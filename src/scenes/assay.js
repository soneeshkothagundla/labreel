/**
 * Scene: assay — THE MEASUREMENT, built as a figure rather than stated as one.
 *
 * Two tubes. The left one (FREE) gets dye only, so the sole thing that
 * fluoresces is the mRNA that already escaped its particle. The right one
 * (TOTAL) gets detergent first — the lipid shells split open on screen — and
 * then dye, so every strand in the tube reports. The difference between those
 * two numbers is the payload that was still inside a particle, which is the
 * whole measurement. The equation then assembles centre-frame out of the two
 * tube labels themselves, so the algebra is visibly made of the experiment.
 *
 * Everything is deterministic: scatter comes from a seeded LCG evaluated once
 * in build(), and all continuous motion is a pure function of frame.time.
 */

import { clamp01, remap, cubicOut, sineInOut, settle } from '../core/easing.js';

/* ---- figure geometry, in the 1920x1080 design box -------------------------- */

const PANEL = { x: 100, y: 146, w: 1720, h: 654 };

const TUBE_HALF = 84;
const TUBE_TOP = 168;
const TUBE_BOT = 588;
const TUBE_RAD = 72;
const IN_HALF = 78;
const IN_TOP = 174;
const IN_BOT = 582;
const IN_RAD = 66;
const FLUID_TOP = 268;

const LABEL_Y = 646;
const METER_Y = 700;
const METER_H = 16;
const METER_HALF = 150;
const VALUE_Y = 756;

const UNITS = [
  { cx: 620, label: 'FREE' },
  { cx: 1300, label: 'TOTAL' },
];

/* Readings. Relative fluorescence units; EE = (TOTAL - FREE) / TOTAL. */
const FREE_RFU = 218;
const TOTAL_RFU = 991;
const RFU_FULL = 1100;
const EE_PCT = ((TOTAL_RFU - FREE_RFU) / TOTAL_RFU) * 100; // 78.0

/* The tube figure shrinks and lifts to clear room for the equation. */
const SHRINK = 0.7;
const PIVOT_Y = 150;
const RISE = 60;
const srcX = (cx) => 960 + (cx - 960) * SHRINK;
const SRC_Y = PIVOT_Y - RISE + (LABEL_Y - PIVOT_Y) * SHRINK;

/* Equation layout. Balanced so the whole assembly centres on x = 960. */
const EQ_Y = 692;
const NUM_Y = 636;
const DEN_Y = 748;
const FX = 840;
const BAR_HALF = 222;
const EE_X = 440;
const EQ1_X = 562;
const EQ2_X = 1140;
const RES_X = 1210;

/** Eased sub-window of a 0..1 progress value; holds its end state. */
const seg = (p, a, b, ease = cubicOut) =>
  b <= a ? (p >= b ? 1 : 0) : ease(clamp01((p - a) / (b - a)));

