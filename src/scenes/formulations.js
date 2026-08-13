/**
 * Beat: "formulations" - Sixteen tubes.
 *
 * A 4x4 rack of microcentrifuge tubes drawn as an engineering elevation that
 * came alive. The left two columns are the STANDARD formulation, the right two
 * are HIGH-PEG; the pairs differ by tint, by cap banding, and by the striations
 * in the liquid, so the split survives a colour-blind viewer and a badly
 * calibrated projector alike.
 *
 * Choreography, in beat progress:
 *   0.00-0.34  tube outlines stroke on, like a plotter drawing the rack
 *   0.12-0.57  a staggered cascade of fills, row by row, left to right, the way
 *              a multichannel pipette actually walks a rack
 *   0.29-0.73  caps drop and seal with a damped settle and a squash on contact
 *   0.56-0.78  a volume dimension calls out 25 uL on the leading tube
 *   0.62-0.90  a dimension bracket sweeps under the rack reading 16 x 25 uL
 *   hold       a QC reticle steps tube to tube forever, so nothing is ever still
 *
 * Nothing here reads window, nothing touches the global RNG (the scatter comes
 * from a seeded LCG, drained during build and never again), and every display
 * object is created once. Frame-exact capture depends on all three.
 */

import { clamp01, remap, cubicOut, sineInOut, settle } from '../core/easing.js';

/* ---------------------------------------------------------------- geometry */

// Two tight pairs, one wide gutter: the split reads before the labels do.
const COL_X = [578, 762, 1158, 1342];
const ROW_Y = [152, 308, 464, 620];
const GROUP_CX = [670, 1250];
const GROUP_SPAN = [[541, 799], [1121, 1379]];

const PANEL = { x0: 490, y0: 140, x1: 1430, y1: 812 };
const RACK_X0 = 541;
const RACK_X1 = 1379;
const BRACKET_Y = 790;
const HEAD_Y = 66;
const DETAIL_Y = 104;
const GBRACKET_Y = 126;
const N = 16;

// Tube elevation, local coords: x = 0 is the axis, y = 0 is the top of the cap.
// Slender on purpose - a 1.5 mL tube is about two and a half times as tall as
// it is wide, and anything squatter reads as a funnel. `in*` is the interior,
// inset by the wall thickness; `fullY` is the surface at nominal volume.
const T = {
  capW: 78, capH: 22, lipHalf: 36, mouthY: 22, lipBotY: 32,
  bodyHalf: 30, coneY: 104, tipHalf: 7, coneBotY: 137, tipY: 144,
  inHalf: 26, inConeBot: 134, inTipHalf: 4, fullY: 62, emptyY: 132,
};

/* ----------------------------------------------------------------- helpers */

const mix = (a, b, t) => a + (b - a) * t;

/** Normalised, clamped window: 0 before `a`, 1 after `b`. */
const win = (v, a, b) => clamp01(remap(v, a, b, 0, 1));

function mixColor(a, b, t) {
  const k = clamp01(t);
  const r = mix((a >> 16) & 255, (b >> 16) & 255, k) | 0;
  const g = mix((a >> 8) & 255, (b >> 8) & 255, k) | 0;
  return (r << 16) | (g << 8) | (mix(a & 255, b & 255, k) | 0);
}

/** Interior half-width of the tube at a given local y. */
function innerHalf(y) {
  if (y <= T.coneY) return T.inHalf;
  return mix(T.inHalf, T.inTipHalf, clamp01((y - T.coneY) / (T.inConeBot - T.coneY)));
}

/**
 * Closed silhouette of one tube, minus the cap, as [x, y] pairs with cumulative
 * arc length. Drawn as a partial polyline so the outline can ink itself on.
 */
