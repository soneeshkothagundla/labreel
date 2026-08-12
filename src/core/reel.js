import { Clock } from './clock.js';
import { progress, clamp01, resolveEase } from './easing.js';

/**
 * A Reel is a continuous, looping film of a scientific protocol.
 *
 * The unit of authorship is the Beat: a labelled span of time that carries
 * protocol metadata (temperature, duration, readout, sample count) alongside
 * its animation. Beats are not slides. They overlap, cross-dissolve, and the
 * reel never stops on one. There is no "next" button anywhere in this API,
 * by design.
 *
 * Tracks animate values across the whole reel. A track is sampled every frame
 * and its output is handed to the renderer; the renderer decides what a value
 * means. This keeps choreography and drawing completely separate, which is
 * what lets the same reel drive a Canvas2D poster, a Pixi scene, and an
 * offline video export without rewriting the animation.
 */

let _uid = 0;

export class Beat {
  /**
   * @param {object} spec
   * @param {string} spec.id
   * @param {number} spec.at        Start time in seconds.
   * @param {number} spec.duration  Seconds.
   * @param {string} [spec.title]
   * @param {string} [spec.subtitle]
   * @param {object} [spec.data]    Arbitrary protocol metadata, surfaced to the
   *                                renderer for readouts and callouts.
   * @param {number} [spec.fade=0.6] Cross-dissolve seconds at each edge.
   */
  constructor(spec) {
    if (!spec || typeof spec.id !== 'string') {
      throw new TypeError('Beat: id is required');
    }
    if (!(spec.duration > 0)) {
      throw new RangeError(`Beat "${spec.id}": duration must be > 0`);
    }
    this.id = spec.id;
    this.at = spec.at ?? 0;
    this.duration = spec.duration;
    this.title = spec.title ?? '';
    this.subtitle = spec.subtitle ?? '';
    this.data = spec.data ?? {};
    this.fade = spec.fade ?? 0.6;
  }

  get end() {
    return this.at + this.duration;
  }

  /** True if `t` falls inside this beat, including its fade edges. */
  covers(t) {
    return t >= this.at - this.fade && t < this.end + this.fade;
  }

  /** 0..1 progress through the beat body, clamped. */
  progressAt(t) {
    return clamp01((t - this.at) / this.duration);
  }

  /**
   * Presence envelope 0..1: ramps up over `fade`, holds at 1, ramps down.
   * This is what makes beats dissolve into each other instead of cutting.
   */
  weightAt(t) {
    const f = this.fade;
    if (f <= 0) return t >= this.at && t < this.end ? 1 : 0;
    if (t < this.at - f || t >= this.end + f) return 0;
    if (t < this.at) return clamp01((t - (this.at - f)) / f);
    if (t >= this.end) return clamp01(1 - (t - this.end) / f);
    return 1;
  }
}

export class Track {
  /**
   * @param {object} spec
   * @param {string} spec.key       Name the renderer reads.
   * @param {Array}  spec.cues      [{ at, duration, from, to, ease }]
   * @param {number} [spec.initial] Value before the first cue.
   * @param {boolean} [spec.wrap]   If true, value is interpreted modulo-cyclic
   *                                (angles), so loops do not snap.
   */
  constructor({ key, cues = [], initial = 0, wrap = false }) {
    if (typeof key !== 'string' || !key) {
      throw new TypeError('Track: key is required');
    }
    this.key = key;
    this.initial = initial;
    this.wrap = wrap;
    this.cues = [...cues].sort((a, b) => a.at - b.at);
    this._validate();
  }

  _validate() {
    for (const c of this.cues) {
      if (typeof c.at !== 'number' || c.at < 0) {
        throw new RangeError(`Track "${this.key}": cue.at must be >= 0`);
      }
      if (typeof c.duration !== 'number' || c.duration < 0) {
        throw new RangeError(`Track "${this.key}": cue.duration must be >= 0`);
      }
    }
  }

  /**
   * Sample the track at time t.
   * Cues are applied in order; each cue's `from` defaults to the running value
   * at its start, so you can author "move to X" without restating where it was.
   */
  valueAt(t) {
    let value = this.initial;
    for (const cue of this.cues) {
      if (t < cue.at) break;
      const from = cue.from ?? value;
      const to = cue.to;
      const p = progress(t, cue.at, cue.duration, cue.ease);
      value = from + (to - from) * p;
    }
    return value;
  }

  get end() {
    return this.cues.reduce((m, c) => Math.max(m, c.at + c.duration), 0);
  }
}