export default {
  id: 'assay',

  build(ctx) {
    const { PIXI, palette, width, height, text } = ctx;

    const view = new PIXI.Container();
    view.pivot.set(width / 2, height / 2);
    view.position.set(width / 2, height / 2);

    /* -- deterministic scatter, computed once ------------------------------ */
    let s = 12345;
    const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;

    const strand = (scale) => {
      const n = 7;
      const len = 46 * scale;
      const amp = (4.5 + rnd() * 5) * scale;
      const ph = rnd() * Math.PI * 2;
      const pts = [];
      for (let i = 0; i < n; i++) {
        pts.push({
          x: -len / 2 + (len * i) / (n - 1),
          y: Math.sin(ph + i * 1.15) * amp,
        });
      }
      return pts;
    };

    const units = UNITS.map((u, ui) => {
      const lnps = [];
      for (let i = 0; i < 8; i++) {
        let x = 0;
        let y = 0;
        let r = 0;
        let ok = false;
        for (let tries = 0; tries < 48 && !ok; tries++) {
          r = 21 + rnd() * 9;
          x = u.cx + (rnd() * 2 - 1) * 50;
          y = 306 + rnd() * 238;
          ok = lnps.every(
            (o) => Math.hypot(o.x - x, o.y - y) > o.r + r + 10
          );
        }
        lnps.push({
          x,
          y,
          r,
          ph: rnd() * Math.PI * 2,
          sp: 0.32 + rnd() * 0.42,
          rot: rnd() * Math.PI * 2,
          spin: (rnd() * 2 - 1) * 0.22,
          dir: rnd() * Math.PI * 2,
          pay: strand(0.5),
        });
      }
      const free = [];
      for (let i = 0; i < 5; i++) {
        free.push({
          x: u.cx + (rnd() * 2 - 1) * 60,
          y: 294 + rnd() * 256,
          ph: rnd() * Math.PI * 2,
          sp: 0.28 + rnd() * 0.44,
          rot: rnd() * Math.PI * 2,
          spin: (rnd() * 2 - 1) * 0.18,
          pts: strand(1),
        });
      }
      return { ...u, ui, lnps, free };
    });

    const motes = [];
    for (let i = 0; i < 18; i++) {
      motes.push({
        x: PANEL.x + rnd() * PANEL.w,
        y: PANEL.y + rnd() * PANEL.h,
        r: 34 + rnd() * 92,
        sp: 4 + rnd() * 11,
        ph: rnd() * Math.PI * 2,
        a: 0.018 + rnd() * 0.03,
        cold: rnd() > 0.55,
      });
    }

    /* -- static backdrop ---------------------------------------------------- */
    const gBack = new PIXI.Graphics();
    gBack
      .roundRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 10)
      .fill({ color: palette.ground, alpha: 0.55 });
    for (let x = PANEL.x + 86; x < PANEL.x + PANEL.w; x += 86) {
      gBack.moveTo(x, PANEL.y).lineTo(x, PANEL.y + PANEL.h);
    }
    for (let y = PANEL.y + 82; y < PANEL.y + PANEL.h; y += 82) {
      gBack.moveTo(PANEL.x, y).lineTo(PANEL.x + PANEL.w, y);
    }
    gBack.stroke({ width: 3, color: palette.grid, alpha: 0.42 });
    gBack
      .roundRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 10)
      .stroke({ width: 3, color: palette.rule, alpha: 0.85 });
    view.addChild(gBack);

    /* Motes and the scan sweep are clipped to the figure panel so nothing
       bleeds into the title band or the readout corner. */
    const atmosMask = new PIXI.Graphics();
    atmosMask
      .roundRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 10)
      .fill({ color: 0xffffff });
    const atmosClip = new PIXI.Container();
    atmosClip.mask = atmosMask;
    const gAtmos = new PIXI.Graphics();
    atmosClip.addChild(gAtmos);
    const gFrame = new PIXI.Graphics();
    view.addChild(atmosMask, atmosClip, gFrame);

    const caption = text('FLUORESCENCE ASSAY   /   RELATIVE UNITS', {
      size: 32,
      color: palette.inkFaint,
      mono: true,
      letterSpacing: 3,
    });
    caption.anchor.set(0, 0.5);
    caption.position.set(PANEL.x + 4, 96);
    view.addChild(caption);

    /* -- tube figure -------------------------------------------------------- */
    const tubeGroup = new PIXI.Container();
    tubeGroup.pivot.set(960, PIVOT_Y);
    tubeGroup.position.set(960, PIVOT_Y);
    view.addChild(tubeGroup);

    for (const u of units) {
      const box = new PIXI.Container();
      box.pivot.set(u.cx, 380);
      box.position.set(u.cx, 380);

      const maskG = new PIXI.Graphics();
      maskG
        .roundRect(u.cx - IN_HALF, IN_TOP, IN_HALF * 2, IN_BOT - IN_TOP, IN_RAD)
        .fill({ color: 0xffffff });

      const fluidLayer = new PIXI.Container();
      fluidLayer.mask = maskG;
      const gFluid = new PIXI.Graphics();
      const gParts = new PIXI.Graphics();
      fluidLayer.addChild(gFluid, gParts);

      const gShell = new PIXI.Graphics();
      const gMeter = new PIXI.Graphics();

      const label = text(u.label, {
        size: 56,
        color: palette.ink,
        mono: true,
        weight: '600',
        letterSpacing: 6,
      });
      label.anchor.set(0.5, 0.5);
      label.position.set(u.cx, LABEL_Y);

      const value = text('0 RFU', {
        size: 46,
        color: palette.inkDim,
        mono: true,
        letterSpacing: 2,
      });
      value.anchor.set(0.5, 0.5);
      value.position.set(u.cx, VALUE_Y);

      box.addChild(maskG, fluidLayer, gShell, gMeter, label, value);
      tubeGroup.addChild(box);

      Object.assign(u, { box, gFluid, gParts, gShell, gMeter, label, value });
    }

    const gDrops = new PIXI.Graphics();
    tubeGroup.addChild(gDrops);

    const mkTag = (str, x, y, anchor, color) => {
      const t = text(str, { size: 34, color, mono: true, letterSpacing: 3 });
      t.anchor.set(anchor, 0.5);
      t.position.set(x, y);
      t.alpha = 0;
      tubeGroup.addChild(t);
      return t;
    };
    const tagDyeL = mkTag('DYE +', UNITS[0].cx - 176, 320, 1, palette.signal);
    const tagDet = mkTag('+ DETERGENT', UNITS[1].cx + 176, 288, 0, palette.warm);
    const tagDyeR = mkTag('+ DYE', UNITS[1].cx + 176, 372, 0, palette.signal);

    /* -- equation ----------------------------------------------------------- */
    const eqGroup = new PIXI.Container();
    view.addChild(eqGroup);

    const gEq = new PIXI.Graphics();
    eqGroup.addChild(gEq);

    const mkEq = (str, size, color, weight = '400', ax = 0.5) => {
      const t = text(str, {
        size,
        color,
        mono: true,
        weight,
        letterSpacing: str.length > 1 ? 4 : 0,
      });
      t.anchor.set(ax, 0.5);
      t.alpha = 0;
      eqGroup.addChild(t);
      return t;
    };

    const eqEE = mkEq('EE', 82, palette.ink, '600');
    const eqIs = mkEq('=', 72, palette.inkDim);
    const eqNumTotal = mkEq('TOTAL', 56, palette.ink, '600');
    const eqMinus = mkEq('−', 56, palette.inkDim);
    const eqNumFree = mkEq('FREE', 56, palette.ink, '600');
    const eqDenTotal = mkEq('TOTAL', 56, palette.ink, '600');
    const eqIs2 = mkEq('=', 72, palette.inkDim);
    const eqResult = mkEq('0.0 %', 88, palette.signal, '600', 0);

    eqEE.position.set(EE_X, EQ_Y);
    eqIs.position.set(EQ1_X, EQ_Y);
    eqIs2.position.set(EQ2_X, EQ_Y);
    eqResult.position.set(RES_X, EQ_Y);

    /* -- helpers used by update() ------------------------------------------- */
    const drawStrand = (g, pts, cx, cy, rot, amp, color, alpha, w) => {
      if (alpha < 0.012) return;
      const c = Math.cos(rot);
      const sn = Math.sin(rot);
      for (let i = 0; i < pts.length; i++) {
        const px = pts[i].x;
        const py = pts[i].y * amp;
        const x = cx + px * c - py * sn;
        const y = cy + px * sn + py * c;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke({ width: w, color, alpha, cap: 'round', join: 'round' });
    };

    const arc = (g, cx, cy, r, a0, a1) => {
      const steps = 16;
      for (let i = 0; i <= steps; i++) {
        const a = a0 + ((a1 - a0) * i) / steps;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
    };

    const pipette = (g, x, tipY, alpha, tint) => {
      if (alpha < 0.012) return;
      g.moveTo(x, tipY)
        .lineTo(x - 15, tipY - 48)
        .lineTo(x + 15, tipY - 48)
        .fill({ color: palette.panel, alpha: alpha * 0.9 });
      g.moveTo(x, tipY)
        .lineTo(x - 15, tipY - 48)
        .moveTo(x, tipY)
        .lineTo(x + 15, tipY - 48)
        .stroke({ width: 3, color: palette.inkDim, alpha });
      g.roundRect(x - 26, tipY - 186, 52, 140, 12)
        .fill({ color: palette.panel, alpha: alpha * 0.95 })
        .stroke({ width: 3, color: palette.inkDim, alpha });
      g.roundRect(x - 26, tipY - 116, 52, 16, 6).fill({ color: tint, alpha: alpha * 0.75 });
    };

    const setText = (obj, str) => {
      if (obj.text !== str) obj.text = str;
    };

    const fly = (obj, sx, sy, dx, dy, t) => {
      const e = cubicOut(t);
      obj.position.set(sx + (dx - sx) * e, sy + (dy - sy) * e);
      obj.scale.set(0.72 + 0.28 * settle(t));
      obj.alpha = clamp01(t * 1.7);
    };

    return {
      view,

      update(frame, weight, progress) {
        const p = clamp01(progress);
        const T = frame.time;
        const bloom = frame.values?.bloom ?? 0.15;
        const drift = frame.values?.drift ?? 0;
        const boost = 0.86 + 0.28 * bloom;

        /* Beat-scale settle so the cross-dissolve arrives rather than cuts. */
        view.scale.set(1 + (1 - clamp01(weight)) * 0.022);

        /* -- cue schedule ---------------------------------------------------- */
        const inA = seg(p, 0.0, 0.1);
        const inB = seg(p, 0.03, 0.13);
        const detTag = seg(p, 0.11, 0.18) * (1 - seg(p, 0.56, 0.63));
        const detArm = seg(p, 0.12, 0.22, sineInOut);
        const detDrop = seg(p, 0.21, 0.28, (t) => t * t);
        const lyse = seg(p, 0.27, 0.45, sineInOut);
        const dyeTag = seg(p, 0.36, 0.44) * (1 - seg(p, 0.58, 0.65));
        const dyeArm = seg(p, 0.38, 0.47, sineInOut);
        const dyeDrop = seg(p, 0.46, 0.53, (t) => t * t);
        const litL = seg(p, 0.52, 0.66, sineInOut);
        const litR = seg(p, 0.53, 0.7, sineInOut);
        const meters = seg(p, 0.57, 0.74, sineInOut);
        const shrink = seg(p, 0.65, 0.78, sineInOut);
        const cueEE = seg(p, 0.69, 0.77);
        const cueNumT = seg(p, 0.72, 0.81);
        const cueMinus = seg(p, 0.76, 0.83);
        const cueFree = seg(p, 0.78, 0.86);
        const cueBar = seg(p, 0.81, 0.88);
        const cueDen = seg(p, 0.83, 0.91);
        const cueRes = seg(p, 0.87, 0.97);

        const lit = [litL * 0.42, litR];
        const impactP = [0.52, 0.27];

        /* -- atmosphere: never still ---------------------------------------- */
        gAtmos.clear();
        for (const m of motes) {
          const y =
            PANEL.y +
            (((m.y - PANEL.y + T * m.sp + drift * 40) % (PANEL.h + 240)) + PANEL.h + 240) %
              (PANEL.h + 240) -
            120;
          const puls = 0.75 + 0.25 * Math.sin(T * 0.6 + m.ph);
          gAtmos.circle(m.x + Math.sin(T * 0.22 + m.ph) * 26, y, m.r * puls).fill({
            color: m.cold ? palette.cold : palette.signal,
            alpha: m.a * puls * boost,
          });
        }
        const scanY =
          PANEL.y - 120 + ((T * 27) % (PANEL.h + 240));
        gAtmos
          .rect(PANEL.x, scanY, PANEL.w, 116)
          .fill({ color: palette.cold, alpha: 0.028 });
        gFrame.clear();
        const tickPulse = 0.4 + 0.28 * Math.sin(T * 1.1);
        for (const [ox, oy, sx2, sy2] of [
          [PANEL.x, PANEL.y, 1, 1],
          [PANEL.x + PANEL.w, PANEL.y, -1, 1],
          [PANEL.x, PANEL.y + PANEL.h, 1, -1],
          [PANEL.x + PANEL.w, PANEL.y + PANEL.h, -1, -1],
        ]) {
          gFrame
            .moveTo(ox, oy + sy2 * 34)
            .lineTo(ox, oy)
            .lineTo(ox + sx2 * 34, oy);
        }
        gFrame.stroke({ width: 4, color: palette.inkDim, alpha: tickPulse });
        caption.alpha = 0.5 + 0.2 * Math.sin(T * 0.8);

        /* -- tube figure transform ------------------------------------------ */
        const gs = 1 - (1 - SHRINK) * shrink;
        tubeGroup.scale.set(gs);
        tubeGroup.position.set(960, PIVOT_Y - RISE * shrink);

        for (const u of units) {
          const enter = u.ui === 0 ? inA : inB;
          u.box.alpha = 0.12 + 0.88 * enter;
          u.box.scale.set(0.94 + 0.06 * enter);
          u.box.position.set(u.cx, 380 + (1 - enter) * 26);

          const glow = lit[u.ui];
          const cx = u.cx;

          /* impact ripple on the meniscus, decaying */
          const ru = clamp01((p - impactP[u.ui]) / 0.16);
          const ripple =
            p < impactP[u.ui] ? 0 : 15 * Math.exp(-4.2 * ru) * Math.cos(ru * 17);

          /* fluid body + fluorescence, clipped to the tube interior */
          const g = u.gFluid;
          g.clear();
          g.rect(cx - 100, FLUID_TOP, 200, IN_BOT - FLUID_TOP + 20).fill({
            color: palette.panel,
            alpha: 0.9,
          });
          for (let i = 0; i < 4; i++) {
            const y0 = FLUID_TOP + ((IN_BOT - FLUID_TOP) * i) / 4;
            g.rect(cx - 100, y0, 200, (IN_BOT - FLUID_TOP) / 4 + 2).fill({
              color: palette.signal,
              alpha: (0.02 + 0.055 * i * glow) * boost,
            });
          }
          const breathe = 0.88 + 0.12 * Math.sin(T * 1.35 + u.ui * 1.7);
          g.rect(cx - 100, FLUID_TOP, 200, IN_BOT - FLUID_TOP + 20).fill({
            color: palette.signal,
            alpha: 0.03 + 0.19 * glow * breathe * boost,
          });
          for (let i = 0; i < 3; i++) {
            const span = IN_BOT - FLUID_TOP;
            const y = FLUID_TOP + ((T * 19 + i * 118 + u.ui * 61) % span);
            g.rect(cx - 100, y, 200, 26).fill({
              color: palette.ink,
              alpha: 0.014 + 0.026 * glow,
            });
          }
          for (let i = 0; i <= 24; i++) {
            const x = cx - 100 + (200 * i) / 24;
            const y =
              FLUID_TOP +
              Math.sin(i * 0.42 + T * 1.9) * 3 +
              Math.sin(i * 0.9 - T * 1.2) * 1.6 +
              ripple * Math.cos(i * 0.5);
            if (i === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.stroke({ width: 4, color: palette.ink, alpha: 0.22 + 0.3 * glow });

          /* particles */
          const gp = u.gParts;
          gp.clear();
          const open = u.ui === 1 ? lyse : 0;
          for (const n of u.lnps) {
            const bob = Math.sin(T * n.sp + n.ph) * 7;
            const sway = Math.cos(T * n.sp * 0.72 + n.ph) * 5;
            const px = n.x + sway + Math.cos(n.dir) * open * 34;
            const py = n.y + bob + Math.sin(n.dir) * open * 34;
            const rot = n.rot + T * n.spin * 0.4;
            const rr = n.r * (1 + 0.34 * open);

            if (open < 0.98) {
              gp.circle(px, py, rr).fill({
                color: palette.ground,
                alpha: (1 - open) * 0.75,
              });
              const gap = 0.12 + open * 1.05;
              arc(gp, px, py, rr, gap, Math.PI - gap);
              gp.stroke({
                width: 4,
                color: palette.lipid,
                alpha: (1 - open) * 0.85,
                cap: 'round',
              });
              arc(gp, px, py, rr, Math.PI + gap, Math.PI * 2 - gap);
              gp.stroke({
                width: 4,
                color: palette.lipid,
                alpha: (1 - open) * 0.85,
                cap: 'round',
              });
            }

            /* payload: dark while encapsulated, bright once released + dyed */
            const released = u.ui === 1 ? open : 0;
            const payLit = glow * (0.25 + 0.75 * released);
            drawStrand(
              gp,
              n.pay,
              px,
              py,
              rot,
              1 + released * 1.4,
              palette.inkFaint,
              0.85 * (1 - payLit),
              4
            );
            if (payLit > 0.02) {
              gp.circle(px, py, rr * 1.15).fill({
                color: palette.signal,
                alpha: 0.05 * payLit * boost,
              });
              drawStrand(
                gp,
                n.pay,
                px,
                py,
                rot,
                1 + released * 1.4,
                palette.signal,
                payLit,
                4
              );
            }
          }

          for (const f of u.free) {
            const bob = Math.sin(T * f.sp + f.ph) * 9;
            const sway = Math.cos(T * f.sp * 0.66 + f.ph) * 7;
            const rot = f.rot + T * f.spin * 0.35;
            const amp = 1 + 0.18 * Math.sin(T * 1.4 + f.ph);
            const fx = f.x + sway;
            const fy = f.y + bob;
            const g2 = u.ui === 0 ? litL : litR;
            drawStrand(gp, f.pts, fx, fy, rot, amp, palette.inkFaint, 0.8 * (1 - g2), 4);
            if (g2 > 0.02) {
              gp.circle(fx, fy, 30).fill({
                color: palette.signal,
                alpha: 0.055 * g2 * boost,
              });
              drawStrand(gp, f.pts, fx, fy, rot, amp, palette.signal, g2, 5);
            }
          }

          /* tube wall, mouth, and outer bloom */
          const sh = u.gShell;
          sh.clear();
          for (let i = 0; i < 3; i++) {
            sh.roundRect(
              cx - TUBE_HALF - i * 7,
              TUBE_TOP - i * 7,
              (TUBE_HALF + i * 7) * 2,
              TUBE_BOT - TUBE_TOP + i * 14,
              TUBE_RAD + i * 7
            ).stroke({
              width: 10,
              color: palette.signal,
              alpha: 0.13 * glow * breathe * (1 - i * 0.28) * boost,
            });
          }
          sh.roundRect(
            cx - TUBE_HALF,
            TUBE_TOP,
            TUBE_HALF * 2,
            TUBE_BOT - TUBE_TOP,
            TUBE_RAD
          ).stroke({ width: 5, color: palette.inkDim, alpha: 0.9 });
          sh.moveTo(cx - TUBE_HALF + 16, TUBE_TOP + 120)
            .lineTo(cx - TUBE_HALF + 16, TUBE_BOT - 110)
            .stroke({ width: 3, color: palette.ink, alpha: 0.22 });
          sh.ellipse(cx, TUBE_TOP, TUBE_HALF, 17).stroke({
            width: 5,
            color: palette.inkDim,
            alpha: 0.95,
          });
          sh.roundRect(cx - TUBE_HALF - 12, TUBE_TOP - 30, (TUBE_HALF + 12) * 2, 24, 8)
            .stroke({ width: 4, color: palette.rule, alpha: 0.9 });
          for (let i = 1; i <= 4; i++) {
            const y = FLUID_TOP + 52 * i;
            sh.moveTo(cx + TUBE_HALF - 22, y)
              .lineTo(cx + TUBE_HALF - 4, y)
              .stroke({ width: 3, color: palette.inkFaint, alpha: 0.6 });
          }

          /* tag leader lines */
          const tagA = u.ui === 0 ? dyeTag : Math.max(detTag, dyeTag);
          if (tagA > 0.02) {
            const dirn = u.ui === 0 ? -1 : 1;
            sh.moveTo(cx + dirn * (TUBE_HALF + 8), 320)
              .lineTo(cx + dirn * (TUBE_HALF + 8 + 152 * tagA), 320)
              .stroke({ width: 3, color: palette.inkFaint, alpha: 0.75 * tagA });
          }

          /* meter + numeric readout */
          const target = u.ui === 0 ? FREE_RFU : TOTAL_RFU;
          const shown = Math.round(target * meters);
          const frac = remap(shown, 0, RFU_FULL, 0, 1);
          const m = u.gMeter;
          m.clear();
          m.roundRect(cx - METER_HALF, METER_Y, METER_HALF * 2, METER_H, METER_H / 2).fill({
            color: palette.grid,
            alpha: 0.95,
          });
          if (frac > 0.001) {
            m.roundRect(
              cx - METER_HALF,
              METER_Y,
              Math.max(METER_H, METER_HALF * 2 * frac),
              METER_H,
              METER_H / 2
            ).fill({
              color: palette.signal,
              alpha: u.ui === 0 ? 0.6 : 1,
            });
          }
          m.roundRect(cx - METER_HALF, METER_Y, METER_HALF * 2, METER_H, METER_H / 2).stroke({
            width: 3,
            color: palette.rule,
            alpha: 0.9,
          });
          const tick = cx - METER_HALF + METER_HALF * 2 * (FREE_RFU / RFU_FULL);
          m.moveTo(tick, METER_Y - 10)
            .lineTo(tick, METER_Y + METER_H + 10)
            .stroke({ width: 3, color: palette.inkFaint, alpha: 0.5 + 0.3 * meters });

          /* pulse the source meter as its word departs for the equation */
          const depart = u.ui === 0 ? cueFree : cueNumT;
          if (depart > 0.001 && depart < 0.999) {
            const e = Math.sin(depart * Math.PI);
            m.roundRect(
              cx - METER_HALF - 10 * e,
              METER_Y - 10 * e,
              (METER_HALF + 10 * e) * 2,
              METER_H + 20 * e,
              METER_H
            ).stroke({ width: 4, color: palette.ink, alpha: 0.7 * e });
          }

          setText(u.value, `${shown} RFU`);
          u.value.alpha = 0.25 + 0.75 * meters;
          u.label.alpha = 0.55 + 0.45 * enter;
          u.label.scale.set(
            1 + 0.03 * Math.sin(T * 1.2 + u.ui * 2) * (0.3 + 0.7 * meters)
          );
        }

        /* -- pipettes, drops, ripples --------------------------------------- */
        gDrops.clear();
        const armY = (t) => -230 + 372 * t;

        /* detergent into TOTAL */
        const detOut = 1 - seg(p, 0.3, 0.4);
        if (detArm > 0 && detOut > 0.01) {
          pipette(gDrops, UNITS[1].cx, armY(detArm) + Math.sin(T * 2.2) * 4, detOut, palette.warm);
        }
        if (detDrop > 0 && detDrop < 1) {
          const y = 152 + (FLUID_TOP - 152) * detDrop;
          gDrops.circle(UNITS[1].cx, y, 13 - 3 * detDrop).fill({
            color: palette.warm,
            alpha: 0.95,
          });
          gDrops.circle(UNITS[1].cx, y, 26).fill({ color: palette.warm, alpha: 0.12 });
        }

        /* dye into both */
        const dyeOut = 1 - seg(p, 0.55, 0.65);
        if (dyeArm > 0 && dyeOut > 0.01) {
          const bobA = Math.sin(T * 2.4) * 4;
          pipette(gDrops, UNITS[0].cx, armY(dyeArm) + bobA, dyeOut, palette.signal);
          pipette(gDrops, UNITS[1].cx, armY(dyeArm) - bobA, dyeOut, palette.signal);
        }
        if (dyeDrop > 0 && dyeDrop < 1) {
          const y = 152 + (FLUID_TOP - 152) * dyeDrop;
          for (const u of UNITS) {
            gDrops.circle(u.cx, y, 13 - 3 * dyeDrop).fill({
              color: palette.signal,
              alpha: 0.95,
            });
            gDrops.circle(u.cx, y, 26).fill({ color: palette.signal, alpha: 0.14 });
          }
        }

        /* surface rings where drops landed */
        const ring = (cx, startP, color) => {
          const u2 = clamp01((p - startP) / 0.14);
          if (u2 <= 0 || u2 >= 1) return;
          gDrops
            .ellipse(cx, FLUID_TOP, 18 + 66 * u2, 6 + 20 * u2)
            .stroke({ width: 4, color, alpha: 0.75 * (1 - u2) });
        };
        ring(UNITS[1].cx, 0.27, palette.warm);
        ring(UNITS[0].cx, 0.52, palette.signal);
        ring(UNITS[1].cx, 0.52, palette.signal);

        tagDyeL.alpha = dyeTag;
        tagDet.alpha = detTag;
        tagDyeR.alpha = dyeTag;
        tagDet.position.x = UNITS[1].cx + 176 - 22 * (1 - detTag);
        tagDyeR.position.x = UNITS[1].cx + 176 - 22 * (1 - dyeTag);
        tagDyeL.position.x = UNITS[0].cx - 176 + 22 * (1 - dyeTag);

        /* -- equation assembly ---------------------------------------------- */
        const eeE = settle(cueEE);
        eqEE.alpha = clamp01(cueEE * 1.7);
        eqEE.position.set(EE_X, EQ_Y - 44 * (1 - eeE));
        eqEE.scale.set(0.8 + 0.2 * eeE);

        eqIs.alpha = clamp01(seg(p, 0.71, 0.78) * 1.6);
        eqIs2.alpha = clamp01(cueRes * 1.8);

        fly(eqNumTotal, srcX(UNITS[1].cx), SRC_Y, FX - 124, NUM_Y, cueNumT);
        fly(eqNumFree, srcX(UNITS[0].cx), SRC_Y, FX + 141, NUM_Y, cueFree);
        fly(eqDenTotal, srcX(UNITS[1].cx), SRC_Y, FX, DEN_Y, cueDen);

        eqMinus.alpha = clamp01(cueMinus * 1.8);
        eqMinus.position.set(FX + 17, NUM_Y);
        eqMinus.scale.set(0.6 + 0.4 * settle(cueMinus));

        const resVal = EE_PCT * cueRes;
        setText(eqResult, `${resVal.toFixed(1)} %`);
        eqResult.alpha = clamp01(cueRes * 2);
        eqResult.scale.set(0.72 + 0.28 * settle(cueRes));

        gEq.clear();
        if (cueBar > 0.005) {
          const half = BAR_HALF * cubicOut(cueBar);
          gEq.moveTo(FX - half, EQ_Y)
            .lineTo(FX + half, EQ_Y)
            .stroke({ width: 6, color: palette.ink, alpha: 0.95, cap: 'round' });
        }
        if (cueRes > 0.02) {
          const pulse = 0.5 + 0.5 * Math.sin(T * 1.6);
          gEq.roundRect(RES_X - 26, EQ_Y - 60, 372, 120, 16).fill({
            color: palette.signal,
            alpha: (0.05 + 0.035 * pulse) * cueRes,
          });
          gEq.roundRect(RES_X - 26, EQ_Y - 60, 372, 120, 16).stroke({
            width: 3,
            color: palette.signal,
            alpha: (0.3 + 0.25 * pulse) * cueRes,
          });
          /* slow highlight sweep so the payoff keeps breathing on the hold */
          const sw = ((T * 0.24) % 1) * 372;
          gEq.rect(RES_X - 26 + sw, EQ_Y - 60, 44, 120).fill({
            color: palette.ink,
            alpha: 0.05 * cueRes,
          });
        }
        if (cueEE > 0.02) {
          gEq.moveTo(PANEL.x + 4, 566)
            .lineTo(PANEL.x + 4 + (PANEL.w - 8) * cubicOut(cueEE), 566)
            .stroke({ width: 3, color: palette.rule, alpha: 0.85 });
        }
      },
    };
  },
};
