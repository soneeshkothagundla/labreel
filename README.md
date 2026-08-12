# labreel

Choreograph scientific protocols as continuous, looping motion graphics.

Built at [Capsule Space Labs](https://capsulelabs.space) to explain a lipid-nanoparticle
freeze/thaw experiment flying to the ISS. Open-sourced because the problem is general:
research explainers are almost always built as **slides that advance**, when what the
work actually is, is **a process that runs**.

```
npm install labreel
```

Core has **zero runtime dependencies**. Renderer adapters are opt-in peers.

---

## Why this exists

Three things go wrong when you animate a protocol with a general-purpose animation library:

**1. You end up with steps.** Slide decks and scene-graph libraries both push you toward
discrete states you click between. A protocol is not discrete. Freezing does not happen
on slide four. `labreel`'s unit of authorship is a **Beat**: a labelled span of time with
a fade envelope on both edges. Beats overlap and cross-dissolve. There is no `next()` in
this API, deliberately.

**2. You cannot reproduce a render.** Every browser animation library is welded to
`requestAnimationFrame`, so the same animation on a busy laptop is a different animation.
`labreel` separates the clock from the frame loop. In `fixed` mode the clock advances by
exactly `1/fps` regardless of wall time, so a capture is frame-exact and byte-identical
across machines. A protocol animation is a scientific figure; it should reproduce.

**3. The metadata lives somewhere else.** Temperature, sample count, wavelength, and
readout end up hard-coded in a text layer that silently drifts out of sync with the
animation. In `labreel` a Beat carries its own `data`, and the renderer reads it. Change
the protocol in one place.

---

## Quick start

```js
import { Reel, Transport } from 'labreel';
import { PixiRenderer } from 'labreel/pixi';
import * as PIXI from 'pixi.js';

const reel = new Reel({
  id: 'freeze-thaw',
  duration: 30,
  beats: [
    {
      id: 'load',
      at: 0,
      duration: 12,
      fade: 1.5,
      title: 'Load',
      subtitle: 'Sixteen tubes at 25 µL',
      data: { readout: '16 × 25 µL' },
    },
    {
      id: 'freeze',
      at: 11,
      duration: 12,
      fade: 1.5,
      title: 'Freeze',
      subtitle: 'Held at −80 °C',
      data: { readout: '−80 °C' },
    },
    {
      id: 'read',
      at: 22,
      duration: 8,
      fade: 1.5,
      title: 'Read',
      data: { readout: 'EE 94%' },
    },
  ],
  tracks: [
    { key: 'chill', initial: 0, cues: [{ at: 10, duration: 6, to: 1, ease: 'sineInOut' }] },
  ],
});

const renderer = new PixiRenderer({
  mount: document.querySelector('#stage'),
  PIXI,
  scenes: [loadScene, freezeScene, readScene],
});
await renderer.init();

new Transport(reel, renderer).play();
```

---

## Concepts

### Beat

A labelled span of time. `weightAt(t)` returns a 0..1 presence envelope that ramps up over
`fade`, holds, and ramps down, which is what makes beats dissolve rather than cut.

```js
const b = new Beat({ id: 'freeze', at: 10, duration: 4, fade: 1 });
b.weightAt(9.5);  // 0.5  (fading in)
b.weightAt(12);   // 1    (held)
b.weightAt(14.5); // 0.5  (fading out)
```

### Track

A named value animated across the whole reel by a list of cues. A cue's `from` defaults to
the running value at its start, so you author *"go to 1"* without restating where it was.
Values hold before the first cue and after the last.

```js
new Track({
  key: 'zoom',
  initial: 1,
  cues: [
    { at: 0, duration: 2, to: 3 },
    { at: 4, duration: 2, to: 0.5, ease: 'cubicOut' },
  ],
});
```

### Reel

Beats plus tracks plus a duration. **A reel with a hole in its timeline throws at
construction time** rather than showing an empty screen mid-presentation:

```
Error: Reel "flagship": gap from 2s to 9s before beat "launch"
```

That is the worst failure mode on a stage, so it is a build error, not a discovery.

### Transport

Drives a reel against a clock and pushes frames at a renderer. `play()`, `pause()`,
`seek()`, `setRate()`.

### Renderer

Anything with `render(frame)`. A frame is:

```js
{
  time,        // reel-local seconds, already wrapped for looping
  cycle,       // how many times the reel has looped
  progress,    // 0..1 through the reel
  active,      // [{ beat, weight, progress }] every beat currently visible
  lead,        // the highest-weighted active beat
  values,      // { [trackKey]: number }
  frameIndex,
}
```

---

## Frame-exact capture

The feature that justifies the deterministic clock. Renders the reel in fixed-step mode
and drives a `MediaRecorder` one frame at a time, so the encoder waits for the renderer
instead of dropping frames.

```js
import { captureReel, WebMSink, downloadBlob } from 'labreel';

const blob = await captureReel(reel, renderer, new WebMSink(), {
  fps: 60,
  cycles: 1,
  onProgress: (p) => console.log(`${Math.round(p * 100)}%`),
});

downloadBlob(blob, 'flagship.webm');
```

Use `FramesSink` instead to collect PNGs for `ffmpeg` when you need H.264 or ProRes.

Practical note: a live WebGL animation on unfamiliar hardware is a single point of failure
during a talk. Exporting the identical reel to a video means your fallback is not a
separate asset that has drifted out of date — it is the same reel.

---

## Writing a scene

```js
import { clamp01, cubicOut } from 'labreel';

export default {
  id: 'freeze',
  build(ctx) {
    const { PIXI, palette, width, height } = ctx;
    const view = new PIXI.Container();
    const frost = new PIXI.Graphics();
    view.addChild(frost);

    return {
      view,
      update(frame, weight, progress) {
        const grow = cubicOut(clamp01(progress * 1.4));
        frost.clear()
          .rect(0, 0, width * grow, height)
          .fill({ color: palette.cold, alpha: 0.25 * weight });
      },
    };
  },
};
```

Rules that keep a looping reel healthy:

- Create display objects in `build()`, mutate them in `update()`. Allocating inside
  `update()` leaks over a reel that loops for an hour.
- Never call `Math.random()` in `update()` — it breaks capture determinism. Seed a small
  LCG in `build()` instead.
- Read `frame.time` for motion that should continue while a beat holds, and `progress`
  for motion tied to the beat's own arc.

---

## Design notes for projected work

The bundled palette assumes a conference projector, which crushes the bottom two stops and
washes the top one. Everything that must be readable sits between 25% and 90% luminance,
nothing important is encoded in colour alone, and the renderer letterboxes a fixed
1920×1080 design box so an unexpected aspect ratio never crops the readout.

---

## API

| Export | From | Purpose |
|---|---|---|
| `Reel`, `Beat`, `Track`, `Transport` | `labreel` | Core model and playback |
| `Clock` | `labreel` | Deterministic time source |
| `captureReel`, `WebMSink`, `FramesSink`, `downloadBlob` | `labreel` | Frame-exact export |
| `EASINGS`, `progress`, `lerp`, `remap`, `clamp01`, `settle`, … | `labreel` | Easing and math |
| `PixiRenderer`, `PALETTE` | `labreel/pixi` | GPU renderer (peer: `pixi.js`) |
| `Canvas2DRenderer` | `labreel/canvas` | Zero-dependency fallback renderer |

---

## Tests

```
npm test
```

Node's built-in runner, no framework.

---

## License

MIT © Capsule Space Labs
