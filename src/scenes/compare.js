/**
 * Scene: compare — "Ground against flight". The results figure.
 *
 * Two grouped pairs (STANDARD, HIGH-PEG), each with a modelled ground bar and a
 * modelled flight bar, built in the grammar of a real paper figure: gridded,
 * axis-labelled, error-barred, honest. Neither series is measured; see BARS.
 *
 * The one thing this scene must not fumble is that the flight bars are a
 * hypothesis, not data. That is carried three ways so it never rests on colour:
 *   texture  — ground bars solid, flight bars open and hatched
 *   type     — a bordered banner inside the plot, plus a legend rail
 *   geometry — flight error bars are dashed modelled bands, not solid SD whiskers
 *
 * Continuous motion (hatch drift, marching ants, shimmer, breathing caps) runs
 * off frame.time, so the picture is alive at progress 0 and 1 while the build
 * choreography runs off the beat's own progress.
 */

import { clamp01, remap, cubicOut, sineInOut, settle } from '../core/easing.js';

/* ---------------------------------------------------------------- geometry */

const PLOT_L = 300, PLOT_R = 1420;
const BASE_Y = 742, TOP_Y = 208; // 0 % and 100 %
const PPP = (BASE_Y - TOP_Y) / 100; // px per percentage point
const yFor = (v) => BASE_Y - v * PPP;

const BAR_W = 118, HALF_GAP = 13; // bar width, half the gap inside a pair
const GROUPS = [
  { cx: 560, label: 'STANDARD' },
  { cx: 1090, label: 'HIGH-PEG' },
];

// NOTHING HERE HAS BEEN MEASURED. No sample has been frozen at CSS and none has
// flown. Both series are modelled from published LNP freeze/thaw literature and
// exist to show the SHAPE of the result the experiment tests for. Labelling
// either series "measured" in front of investors would be a fabrication, so the
// scene states its own status on screen rather than relying on the narrator.
const BARS = [
  { gi: 0, kind: 'ground', v: 68.2, e: 2.6 },
  { gi: 0, kind: 'flight', v: 79.4, e: 4.8 },
  { gi: 1, kind: 'ground', v: 81.6, e: 2.2 },
  { gi: 1, kind: 'flight', v: 87.1, e: 4.1 },
];

const TICKS = [0, 20, 40, 60, 80, 100];
const SPEC = 75.0; // release specification — the dashed reference line
const RAIL_X = 1470;
const RAIL_NOTES = [
  [386, 'Nothing has run yet.'], [424, 'Both series are modelled'],
  [462, 'from published LNP'], [500, 'freeze/thaw literature.'],
  [552, 'Δ = predicted gain (pp)'], [590, 'n = 8 tubes per bar,'],
  [628, 'planned'], [680, 'Dashed: spec ≥ 75 % EE'],
];

/* --------------------------------------------------------------- utilities */

/** Windowed 0..1 progress, clamped, safe when the window has no width. */
const winF = (p, a, b) => (b <= a ? (p >= b ? 1 : 0) : clamp01(remap(p, a, b, 0, 1)));

/** Queue horizontal dash segments onto the current path. */
function dashH(g, x0, x1, y, dash, gap, phase) {
  if (x1 <= x0) return;
  const period = dash + gap;
  let x = x0 - (((phase % period) + period) % period);
  for (let n = 0; x < x1 && n < 400; n++, x += period) {
    const a = Math.max(x0, x), b = Math.min(x1, x + dash);
    if (b > a) g.moveTo(a, y).lineTo(b, y);
  }
}

/** Queue vertical dash segments onto the current path. */
function dashV(g, x, y0, y1, dash, gap, phase) {
  if (y1 <= y0) return;
  const period = dash + gap;
  let y = y0 - (((phase % period) + period) % period);
  for (let n = 0; y < y1 && n < 400; n++, y += period) {
    const a = Math.max(y0, y), b = Math.min(y1, y + dash);
    if (b > a) g.moveTo(x, a).lineTo(x, b);
  }
}

