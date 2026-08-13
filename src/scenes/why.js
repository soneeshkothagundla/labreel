/**
 * Beat: "why" — closing / so what.
 *
 * Bookend of the cold open. A wide, calm Earth limb sits low in the frame with
 * a distribution network drawn progressively between points riding the horizon,
 * three stat lines hang off a left-hand spine, and the composition resolves to
 * the Capsule Space Labs wordmark before quieting back down for the loop.
 *
 * Everything continuous is driven by `frame.time`, so the picture is alive at
 * progress 0.0 (while the beat is still cross-fading in and progress is pinned)
 * and at 1.0 (while it holds before the cut back to the cold open).
 */

import { clamp01, remap, cubicOut, sineInOut, settle } from '../core/easing.js';

const STATS = [
  'mRNA therapies require −80 °C',
  'Cold chain is the bottleneck',
  'Orbit isolates one variable',
];

const WORDMARK = 'CAPSULE SPACE LABS';
const SUBLINE = 'ORBITAL LIFE SCIENCE';

/** Node index pairs the distribution network connects, in draw order. */
const PAIRS = [
  [0, 2], [1, 3], [2, 5], [3, 4], [4, 6], [5, 7], [6, 8],
  [1, 4], [3, 6], [0, 1], [5, 6], [2, 3], [7, 8], [4, 7],
];

