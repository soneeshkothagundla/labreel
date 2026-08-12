import { Clock } from './clock.js';

/**
 * Frame-exact capture.
 *
 * Renders a reel in fixed-step mode and hands each frame to a sink. Because
 * the clock ignores wall time, the output is identical on a fast laptop and a
 * throttled one, and a dropped frame is impossible: the encoder waits for the
 * renderer rather than the other way round.
 *
 * Two sinks ship here:
 *   WebMSink   - MediaRecorder, works in every current browser, no deps.
 *   FramesSink - raw PNG blobs, for feeding ffmpeg when you want ProRes/H.264.
 *
 * Practical reason this exists: a live WebGL animation on unfamiliar hardware
 * is a single point of failure during a presentation. Exporting the identical
 * reel to a video file means the fallback is not a different asset that has
 * drifted out of date, it is the same reel.
 */

export async function captureReel(
  reel,
  renderer,
  sink,
  { fps = 60, cycles = 1, onProgress } = {}
) {
  const clock = new Clock({ mode: 'fixed', fps });
  const total = Math.round(reel.duration * cycles * fps);

  await sink.open?.({ fps, width: renderer.width, height: renderer.height, total });

  clock.start();
  for (let i = 0; i < total; i++) {
    const frame = reel.sample(clock.time);
    frame.frameIndex = i;
    renderer.render(frame);
    // Give the GPU a chance to actually flush before the sink reads pixels.
    await nextPaint();
    await sink.write(renderer, i);
    if (onProgress) onProgress((i + 1) / total, i + 1, total);
    clock.tick();
  }

  return sink.close();
}

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** Records the renderer's canvas via MediaRecorder into a single .webm Blob. */
export class WebMSink {
  constructor({ mimeType, bitsPerSecond = 12_000_000 } = {}) {
    this.mimeType = mimeType ?? pickMimeType();
    this.bitsPerSecond = bitsPerSecond;
    this.chunks = [];
  }

  async open({ fps, width, height }) {
    this.width = width;
    this.height = height;
    return this;
  }

  async write(renderer) {
    if (!this.recorder) {
      const canvas = renderer.canvas;
      if (!canvas) throw new Error('WebMSink: renderer has no .canvas');
      // captureStream(0) yields a track we drive manually, one requestFrame per
      // rendered frame. That is what keeps the video in lockstep with the reel.
      this.stream = canvas.captureStream(0);
      this.track = this.stream.getVideoTracks()[0];
      this.recorder = new MediaRecorder(this.stream, {
        mimeType: this.mimeType,
        videoBitsPerSecond: this.bitsPerSecond,
      });
      this.recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };
      this.recorder.start();
    }
    this.track.requestFrame();
  }

  close() {
    return new Promise((resolve) => {
      if (!this.recorder) return resolve(null);
      this.recorder.onstop = () => {
        this.track?.stop();
        resolve(new Blob(this.chunks, { type: this.mimeType }));
      };
      this.recorder.stop();
    });
  }
}

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return 'video/webm';
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? 'video/webm';
}

/** Collects individual PNG blobs. Feed to ffmpeg for broadcast codecs. */
export class FramesSink {
  constructor() {
    this.frames = [];
  }

  async write(renderer, index) {
    const blob = await new Promise((resolve) =>
      renderer.canvas.toBlob(resolve, 'image/png')
    );
    this.frames.push({ index, blob });
  }

  close() {
    return this.frames;
  }
}

/** Browser download helper. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
