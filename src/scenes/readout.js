/**
 * Scene: readout - FLUORESCENCE READ.
 *
 * A tube slots into a fluorimeter block. A 470 nm excitation beam enters from
 * the left and is absorbed by the sample; 510 nm emission blooms out as a stack
 * of soft concentric circles, is collected downward into a PMT, and travels as
 * a signal trace into a live spectrum plot that draws itself from 400 to 600 nm.
 * An encapsulation-efficiency number resolves on a critically-damped settle.
 *
 * This is the greenest moment in the film: everything else in the reel is cold
 * blue or near-neutral, so the emission bloom here is allowed to dominate.
 *
 * Determinism: every scatter/jitter phase is precomputed in build() with a
 * seeded LCG. update() never draws an unseeded random number and never
 * allocates PIXI objects, so a 96-second loop can run for an hour without
 * drifting or leaking.
 */

import { clamp01, remap, cubicOut, sineInOut, settle } from '../core/easing.js';

/* ---------------------------------------------------------------- layout --
 * Authored against the 1920x1080 design box. Bottom 24% (y > 820) and the
 * top-right corner (x > 1450, y < 130) are left to the renderer's overlay.
 */
const CX = 400; // optical axis of the fluorimeter
const SAMPLE_Y = 483; // centre of the illuminated volume

const BLOCK = { x: 230, y: 300, w: 340, h: 340 };
const BORE = { x: 344, y: 296, w: 112, h: 274 };
const TUBE = { x: 361, y: 268, w: 78, h: 284 };
const LIQ = { x: 367, y: 420, w: 66, h: 126 };
const CAP = { x: 351, y: 246, w: 98, h: 28 };

const PMT = { x: 330, y: 654, w: 140, h: 66 };
const TRACE_Y = 745;
const DIVIDER_X = 744;

const PX0 = 820; // lambda = 400 nm
const PX1 = 1800; // lambda = 600 nm
const PW = PX1 - PX0;
const PY0 = 700; // baseline
const PH = 430; // full-scale height

const LAM0 = 400;
const LAM1 = 600;
const NM_PX = PW / (LAM1 - LAM0); // 4.9 px per nm
const lamToX = (nm) => PX0 + (nm - LAM0) * NM_PX;

const EX_NM = 470;
const EM_NM = 510;
const EX_X = lamToX(EX_NM);
const EM_X = lamToX(EM_NM);

const N = 181; // spectrum samples
const EX_AMP = 0.52; // excitation trace never competes with emission

const CARD = { x: 846, y: 232, w: 384, h: 172 };

/** Integer-RGB mix, used to warm the sample from cold to GFP green. */
function mixColor(a, b, t) {
  const k = clamp01(t);
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return (
    ((ar + (br - ar) * k) << 16) |
    ((ag + (bg - ag) * k) << 8) |
    (ab + (bb - ab) * k)
  );
}

/** Asymmetric gaussian: real emission bands have a long red tail. */
function band(nm, mu, sigL, sigR) {
  const s = nm < mu ? sigL : sigR;
  const d = (nm - mu) / s;
  return Math.exp(-0.5 * d * d);
}

