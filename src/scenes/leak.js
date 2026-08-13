/**
 * leak — the failure mode.
 *
 * Same lipid nanoparticle as the previous beat, same construction: a gold
 * bilayer of lipid beads, a PEG corona, a tangled mRNA thread in the core.
 * Then ice nucleates in the medium and grows inward as angular shards, the
 * shell fractures at three points, and the payload leaves.
 *
 * Everything is a pure function of (progress, frame.time) — the scatter is
 * baked once in build() with a seeded LCG, so a frame-exact capture and a live
 * projector draw the same picture. The whole particle lives inside a disc of
 * radius RMAX centred on (CX, CY), sized so that nothing can reach the bottom
 * title band or the top-right readout corner whatever the sway does.
 */

import { clamp01, remap, cubicOut, sineInOut, settle } from '../core/easing.js';

const TAU = Math.PI * 2;

/** Blend two 0xRRGGBB colours. Loss is drawn as a hue drifting, not a swap. */
function mix(a, b, t) {
  const k = clamp01(t);
  const r = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * k;
  const g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * k;
  const l = (a & 255) + ((b & 255) - (a & 255)) * k;
  return (r << 16) | (g << 8) | l;
}

/** Shortest absolute angular distance. */
function angGap(a, b) {
  return Math.abs((((a - b) % TAU) + TAU + Math.PI) % TAU - Math.PI);
}

/** Polyline stroke from a flat [x,y,x,y,...] buffer. */
function line(g, pts, opts) {
  if (pts.length < 4) return;
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.stroke(opts);
}

/** Closed shape, filled then stroked (the path is re-walked for the stroke). */
function shape(g, pts, fillOpt, strokeOpt) {
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.fill(fillOpt);
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.lineTo(pts[0], pts[1]);
  g.stroke(strokeOpt);
}

/** Arc drawn as a polyline so we never depend on Graphics.arc semantics. */
function arc(g, r, a0, a1, opts, steps = 48) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  line(g, pts, opts);
}

/** Radial tick / needle. */
function spoke(g, a, r0, r1, opts) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  line(g, [c * r0, s * r0, c * r1, s * r1], opts);
}