export default {
  id: 'why',

  build(ctx) {
    const { PIXI, palette, width, height, text } = ctx;
    const view = new PIXI.Container();

    // Seeded LCG. Every scatter in this scene is decided once, here, so a
    // frame-exact video capture replays identically.
    let s = 987654321;
    const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;

    const W = width;
    const H = height;
    const CX = W * 0.5;

    // Earth is drawn as a very large sphere whose apex sits just above the
    // lower-third rule, so the limb never crosses into the title safe area.
    const APEX = H * 0.654;
    const R = W * 2.708;
    const CY = APEX + R;

    const sx = (u, h = 0) => CX + (R + h) * Math.sin(u);
    const sy = (u, h = 0) => CY - (R + h) * Math.cos(u);

    // Angular half-span that covers the full frame width, plus bleed.
    const ULIM = Math.asin(Math.min(0.98, (W * 0.56) / R));
    const limbY = (x) => CY - Math.sqrt(Math.max(0, R * R - (x - CX) * (x - CX)));

    /** Stroke a constant-altitude arc across the frame. Build time only. */
    const band = (g, h, w, color, alpha, spread = 1.06, n = 72) => {
      const lim = ULIM * spread;
      for (let i = 0; i <= n; i++) {
        const u = -lim + 2 * lim * (i / n);
        const x = sx(u, h);
        const y = sy(u, h);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke({ width: w, color, alpha });
    };

    // ---------------------------------------------------------------- stars
    // Four parallax layers, each a single Graphics built once. Twinkle is a
    // per-layer alpha oscillation, which costs nothing per frame.
    const starLayers = [];
    const STAR_SPEC = [
      { n: 40, rMin: 0.9, rMax: 1.5, a: 0.34, rate: 0.55, drift: 3 },
      { n: 30, rMin: 1.2, rMax: 1.9, a: 0.46, rate: 0.83, drift: 5 },
      { n: 20, rMin: 1.6, rMax: 2.4, a: 0.58, rate: 0.41, drift: 8 },
      { n: 12, rMin: 2.0, rMax: 3.0, a: 0.72, rate: 1.10, drift: 11 },
    ];
    for (let li = 0; li < STAR_SPEC.length; li++) {
      const spec = STAR_SPEC[li];
      const g = new PIXI.Graphics();
      let placed = 0;
      let guard = 0;
      while (placed < spec.n && guard++ < spec.n * 40) {
        const x = -40 + rnd() * (W + 80);
        const y = -20 + rnd() * (H * 0.72);
        // Keep the readout corner and the planet itself clear of starfield.
        if (x > W * 0.75 && y < H * 0.13) continue;
        if (y > limbY(x) - 26) continue;
        const r = spec.rMin + rnd() * (spec.rMax - spec.rMin);
        const tint = rnd() < 0.22 ? palette.cold : palette.ink;
        g.circle(x, y, r).fill({ color: tint, alpha: 0.55 + rnd() * 0.45 });
        placed++;
      }
      g.alpha = spec.a;
      starLayers.push({ g, ...spec, phase: rnd() * Math.PI * 2 });
      view.addChild(g);
    }

    // A handful of anchor stars with a cross flare, for scale.
    const brightG = new PIXI.Graphics();
    for (let i = 0; i < 5; i++) {
      let x = 0;
      let y = 0;
      let guard = 0;
      do {
        x = W * 0.06 + rnd() * W * 0.62;
        y = H * 0.05 + rnd() * H * 0.42;
        guard++;
      } while (y > limbY(x) - 60 && guard < 60);
      const arm = 9 + rnd() * 6;
      brightG.circle(x, y, 2.4).fill({ color: palette.ink, alpha: 0.9 });
      brightG.moveTo(x - arm, y).lineTo(x + arm, y)
        .stroke({ width: 3, color: palette.ink, alpha: 0.16 });
      brightG.moveTo(x, y - arm).lineTo(x, y + arm)
        .stroke({ width: 3, color: palette.ink, alpha: 0.16 });
    }
    view.addChild(brightG);

    // ---------------------------------------------------------------- planet
    // Body: the limb polyline closed down to the bottom of the frame, stacked
    // three deep so the terminator falls off into black under the title.
    const bodyG = new PIXI.Graphics();
    const bodyPass = [
      { h: 0, color: palette.ground, alpha: 0.62 },
      { h: -70, color: palette.void, alpha: 0.40 },
      { h: -190, color: palette.void, alpha: 0.52 },
    ];
    for (const pass of bodyPass) {
      const lim = ULIM * 1.2;
      const n = 80;
      for (let i = 0; i <= n; i++) {
        const u = -lim + 2 * lim * (i / n);
        const x = sx(u, pass.h);
        const y = sy(u, pass.h);
        if (i === 0) bodyG.moveTo(x, y);
        else bodyG.lineTo(x, y);
      }
      bodyG.lineTo(W + 60, H + 60).lineTo(-60, H + 60);
      bodyG.fill({ color: pass.color, alpha: pass.alpha });
    }
    view.addChild(bodyG);

    // Faint interior banding, shifted slowly sideways to imply rotation.
    const surfaceG = new PIXI.Graphics();
    const surfaceBands = [
      { h: -22, a: 0.075 }, { h: -54, a: 0.06 },
      { h: -102, a: 0.045 }, { h: -168, a: 0.032 },
    ];
    for (const b of surfaceBands) {
      band(surfaceG, b.h, 3, palette.cold, b.a, 1.34, 64);
    }
    view.addChild(surfaceG);

    // Atmosphere: stacked altitude bands, each breathing on its own phase.
    const glowBands = [];
    const GLOW_SPEC = [
      { h: 4, w: 4, a: 0.30 }, { h: 13, w: 4, a: 0.20 },
      { h: 27, w: 5, a: 0.14 }, { h: 48, w: 6, a: 0.095 },
      { h: 76, w: 7, a: 0.062 }, { h: 116, w: 9, a: 0.036 },
    ];
    for (let i = 0; i < GLOW_SPEC.length; i++) {
      const spec = GLOW_SPEC[i];
      const g = new PIXI.Graphics();
      band(g, spec.h, spec.w, palette.cold, 1, 1.08, 72);
      g.alpha = spec.a;
      glowBands.push({ g, base: spec.a, phase: i * 0.9 });
      view.addChild(g);
    }

    // The limb itself: the single brightest line in the frame.
    const limbG = new PIXI.Graphics();
    band(limbG, 6, 3, palette.ink, 0.22, 1.08, 90);
    band(limbG, 0, 4, palette.cold, 0.80, 1.08, 90);
    view.addChild(limbG);

    // Sun glint travelling along the limb. Redrawn each frame.
    const glintG = new PIXI.Graphics();
    view.addChild(glintG);

    // --------------------------------------------------------------- network
    // The network rides the limb, so its band is bounded twice: by the frame
    // edge, so nodes fade out instead of clipping, and by the lower title-safe
    // rule at y = 820, which a node's outermost pulse ring must never reach.
    // At U_VIS the node sits at x ~= 1840, y ~= 781, and its ring reaches 814.
    //
    // Nodes tile the whole wrap cycle rather than a sub-range of it, so the
    // drift below only rotates the layout. That matters because `time` is
    // reel-global: this beat opens at t = 85 s, i.e. already ~0.17 rad into the
    // drift, and a partial tiling would arrive bunched against one edge.
    const NODE_N = 9;
    const PING_R = 24; // pulse ring growth, px
    const U_VIS = 0.170; // node alpha reaches 0 here
    const U_FADE = 0.030; // fade band just inside U_VIS
    const SPAN = 2 * U_VIS; // wrap cycle == the visible band
    const nodes = [];
    for (let i = 0; i < NODE_N; i++) {
      nodes.push({
        u0: -U_VIS + (SPAN * i) / NODE_N + (rnd() - 0.5) * 0.006,
        phase: rnd() * Math.PI * 2,
        rate: 0.9 + rnd() * 0.7,
        ping: rnd(),
      });
    }
    const arcs = PAIRS.map(([a, b], k) => ({
      a,
      b,
      t0: 0.04 + k * 0.030,
      dur: 0.20,
      speed: 0.13 + rnd() * 0.14,
      phase: rnd(),
      seg: 24,
    }));
    const nodeU = new Array(NODE_N).fill(0);
    const nodeA = new Array(NODE_N).fill(0);

    const netG = new PIXI.Graphics();
    view.addChild(netG);

    // ----------------------------------------------------------- stat block
    const SPINE_X = Math.round(W * 0.0646);
    const STAT_X = Math.round(W * 0.0875);
    const STAT_Y = [H * 0.228, H * 0.304, H * 0.380];
    const STAT_SIZE = Math.max(30, Math.round(H * 0.0426));
    const IN_T = [0.14, 0.26, 0.38];
    const OUT_T = [0.600, 0.635, 0.670];

    const spineG = new PIXI.Graphics();
    view.addChild(spineG);

    const statTexts = STATS.map((str) => {
      const t = text(str, { size: STAT_SIZE, weight: '500', color: palette.ink });
      t.alpha = 0;
      view.addChild(t);
      return t;
    });

    // ----------------------------------------------------------- wordmark
    const WM_SIZE = Math.max(30, Math.round(H * 0.070));
    const WM_Y = H * 0.326;
    const RULE_Y = H * 0.398;
    const SUB_Y = H * 0.4315;

    const wmLayer = new PIXI.Container();
    view.addChild(wmLayer);

    const glyphs = [];
    for (const ch of WORDMARK) {
      if (ch === ' ') {
        glyphs.push({ t: null, w: WM_SIZE * 0.30 });
        continue;
      }
      const t = text(ch, { size: WM_SIZE, weight: '600', color: palette.ink });
      t.anchor.set(0.5, 0.5);
      t.alpha = 0;
      wmLayer.addChild(t);
      glyphs.push({ t, w: t.width });
    }

    const wmRuleG = new PIXI.Graphics();
    view.addChild(wmRuleG);

    const subline = text(SUBLINE, {
      size: Math.max(30, Math.round(H * 0.0296)),
      color: palette.inkDim,
      mono: true,
      letterSpacing: 6,
    });
    subline.anchor.set(0.5, 0.5);
    subline.position.set(CX, SUB_Y);
    subline.alpha = 0;
    view.addChild(subline);

    // ------------------------------------------------------------- update
    return {
      view,

      update(frame, weight, progress) {
        const time = frame?.time ?? 0;
        const p = clamp01(progress ?? 0);
        const v = frame?.values ?? {};
        const bloom = v.bloom ?? 0.6;
        const chill = v.chill ?? 0;
        const drift = v.drift ?? 0;

        // Reel-wide bloom drives every accent luminance so the closing beat
        // inherits its brightness from the microgravity act rather than resetting.
        const bloomK = clamp01(remap(bloom, 0, 1, 0.72, 1.05));
        const coldK = 0.82 + 0.34 * clamp01(chill);
        // The frame quiets down over the last beat so the cut back to the cold
        // open lands on matching energy.
        const quiet = 1 - 0.55 * cubicOut(clamp01((p - 0.86) / 0.14));
        const endFade = 1 - 0.5 * sineInOut(clamp01((p - 0.94) / 0.06));

        // The atmosphere leans a touch harder while the beat is at full
        // presence, so the cross-dissolve edges stay soft rather than popping.
        const present = 0.88 + 0.12 * clamp01(weight ?? 1);

        // --- ambient -----------------------------------------------------
        for (let i = 0; i < starLayers.length; i++) {
          const L = starLayers[i];
          L.g.alpha = L.a * (0.72 + 0.28 * Math.sin(time * L.rate + L.phase));
          L.g.x = L.drift * Math.sin(time * 0.037 + i) - drift * 6;
          L.g.y = L.drift * 0.22 * Math.sin(time * 0.021 + i * 1.7);
        }
        brightG.alpha = 0.62 + 0.24 * Math.sin(time * 0.29 + 1.1);

        surfaceG.x = 26 * Math.sin(time * 0.06) - drift * 10;
        surfaceG.alpha = 0.8 + 0.2 * Math.sin(time * 0.19);

        for (let i = 0; i < glowBands.length; i++) {
          const B = glowBands[i];
          B.g.alpha = B.base * coldK * present
            * (0.80 + 0.20 * Math.sin(time * 0.5 + B.phase))
            * (0.55 + 0.45 * quiet);
        }
        limbG.alpha = (0.86 + 0.14 * Math.sin(time * 0.33)) * coldK;

        // Sun glint sliding along the horizon.
        glintG.clear();
        const uc = 0.155 * Math.sin(time * 0.055);
        const spanG = 0.075;
        const gSegs = 12;
        const glintA = (0.72 + 0.28 * Math.sin(time * 0.3)) * bloomK;
        const glintPass = [
          { h: 2, w: 5, color: palette.ink, a: 0.30 },
          { h: 12, w: 4, color: palette.cold, a: 0.26 },
          { h: 34, w: 3, color: palette.cold, a: 0.13 },
        ];
        for (const gp of glintPass) {
          for (let i = 0; i < gSegs; i++) {
            const s0 = i / gSegs;
            const s1 = (i + 1) / gSegs;
            const u0 = uc - spanG + 2 * spanG * s0;
            const u1 = uc - spanG + 2 * spanG * s1;
            const env = Math.sin(Math.PI * (s0 + s1) * 0.5);
            glintG
              .moveTo(sx(u0, gp.h), sy(u0, gp.h))
              .lineTo(sx(u1, gp.h), sy(u1, gp.h))
              .stroke({ width: gp.w, color: gp.color, alpha: gp.a * env * env * glintA });
          }
        }

        // --- distribution network ---------------------------------------
        const uOff = 0.0020 * time + 0.02 * drift;
        for (let i = 0; i < NODE_N; i++) {
          let u = nodes[i].u0 + uOff;
          u = (((u + U_VIS) % SPAN) + SPAN) % SPAN - U_VIS;
          nodeU[i] = u;
          nodeA[i] = clamp01((U_VIS - Math.abs(u)) / U_FADE);
        }

        const netK = Math.min(1.1, (0.75 + 0.35 * bloom) * quiet);
        netG.clear();

        for (let k = 0; k < arcs.length; k++) {
          const arc = arcs[k];
          const dp = cubicOut(clamp01((p - arc.t0) / arc.dur));
          if (dp <= 0.002) continue;
          const aBase = Math.min(nodeA[arc.a], nodeA[arc.b]) * netK;
          if (aBase <= 0.01) continue;

          const u1 = nodeU[arc.a];
          const u2 = nodeU[arc.b];
          const du = Math.abs(u2 - u1);
          const hMax = Math.min(158, 620 * du + 34);
          const n = arc.seg;

          for (let i = 0; i <= n; i++) {
            const t = (i / n) * dp;
            const u = u1 + (u2 - u1) * t;
            const h = hMax * Math.sin(Math.PI * t);
            const x = sx(u, h);
            const y = sy(u, h);
            if (i === 0) netG.moveTo(x, y);
            else netG.lineTo(x, y);
          }
          netG.stroke({ width: 3, color: palette.signal, alpha: 0.30 * aBase });

          if (dp < 0.999) {
            // Leading tip while the line is still being laid down.
            const h = hMax * Math.sin(Math.PI * dp);
            const u = u1 + (u2 - u1) * dp;
            netG.circle(sx(u, h), sy(u, h), 4.5)
              .fill({ color: palette.ink, alpha: 0.85 * aBase });
          } else {
            // Completed routes carry a shipment travelling end to end.
            const ps = (time * arc.speed + arc.phase) % 1;
            const env = Math.sin(Math.PI * ps);
            for (let j = 4; j >= 1; j--) {
              const st = ps - j * 0.035;
              if (st <= 0) continue;
              const hT = hMax * Math.sin(Math.PI * st);
              const uT = u1 + (u2 - u1) * st;
              netG.circle(sx(uT, hT), sy(uT, hT), 3.0 - j * 0.4).fill({
                color: palette.signal,
                alpha: 0.30 * env * aBase * (1 - j / 5),
              });
            }
            const h = hMax * Math.sin(Math.PI * ps);
            const u = u1 + (u2 - u1) * ps;
            netG.circle(sx(u, h), sy(u, h), 10)
              .fill({ color: palette.signal, alpha: 0.16 * env * aBase });
            netG.circle(sx(u, h), sy(u, h), 4)
              .fill({ color: palette.ink, alpha: 0.9 * env * aBase });
          }
        }

        for (let i = 0; i < NODE_N; i++) {
          const a = nodeA[i];
          if (a <= 0.01) continue;
          const nd = nodes[i];
          const x = sx(nodeU[i], 0);
          const y = sy(nodeU[i], 0);
          const r = 9 + 2.6 * Math.sin(time * nd.rate * 0.8 + nd.phase);
          netG.circle(x, y, r)
            .stroke({ width: 3, color: palette.signal, alpha: 0.42 * a * netK });
          netG.circle(x, y, 3.6).fill({ color: palette.ink, alpha: 0.9 * a });
          const ping = (time * 0.35 + nd.ping) % 1;
          netG.circle(x, y, 9 + ping * PING_R).stroke({
            width: 3,
            color: palette.signal,
            alpha: 0.22 * (1 - ping) * a * netK,
          });
        }

        // --- stat block ---------------------------------------------------
        spineG.clear();
        const spIn = cubicOut(clamp01((p - 0.10) / 0.16));
        const spOut = cubicOut(clamp01((p - 0.64) / 0.12));
        const yTop = H * 0.222 + (H * 0.462 - H * 0.222) * spOut;
        const yBot = H * 0.222 + (H * 0.462 - H * 0.222) * spIn;
        if (yBot > yTop + 1) {
          spineG.moveTo(SPINE_X, yTop).lineTo(SPINE_X, yBot)
            .stroke({ width: 3, color: palette.signal, alpha: 0.50 * bloomK });
        }

        for (let i = 0; i < statTexts.length; i++) {
          const rin = cubicOut(clamp01((p - IN_T[i]) / 0.13));
          const rout = cubicOut(clamp01((p - OUT_T[i]) / 0.09));
          const a = rin * (1 - rout);
          const t = statTexts[i];
          t.alpha = a;
          t.x = STAT_X - 22 * (1 - rin) + 16 * rout;
          t.y = STAT_Y[i] + 10 * (1 - rin) + 1.2 * Math.sin(time * 0.5 + i);
          if (a > 0.01) {
            const ty = t.y + STAT_SIZE * 0.62;
            spineG.moveTo(SPINE_X, ty).lineTo(SPINE_X + 26 * rin, ty)
              .stroke({ width: 3, color: palette.signal, alpha: 0.75 * a });
          }
        }

        // --- wordmark -----------------------------------------------------
        const trackP = settle(clamp01((p - 0.66) / 0.20));
        const tracking = 46 + (12 - 46) * Math.min(1, trackP);
        let total = tracking * (glyphs.length - 1);
        for (let k = 0; k < glyphs.length; k++) total += glyphs[k].w;

        let cx = CX - total * 0.5;
        for (let k = 0; k < glyphs.length; k++) {
          const g = glyphs[k];
          const cxk = cx + g.w * 0.5;
          cx += g.w + tracking;
          if (!g.t) continue;
          const cp = cubicOut(clamp01((p - (0.66 + k * 0.011)) / 0.15));
          g.t.x = cxk;
          g.t.y = WM_Y + 14 * (1 - cp) + 1.6 * Math.sin(time * 0.45 + k * 0.2);
          g.t.alpha = cp * endFade;
        }

        wmRuleG.clear();
        const rp = cubicOut(clamp01((p - 0.72) / 0.16));
        if (rp > 0.002) {
          const half = total * 0.5 * rp;
          wmRuleG.moveTo(CX - half, RULE_Y).lineTo(CX + half, RULE_Y)
            .stroke({ width: 3, color: palette.signal, alpha: 0.55 * endFade * bloomK });
          if (half > 24) {
            const sc = (time * 0.09) % 1;
            const cxs = CX - half + 2 * half * sc;
            const segw = Math.min(90, half * 0.5);
            wmRuleG
              .moveTo(Math.max(CX - half, cxs - segw), RULE_Y)
              .lineTo(Math.min(CX + half, cxs + segw), RULE_Y)
              .stroke({
                width: 3,
                color: palette.ink,
                alpha: 0.5 * Math.sin(Math.PI * sc) * endFade,
              });
          }
        }

        subline.alpha = cubicOut(clamp01((p - 0.82) / 0.10)) * endFade * 0.95;
        subline.y = SUB_Y + 2 * Math.sin(time * 0.4);
      },
    };
  },
};