export default {
  id: 'readout',

  build(ctx) {
    const { PIXI, palette, width, height, text } = ctx;

    const view = new PIXI.Container();
    view.pivot.set(width / 2, height / 2);
    view.position.set(width / 2, height / 2);

    /* ------------------------------------------------------ seeded scatter */
    let s = 12345;
    const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;

    const motes = [];
    for (let i = 0; i < 52; i++) {
      const mx = 70 + rnd() * 1780;
      const my = 150 + rnd() * 640;
      if (mx > 1420 && my < 170) continue; // stay out of the overlay corner
      motes.push({
        x: mx,
        y: my,
        r: 1.6 + rnd() * 3.4,
        sp: 0.12 + rnd() * 0.42,
        ph: rnd() * Math.PI * 2,
        cold: rnd() < 0.42,
      });
    }

    // Per-sample jitter phase so the trace shimmers like a real detector.
    const phase = new Float64Array(N);
    for (let i = 0; i < N; i++) phase[i] = rnd() * Math.PI * 2;

    const exPackets = [];
    for (let i = 0; i < 10; i++) exPackets.push({ o: i / 10, sp: 0.26 + rnd() * 0.1 });
    const emPackets = [];
    for (let i = 0; i < 7; i++) emPackets.push({ o: i / 7, sp: 0.34 + rnd() * 0.12 });
    const tracePulses = [];
    for (let i = 0; i < 4; i++) tracePulses.push({ o: i / 4 });

    /* --------------------------------------------------- spectrum profiles */
    const xs = new Float64Array(N);
    const emY = new Float64Array(N);
    const exY = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const nm = LAM0 + ((LAM1 - LAM0) * i) / (N - 1);
      xs[i] = lamToX(nm);
      emY[i] = band(nm, EM_NM, 17, 33);
      exY[i] = band(nm, EX_NM, 26, 15);
    }

    /* -------------------------------------------------------------- layers */
    const gWash = new PIXI.Graphics();
    const gField = new PIXI.Graphics();
    const gGrid = new PIXI.Graphics();
    const gHatch = new PIXI.Graphics();
    const gCurves = new PIXI.Graphics();
    const gCard = new PIXI.Graphics();
    const gRig = new PIXI.Graphics();
    const gEmit = new PIXI.Graphics();
    const tubeC = new PIXI.Container();
    const gTube = new PIXI.Graphics();
    const gBeam = new PIXI.Graphics();
    const gGlow = new PIXI.Graphics();
    const labels = new PIXI.Container();

    tubeC.addChild(gTube);
    view.addChild(
      gWash,
      gField,
      gGrid,
      gHatch,
      gCurves,
      gCard,
      gRig,
      gEmit,
      tubeC,
      gBeam,
      gGlow,
      labels
    );

    /* --------------------------------------------------------------- type */
    const mk = (str, opts, x, y, ax, ay) => {
      const o = text(str, opts);
      if (ax !== undefined) o.anchor.set(ax, ay === undefined ? 0 : ay);
      o.position.set(x, y);
      labels.addChild(o);
      return o;
    };

    const hdrLeft = mk(
      'SAMPLE  ·  25 µL',
      { size: 30, color: palette.inkDim, letterSpacing: 3, weight: '600' },
      140,
      150
    );
    const statusText = mk(
      'STANDBY',
      { size: 30, color: palette.signal, letterSpacing: 3, weight: '600', mono: true },
      172,
      194
    );

    const hdrRight = mk(
      'EMISSION SPECTRUM',
      { size: 32, color: palette.inkDim, letterSpacing: 3, weight: '600' },
      820,
      150
    );

    const tickLabels = [];
    for (let k = 0; k <= 4; k++) {
      const nm = 400 + k * 50;
      tickLabels.push(
        mk(String(nm), { size: 30, color: palette.inkFaint, mono: true }, lamToX(nm), 714, 0.5, 0)
      );
    }
    const axisXLabel = mk(
      'WAVELENGTH  (nm)',
      { size: 30, color: palette.inkFaint, letterSpacing: 2 },
      1310,
      756,
      0.5,
      0
    );
    const axisYLabel = mk(
      'INTENSITY',
      { size: 30, color: palette.inkFaint, letterSpacing: 2 },
      786,
      470,
      0.5,
      0.5
    );
    axisYLabel.rotation = -Math.PI / 2;

    const peakLabel = mk(
      '510 nm',
      { size: 34, color: palette.signal, weight: '700', mono: true },
      1420,
      244
    );
    const exLabel = mk(
      '470 nm',
      { size: 30, color: palette.cold, mono: true },
      EX_X,
      424,
      0.5,
      0
    );

    const eeCaption = mk(
      'ENCAPSULATION EE',
      { size: 30, color: palette.inkDim, letterSpacing: 1.2, weight: '600' },
      872,
      250
    );
    const eeValue = mk(
      '0.0',
      { size: 78, color: palette.ink, mono: true, weight: '700' },
      872,
      292
    );
    const eePct = mk('%', { size: 40, color: palette.signal, weight: '600' }, 1072, 320);
    const eeErr = mk('± 0.4', { size: 30, color: palette.inkFaint, mono: true }, 1128, 330);

    const pmtLabel = mk(
      'PMT',
      { size: 30, color: palette.inkDim, letterSpacing: 3, weight: '600' },
      CX,
      671,
      0.5,
      0
    );
    const legEx = mk('EX 470 nm', { size: 30, color: palette.cold, mono: true }, 152, 769);
    const legEm = mk('EM 510 nm', { size: 30, color: palette.signal, mono: true }, 432, 769);

    /* ---------------------------------------------------------- draw utils */
    const strokeCurve = (g, ys, sweep, amp, jit, col, alpha, wPx, tNow) => {
      if (sweep <= 0.001 || alpha <= 0.01) return;
      const headF = sweep * (N - 1);
      const last = Math.min(N - 1, Math.floor(headF));
      for (let i = 0; i <= last; i++) {
        const y =
          PY0 - ys[i] * amp * PH + jit * Math.sin(tNow * 3.1 + phase[i]) * (0.35 + ys[i]);
        if (i === 0) g.moveTo(xs[i], y);
        else g.lineTo(xs[i], y);
      }
      if (last < N - 1) {
        const f = headF - last;
        const yA = PY0 - ys[last] * amp * PH;
        const yB = PY0 - ys[last + 1] * amp * PH;
        g.lineTo(xs[last] + (xs[last + 1] - xs[last]) * f, yA + (yB - yA) * f);
      }
      g.stroke({ width: wPx, color: col, alpha, cap: 'round', join: 'round' });
    };

    /* -------------------------------------------------------------- update */
    const state = { ee: '', status: '' };

    const scene = {
      view,
      update(frame, weight, progress) {
        const t = frame && typeof frame.time === 'number' ? frame.time : 0;
        const p = clamp01(progress);
        const vals = (frame && frame.values) || {};
        const bloomTrack = typeof vals.bloom === 'number' ? vals.bloom : 0.5;
        const chill = typeof vals.chill === 'number' ? vals.chill : 0;
        const drift = typeof vals.drift === 'number' ? vals.drift : 0;
        const w = clamp01(weight === undefined ? 1 : weight);

        // Continuous breathing carriers - these never stop, so no frame is dead.
        const breath = sineInOut(0.5 + 0.5 * Math.sin(t * 1.35));
        const breath2 = 0.5 + 0.5 * Math.sin(t * 0.62 + 1.1);
        const flicker = 0.5 + 0.5 * Math.sin(t * 7.4);

        // Beat sub-timeline.
        const seat = cubicOut(clamp01(remap(p, 0.0, 0.16, 0, 1)));
        const seatS = clamp01(settle(clamp01(remap(p, 0.05, 0.3, 0, 1))));
        const rigIn = cubicOut(clamp01(remap(p, 0.0, 0.12, 0, 1)));
        const exOn = cubicOut(clamp01(remap(p, 0.13, 0.29, 0, 1)));
        const emOn = cubicOut(clamp01(remap(p, 0.21, 0.47, 0, 1)));
        const axesIn = cubicOut(clamp01(remap(p, 0.08, 0.26, 0, 1)));
        const exSweep = clamp01(remap(p, 0.25, 0.47, 0, 1));
        const emSweep = clamp01(remap(p, 0.39, 0.72, 0, 1));
        const markIn = clamp01(settle(clamp01(remap(p, 0.6, 0.86, 0, 1))));
        const cardIn = clamp01(settle(clamp01(remap(p, 0.58, 0.82, 0, 1))));
        const eeIn = clamp01(settle(clamp01(remap(p, 0.62, 0.95, 0, 1))));

        // Slow push-in keeps the frame from ever feeling locked off.
        const sc = 1 + 0.014 * p + 0.0022 * breath2;
        view.scale.set(sc);

        const glowK = (0.55 + 0.45 * bloomTrack) * emOn;
        const emAmp = (0.55 + 0.44 * emSweep) * (1 + 0.028 * Math.sin(t * 2.1));
        const apexY = PY0 - emAmp * PH;
        const sampleCol = mixColor(
          mixColor(palette.cold, palette.lipid, 0.25 * chill),
          palette.signal,
          emOn
        );

        /* ------------------------------------------------- 1. ambient wash */
        gWash.clear();
        gWash
          .rect(0, 0, width, height)
          .fill({ color: palette.signal, alpha: 0.012 + 0.026 * glowK * (0.7 + 0.3 * breath) });

        /* ------------------------------------------------ 2. drifting field */
        gField.clear();
        for (let i = 0; i < motes.length; i++) {
          const m = motes[i];
          const a = m.ph + drift * 1.6;
          const mx = m.x + Math.cos(t * m.sp * 0.7 + a) * 20;
          const my = m.y + Math.sin(t * m.sp + a) * 26;
          const pulse = 0.5 + 0.5 * Math.sin(t * m.sp * 2.3 + a);
          gField.circle(mx, my, m.r * (0.85 + 0.3 * pulse)).fill({
            color: m.cold ? palette.cold : palette.signal,
            alpha: (0.05 + 0.11 * pulse) * (m.cold ? 1 : 0.5 + 0.9 * glowK),
          });
        }

        /* ---------------------------------------------------- 3. plot chrome */
        gGrid.clear();
        const gridA = 0.9 * axesIn;
        if (gridA > 0.01) {
          for (let k = 1; k <= 4; k++) {
            const y = PY0 - (PH / 4) * k;
            gGrid.moveTo(PX0, y).lineTo(PX1, y);
          }
          gGrid.stroke({ width: 3, color: palette.rule, alpha: 0.55 * gridA });

          for (let k = 1; k <= 4; k++) {
            const x = lamToX(400 + k * 50);
            gGrid.moveTo(x, PY0).lineTo(x, PY0 - PH);
          }
          gGrid.stroke({ width: 3, color: palette.rule, alpha: 0.32 * gridA });

          // Axes.
          gGrid
            .moveTo(PX0, PY0 - PH - 6)
            .lineTo(PX0, PY0)
            .lineTo(PX1 + 10, PY0)
            .stroke({ width: 4, color: palette.inkDim, alpha: 0.9 * gridA });

          // Wavelength ticks.
          for (let k = 0; k <= 4; k++) {
            const x = lamToX(400 + k * 50);
            gGrid.moveTo(x, PY0).lineTo(x, PY0 + 12);
          }
          for (let k = 0; k <= 4; k++) {
            const y = PY0 - (PH / 4) * k;
            gGrid.moveTo(PX0 - 12, y).lineTo(PX0, y);
          }
          gGrid.stroke({ width: 4, color: palette.inkDim, alpha: 0.85 * gridA });
        }

        // Column divider - always breathing so the frame is never inert.
        gGrid
          .moveTo(DIVIDER_X, 200)
          .lineTo(DIVIDER_X, 800)
          .stroke({
            width: 3,
            color: palette.rule,
            alpha: (0.5 + 0.25 * breath2) * rigIn,
          });

        /* ------------------------------------ 4. spectrum: hatch + baseline */
        gHatch.clear();
        if (emSweep > 0.002) {
          const headF = emSweep * (N - 1);
          for (let i = 0; i < N; i += 3) {
            if (i > headF) break;
            const h = emY[i] * emAmp * PH;
            if (h < 4) continue;
            gHatch.moveTo(xs[i], PY0).lineTo(xs[i], PY0 - h);
          }
          gHatch.stroke({
            width: 3,
            color: palette.signal,
            alpha: 0.1 + 0.09 * breath,
          });
        }

        gCurves.clear();

        // Live baseline noise across the whole axis: the instrument is on even
        // before the scan reaches you.
        if (axesIn > 0.01) {
          for (let i = 0; i < N; i++) {
            const y = PY0 - 5 - Math.sin(t * 4.2 + phase[i]) * 3.2;
            if (i === 0) gCurves.moveTo(xs[i], y);
            else gCurves.lineTo(xs[i], y);
          }
          gCurves.stroke({ width: 3, color: palette.inkFaint, alpha: 0.3 * axesIn });
        }

        // Ambient scan cursor - loops forever, independent of the beat.
        const scanX = PX0 + ((t * 0.13) % 1) * PW;
        gCurves
          .moveTo(scanX, PY0)
          .lineTo(scanX, PY0 - PH)
          .stroke({ width: 3, color: palette.inkFaint, alpha: 0.16 * axesIn });

        /* ------------------------------------------------ 5. the two curves */
        strokeCurve(gCurves, exY, exSweep, EX_AMP, 2.2, palette.cold, 0.85, 4, t);
        // Soft halo under the emission peak: the greenest pixel in the film.
        if (emSweep > 0.5 && glowK > 0.01) {
          for (let r = 0; r < 3; r++) {
            gCurves
              .ellipse(EM_X, apexY + 40, 90 + r * 70, 44 + r * 34)
              .fill({ color: palette.signal, alpha: (0.05 - r * 0.014) * (0.6 + 0.4 * breath) });
          }
        }
        strokeCurve(gCurves, emY, emSweep, emAmp, 3.4, palette.signal, 0.98, 5, t);

        // Acquisition head.
        if (emSweep > 0.002 && emSweep < 0.999) {
          const hi = Math.min(N - 1, Math.round(emSweep * (N - 1)));
          const hx = xs[hi];
          const hy = PY0 - emY[hi] * emAmp * PH;
          gCurves
            .circle(hx, hy, 8 + 3 * flicker)
            .fill({ color: palette.ink, alpha: 0.85 });
          gCurves
            .moveTo(hx, PY0)
            .lineTo(hx, hy)
            .stroke({ width: 3, color: palette.signal, alpha: 0.5 });
        }

        // Excitation marker.
        if (exSweep > 0.5) {
          const a = clamp01(remap(exSweep, 0.5, 1, 0, 1));
          gCurves
            .moveTo(EX_X, PY0)
            .lineTo(EX_X, PY0 - EX_AMP * PH)
            .stroke({ width: 3, color: palette.cold, alpha: 0.45 * a });
          gCurves
            .circle(EX_X, PY0 - EX_AMP * PH, 7)
            .fill({ color: palette.cold, alpha: 0.9 * a });
        }

        // Emission peak marker, snapping in on a settle.
        if (markIn > 0.01) {
          gCurves
            .moveTo(EM_X, PY0)
            .lineTo(EM_X, apexY)
            .stroke({ width: 4, color: palette.signal, alpha: 0.55 * markIn });
          gCurves
            .circle(EM_X, apexY, (7 + 4 * breath) * markIn)
            .fill({ color: palette.ink, alpha: 0.95 * markIn });
          gCurves
            .circle(EM_X, apexY, (16 + 9 * breath) * markIn)
            .stroke({ width: 3, color: palette.signal, alpha: 0.45 * markIn });
        }

        /* ------------------------------------------------------- 6. EE card */
        gCard.clear();
        if (cardIn > 0.01) {
          const ch = CARD.h * (0.9 + 0.1 * cardIn);
          gCard
            .roundRect(CARD.x, CARD.y, CARD.w, ch, 12)
            .fill({ color: palette.panel, alpha: 0.88 * cardIn })
            .stroke({ width: 3, color: palette.rule, alpha: 0.9 * cardIn });
          gCard
            .rect(CARD.x, CARD.y, 5, ch)
            .fill({ color: palette.signal, alpha: (0.7 + 0.3 * breath) * cardIn });
        }

        /* ----------------------------------------------- 7. fluorimeter rig */
        gRig.clear();
        const rigA = rigIn;

        // Block body.
        gRig
          .roundRect(BLOCK.x, BLOCK.y, BLOCK.w, BLOCK.h, 18)
          .fill({ color: palette.panel, alpha: 0.95 * rigA })
          .stroke({ width: 4, color: palette.rule, alpha: rigA });

        // Machined ribs, drifting highlight.
        for (let k = 0; k < 5; k++) {
          const y = BLOCK.y + 40 + k * 62;
          const hl = 0.5 + 0.5 * Math.sin(t * 0.9 + k * 0.7);
          gRig
            .moveTo(BLOCK.x + 16, y)
            .lineTo(BLOCK.x + 92, y)
            .stroke({ width: 3, color: palette.grid, alpha: (0.5 + 0.5 * hl) * rigA });
          gRig
            .moveTo(BLOCK.x + BLOCK.w - 92, y)
            .lineTo(BLOCK.x + BLOCK.w - 16, y)
            .stroke({ width: 3, color: palette.grid, alpha: (0.5 + 0.5 * (1 - hl)) * rigA });
        }

        // Bore the tube drops into.
        gRig
          .roundRect(BORE.x, BORE.y, BORE.w, BORE.h, 10)
          .fill({ color: palette.void, alpha: 0.94 * rigA })
          .stroke({ width: 3, color: palette.grid, alpha: 0.9 * rigA });

        // Entrance slit on the left wall.
        gRig
          .rect(BLOCK.x - 7, SAMPLE_Y - 18, 14, 36)
          .fill({ color: palette.cold, alpha: (0.25 + 0.6 * exOn) * rigA });

        // Collection port under the sample.
        gRig
          .rect(CX - 34, BLOCK.y + BLOCK.h - 6, 68, 14)
          .fill({ color: palette.signal, alpha: (0.15 + 0.7 * emOn) * rigA });

        // PMT housing + lens.
        gRig
          .roundRect(PMT.x, PMT.y, PMT.w, PMT.h, 10)
          .fill({ color: palette.panel, alpha: 0.95 * rigA })
          .stroke({ width: 3, color: palette.rule, alpha: rigA });
        gRig
          .ellipse(CX, PMT.y, 48, 13)
          .stroke({
            width: 4,
            color: palette.signal,
            alpha: (0.3 + 0.6 * emOn * (0.6 + 0.4 * breath)) * rigA,
          });

        // Status LED beside the header.
        gRig
          .circle(150, 211, 7 + 2 * flicker)
          .fill({
            color: p > 0.62 ? palette.signal : palette.cold,
            alpha: (0.45 + 0.5 * flicker) * rigA,
          });

        // Signal trace out of the PMT, with pulses running to the plot.
        gRig
          .moveTo(CX, PMT.y + PMT.h)
          .lineTo(CX, TRACE_Y)
          .lineTo(700, TRACE_Y)
          .stroke({ width: 3, color: palette.rule, alpha: 0.95 * rigA });
        gRig
          .moveTo(688, TRACE_Y - 9)
          .lineTo(702, TRACE_Y)
          .lineTo(688, TRACE_Y + 9)
          .stroke({ width: 3, color: palette.inkFaint, alpha: 0.85 * rigA });

        for (let i = 0; i < tracePulses.length; i++) {
          const f = (t * 0.42 + tracePulses[i].o) % 1;
          const px = CX + f * (700 - CX);
          gRig.circle(px, TRACE_Y, 5).fill({
            color: palette.signal,
            alpha: (0.15 + 0.75 * emOn) * (1 - f) * rigA,
          });
        }

        // Legend swatches.
        gRig
          .moveTo(100, 787)
          .lineTo(140, 787)
          .stroke({ width: 5, color: palette.cold, alpha: (0.5 + 0.5 * exOn) * rigA });
        gRig
          .moveTo(380, 787)
          .lineTo(420, 787)
          .stroke({ width: 5, color: palette.signal, alpha: (0.35 + 0.65 * emOn) * rigA });

        /* -------------------------------------- 8. the tube, slotting home */
        const drop = -340 * (1 - seat);
        const click = -16 * (1 - seatS);
        const hover = (1 - seat) * Math.sin(t * 1.6) * 3;
        tubeC.position.set(0, drop + click + hover);
        tubeC.alpha = rigA;

        gTube.clear();
        gTube
          .roundRect(TUBE.x, TUBE.y, TUBE.w, TUBE.h, TUBE.w / 2)
          .fill({ color: palette.ground, alpha: 0.85 })
          .stroke({ width: 4, color: palette.inkFaint, alpha: 0.85 });
        gTube
          .roundRect(CAP.x, CAP.y, CAP.w, CAP.h, 8)
          .fill({ color: palette.rule, alpha: 0.98 })
          .stroke({ width: 3, color: palette.inkFaint, alpha: 0.8 });

        // Liquid, warming from cold to green as it emits. The meniscus rocks
        // slightly - a real 25 µL column is never perfectly still.
        const rock = Math.sin(t * 1.9) * 2.2 * (1 - 0.6 * seat);
        gTube
          .roundRect(LIQ.x, LIQ.y + rock, LIQ.w, LIQ.h, LIQ.w / 2)
          .fill({ color: sampleCol, alpha: 0.36 + 0.4 * emOn });
        gTube
          .ellipse(CX, LIQ.y + rock + 4, LIQ.w / 2 - 2, 7)
          .stroke({ width: 3, color: palette.ink, alpha: 0.35 + 0.3 * emOn });

        // Fill-line graduations, always readable against the glow.
        for (let k = 1; k <= 3; k++) {
          const y = LIQ.y + 26 * k;
          gTube
            .moveTo(TUBE.x + 10, y)
            .lineTo(TUBE.x + 26, y)
            .stroke({ width: 3, color: palette.ink, alpha: 0.28 });
        }

        /* --------------------------------------- 9. 470 nm excitation beam */
        gBeam.clear();
        if (exOn > 0.01) {
          const bx0 = 96;
          const bx1 = CX;
          for (let k = 0; k < 4; k++) {
            const hh = 5 + k * 9;
            gBeam
              .rect(bx0, SAMPLE_Y - hh, bx1 - bx0, hh * 2)
              .fill({
                color: palette.cold,
                alpha: (0.3 - k * 0.065) * exOn * (0.78 + 0.22 * breath),
              });
          }
          gBeam
            .moveTo(bx0, SAMPLE_Y)
            .lineTo(bx1 - 6, SAMPLE_Y)
            .stroke({ width: 4, color: palette.cold, alpha: 0.9 * exOn });

          for (let i = 0; i < exPackets.length; i++) {
            const q = exPackets[i];
            const f = (t * q.sp + q.o) % 1;
            const px = bx0 + f * (bx1 - bx0);
            const fade = 1 - clamp01(remap(f, 0.82, 1, 0, 1)); // absorbed at the sample
            gBeam
              .rect(px - 11, SAMPLE_Y - 3, 22, 6)
              .fill({ color: palette.ink, alpha: 0.7 * fade * exOn });
          }
        }

        /* ----------------------------- 10. 510 nm emission: bloom + collect */
        gGlow.clear();
        if (glowK > 0.01) {
          const pulse = 0.82 + 0.18 * breath;
          for (let k = 0; k < 9; k++) {
            const r = (26 + k * 26) * (0.86 + 0.14 * pulse) * (0.6 + 0.4 * glowK);
            const fall = 1 - k / 9;
            gGlow.circle(CX, SAMPLE_Y, r).fill({
              color: palette.signal,
              alpha: 0.1 * fall * fall * glowK * pulse,
            });
          }
          gGlow
            .circle(CX, SAMPLE_Y, (13 + 4 * breath) * glowK)
            .fill({ color: palette.ink, alpha: 0.85 * glowK });
          gGlow
            .circle(CX, SAMPLE_Y, (34 + 10 * breath) * glowK)
            .stroke({ width: 3, color: palette.signal, alpha: 0.5 * glowK });
        }

        gEmit.clear();
        if (emOn > 0.01) {
          for (let k = 0; k < 3; k++) {
            const hw = 12 + k * 13;
            gEmit
              .rect(CX - hw, LIQ.y + LIQ.h - 6, hw * 2, PMT.y - (LIQ.y + LIQ.h) + 6)
              .fill({
                color: palette.signal,
                alpha: (0.16 - k * 0.045) * emOn * (0.75 + 0.25 * breath),
              });
          }
          for (let i = 0; i < emPackets.length; i++) {
            const q = emPackets[i];
            const f = (t * q.sp + q.o) % 1;
            const y0 = LIQ.y + LIQ.h - 6;
            const py = y0 + f * (PMT.y - y0);
            gEmit
              .circle(CX + Math.sin(f * 6.1 + q.o * 9) * 14, py, 5)
              .fill({ color: palette.ink, alpha: 0.65 * (1 - f * 0.5) * emOn });
          }
        }

        /* ----------------------------------------------------- 11. numbers */
        const eeTarget = 94.2 * eeIn;
        const eeJitter = (1 - eeIn) * 5.5 * Math.sin(t * 21.7);
        const shown = Math.max(0, eeTarget + eeJitter);
        const str = shown.toFixed(1);
        if (state.ee !== str) {
          eeValue.text = str;
          state.ee = str;
        }
        const st = p < 0.28 ? 'STANDBY' : p < 0.66 ? 'ACQUIRING' : 'COMPLETE';
        if (state.status !== st) {
          statusText.text = st;
          state.status = st;
        }

        /* ------------------------------------------------- 12. type fading */
        const base = 0.55 + 0.45 * w;
        hdrLeft.alpha = rigIn * base;
        statusText.alpha = rigIn * base * (0.65 + 0.35 * flicker);
        hdrRight.alpha = axesIn * base;
        for (let i = 0; i < tickLabels.length; i++) tickLabels[i].alpha = axesIn * 0.95 * base;
        axisXLabel.alpha = axesIn * 0.9 * base;
        axisYLabel.alpha = axesIn * 0.9 * base;

        peakLabel.alpha = markIn * base;
        peakLabel.position.set(1420 + (1 - markIn) * 22, 244);
        exLabel.alpha = clamp01(remap(exSweep, 0.55, 1, 0, 1)) * 0.95 * base;

        eeCaption.alpha = cardIn * base;
        eeValue.alpha = cardIn * base;
        eePct.alpha = cardIn * base;
        eeErr.alpha = cardIn * eeIn * base;
        eeValue.position.set(872, 292 + (1 - cardIn) * 10);

        pmtLabel.alpha = rigIn * 0.9 * base;
        legEx.alpha = rigIn * (0.4 + 0.6 * exOn) * base;
        legEm.alpha = rigIn * (0.4 + 0.6 * emOn) * base;
      },
    };

    return scene;
  },
};