export default {
  id: 'leak',

  build(ctx) {
    const { PIXI, palette, width, height, text, font, mono } = ctx;

    // ---- layout -----------------------------------------------------------
    const CX = width * 0.524; // particle centre
    const CY = height * 0.389;
    const R = height * 0.181; // shell radius
    const RMAX = height * 0.333; // hard reach limit for ice + fragments
    const GX = width * 0.149; // EE gauge centre
    const GY = height * 0.326;
    const GR = height * 0.115;

    const A0 = Math.PI * 0.75; // gauge sweep, open at the bottom
    const A1 = Math.PI * 2.25;
    const EE_LO = 65;
    const EE_HI = 96;
    const EE_START = 94;
    const angOf = (v) => A0 + clamp01((v - EE_LO) / (EE_HI - EE_LO)) * (A1 - A0);
    const ANG_START = angOf(EE_START);

    // Three fractures. Angles point up-right, up-left and right, so escaping
    // material never runs at the lower title band.
    const FRACT = [
      { ang: -1.12, at: 0.28, drop: 9 },
      { ang: -2.32, at: 0.48, drop: 8 },
      { ang: 0.2, at: 0.68, drop: 4 },
    ];

    // ---- deterministic scatter -------------------------------------------
    let s = 12345;
    const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;

    // Suspended debris in the medium. Kept out of the title band and the
    // readout corner at author time, so no runtime clamping is needed.
    const MOTES = [];
    for (let i = 0; i < 90; i++) {
      let x = 0;
      let y = 0;
      for (let guard = 0; guard < 24; guard++) {
        x = 24 + rnd() * (width - 94);
        y = 16 + rnd() * (height * 0.68);
        if (!(x > width * 0.745 && y < height * 0.14)) break;
      }
      const sp = 0.14 + rnd() * 0.38;
      MOTES.push({ x, y, sp, r: 1.2 + rnd() * 2.4, a: 0.05 + rnd() * 0.18, ph: rnd() * TAU, ax: 10 + rnd() * 28, ay: 7 + rnd() * 20 });
    }

    const HAZE = [];
    for (let i = 0; i < 5; i++) {
      const r = height * (0.14 + rnd() * 0.14);
      const x = width * (0.18 + rnd() * 0.37);
      const y = Math.min(height * (0.18 + rnd() * 0.32), height * 0.72 - r);
      HAZE.push({ x, y, r, a: 0.016 + rnd() * 0.02, ph: rnd() * TAU, sp: 0.06 + rnd() * 0.09 });
    }

    // Ice shards: each is a spike that grows from its outer base inward.
    const SHARDS = [];
    const N_SH = 24;
    for (let i = 0; i < N_SH; i++) {
      SHARDS.push({
        ang: (i / N_SH) * TAU + (rnd() - 0.5) * 0.17,
        base: RMAX * (0.87 + rnd() * 0.13), // nucleation radius, out in the medium
        tip: R * (0.78 + rnd() * 0.44), // where the point ends up, some inside the shell
        wid: R * (0.045 + rnd() * 0.075),
        delay: rnd() * 0.5, // staggered so the field crystallises, not pops
        span: 0.3 + rnd() * 0.3,
        ph: rnd() * TAU,
        skew: (rnd() - 0.5) * 0.55,
        b1: 0.24 + rnd() * 0.18,
        b2: 0.56 + rnd() * 0.2,
        bl: 0.22 + rnd() * 0.26,
      });
    }

    const CRACKS = FRACT.map(() => {
      const jag = [];
      for (let j = 0; j < 11; j++) jag.push({ da: (j / 10 - 0.5) * 0.5, dr: (rnd() - 0.5) * R * 0.2 });
      return jag;
    });

    // Escaping payload. Each fragment belongs to the last fracture open before
    // it leaves, and its reach is capped so it dies inside the safe disc.
    const FRAGS = [];
    const NF = 16;
    for (let i = 0; i < NF; i++) {
      const t0 = 0.3 + (i / (NF - 1)) * 0.68;
      let k = 0;
      for (let j = 0; j < FRACT.length; j++) if (FRACT[j].at <= t0 - 0.015) k = j;
      const len = R * (0.22 + rnd() * 0.2);
      const far = Math.min(R * 0.9 + rnd() * R * 0.8, RMAX - 8 - len * 0.5);
      FRAGS.push({
        t0,
        len,
        far,
        dir: FRACT[k].ang + (rnd() - 0.5) * 0.8,
        curl: R * (0.05 + rnd() * 0.09) * (rnd() < 0.5 ? -1 : 1),
        span: 0.3 + rnd() * 0.16,
        spin: (rnd() - 0.5) * 1.5,
        ph: rnd() * TAU,
        sway: R * (0.03 + rnd() * 0.05),
      });
    }

    const N_BEAD = 76;
    const N_PEG = 56;

    // ---- display objects, created once and only mutated after this --------
    const view = new PIXI.Container();
    const gMedium = new PIXI.Graphics();
    const gPanel = new PIXI.Graphics();
    const gHalo = new PIXI.Graphics();
    const gCore = new PIXI.Graphics();
    const gShell = new PIXI.Graphics();
    const gShard = new PIXI.Graphics();
    const gFrag = new PIXI.Graphics();
    const gGauge = new PIXI.Graphics();

    // Ice draws over the shell, because it is piercing it.
    const orb = new PIXI.Container();
    orb.position.set(CX, CY);
    orb.addChild(gHalo, gCore, gShell, gShard, gFrag);

    const gauge = new PIXI.Container();
    gauge.position.set(GX, GY);
    gauge.addChild(gGauge);

    // Type column on the left, well clear of the particle. Everything is >= 30px.
    const COL = GX - GR - 34;
    const TALLY_Y = GY + GR * 2.35 + 22;

    const tLabel = text('ENCAPSULATION EFFICIENCY', { size: 30, color: palette.inkDim, weight: '600', letterSpacing: 4 });
    tLabel.position.set(COL, GY - GR - 100);

    const tValue = text('94%', { size: 96, color: palette.ink, weight: '600', mono: true });
    tValue.anchor.set(0.5);
    tValue.position.set(0, -4);

    const tDelta = text('LOSS 0 PTS', { size: 34, color: palette.alert, mono: true, letterSpacing: 3 });
    tDelta.anchor.set(0.5, 0);
    tDelta.position.set(0, GR + 26);

    const tStart = text('START 94', { size: 30, color: palette.inkDim, mono: true, letterSpacing: 2 });
    tStart.anchor.set(0, 0.5);
    tStart.position.set(Math.cos(ANG_START) * (GR + 32), Math.sin(ANG_START) * (GR + 32));

    const tTally = text('MRNA FRAGMENTS FREE   0', { size: 32, color: palette.inkDim, mono: true, letterSpacing: 2 });
    tTally.position.set(COL, GY + GR * 1.95);

    gauge.addChild(tValue, tDelta, tStart);
    view.addChild(gMedium, gPanel, orb, gauge, tLabel, tTally);

    return {
      view,

      update(frame, weight, progress) {
        const t = frame.time;
        const p = clamp01(progress);
        const bloom = frame.values?.bloom ?? 0.15;
        const chill = frame.values?.chill ?? 0;
        const drift = frame.values?.drift ?? 0;

        // ---- encapsulation efficiency ------------------------------------
        // A slow seep plus three step losses, one per fracture.
        let drop = 2 * cubicOut(p);
        let flash = 0;
        const open = [];
        for (let i = 0; i < FRACT.length; i++) {
          const f = FRACT[i];
          const q = p - f.at;
          drop += f.drop * settle(clamp01(q / 0.16));
          open.push(clamp01(q / 0.11));
          if (q >= 0) flash = Math.max(flash, Math.exp(-q / 0.045));
        }
        const ee = Math.max(71, EE_START - drop);
        const lost = clamp01((EE_START - ee) / 23);
        const freeze = clamp01(remap(p, 0, 0.45, 0, 1));
        const cool = clamp01(0.75 * freeze + 0.2 * chill);
        const breath = sineInOut((Math.sin(t * 0.62) + 1) * 0.5);

        // ---- the medium ---------------------------------------------------
        gMedium.clear();
        const hazeCol = mix(palette.panel, palette.cold, 0.35 + 0.4 * freeze);
        for (let i = 0; i < HAZE.length; i++) {
          const h = HAZE[i];
          const hx = h.x + Math.sin(t * h.sp + h.ph) * 26;
          const hy = h.y + Math.cos(t * h.sp * 0.8 + h.ph) * 18;
          gMedium
            .circle(hx, hy, h.r * (0.94 + 0.08 * breath))
            .fill({ color: hazeCol, alpha: h.a * (0.7 + 0.6 * weight) });
        }
        const moteCol = mix(palette.inkFaint, palette.cold, 0.45 + 0.5 * freeze);
        for (let i = 0; i < MOTES.length; i++) {
          const m = MOTES[i];
          const mx = m.x + Math.sin(t * m.sp + m.ph) * m.ax;
          const my = m.y + Math.cos(t * m.sp * 0.73 + m.ph * 1.7) * m.ay;
          const tw = 0.6 + 0.4 * Math.sin(t * 1.6 + m.ph * 3);
          gMedium.circle(mx, my, m.r * (0.8 + 0.4 * tw)).fill({ color: moteCol, alpha: m.a * tw });
        }

        // ---- particle body ------------------------------------------------
        const scale = (0.986 + 0.014 * weight) * (1 + 0.005 * Math.sin(t * 0.6));
        orb.scale.set(scale);
        orb.rotation = 0.05 * Math.sin(t * 0.21) + drift * 0.12;

        gHalo.clear();
        const glowCol = mix(palette.signal, palette.cold, 0.35 + 0.6 * freeze);
        gHalo.circle(0, 0, R * 1.55 + 8 * breath).fill({ color: glowCol, alpha: 0.028 + 0.03 * bloom * (1 - lost) });
        for (let i = 0; i < 4; i++) {
          const rr = R * (1.12 + i * 0.24) + Math.sin(t * 0.5 + i * 1.3) * 8;
          const ha = (0.11 - i * 0.022) * (0.55 + 0.45 * breath);
          gHalo.circle(0, 0, rr).stroke({ width: 3, color: mix(palette.cold, palette.ink, 0.12 * i), alpha: ha });
        }

        // core + mRNA thread
        gCore.clear();
        gCore.circle(0, 0, R * 0.87).fill({ color: palette.ground, alpha: 0.92 });
        const glowA = (0.09 + 0.07 * bloom) * (1 - 0.85 * lost);
        gCore.circle(0, 0, R * 0.66 * (1 - 0.18 * lost)).fill({ color: palette.signal, alpha: glowA });

        const coilN = Math.max(24, Math.floor(170 * (1 - 0.55 * lost)));
        const coilR = R * (0.62 - 0.2 * lost);
        const coil = [];
        for (let j = 0; j <= coilN; j++) {
          const th = (j / 170) * TAU;
          coil.push(coilR * Math.sin(2.3 * th + t * 0.22) * 0.96, coilR * Math.sin(1.7 * th + 1.05 + t * 0.17));
        }
        const rnaCol = mix(palette.signal, palette.inkDim, 0.3 * freeze);
        line(gCore, coil, { width: 4, color: rnaCol, alpha: 0.85 - 0.45 * lost });

        // bilayer, beads, corona, cracks
        gShell.clear();
        const beadCol = mix(palette.lipid, palette.cold, cool);
        const leaf = mix(beadCol, palette.ink, 0.1);
        gShell.circle(0, 0, R * 0.95).stroke({ width: 3, color: leaf, alpha: 0.4 - 0.15 * lost });
        gShell.circle(0, 0, R * 1.05).stroke({ width: 3, color: leaf, alpha: 0.34 - 0.14 * lost });

        for (let j = 0; j < N_BEAD; j++) {
          const a = (j / N_BEAD) * TAU;
          let push = 0;
          let dim = 0;
          for (let i = 0; i < FRACT.length; i++) {
            if (open[i] <= 0) continue;
            const d = angGap(a, FRACT[i].ang);
            if (d > 0.32) continue;
            const k = (1 - d / 0.32) * open[i];
            if (k > dim) dim = k;
            push = Math.max(push, k * R * 0.11);
          }
          if (dim > 0.88) continue;
          const rr = R + Math.sin(t * 1.4 + j * 0.55) * R * 0.015 + push;
          const bA = (0.92 - 0.7 * dim) * (0.7 + 0.3 * weight);
          gShell.circle(Math.cos(a) * rr, Math.sin(a) * rr, R * 0.028 * (1 - 0.45 * dim)).fill({ color: beadCol, alpha: bA });
        }

        const pegCol = mix(palette.inkFaint, palette.cold, 0.35 + 0.5 * freeze);
        const r0 = R * 1.055;
        for (let j = 0; j < N_PEG; j++) {
          const a = (j / N_PEG) * TAU + 0.031;
          const wob = Math.sin(t * 1.7 + j * 0.9) * 0.055;
          const r1 = r0 + R * (0.08 + 0.045 * Math.sin(t * 1.1 + j * 2.1));
          const pts = [Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a + wob) * r1, Math.sin(a + wob) * r1];
          line(gShell, pts, { width: 3, color: pegCol, alpha: 0.34 });
        }

        for (let i = 0; i < FRACT.length; i++) {
          if (open[i] <= 0) continue;
          const jag = CRACKS[i];
          const rev = clamp01((p - FRACT[i].at) / 0.09);
          const mid = (jag.length - 1) / 2;
          const half = Math.max(1, Math.round(mid * rev));
          const pts = [];
          for (let j = mid - half; j <= mid + half; j++) {
            const q = jag[Math.round(j)];
            const a = FRACT[i].ang + q.da + Math.sin(t * 2.1 + j) * 0.006;
            const rr = R + q.dr * (0.45 + 0.55 * open[i]);
            pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          const hot = Math.exp(-Math.max(0, p - FRACT[i].at) / 0.05);
          if (hot > 0.02) line(gShell, pts, { width: 14, color: palette.cold, alpha: 0.28 * hot });
          const crackCol = mix(palette.ink, palette.cold, 0.25);
          line(gShell, pts, { width: 4, color: crackCol, alpha: 0.55 + 0.4 * open[i] });
        }

        // ---- ice ----------------------------------------------------------
        gShard.clear();
        for (let i = 0; i < SHARDS.length; i++) {
          const sh = SHARDS[i];
          const ca = Math.cos(sh.ang);
          const sa = Math.sin(sh.ang);
          const twk = 0.55 + 0.45 * Math.sin(t * 2.2 + sh.ph);

          // nucleus: always present, always twinkling
          const nb = sh.base + 4 * Math.sin(t * 0.9 + sh.ph);
          const nx = ca * nb;
          const ny = sa * nb;
          const ns = 3 + 3 * twk;
          shape(
            gShard,
            [nx, ny - ns, nx + ns * 0.7, ny, nx, ny + ns, nx - ns * 0.7, ny],
            { color: palette.cold, alpha: 0.22 + 0.3 * twk },
            { width: 3, color: mix(palette.cold, palette.ink, 0.5), alpha: 0.3 + 0.35 * twk }
          );

          const g0 = cubicOut(clamp01((p - sh.delay) / sh.span));
          if (g0 <= 0.001) continue;

          const tipR = sh.base - (sh.base - sh.tip) * g0 + 3 * Math.sin(t * 1.5 + sh.ph);
          const tipA = sh.ang + sh.skew * 0.12 * g0;
          const tx = Math.cos(tipA) * tipR;
          const ty = Math.sin(tipA) * tipR;
          const w = sh.wid * (0.35 + 0.65 * g0);
          const px = -sa * w;
          const py = ca * w;
          const bx = ca * sh.base;
          const by = sa * sh.base;
          shape(
            gShard,
            [bx + px, by + py, bx - px * 0.82, by - py * 0.82, tx, ty],
            { color: mix(palette.cold, palette.ink, 0.15), alpha: (0.1 + 0.14 * g0) * (0.8 + 0.2 * twk) },
            { width: 3, color: mix(palette.cold, palette.ink, 0.45 + 0.2 * twk), alpha: (0.35 + 0.5 * g0) * (0.78 + 0.22 * twk) }
          );

          // spine + barbs, the dendritic tell of a growing crystal
          const spineCol = mix(palette.cold, palette.ink, 0.75);
          line(gShard, [bx, by, tx, ty], { width: 3, color: spineCol, alpha: 0.22 + 0.3 * g0 });
          const barbCol = mix(palette.cold, palette.ink, 0.35);
          for (let b = 0; b < 2; b++) {
            const f = b === 0 ? sh.b1 : sh.b2;
            if (g0 < f) continue;
            const jx = bx + (tx - bx) * f;
            const jy = by + (ty - by) * f;
            const bl = sh.wid * sh.bl * 2.4 * g0;
            const d = b === 0 ? 1 : -1;
            const ex = jx + (-sa * d * bl + (tx - bx) * 0.1);
            const ey = jy + (ca * d * bl + (ty - by) * 0.1);
            line(gShard, [jx, jy, ex, ey], { width: 3, color: barbCol, alpha: 0.3 + 0.35 * g0 });
          }
        }

        // ---- escaping mRNA -------------------------------------------------
        gFrag.clear();
        let freeCount = 0;
        for (let i = 0; i < FRAGS.length; i++) {
          const fr = FRAGS[i];
          const u0 = (p - fr.t0) / fr.span;
          if (u0 <= 0) continue;
          freeCount++;
          const u = clamp01(u0);
          const travel = R * 0.92 + (fr.far - R * 0.92) * cubicOut(u) + 10 * Math.sin(t * 0.5 + fr.ph);
          const swing = fr.sway * Math.sin(t * 0.8 + fr.ph * 2 + u * 3);
          const ca = Math.cos(fr.dir);
          const sa = Math.sin(fr.dir);
          const ox = ca * travel - sa * swing;
          const oy = sa * travel + ca * swing;
          const rot = fr.dir + fr.spin * (t * 0.35 + u * 1.6);
          const cr = Math.cos(rot);
          const sr = Math.sin(rot);
          const fade = clamp01(u / 0.07) * (u > 0.66 ? 1 - clamp01((u - 0.66) / 0.34) : 1);
          if (fade <= 0.002) continue;

          const segs = 10;
          const pts = [];
          for (let j = 0; j <= segs; j++) {
            const q = j / segs;
            const lx = (q - 0.5) * fr.len;
            const ly = Math.sin(q * Math.PI * 1.7 + fr.ph + t * 1.3) * fr.curl;
            pts.push(ox + lx * cr - ly * sr, oy + lx * sr + ly * cr);
          }
          const col = mix(palette.signal, palette.cold, 0.15 + 0.6 * u);
          line(gFrag, pts, { width: 9, color: col, alpha: 0.1 * fade * (0.5 + 0.5 * bloom) });
          line(gFrag, pts, { width: 5, color: col, alpha: 0.92 * fade });
          const capCol = mix(col, palette.ink, 0.4);
          gFrag.circle(pts[pts.length - 2], pts[pts.length - 1], 4.5).fill({ color: capCol, alpha: 0.95 * fade });
        }

        // ---- EE gauge ------------------------------------------------------
        const eeLive = ee + 0.1 * Math.sin(t * 2.3) + 0.06 * Math.sin(t * 5.1);
        const aNow = angOf(eeLive);
        gauge.scale.set(1 + 0.022 * flash);

        gGauge.clear();
        arc(gGauge, GR, A0, A1, { width: 13, color: palette.grid, alpha: 0.95 });
        for (let i = 0; i <= 6; i++) {
          spoke(gGauge, angOf(EE_LO + i * 5), GR - 17, GR - 4, { width: 3, color: palette.inkFaint, alpha: 0.65 });
        }
        // the band that used to be full: what the freeze took
        if (ANG_START - aNow > 0.006) {
          arc(gGauge, GR, aNow, ANG_START, { width: 9, color: palette.alert, alpha: 0.4 + 0.4 * flash }, 24);
        }
        arc(gGauge, GR, A0, aNow, { width: 13, color: mix(palette.cold, palette.ink, 0.28), alpha: 0.95 }, 40);
        spoke(gGauge, ANG_START, GR - 24, GR + 20, { width: 4, color: palette.inkDim, alpha: 0.75 });
        spoke(gGauge, aNow, GR - 30, GR + 18, { width: 6, color: palette.ink, alpha: 0.95 });
        gGauge.circle(Math.cos(aNow) * GR, Math.sin(aNow) * GR, 8 + 3 * flash).fill({ color: palette.ink, alpha: 0.95 });
        if (flash > 0.02) {
          gGauge.circle(0, 0, GR + 26 + 18 * (1 - flash)).stroke({ width: 3, color: palette.alert, alpha: 0.55 * flash });
        }

        const vs = `${Math.round(ee)}%`;
        if (tValue.text !== vs) tValue.text = vs;
        const ds = `LOSS ${Math.round(EE_START - ee)} PTS`;
        if (tDelta.text !== ds) tDelta.text = ds;
        tDelta.alpha = clamp01((EE_START - ee) / 2.5) * (0.8 + 0.2 * flash);
        tStart.alpha = 0.55 + 0.25 * breath;
        tValue.alpha = 0.9 + 0.1 * flash;
        tLabel.alpha = 0.7 + 0.15 * breath;

        // ---- fragment tally -------------------------------------------------
        const ts = `MRNA FRAGMENTS FREE  ${freeCount < 10 ? '0' : ''}${freeCount}`;
        if (tTally.text !== ts) tTally.text = ts;
        tTally.alpha = 0.5 + 0.35 * clamp01(freeCount / 4);

        gPanel.clear();
        const ruleY = GY - GR - 46;
        line(gPanel, [COL, ruleY, GX + GR + 130, ruleY], { width: 3, color: palette.rule, alpha: 0.6 });
        for (let i = 0; i < FRAGS.length; i++) {
          const cx = COL + 6 + i * 26;
          const on = i < freeCount;
          const pulse = on ? 0.6 + 0.4 * Math.sin(t * 2.4 + i * 0.7) : 1;
          const dotCol = on ? mix(palette.signal, palette.cold, 0.5) : palette.rule;
          gPanel.circle(cx, TALLY_Y, on ? 6 : 3.4).fill({ color: dotCol, alpha: on ? 0.85 * pulse : 0.55 });
        }
      },
    };
  },
};