export class Reel {
  /**
   * @param {object} spec
   * @param {string} spec.id
   * @param {string} [spec.title]
   * @param {Beat[]|object[]} [spec.beats]
   * @param {Track[]|object[]} [spec.tracks]
   * @param {number} [spec.duration] Defaults to the span of beats and tracks.
   * @param {boolean} [spec.loop=true]
   */
  constructor(spec = {}) {
    this.id = spec.id ?? `reel-${++_uid}`;
    this.title = spec.title ?? '';
    this.loop = spec.loop ?? true;

    this.beats = (spec.beats ?? []).map((b) => (b instanceof Beat ? b : new Beat(b)));
    this.tracks = new Map();
    for (const t of spec.tracks ?? []) {
      const track = t instanceof Track ? t : new Track(t);
      this.tracks.set(track.key, track);
    }

    this.duration = spec.duration ?? this._naturalDuration();
    if (!(this.duration > 0)) {
      throw new RangeError(`Reel "${this.id}": duration must be > 0`);
    }
    this._assertNoGaps();
  }

  _naturalDuration() {
    let end = 0;
    for (const b of this.beats) end = Math.max(end, b.end);
    for (const t of this.tracks.values()) end = Math.max(end, t.end);
    return end;
  }

  /**
   * A reel with a hole in it shows an empty screen mid-presentation. That is
   * the single worst failure mode on stage, so it is a construction error
   * rather than something you discover in front of an audience.
   */
  _assertNoGaps() {
    if (this.beats.length === 0) return;
    const sorted = [...this.beats].sort((a, b) => a.at - b.at);
    if (sorted[0].at > 0.001) {
      throw new Error(
        `Reel "${this.id}": gap from 0s to ${sorted[0].at}s before beat "${sorted[0].id}"`
      );
    }
    let reach = sorted[0].end;
    for (let i = 1; i < sorted.length; i++) {
      const b = sorted[i];
      if (b.at > reach + 0.001) {
        throw new Error(
          `Reel "${this.id}": gap from ${reach}s to ${b.at}s before beat "${b.id}"`
        );
      }
      reach = Math.max(reach, b.end);
    }
  }

  /** Wrap an absolute time into the reel's own timebase. */
  localTime(t) {
    if (!this.loop) return Math.min(t, this.duration);
    const d = this.duration;
    return ((t % d) + d) % d;
  }

  /**
   * Everything the renderer needs for one frame.
   * @param {number} t Absolute seconds since play started.
   */
  sample(t) {
    const time = this.localTime(t);

    const active = [];
    for (const b of this.beats) {
      const w = b.weightAt(time);
      if (w > 0) {
        active.push({ beat: b, weight: w, progress: b.progressAt(time) });
      }
    }
    // Highest weight wins ties; later beats win exact ties so a hand-off
    // resolves forward rather than sticking on the outgoing beat.
    active.sort((a, b) => b.weight - a.weight || b.beat.at - a.beat.at);

    const values = {};
    for (const [key, track] of this.tracks) {
      values[key] = track.valueAt(time);
    }

    return {
      time,
      cycle: this.loop ? Math.floor(t / this.duration) : 0,
      progress: time / this.duration,
      active,
      lead: active[0] ?? null,
      values,
    };
  }

  beat(id) {
    return this.beats.find((b) => b.id === id) ?? null;
  }
}

/**
 * Drives a Reel against a Clock and pushes frames at a renderer.
 * The renderer is any object with { render(frame), resize?(w,h), destroy?() }.
 */
export class Transport {
  constructor(reel, renderer, { mode = 'realtime', fps = 60, rate = 1 } = {}) {
    this.reel = reel;
    this.renderer = renderer;
    this.clock = new Clock({ mode, fps, rate });
    this._raf = null;
    this._onFrame = null;
  }

  play() {
    if (this._raf !== null) return this;
    this.clock.start(typeof performance !== 'undefined' ? performance.now() : 0);
    const loop = (now) => {
      this.clock.tick(now);
      this.renderFrame();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
    return this;
  }

  pause() {
    if (this._raf !== null) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
    this.clock.pause();
    return this;
  }

  seek(seconds) {
    this.clock.seek(seconds);
    this.renderFrame();
    return this;
  }

  setRate(rate) {
    this.clock.rate = rate;
    return this;
  }

  renderFrame() {
    const frame = this.reel.sample(this.clock.time);
    frame.frameIndex = this.clock.frame;
    this.renderer.render(frame);
    if (this._onFrame) this._onFrame(frame);
    return frame;
  }

  onFrame(fn) {
    this._onFrame = fn;
    return this;
  }

  destroy() {
    this.pause();
    this.renderer.destroy?.();
  }
}