/**
 * Queue 45° hatch lines clipped to a rect. Lines satisfy x - y = c, so sliding
 * `phase` by one spacing maps the pattern onto itself and the drift loops
 * seamlessly — no visible seam on a reel that runs all day.
 */
function hatchRect(g, x0, y0, x1, y1, spacing, phase) {
  if (x1 - x0 < 1 || y1 - y0 < 1) return;
  const cMax = x1 - y0;
  let c = Math.floor((x0 - y1 - phase) / spacing) * spacing + phase;
  for (let n = 0; c <= cMax && n < 200; n++, c += spacing) {
    const ya = Math.max(y0, x0 - c), yb = Math.min(y1, x1 - c);
    if (yb > ya + 0.5) g.moveTo(ya + c, ya).lineTo(yb + c, yb);
  }
}

/** Solid triangular arrowhead; dir -1 points up, +1 points down. */
function arrowHead(g, x, y, size, dir) {
  g.moveTo(x, y).lineTo(x - size * 0.52, y + size * dir).lineTo(x + size * 0.52, y + size * dir);
}

/* ------------------------------------------------------------------- scene */

export default {
  id: 'compare',

  build(ctx) {
    const { PIXI, palette, width, height, text, font, mono } = ctx;

    const view = new PIXI.Container();
    // Pivot at frame centre so the whole figure breathes about its middle.
    view.pivot.set(width / 2, height / 2);
    view.position.set(width / 2, height / 2);

    // Deterministic scatter for the "samples accumulating" motes. Seeded once,
    // never re-rolled, so an offline capture is frame-for-frame reproducible.
    let s = 12345;
    const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const DOTS = 5;
    const motePhase = [], moteX = [];
    for (let i = 0; i < BARS.length * DOTS; i++) { motePhase.push(rnd()); moteX.push(rnd()); }

    const bars = BARS.map((b, i) => {
      const cx = GROUPS[b.gi].cx;
      const x = b.kind === 'ground' ? cx - HALF_GAP - BAR_W : cx + HALF_GAP;
      return {
        ...b, i, x, cx: x + BAR_W / 2,
        top: yFor(b.v), errTop: yFor(b.v + b.e), errBot: yFor(b.v - b.e),
        start: 0.12 + i * 0.05, grow: 0.24, errAt: 0.44 + i * 0.03,
      };
    });

    const groups = GROUPS.map((g, gi) => {
      const gr = bars.find((b) => b.gi === gi && b.kind === 'ground');
      const fl = bars.find((b) => b.gi === gi && b.kind === 'flight');
      return { ...g, gi, gr, fl, dimX: g.cx + 175, delta: fl.v - gr.v, at: 0.6 + gi * 0.065 };
    });

    /* ---------------------------------------------------------- layers */

    const plotG = new PIXI.Graphics();
    const columnG = new PIXI.Graphics();
    const gridG = new PIXI.Graphics();
    const axisG = new PIXI.Graphics();
    const ghostG = new PIXI.Graphics();
    const deltaG = new PIXI.Graphics(); // under the bars: leaders pass behind
    const barG = new PIXI.Graphics();
    const hatchG = new PIXI.Graphics();
    const edgeG = new PIXI.Graphics();
    const errG = new PIXI.Graphics();
    const refG = new PIXI.Graphics();
    const railG = new PIXI.Graphics();
    const plateG = new PIXI.Graphics();
    const textLayer = new PIXI.Container();
    view.addChild(plotG, columnG, gridG, axisG, ghostG, deltaG, barG,
      hatchG, edgeG, errG, refG, railG, plateG, textLayer);

    /* ------------------------------------------------------------ type */

    const axisTitle = text('Encapsulation efficiency (%)', {
      size: 34, color: palette.inkDim, weight: '500',
    });
    axisTitle.anchor.set(0.5, 0.5);
    axisTitle.rotation = -Math.PI / 2;
    axisTitle.position.set(140, (BASE_Y + TOP_Y) / 2);
    textLayer.addChild(axisTitle);

    const tickLabels = TICKS.map((v) => {
      const t = text(String(v), { size: 30, color: palette.inkDim, mono: true });
      t.anchor.set(1, 0.5);
      t.position.set(272, yFor(v));
      return textLayer.addChild(t);
    });

    const catLabels = groups.map((g) => {
      const t = text(g.label, { size: 34, color: palette.ink, weight: '600', letterSpacing: 3 });
      t.anchor.set(0.5, 0);
      t.position.set(g.cx, 760);
      return textLayer.addChild(t);
    });

    const valueLabels = bars.map((b) => {
      const t = text('0.0', {
        size: 34, mono: true, weight: '600',
        color: b.kind === 'ground' ? palette.ink : palette.signal,
      });
      t.anchor.set(0.5, 1);
      t.position.set(b.cx, b.errTop - 12);
      return textLayer.addChild(t);
    });
    const valueShown = bars.map(() => '');

    const deltaLabels = groups.map((g) => {
      const t = text(`Δ +${g.delta.toFixed(1)}`, {
        size: 32, color: palette.warm, weight: '600', mono: true,
      });
      t.anchor.set(0, 0.5);
      t.position.set(g.dimX + 18, (g.gr.top + g.fl.top) / 2);
      return textLayer.addChild(t);
    });

    const refLabel = text('SPEC ≥ 75 %', {
      size: 30, color: palette.ink, weight: '600', letterSpacing: 2,
    });
    refLabel.anchor.set(1, 1);
    refLabel.position.set(PLOT_R - 6, yFor(SPEC) - 14);
    textLayer.addChild(refLabel);

    // Sits above the plot rather than inside it: at 245 it collided with the
    // 79.4 value label on the first standard bar.
    const badgeLabel = text('ILLUSTRATIVE · NO DATA COLLECTED YET', {
      size: 32, color: palette.lipid, weight: '600', letterSpacing: 1.5,
    });
    badgeLabel.anchor.set(0, 0.5);
    badgeLabel.position.set(334, 150);
    textLayer.addChild(badgeLabel);

    const keyLabel = text('KEY', {
      size: 30, color: palette.inkFaint, weight: '600', letterSpacing: 5,
    });
    keyLabel.position.set(RAIL_X, 214);
    textLayer.addChild(keyLabel);

    const legGround = text('GROUND · MODELLED', { size: 30, color: palette.ink });
    legGround.anchor.set(0, 0.5);
    legGround.position.set(RAIL_X + 70, 281);
    textLayer.addChild(legGround);

    const legFlight = text('FLIGHT · PREDICTED', { size: 30, color: palette.signal });
    legFlight.anchor.set(0, 0.5);
    legFlight.position.set(RAIL_X + 70, 337);
    textLayer.addChild(legFlight);

    const noteLabels = RAIL_NOTES.map(([y, str]) => {
      const t = text(str, { size: 30, color: palette.inkDim });
      t.position.set(RAIL_X, y);
      return textLayer.addChild(t);
    });

    /** Backing plate, so type stays readable wherever a rule crosses it. */
    const plate = (g, t, padX = 12) => {
      if (t.alpha <= 0.02) return;
      const w = t.width, h = t.height;
      g.roundRect(t.x - t.anchor.x * w - padX, t.y - t.anchor.y * h - 4,
        w + padX * 2, h + 8, 7).fill({ color: palette.void, alpha: 0.82 * t.alpha });
    };

    /* ---------------------------------------------------------- update */

    return {
      view,

      update(frame, weight, progress) {
        const t = frame.time ?? 0;
        const p = clamp01(progress);
        const bloom = frame.values?.bloom ?? 0.5;
        const drift = frame.values?.drift ?? 0;
        const glow = 0.55 + 0.45 * clamp01(bloom);
        const span = PLOT_R - PLOT_L;
        const hatchPhase = (((t * 15) % 24) + 24) % 24;

        // Whole-figure breath, plus a hair of scale-in on the cross-dissolve.
        view.scale.set(0.988 + 0.012 * weight + 0.0016 * Math.sin(t * 0.5));

        /* -- plot ground and the drifting light column ------------------ */
        plotG.clear();
        plotG.roundRect(PLOT_L - 6, TOP_Y - 10, span + 12, BASE_Y - TOP_Y + 20, 10)
          .fill({ color: palette.ground, alpha: 0.55 });

        columnG.clear();
        const colF = ((((t * 0.05 + drift * 0.4) % 1) + 1) % 1);
        const colX = PLOT_L - 140 + colF * (span + 280);
        for (let i = 6; i >= 0; i--) {
          const half = 18 + i * 24;
          const x0 = Math.max(PLOT_L, colX - half), x1 = Math.min(PLOT_R, colX + half);
          if (x1 > x0) {
            columnG.rect(x0, TOP_Y, x1 - x0, BASE_Y - TOP_Y)
              .fill({ color: palette.signal, alpha: 0.055 * (1 - i / 7.5) * glow });
          }
        }

        /* -- gridlines --------------------------------------------------- */
        const gridA = 0.5 + 0.5 * clamp01(p / 0.1);
        gridG.clear();
        for (let k = 1; k < TICKS.length; k++) {
          const y = yFor(TICKS[k]);
          gridG.moveTo(PLOT_L, y).lineTo(PLOT_R, y);
          gridG.stroke({
            width: 3, color: palette.rule,
            alpha: gridA * (0.62 + 0.2 * Math.sin(t * 0.7 + k * 0.9)),
          });
        }

        /* -- axes, ticks, group brackets --------------------------------- */
        axisG.clear();
        axisG.moveTo(PLOT_L - 18, BASE_Y).lineTo(PLOT_R, BASE_Y);
        axisG.moveTo(PLOT_L, BASE_Y).lineTo(PLOT_L, TOP_Y);
        for (const v of TICKS) axisG.moveTo(PLOT_L - 18, yFor(v)).lineTo(PLOT_L, yFor(v));
        axisG.stroke({ width: 4, color: palette.inkFaint, alpha: gridA });

        const brA = winF(p, 0.06, 0.18);
        for (const g of groups) {
          const halfw = (BAR_W + HALF_GAP - 14) * cubicOut(brA);
          axisG.moveTo(g.cx - halfw, 752).lineTo(g.cx + halfw, 752);
          axisG.moveTo(g.cx - halfw, 752).lineTo(g.cx - halfw, 744);
          axisG.moveTo(g.cx + halfw, 752).lineTo(g.cx + halfw, 744);
        }
        axisG.stroke({ width: 3, color: palette.inkFaint, alpha: 0.8 * brA });

        for (const l of tickLabels) l.alpha = gridA;
        for (const l of catLabels) l.alpha = brA;
        axisTitle.alpha = gridA;

        /* -- empty slots and accumulating motes -------------------------- */
        ghostG.clear();
        const grows = bars.map((b) => cubicOut(winF(p, b.start, b.start + b.grow)));
        for (let i = 0; i < bars.length; i++) {
          const b = bars[i];
          const ghost = (1 - grows[i]) * (0.34 + 0.14 * Math.sin(t * 1.6 + i * 1.1));
          if (ghost > 0.02) {
            dashH(ghostG, b.x, b.x + BAR_W, TOP_Y, 14, 10, t * 6);
            dashV(ghostG, b.x, TOP_Y, BASE_Y, 14, 10, -t * 6);
            dashV(ghostG, b.x + BAR_W, TOP_Y, BASE_Y, 14, 10, t * 6);
            ghostG.stroke({ width: 3, color: palette.inkFaint, alpha: ghost });
          }
          const moteA = (1 - grows[i]) * 0.6;
          if (moteA <= 0.02) continue;
          const tint = b.kind === 'ground' ? palette.cold : palette.signal;
          for (let j = 0; j < DOTS; j++) {
            const idx = i * DOTS + j;
            const f = ((((t * 0.2 + motePhase[idx]) % 1) + 1) % 1);
            const a = moteA * Math.sin(Math.PI * f);
            if (a > 0.03) {
              ghostG.circle(b.x + 22 + moteX[idx] * (BAR_W - 44),
                BASE_Y - f * (BASE_Y - TOP_Y), 4).fill({ color: tint, alpha: a });
            }
          }
        }

        /* -- bars -------------------------------------------------------- */
        barG.clear(); hatchG.clear(); edgeG.clear();
        for (let i = 0; i < bars.length; i++) {
          const b = bars[i];
          const h = (BASE_Y - b.top) * grows[i];
          if (h < 1) continue;
          const top = BASE_Y - h;
          const capA = 0.7 + 0.3 * Math.sin(t * 1.8 + i);

          if (b.kind === 'ground') {
            barG.rect(b.x, top, BAR_W, h).fill({ color: palette.cold, alpha: 0.86 });
            // Depth: the base sits back, the cap catches the light.
            barG.rect(b.x, BASE_Y - h * 0.4, BAR_W, h * 0.4)
              .fill({ color: palette.void, alpha: 0.2 });
            edgeG.moveTo(b.x, top).lineTo(b.x + BAR_W, top);
            edgeG.stroke({ width: 5, color: palette.ink, alpha: capA });
          } else {
            barG.rect(b.x, top, BAR_W, h).fill({ color: palette.panel, alpha: 0.9 });
            hatchRect(hatchG, b.x + 2, top + 2, b.x + BAR_W - 2, BASE_Y - 2, 24, hatchPhase);
            hatchG.stroke({ width: 3, color: palette.signal, alpha: 0.34 * glow + 0.14 });
            edgeG.rect(b.x, top, BAR_W, h)
              .stroke({ width: 3, color: palette.signal, alpha: 0.85 });
            edgeG.moveTo(b.x, top).lineTo(b.x + BAR_W, top);
            edgeG.stroke({ width: 5, color: palette.signal, alpha: capA * glow });
          }
        }

        /* -- error bars -------------------------------------------------- */
        errG.clear();
        for (let i = 0; i < bars.length; i++) {
          const b = bars[i];
          const e = cubicOut(winF(p, b.errAt, b.errAt + 0.1));
          if (e <= 0.01) continue;
          const yt = b.top + (b.errTop - b.top) * e;
          const yb = b.top + (b.errBot - b.top) * e;
          const cap = (13 + 2.2 * Math.sin(t * 2.4 + i * 1.3)) * e;

          if (b.kind === 'ground') {
            errG.moveTo(b.cx, yt).lineTo(b.cx, yb);
          } else {
            // Modelled band: a dashed shaft marks it as an interval, not an SD.
            dashV(errG, b.cx, yt, yb, 11, 8, t * 9);
          }
          errG.moveTo(b.cx - cap, yt).lineTo(b.cx + cap, yt);
          errG.moveTo(b.cx - cap, yb).lineTo(b.cx + cap, yb);
          errG.stroke({
            width: 4, alpha: 0.92,
            color: b.kind === 'ground' ? palette.ink : palette.signal,
          });
        }

        /* -- value labels, counting up as the bar rises ------------------ */
        for (let i = 0; i < bars.length; i++) {
          const b = bars[i];
          const a = winF(p, b.start + 0.16, b.start + 0.28);
          valueLabels[i].alpha = a;
          valueLabels[i].y = b.errTop - 12 + (1 - Math.min(1, settle(a))) * 16;
          const str = (b.v * grows[i]).toFixed(1);
          if (valueShown[i] !== str) { valueLabels[i].text = str; valueShown[i] = str; }
        }

        /* -- dashed reference line sweeping across ----------------------- */
        refG.clear();
        const sweep = cubicOut(winF(p, 0.72, 0.88));
        const refY = yFor(SPEC);
        if (sweep > 0.001) {
          const xEnd = PLOT_L + span * sweep;
          dashH(refG, PLOT_L, xEnd, refY, 22, 14, t * 12);
          refG.stroke({ width: 4, color: palette.ink, alpha: 0.72 });
          refG.circle(xEnd, refY, 6).fill({
            color: palette.ink,
            alpha: sweep < 0.999 ? 0.95 : 0.35 + 0.35 * Math.sin(t * 2.6),
          });
        }
        refLabel.alpha = winF(p, 0.84, 0.94);

        /* -- delta dimensions -------------------------------------------- */
        deltaG.clear();
        for (const g of groups) {
          const ext = cubicOut(winF(p, g.at, g.at + 0.1));
          if (ext <= 0.01) continue;
          const endX = g.dimX + 12;
          const gS = g.cx - HALF_GAP, fS = g.cx + HALF_GAP + BAR_W;
          dashH(deltaG, gS, gS + (endX - gS) * ext, g.gr.top, 9, 8, -t * 7);
          dashH(deltaG, fS, fS + (endX - fS) * ext, g.fl.top, 9, 8, -t * 7);
          deltaG.stroke({ width: 3, color: palette.warm, alpha: 0.6 * ext });

          const rise = cubicOut(winF(p, g.at + 0.05, g.at + 0.15));
          if (rise > 0.01) {
            const mid = (g.gr.top + g.fl.top) / 2;
            const half = ((g.gr.top - g.fl.top) / 2) * rise;
            deltaG.moveTo(g.dimX, mid - half).lineTo(g.dimX, mid + half);
            deltaG.stroke({ width: 4, color: palette.warm, alpha: 0.95 });
            if (rise > 0.9) {
              const sz = 13 + 1.6 * Math.sin(t * 3 + g.gi);
              // Tight spans get their arrows outside pointing in — drafting
              // convention, and it keeps a 5 pp delta readable from the back row.
              const out = half * 2 >= 46 ? 0 : sz + 4;
              arrowHead(deltaG, g.dimX, mid - half - out, sz, 1);
              arrowHead(deltaG, g.dimX, mid + half + out, sz, -1);
              deltaG.fill({ color: palette.warm, alpha: 0.95 });
            }
          }
          const la = winF(p, g.at + 0.08, g.at + 0.2);
          deltaLabels[g.gi].alpha = la;
          deltaLabels[g.gi].x = g.dimX + 18 + (1 - Math.min(1, settle(la))) * 18;
        }

        /* -- banner and legend rail -------------------------------------- */
        railG.clear();
        const badgeA = winF(p, 0.14, 0.26);
        badgeLabel.alpha = badgeA;
        if (badgeA > 0.02) {
          const bw = badgeLabel.width + 48;
          railG.roundRect(310, 119, bw, 62, 10)
            .fill({ color: palette.void, alpha: 0.7 * badgeA });
          railG.roundRect(310, 119, bw, 62, 10).stroke({
            width: 3, color: palette.lipid,
            alpha: badgeA * (0.6 + 0.4 * Math.abs(Math.sin(t * 1.3))),
          });
          // Hazard hatch on the banner's leading edge: texture, not colour.
          hatchRect(railG, 314, 123, 342, 177, 16, (((t * 11) % 16) + 16) % 16);
          railG.stroke({ width: 3, color: palette.lipid, alpha: 0.6 * badgeA });
        }

        const keyA = sineInOut(winF(p, 0.2, 0.34));
        keyLabel.alpha = keyA * 0.9;
        legGround.alpha = keyA;
        legFlight.alpha = keyA;
        if (keyA > 0.02) {
          railG.rect(RAIL_X, 262, 54, 38).fill({ color: palette.cold, alpha: 0.86 * keyA });
          railG.moveTo(RAIL_X, 262).lineTo(RAIL_X + 54, 262);
          railG.stroke({ width: 5, color: palette.ink, alpha: 0.9 * keyA });
          railG.rect(RAIL_X, 318, 54, 38).fill({ color: palette.panel, alpha: 0.9 * keyA });
          hatchRect(railG, RAIL_X + 2, 320, RAIL_X + 52, 354, 16, hatchPhase % 16);
          railG.stroke({ width: 3, color: palette.signal, alpha: 0.55 * keyA });
          railG.rect(RAIL_X, 318, 54, 38)
            .stroke({ width: 3, color: palette.signal, alpha: 0.9 * keyA });
        }
        for (let k = 0; k < noteLabels.length; k++) {
          noteLabels[k].alpha = sineInOut(winF(p, 0.24 + k * 0.03, 0.38 + k * 0.03)) * 0.95;
        }

        /* -- backing plates last, so type always wins -------------------- */
        plateG.clear();
        for (const l of valueLabels) plate(plateG, l);
        for (const l of deltaLabels) plate(plateG, l);
        plate(plateG, refLabel, 14);
      },
    };
  },
};