function buildSilhouette() {
  const { lipHalf: L, bodyHalf: B, tipHalf: R, mouthY: M, lipBotY: LB } = T;
  const C = T.coneY;
  const CB = T.coneBotY;
  const p = [[-L, M], [-L, LB], [-B, LB], [-B, C], [-R, CB]];
  for (let i = 1; i <= 8; i++) {
    const a = Math.PI - (Math.PI * i) / 8;
    p.push([Math.cos(a) * R, CB + Math.sin(a) * R]);
  }
  p.push([B, C], [B, LB], [L, LB], [L, M], [-L, M]);

  const cum = [0];
  for (let i = 1; i < p.length; i++) {
    cum[i] = cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  }
  return { pts: p, cum, total: cum[cum.length - 1] };
}

/** Nothing may be drawn under the title block or behind the corner readout. */
const clearOK = (x, y, r) => y + r < 814 && !(x + r > 1444 && y - r < 140);

export default {
  id: 'formulations',

  build(ctx) {
    const { PIXI, palette, width, height, text } = ctx;

    // Deterministic scatter. Seeded once, never touched again after build.
    let s = 12345;
    const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;

    const view = new PIXI.Container();
    const stage = new PIXI.Container();
    stage.pivot.set(width / 2, height / 2);
    stage.position.set(width / 2, height / 2);
    view.addChild(stage);

    const bg = new PIXI.Graphics();
    const rig = new PIXI.Graphics();
    const glow = new PIXI.Graphics();
    const tubeLayer = new PIXI.Container();
    const capLayer = new PIXI.Container();
    const reticle = new PIXI.Graphics();
    const labels = new PIXI.Container();
    stage.addChild(bg, rig, glow, tubeLayer, capLayer, reticle, labels);

    const sil = buildSilhouette();
    const TINT = [palette.lipid, palette.signal];

    /* --- tubes ------------------------------------------------------- */
    const tubes = [];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const group = col < 2 ? 0 : 1;
        const order = row * 4 + col; // a four-channel pipette walks rows
        const g = new PIXI.Graphics();
        g.position.set(COL_X[col], ROW_Y[row]);
        tubeLayer.addChild(g);

        // Plug first: it seats down inside the mouth, so a closed cap reads as
        // closed rather than as a bar hovering over the tube.
        const cap = new PIXI.Graphics();
        cap.rect(-25, -3, 50, 14)
          .fill({ color: palette.ground, alpha: 0.98 })
          .stroke({ width: 3, color: palette.inkFaint, alpha: 0.7 });
        cap.roundRect(-T.capW / 2, -T.capH, T.capW, T.capH, 5)
          .fill({ color: palette.panel, alpha: 0.99 })
          .stroke({ width: 3, color: palette.ink, alpha: 0.92 });
        cap.roundRect(-T.capW / 2 - 11, -18, 11, 13, 3)
          .fill({ color: palette.rule })
          .stroke({ width: 3, color: palette.inkFaint, alpha: 0.85 });
        if (group === 0) {
          cap.rect(-30, -17, 60, 5).fill({ color: TINT[0], alpha: 0.95 });
        } else {
          cap.rect(-30, -18, 60, 4).fill({ color: TINT[1], alpha: 0.95 });
          cap.rect(-30, -9, 60, 4).fill({ color: TINT[1], alpha: 0.95 });
        }
        cap.moveTo(-17, -19).lineTo(-17, -4).moveTo(17, -19).lineTo(17, -4)
          .stroke({ width: 3, color: palette.inkFaint, alpha: 0.5 });
        cap.position.set(COL_X[col], ROW_Y[row] + T.mouthY);
        capLayer.addChild(cap);

        const bubbles = [];
        for (let b = 0; b < 3; b++) {
          bubbles.push({
            x: (rnd() * 2 - 1) * 0.7, sp: 0.15 + rnd() * 0.22,
            ph: rnd(), r: 2.4 + rnd() * 1.8,
          });
        }
        const frost = [];
        for (let f = 0; f < 5; f++) {
          frost.push({ y: 44 + rnd() * 70, side: rnd() < 0.5 ? -1 : 1, len: 6 + rnd() * 8 });
        }

        const t0 = 0.12 + order * 0.02;
        tubes.push({
          row, group, order, g, cap, bubbles, frost,
          cx: COL_X[col], top: ROW_Y[row], phase: rnd() * Math.PI * 2,
          revA: 0.01 + order * 0.012, revB: 0.14 + order * 0.012,
          fillA: t0, fillB: t0 + 0.17,
          sealA: t0 + 0.17, sealB: t0 + 0.33,
        });
      }
    }
    // The reticle inspects in the same order the rack was filled.
    const visit = tubes.slice().sort((a, b) => a.order - b.order);

    /* --- dust motes -------------------------------------------------- */
    const motes = [];
    for (let i = 0; i < 46; i++) {
      motes.push({
        x: 40 + rnd() * 1840, y: rnd() * 780, sp: 6 + rnd() * 16,
        ph: rnd() * Math.PI * 2, r: 1.4 + rnd() * 2.2,
      });
    }

    /* --- type -------------------------------------------------------- */
    const HEAD = ['STANDARD', 'HIGH-PEG'];
    const DETAIL = ['1.5 mol% PEG · n=8', '5.0 mol% PEG · n=8'];
    const headers = [];
    const details = [];
    for (let i = 0; i < 2; i++) {
      const h = text(HEAD[i], { size: 36, weight: '700', letterSpacing: 8 });
      h.anchor.set(0.5);
      h.position.set(GROUP_CX[i], HEAD_Y);
      const d = text(DETAIL[i], { size: 30, color: palette.inkDim, mono: true });
      d.anchor.set(0.5);
      d.position.set(GROUP_CX[i], DETAIL_Y);
      labels.addChild(h, d);
      headers.push(h);
      details.push(d);
    }
    const markerX = GROUP_CX.map((cx, i) => cx - headers[i].width / 2 - 34);

    const rowLabels = [];
    for (let r = 0; r < 4; r++) {
      const t = text(String.fromCharCode(65 + r), {
        size: 32, color: palette.inkFaint, mono: true,
      });
      t.anchor.set(1, 0.5);
      t.position.set(446, ROW_Y[r] + 74);
      labels.addChild(t);
      rowLabels.push(t);
    }

    const dimLabel = text('16 × 25 µL', { size: 36, weight: '600', letterSpacing: 2 });
    dimLabel.anchor.set(0.5);
    dimLabel.position.set(960, BRACKET_Y);

    const volLabel = text('25 µL', { size: 32, mono: true });
    volLabel.anchor.set(0, 0.5);
    volLabel.position.set(1484, ROW_Y[0] + (T.fullY + T.inConeBot) / 2);
    labels.addChild(dimLabel, volLabel);

    /* --- per-frame scratch, allocated once --------------------------- */
    const fillOf = new Float32Array(N);
    const levelOf = new Float32Array(N);
    const rowFill = new Float32Array(4);
    const CORNER = [
      [PANEL.x0, PANEL.y0, 1, 1], [PANEL.x1, PANEL.y0, -1, 1],
      [PANEL.x0, PANEL.y1, 1, -1], [PANEL.x1, PANEL.y1, -1, -1],
    ];
    const QUAD = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    const GLASS = [
      -T.lipHalf, T.mouthY, -T.bodyHalf, T.lipBotY, -T.bodyHalf, T.coneY,
      -T.tipHalf, T.coneBotY, T.tipHalf, T.coneBotY, T.bodyHalf, T.coneY,
      T.bodyHalf, T.lipBotY, T.lipHalf, T.mouthY,
    ];
    const liquid = []; // reused polygon buffer, never reallocated

    /** Partial polyline stroke: the "plotter drawing itself" reveal. */
    function strokePartial(g, r, color, alpha) {
      const target = sil.total * clamp01(r);
      if (target < 1) return;
      const p = sil.pts;
      g.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) {
        if (sil.cum[i] <= target) {
          g.lineTo(p[i][0], p[i][1]);
        } else {
          const seg = sil.cum[i] - sil.cum[i - 1];
          const k = seg > 0 ? (target - sil.cum[i - 1]) / seg : 0;
          g.lineTo(mix(p[i - 1][0], p[i][0], k), mix(p[i - 1][1], p[i][1], k));
          break;
        }
      }
      g.stroke({ width: 3, color, alpha: clamp01(alpha), cap: 'round', join: 'round' });
    }

    return {
      view,

      update(frame, weight, progress) {
        const time = frame.time;
        const p = progress;
        const chill = frame.values?.chill ?? 0;
        const bloom = frame.values?.bloom ?? 0.15;
        const drift = frame.values?.drift ?? 0;
        const breathe = sineInOut((Math.sin(time * 0.55) + 1) / 2);
        const scanX = 960 + Math.sin(time * 0.42) * 560;

        // The rack eases its last two per cent of scale as the beat lands.
        stage.scale.set(1 + (1 - clamp01(weight)) * 0.02);
        stage.x = width / 2 + Math.sin(drift * Math.PI * 2) * 4;

        /* ---- ambient ground ----------------------------------------- */
        bg.clear();
        bg.roundRect(PANEL.x0, PANEL.y0, PANEL.x1 - PANEL.x0, PANEL.y1 - PANEL.y0, 8)
          .fill({ color: palette.panel, alpha: 0.4 });

        const gx = Math.sin(time * 0.07) * 8;
        const gy = Math.cos(time * 0.055) * 6;
        for (let x = 32; x < 1912; x += 64) {
          const px = x + gx;
          bg.moveTo(px, px > 1450 ? 144 : 10).lineTo(px, 810);
        }
        for (let y = 40; y < 812; y += 64) {
          const py = y + gy;
          bg.moveTo(10, py).lineTo(py < 140 ? 1440 : 1910, py);
        }
        bg.stroke({ width: 3, color: palette.grid, alpha: 0.3 });

        for (let i = 0; i < motes.length; i++) {
          const m = motes[i];
          const mx = m.x + Math.sin(time * 0.3 + m.ph) * 16;
          const my = ((((m.y - time * m.sp) % 780) + 780) % 780) + 16;
          if (!clearOK(mx, my, m.r)) continue;
          bg.circle(mx, my, m.r).fill({
            color: palette.inkFaint,
            alpha: 0.1 + 0.14 * (0.5 + 0.5 * Math.sin(time * 1.1 + m.ph)),
          });
        }

        /* ---- tube states -------------------------------------------- */
        rowFill[0] = rowFill[1] = rowFill[2] = rowFill[3] = 0;
        for (let i = 0; i < N; i++) {
          const tb = tubes[i];
          const f = cubicOut(win(p, tb.fillA, tb.fillB));
          fillOf[i] = f;
          const wob = f > 0.02 ? Math.sin(time * 2.1 + tb.phase) * 1.1 * f : 0;
          levelOf[i] = mix(T.emptyY, T.fullY, Math.pow(f, 0.62)) + wob;
          if (f > rowFill[tb.row]) rowFill[tb.row] = f;
        }

        /* ---- drawing rig: panel, construction lines, dimensions ------ */
        rig.clear();
        for (let i = 0; i < CORNER.length; i++) {
          const [cx, cy, sx, sy] = CORNER[i];
          rig.moveTo(cx, cy).lineTo(cx + 34 * sx, cy);
          rig.moveTo(cx, cy).lineTo(cx, cy + 34 * sy);
        }
        rig.stroke({ width: 3, color: palette.rule, alpha: 0.85 });
        rig.roundRect(PANEL.x0, PANEL.y0, PANEL.x1 - PANEL.x0, PANEL.y1 - PANEL.y0, 8)
          .stroke({ width: 3, color: palette.rule, alpha: 0.3 });

        // Column centre lines, crawling slowly so the drawing never freezes.
        const crawl = (time * 3) % 36;
        for (let c = 0; c < 4; c++) {
          for (let y = PANEL.y0 + 6 - crawl; y < PANEL.y1 - 6; y += 36) {
            const a = Math.max(PANEL.y0 + 6, y);
            const b = Math.min(PANEL.y1 - 6, y + 22);
            if (b > a) rig.moveTo(COL_X[c], a).lineTo(COL_X[c], b);
          }
        }
        rig.stroke({ width: 3, color: palette.grid, alpha: 0.75 });

        // Level reference: proof that all sixteen fill to the same line.
        for (let r = 0; r < 4; r++) {
          if (rowFill[r] < 0.02) continue;
          const y = ROW_Y[r] + T.fullY;
          const reach = 504 + 912 * clamp01(rowFill[r]);
          for (let x = 504; x < reach; x += 44) {
            rig.moveTo(x, y).lineTo(Math.min(x + 22, reach), y);
          }
        }
        rig.stroke({ width: 3, color: palette.inkFaint, alpha: 0.22 });

        // Rack index rail down the left margin, ticked at every row.
        const sr = cubicOut(win(p, 0.06, 0.32));
        if (sr > 0.001) {
          const yy = mix(ROW_Y[0] + 18, ROW_Y[3] + 122, sr);
          rig.moveTo(466, ROW_Y[0] + 18).lineTo(466, yy);
          for (let r = 0; r < 4; r++) {
            const ty = ROW_Y[r] + 74;
            if (ty < yy) rig.moveTo(466, ty).lineTo(480, ty);
          }
          rig.stroke({ width: 3, color: palette.rule, alpha: clamp01(0.9 * sr) });
        }

        // Group brackets and the non-colour group markers.
        for (let i = 0; i < 2; i++) {
          const a = win(p, 0.02 + i * 0.05, 0.2 + i * 0.05);
          if (a <= 0) continue;
          const [x0, x1] = GROUP_SPAN[i];
          const cxm = (x0 + x1) / 2;
          const half = ((x1 - x0) / 2) * cubicOut(a);
          rig.moveTo(cxm - half, GBRACKET_Y).lineTo(cxm + half, GBRACKET_Y);
          rig.moveTo(cxm - half, GBRACKET_Y).lineTo(cxm - half, GBRACKET_Y + 12);
          rig.moveTo(cxm + half, GBRACKET_Y).lineTo(cxm + half, GBRACKET_Y + 12);
          rig.stroke({ width: 3, color: palette.rule, alpha: clamp01(0.5 + 0.5 * a) });

          if (i === 0) {
            rig.rect(markerX[0] - 9, HEAD_Y - 9, 18, 18)
              .fill({ color: TINT[0], alpha: 0.9 * a });
          } else {
            rig.circle(markerX[1], HEAD_Y, 10)
              .stroke({ width: 3, color: TINT[1], alpha: 0.9 * a });
            rig.circle(markerX[1], HEAD_Y, 4).fill({ color: TINT[1], alpha: 0.9 * a });
          }
        }

        // Volume dimension on the leading tube.
        const sv = cubicOut(win(p, 0.56, 0.74));
        if (sv > 0.001) {
          const yTop = ROW_Y[0] + T.fullY;
          const yBot = ROW_Y[0] + T.inConeBot;
          const reach = mix(1384, 1470, sv);
          rig.moveTo(1384, yTop).lineTo(reach, yTop);
          rig.moveTo(1360, yBot).lineTo(Math.max(1360, reach), yBot);
          rig.moveTo(1454, yTop).lineTo(1454, mix(yTop, yBot, sv));
          rig.moveTo(1446, yTop + 11).lineTo(1454, yTop);
          rig.moveTo(1462, yTop + 11).lineTo(1454, yTop);
          if (sv > 0.94) {
            rig.moveTo(1446, yBot - 11).lineTo(1454, yBot);
            rig.moveTo(1462, yBot - 11).lineTo(1454, yBot);
          }
          rig.stroke({ width: 3, color: palette.inkDim, alpha: 0.85 * sv });
        }

        // The dimension bracket sweeping under the rack.
        const sb = cubicOut(win(p, 0.62, 0.88));
        if (sb > 0.001) {
          const xEnd = mix(RACK_X0, RACK_X1, sb);
          const g0 = 960 - dimLabel.width / 2 - 26;
          const g1 = 960 + dimLabel.width / 2 + 26;
          rig.moveTo(RACK_X0, BRACKET_Y).lineTo(Math.min(xEnd, g0), BRACKET_Y);
          if (xEnd > g1) rig.moveTo(g1, BRACKET_Y).lineTo(xEnd, BRACKET_Y);
          rig.moveTo(RACK_X0, BRACKET_Y - 14).lineTo(RACK_X0, BRACKET_Y + 8);
          rig.moveTo(RACK_X0, 770).lineTo(RACK_X0, BRACKET_Y - 14);
          if (sb > 0.985) {
            rig.moveTo(RACK_X1, BRACKET_Y - 14).lineTo(RACK_X1, BRACKET_Y + 8);
            rig.moveTo(RACK_X1, 770).lineTo(RACK_X1, BRACKET_Y - 14);
          }
          rig.stroke({ width: 3, color: palette.ink, alpha: clamp01(0.35 + 0.5 * sb) });
        }

        // Inspection sweep, always running.
        rig.moveTo(scanX, PANEL.y0 + 6).lineTo(scanX, PANEL.y1 - 6);
        rig.stroke({ width: 3, color: palette.ink, alpha: 0.07 });

        /* ---- glow bed ----------------------------------------------- */
        glow.clear();
        for (let i = 0; i < N; i++) {
          const tb = tubes[i];
          const f = fillOf[i];
          if (f < 0.03) continue;
          const tint = mixColor(TINT[tb.group], palette.cold, chill * 0.45);
          const puff = 0.82 + 0.18 * breathe;
          const lift = f * (0.6 + bloom);
          glow.ellipse(tb.cx, tb.top + 100, 52 * puff, 56 * puff)
            .fill({ color: tint, alpha: 0.07 * lift });
          glow.ellipse(tb.cx, tb.top + 108, 26 * puff, 30 * puff)
            .fill({ color: tint, alpha: 0.1 * lift });
        }

        /* ---- the tubes ---------------------------------------------- */
        for (let i = 0; i < N; i++) {
          const tb = tubes[i];
          const g = tb.g;
          const f = fillOf[i];
          const lv = levelOf[i];
          const rev = cubicOut(win(p, tb.revA, tb.revB));
          const sheen = Math.exp(-Math.pow((tb.cx - scanX) / 150, 2));
          const tint = mixColor(TINT[tb.group], palette.cold, chill * 0.45);
          g.clear();

          // Construction ghost. Always drawn, so the rack already exists as
          // drafting geometry during the 1.2s cross-dissolve, when `progress`
          // is still pinned at zero and nothing else has started.
          const ghost = 0.14 + 0.05 * Math.sin(time * 0.9 + tb.phase);
          strokePartial(g, 1, palette.inkFaint, ghost + 0.1 * sheen - 0.1 * rev);
          if (rev < 0.001) continue;

          // Glass body, faintly filled so the tube reads as an object.
          if (rev > 0.995) g.poly(GLASS).fill({ color: palette.ground, alpha: 0.9 });

          if (f > 0.008) {
            liquid.length = 0;
            liquid.push(-innerHalf(lv), lv, innerHalf(lv), lv);
            if (lv < T.coneY) liquid.push(T.inHalf, T.coneY);
            liquid.push(T.inTipHalf, T.inConeBot, -T.inTipHalf, T.inConeBot);
            if (lv < T.coneY) liquid.push(-T.inHalf, T.coneY);
            g.poly(liquid).fill({ color: tint, alpha: 0.62 + 0.18 * f });

            // Refraction band just under the surface.
            if (lv < T.coneY - 16) {
              g.rect(-T.inHalf, lv, T.inHalf * 2, 10)
                .fill({ color: palette.ink, alpha: 0.14 * f });
            }

            // HIGH-PEG carries striations; STANDARD carries a centre stipple.
            // Two formulations must never be told apart by hue alone.
            for (let k = 1; k <= 3; k++) {
              const y = mix(lv, T.inConeBot, k / 4);
              if (tb.group === 1) {
                const w = innerHalf(y) * 0.8;
                g.moveTo(-w, y).lineTo(w, y);
              } else {
                g.circle(0, y, 2.5).fill({ color: palette.void, alpha: 0.26 * f });
              }
            }
            if (tb.group === 1) {
              g.stroke({ width: 3, color: palette.void, alpha: 0.4 * f });
            }

            for (let b = 0; b < tb.bubbles.length; b++) {
              const bb = tb.bubbles[b];
              const fr = (((time * bb.sp + bb.ph) % 1) + 1) % 1;
              const by = mix(T.inConeBot - 4, lv + 7, fr);
              if (by <= lv + 2) continue;
              g.circle(bb.x * innerHalf(by) * 0.72, by, bb.r).fill({
                color: palette.ink,
                alpha: 0.4 * Math.sin(fr * Math.PI) * f,
              });
            }

            // Meniscus, three segments so it dips like real surface tension.
            const mw = innerHalf(lv);
            g.moveTo(-mw, lv).lineTo(-mw * 0.45, lv + 2.4)
              .lineTo(mw * 0.45, lv + 2.4).lineTo(mw, lv)
              .stroke({ width: 3, color: palette.ink, alpha: clamp01(0.35 + 0.5 * f) });
          }

          // Dispensing, kept inside the tube's own footprint so a column of
          // tubes filling at once never reads as one long wire.
          const fw = win(p, tb.fillA, tb.fillB);
          if (fw > 0.001 && fw < 0.999) {
            const fade = Math.min(1, (1 - fw) * 5) * Math.min(1, fw * 8);
            g.moveTo(0, T.mouthY + 4).lineTo(0, lv - 2)
              .stroke({ width: 3, color: tint, alpha: clamp01(0.85 * fade) });
            const ring = 7 + 11 * (0.5 + 0.5 * Math.sin(time * 9 + tb.phase));
            g.ellipse(0, lv, ring, ring * 0.3)
              .stroke({ width: 3, color: tint, alpha: clamp01(0.5 * fade) });
          }

          // Graduations on the wall.
          g.moveTo(-T.bodyHalf + 4, 62).lineTo(-T.bodyHalf + 14, 62)
            .moveTo(-T.bodyHalf + 4, 80).lineTo(-T.bodyHalf + 14, 80)
            .moveTo(T.bodyHalf - 14, 71).lineTo(T.bodyHalf - 4, 71)
            .stroke({ width: 3, color: palette.inkFaint, alpha: 0.4 * rev });

          // Rim, and a specular stripe hugging the wall so the glass stays wet.
          g.moveTo(-T.bodyHalf, T.lipBotY).lineTo(T.bodyHalf, T.lipBotY)
            .stroke({ width: 3, color: palette.ink, alpha: 0.4 * rev });
          g.rect(-T.bodyHalf + 5, T.lipBotY + 8, 4, T.coneY - T.lipBotY - 18)
            .fill({ color: palette.ink, alpha: clamp01((0.04 + 0.13 * sheen) * rev) });

          // Frost: this beat hands off to the cold chain, so it starts here.
          if (chill > 0.05) {
            for (let k = 0; k < tb.frost.length; k++) {
              const fr = tb.frost[k];
              const x = fr.side * (T.bodyHalf - 3);
              g.moveTo(x, fr.y).lineTo(x - fr.side * fr.len, fr.y + 3);
            }
            g.stroke({ width: 3, color: palette.cold, alpha: clamp01(0.75 * chill) });
          }

          strokePartial(g, rev, palette.ink, 0.55 + 0.35 * rev + 0.25 * sheen);
        }

        /* ---- caps ---------------------------------------------------- */
        for (let i = 0; i < N; i++) {
          const tb = tubes[i];
          const sw = win(p, tb.sealA, tb.sealB);
          if (sw <= 0.001) {
            tb.cap.alpha = 0;
            continue;
          }
          const impact = sw > 0.44 ? Math.exp(-11 * (sw - 0.44)) : 0;
          tb.cap.alpha = clamp01(sw * 4);
          tb.cap.y = tb.top + T.mouthY - 24 * (1 - settle(sw));
          tb.cap.rotation = -0.11 * (1 - cubicOut(clamp01(sw * 1.5)));
          tb.cap.scale.set(1 + 0.05 * impact, 1 - 0.14 * impact);
        }

        /* ---- QC reticle, forever stepping ---------------------------- */
        reticle.clear();
        const ra = win(p, 0.7, 0.86);
        if (ra > 0.01) {
          const step = time / 0.62;
          const idx = Math.floor(step);
          const e = cubicOut(clamp01((step - idx) * 2.2));
          const a = visit[((idx % N) + N) % N];
          const b = visit[(((idx + 1) % N) + N) % N];
          const rx = mix(a.cx, b.cx, e);
          const ry = mix(a.top, b.top, e) + 82;
          for (let q = 0; q < QUAD.length; q++) {
            const cx = rx + 56 * QUAD[q][0];
            const cy = ry + 92 * QUAD[q][1];
            reticle.moveTo(cx, cy).lineTo(cx - 22 * QUAD[q][0], cy);
            reticle.moveTo(cx, cy).lineTo(cx, cy - 22 * QUAD[q][1]);
          }
          const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(time * 3.4));
          reticle.stroke({
            width: 3, color: palette.ink, alpha: clamp01(0.6 * ra * pulse),
          });
          reticle.moveTo(rx - 11, ry).lineTo(rx + 11, ry)
            .stroke({ width: 3, color: palette.signal, alpha: clamp01(0.5 * ra) });
        }

        /* ---- type ---------------------------------------------------- */
        for (let i = 0; i < 2; i++) {
          const a = win(p, 0.02 + i * 0.05, 0.18 + i * 0.05);
          const e = settle(a);
          headers[i].alpha = a;
          headers[i].y = HEAD_Y + (1 - e) * 14;
          details[i].alpha = a * 0.9;
          details[i].y = DETAIL_Y + (1 - e) * 10;
        }
        for (let r = 0; r < 4; r++) {
          const a = win(p, 0.06 + r * 0.03, 0.24 + r * 0.03);
          rowLabels[r].alpha = a * (0.5 + 0.5 * clamp01(rowFill[r] * 2));
          rowLabels[r].x = 446 - (1 - settle(a)) * 12;
        }

        // Starts exactly when the sweep reaches the gap it reserved, so the
        // bracket is never a line with a hole in it.
        const dl = win(p, 0.69, 0.85);
        dimLabel.alpha = dl;
        dimLabel.y = BRACKET_Y + (1 - settle(dl)) * 12;
        dimLabel.scale.set(mix(0.96, 1, settle(dl)));

        const vl = win(p, 0.64, 0.8);
        volLabel.alpha = clamp01(vl * (0.82 + 0.18 * (0.5 + 0.5 * Math.sin(time * 2.2))));
        volLabel.x = 1484 - (1 - settle(vl)) * 14;
      },
    };
  },
};
