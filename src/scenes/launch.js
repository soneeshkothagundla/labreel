/**
 * Beat: `launch` - ASCENT.
 *
 * The one high-tempo beat in the reel. A vertical composition: the vehicle
 * rises out of the bottom of the frame, the Earth's limb falls away beneath
 * it, the sky bleeds from lit to black, and the starfield comes up as the
 * atmosphere thins. Speed lines stream down past the camera to sell velocity.
 *
 * Everything is derived from two scalars - `alt` (kilometres) and `vel`
 * (km/s) - so the picture and the telemetry can never disagree. Altitude
 * doubles as the world's vertical scroll, which is what makes the altitude
 * markers, the tape on the right and the falling horizon all move together.
 *
 * Determinism: every scatter is precomputed in build() with a seeded LCG.
 * There is no call to the platform RNG anywhere in this file, so a capture
 * pass and a live pass produce identical pixels.
 */

import { clamp01, remap, cubicOut, sineInOut, settle } from '../core/easing.js';

const lerp = (a, b, t) => a + (b - a) * t;

/** Channel-wise colour blend, returns a 0xRRGGBB int. */
const mix = (c1, c2, t) => {
  const k = clamp01(t);
  const r1 = (c1 >> 16) & 0xff;
  const g1 = (c1 >> 8) & 0xff;
  const b1 = c1 & 0xff;
  const r = Math.round(r1 + (((c2 >> 16) & 0xff) - r1) * k);
  const g = Math.round(g1 + (((c2 >> 8) & 0xff) - g1) * k);
  const b = Math.round(b1 + ((c2 & 0xff) - b1) * k);
  return (r << 16) | (g << 8) | b;
};

/** Mission events, keyed to beat progress. */
const EVENTS = [
  { at: 0.0, label: 'LIFTOFF' },
  { at: 0.17, label: 'MAX-Q' },
  { at: 0.34, label: 'STAGE SEP' },
  { at: 0.46, label: 'KÁRMÁN LINE' },
  { at: 0.6, label: 'STAGE 2 BURN' },
  { at: 0.88, label: 'ORBIT INSERTION' },
];

/** World-space altitude markers that scroll down past the camera. */
const MARKERS = [
  { km: 12, label: 'MAX Q · 12 km' },
  { km: 100, label: 'KÁRMÁN LINE · 100 km' },
  { km: 210, label: 'STAGE 2 CUTOFF · 210 km' },
  { km: 408, label: 'ISS ORBIT · 408 km' },
];

// Reserved by the renderer overlay; matches freeze.js. Nothing that carries
// meaning is drawn past the bottom line. The top-right readout box
// (x > 1450, y < 130) is clear by construction: the HUD column starts at
// TAPE_TOP and every label below hangs off it.
const SAFE_BOTTOM = 816; // title / subtitle / progress hairline

const SEP_P = 0.34;
const MARKER_PX_KM = 7.2; // world pixels per kilometre
const TAPE_X = 1462;
const TAPE_TOP = 200;
const TAPE_BOT = 520;
const TAPE_MID = 360;
const TAPE_PX_KM = 2.0; // HUD pixels per kilometre
const RX = 1758; // right-align column for the big numerals

export default {
  id: 'launch',

  build(ctx) {
    const { PIXI, palette, width, height, text, font, mono } = ctx;
    const W = width;
    const H = height;
    const CX = W * 0.5;

    // ---- seeded scatter, precomputed once -----------------------------
    let s = 20260812;
    const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;

    const view = new PIXI.Container();
    const world = new PIXI.Container(); // everything that shares the camera shake
    view.addChild(world);

    // ---- sky gradient --------------------------------------------------
    const skyG = new PIXI.Graphics();
    world.addChild(skyG);
    const SKY_BANDS = 30;
    const bandH = Math.ceil((H + 120) / SKY_BANDS) + 1;

    // ---- starfield: two parallax layers, each a wrapping pair of tiles --
    const starsC = new PIXI.Container();
    world.addChild(starsC);
    const starLayers = [];
    for (let layer = 0; layer < 2; layer++) {
      const count = layer === 0 ? 96 : 58;
      const pts = [];
      for (let i = 0; i < count; i++) {
        pts.push({
          x: rnd() * (W + 120) - 60,
          y: rnd() * H,
          r: (layer === 0 ? 1.4 : 2.1) + rnd() * (layer === 0 ? 1.1 : 1.5),
          a: 0.3 + rnd() * 0.7,
          glint: rnd() > 0.9,
          tint: rnd() > 0.85 ? palette.cold : palette.ink,
        });
      }
      const holder = new PIXI.Container();
      for (let tile = 0; tile < 2; tile++) {
        const g = new PIXI.Graphics();
        for (const st of pts) {
          g.circle(st.x, st.y, st.r).fill({ color: st.tint, alpha: st.a });
          if (st.glint) {
            const L = st.r * 5.5;
            g.moveTo(st.x - L, st.y)
              .lineTo(st.x + L, st.y)
              .moveTo(st.x, st.y - L)
              .lineTo(st.x, st.y + L)
              .stroke({ width: 3, color: st.tint, alpha: st.a * 0.28 });
          }
        }
        holder.addChild(g);
      }
      starsC.addChild(holder);
      starLayers.push({ holder, speed: layer === 0 ? 24 : 9 });
    }

    // ---- Earth limb ----------------------------------------------------
    const earthG = new PIXI.Graphics();
    world.addChild(earthG);

    // ---- altitude markers ----------------------------------------------
    const markerG = new PIXI.Graphics();
    world.addChild(markerG);
    const markerLabels = MARKERS.map((m) => {
      // Base fill is near-white so the per-frame tint can only darken it,
      // which is how the label brightens as the vehicle crosses the mark.
      const tx = text(m.label, {
        size: 30,
        color: palette.ink,
        mono: true,
        letterSpacing: 2,
      });
      tx.anchor.set(0, 1);
      world.addChild(tx);
      return tx;
    });

    // ---- exhaust trail, plume, vehicle ---------------------------------
    const trailG = new PIXI.Graphics();
    const plumeG = new PIXI.Graphics();
    world.addChild(trailG, plumeG);

    const puffs = [];
    for (let i = 0; i < 26; i++) {
      puffs.push({
        u: i / 26,
        lat: (rnd() - 0.5) * 2,
        r: 16 + rnd() * 26,
        a: 0.08 + rnd() * 0.16,
        wob: rnd() * Math.PI * 2,
      });
    }

    // Booster: local origin at the interstage, body running down +y.
    const boosterC = new PIXI.Container();
    const boosterG = new PIXI.Graphics();
    boosterC.addChild(boosterG);
    world.addChild(boosterC);
    boosterG
      .rect(-19, 0, 38, 150)
      .fill({ color: palette.panel })
      .stroke({ width: 3, color: palette.ink, alpha: 0.9 });
    boosterG.rect(-19, 0, 38, 8).fill({ color: palette.rule });
    boosterG.rect(-19, 96, 38, 5).fill({ color: palette.grid });
    boosterG
      .moveTo(-19, 108)
      .lineTo(-48, 152)
      .lineTo(-19, 152)
      .closePath()
      .fill({ color: palette.panel })
      .stroke({ width: 3, color: palette.ink, alpha: 0.8 });
    boosterG
      .moveTo(19, 108)
      .lineTo(48, 152)
      .lineTo(19, 152)
      .closePath()
      .fill({ color: palette.panel })
      .stroke({ width: 3, color: palette.ink, alpha: 0.8 });
    boosterG
      .moveTo(-14, 150)
      .lineTo(-21, 170)
      .lineTo(21, 170)
      .lineTo(14, 150)
      .closePath()
      .fill({ color: palette.grid })
      .stroke({ width: 3, color: palette.inkDim, alpha: 0.9 });
    boosterG
      .moveTo(-19, 4)
      .lineTo(-19, 148)
      .stroke({ width: 3, color: palette.cold, alpha: 0.55 });

    // Upper stage: local origin at the engine plane, nose at -150.
    const rocketC = new PIXI.Container();
    const bodyG = new PIXI.Graphics();
    const cryoG = new PIXI.Graphics();
    rocketC.addChild(bodyG, cryoG);
    world.addChild(rocketC);
    bodyG
      .moveTo(-17, 0)
      .lineTo(-17, -96)
      .lineTo(-13, -118)
      .lineTo(-7, -136)
      .lineTo(0, -150)
      .lineTo(7, -136)
      .lineTo(13, -118)
      .lineTo(17, -96)
      .lineTo(17, 0)
      .closePath()
      .fill({ color: palette.panel })
      .stroke({ width: 3, color: palette.ink, alpha: 0.95 });
    bodyG.rect(-17, -46, 34, 6).fill({ color: palette.grid });
    bodyG
      .moveTo(-17, -6)
      .lineTo(-17, -96)
      .lineTo(-13, -118)
      .lineTo(-7, -136)
      .lineTo(0, -150)
      .stroke({ width: 3, color: palette.cold, alpha: 0.85 });
    // Payload band: the frozen cargo this whole reel is about.
    cryoG.rect(-17, -88, 34, 16).fill({ color: palette.cold, alpha: 0.9 });

    const fxG = new PIXI.Graphics(); // separation flash
    world.addChild(fxG);

    // ---- foreground speed lines ----------------------------------------
    // Banded by depth so the whole field tessellates as six strokes rather
    // than fifty-four. Parallax survives; the geometry rebuild does not hurt.
    const streakG = new PIXI.Graphics();
    world.addChild(streakG);
    const streakBands = [];
    for (let b = 0; b < 6; b++) {
      const depth = (b + 0.5) / 6;
      const items = [];
      for (let i = 0; i < 12 - b; i++) {
        items.push({ x: rnd() * (W + 160) - 80, phase: rnd() });
      }
      streakBands.push({
        items,
        speed: 0.18 + depth * 0.9,
        len: 60 + depth * 240,
        w: depth > 0.72 ? 4 : 3,
        a: 0.1 + depth * 0.4,
        tint: depth > 0.85 ? palette.cold : palette.ink,
      });
    }

    // ---- scrims: protect the overlay type, unshaken ----------------------
    const scrimG = new PIXI.Graphics();
    view.addChild(scrimG);
    for (let i = 0; i < 32; i++) {
      const y = 700 + (i / 32) * (H - 700);
      const a = 0.97 * Math.pow(clamp01((i / 31) * 1.55), 0.9);
      scrimG.rect(0, y, W, (H - 700) / 32 + 2).fill({ color: palette.void, alpha: a });
    }
    for (let i = 0; i < 10; i++) {
      const a = 0.42 * Math.pow(1 - i / 9, 1.6);
      scrimG.rect(0, i * 18, W, 20).fill({ color: palette.void, alpha: a });
    }

    // ---- HUD: altitude tape and telemetry, never shaken -------------------
    const hud = new PIXI.Container();
    view.addChild(hud);
    const hudG = new PIXI.Graphics();
    hud.addChild(hudG);

    const tickLabels = [];
    for (let i = 0; i < 7; i++) {
      const tx = text('', { size: 30, color: palette.inkDim, mono: true, letterSpacing: 1 });
      tx.anchor.set(0, 0.5);
      tx.x = TAPE_X + 46;
      hud.addChild(tx);
      tickLabels.push(tx);
    }

    const mkLabel = (str, y) => {
      const tx = text(str, { size: 30, color: palette.inkFaint, letterSpacing: 4, weight: '600' });
      tx.anchor.set(1, 0);
      tx.position.set(RX, y);
      hud.addChild(tx);
      return tx;
    };
    mkLabel('ALTITUDE', 208);
    mkLabel('VELOCITY', 350);

    const altValue = text('000', { size: 64, color: palette.ink, mono: true, weight: '600' });
    altValue.anchor.set(1, 0);
    altValue.position.set(RX, 242);
    const altUnit = text('km', { size: 32, color: palette.inkDim, mono: true });
    altUnit.position.set(RX + 12, 274);

    const velValue = text('0.00', { size: 52, color: palette.ink, mono: true, weight: '600' });
    velValue.anchor.set(1, 0);
    velValue.position.set(RX, 384);
    const velUnit = text('km/s', { size: 30, color: palette.inkDim, mono: true });
    velUnit.position.set(RX + 12, 408);

    const eventLabel = text('LIFTOFF', { size: 34, color: palette.signal, mono: true, letterSpacing: 3, weight: '600' });
    eventLabel.position.set(1496, 586);

    const clockLabel = text('T+ 00:00', { size: 32, color: palette.inkFaint, mono: true, letterSpacing: 2 });
    clockLabel.position.set(TAPE_X, 650);

    hud.addChild(altValue, altUnit, velValue, velUnit, eventLabel, clockLabel);

    /**
     * One tapered plume lobe. Walks the outbound edge, then walks the
     * return edge backwards. No allocation: the points are recomputed.
     */
    const lobe = (g, bx, by, dx, dy, px, py, len, w0, color, alpha, waver, phase) => {
      const SEG = 20;
      for (let i = 0; i <= SEG; i++) {
        const u = i / SEG;
        const shape = Math.sin(Math.PI * Math.pow(u, 0.55));
        const w = w0 * (0.34 + 0.92 * shape) * (1 + waver * Math.sin(u * 10.5 - phase));
        const x = bx + dx * len * u + px * w;
        const y = by + dy * len * u + py * w;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      for (let i = SEG; i >= 0; i--) {
        const u = i / SEG;
        const shape = Math.sin(Math.PI * Math.pow(u, 0.55));
        const w = w0 * (0.34 + 0.92 * shape) * (1 + waver * Math.sin(u * 10.5 - phase));
        g.lineTo(bx + dx * len * u - px * w, by + dy * len * u - py * w);
      }
      g.closePath().fill({ color, alpha });
    };

    return {
      view,

      update(frame, weight, progress) {
        const t = frame.time || 0;
        const p = clamp01(progress);
        const vals = frame.values || {};
        const chill = vals.chill ?? 0;
        const bloom = vals.bloom ?? 0.15;
        const drift = vals.drift ?? 0;

        // ---- flight model ------------------------------------------------
        const climb = 0.15 * p + 0.85 * Math.pow(p, 1.7);
        const alt = 408 * climb;
        const vel = 7.66 * (0.02 + 0.98 * sineInOut(clamp01(p * 1.02)));
        const highAlt = clamp01(remap(alt, 60, 230, 0, 1));
        const atmo = 1 - clamp01(remap(alt, 2, 95, 0, 1));
        const breathe = 0.92 + 0.08 * Math.sin(t * 0.8 + drift * 3);

        // ---- camera shake -------------------------------------------------
        const liftoff = clamp01(remap(p, 0.1, 0.0, 0, 1));
        const maxq = Math.exp(-Math.pow((p - 0.19) / 0.075, 2));
        const sepShake = Math.exp(-Math.pow((p - SEP_P) / 0.022, 2));
        const amp = (1.5 + 9 * liftoff + 6.5 * maxq + 7 * sepShake) * clamp01(weight);
        world.x = Math.sin(t * 31.7) * amp + Math.sin(t * 17.3 + 1.1) * amp * 0.55;
        world.y = Math.cos(t * 27.1) * amp * 0.7 + Math.sin(t * 41.3) * amp * 0.3;

        // ---- sky -----------------------------------------------------------
        // Apex starts above the title safe line (816) so the limb actually
        // reads, then falls out of frame as altitude builds. Anything below
        // ~870 is already under 75%+ of the bottom scrim, so a horizon that
        // starts down there is a horizon nobody ever sees.
        const horizonY = lerp(708, 1044, cubicOut(p) * 0.85 + 0.15 * p);
        const R = lerp(12000, 3200, sineInOut(p));
        const tint = mix(mix(palette.void, palette.cold, 0.78), palette.warm, 0.22 * atmo);
        skyG.clear();
        for (let i = 0; i < SKY_BANDS; i++) {
          const y = -60 + (i / SKY_BANDS) * (H + 120);
          const d = clamp01((horizonY - y) / 1150);
          const inten = atmo * Math.pow(1 - d, 2.4) * breathe;
          skyG.rect(-60, y, W + 120, bandH).fill({ color: mix(palette.void, tint, inten * 0.95) });
        }

        // ---- stars ----------------------------------------------------------
        const starVis = clamp01(remap(alt, 22, 140, 0, 1)) * (0.55 + 0.5 * bloom) * breathe;
        starsC.alpha = clamp01(starVis);
        for (const L of starLayers) {
          const off = ((t * L.speed + drift * 400) % H + H) % H;
          L.holder.children[0].y = off;
          L.holder.children[1].y = off - H;
        }

        // ---- Earth limb ------------------------------------------------------
        const cy = horizonY + R;
        earthG.clear();
        for (let i = 7; i >= 0; i--) {
          const glowC = mix(palette.cold, palette.warm, 0.34 * atmo);
          earthG
            .circle(CX, cy, R + 14 + i * 24)
            .fill({ color: glowC, alpha: 0.055 * (1 - i / 9) * (0.35 + 0.65 * atmo) * breathe });
        }
        earthG.circle(CX, cy, R).fill({ color: mix(palette.void, palette.ground, 0.75) });
        earthG.circle(CX, cy, R - 120).stroke({ width: 200, color: mix(palette.void, palette.cold, 0.18), alpha: 0.45 });
        earthG.circle(CX, cy, R - 22).stroke({ width: 34, color: mix(palette.void, palette.cold, 0.4), alpha: 0.5 });
        earthG.circle(CX, cy, R).stroke({ width: 4, color: mix(palette.cold, palette.ink, 0.35), alpha: 0.85 });

        // ---- altitude markers -------------------------------------------------
        markerG.clear();
        for (let i = 0; i < MARKERS.length; i++) {
          const m = MARKERS[i];
          const my = 540 + (alt - m.km) * MARKER_PX_KM;
          const tx = markerLabels[i];
          if (my < -40 || my > SAFE_BOTTOM) {
            tx.visible = false;
            continue;
          }
          // Faded out well above the reserved bottom band so the marker type
          // never fights the overlay title.
          const fade =
            clamp01(remap(my, 40, 210, 0, 1)) * clamp01(remap(my, 790, 660, 0, 1));
          const near = Math.exp(-Math.pow((alt - m.km) / 9, 2));
          const a = fade * (0.32 + 0.55 * near) * (0.85 + 0.15 * Math.sin(t * 2.1 + i));
          const bright = mix(palette.inkFaint, palette.ink, near);
          for (let d = 0; d < 14; d++) {
            const x0 = 210 + d * 70;
            markerG.moveTo(x0, my).lineTo(x0 + 40 + 18 * near, my);
          }
          markerG.stroke({ width: 3, color: bright, alpha: a });
          markerG
            .moveTo(210, my - 18 - 10 * near)
            .lineTo(210, my + 18 + 10 * near)
            .stroke({ width: 4, color: bright, alpha: a * 1.2 });
          tx.visible = true;
          tx.position.set(226, my - 14);
          tx.alpha = clamp01(a * 1.6);
          tx.tint = bright;
        }

        // ---- vehicle -----------------------------------------------------------
        const sc = lerp(1.05, 0.36, sineInOut(p));
        const rx = CX + 190 * sineInOut(clamp01(remap(p, 0.15, 1, 0, 1)));
        const ry = lerp(812, 396, 0.75 * cubicOut(p) + 0.25 * p);
        const rot =
          0.34 * sineInOut(clamp01(remap(p, 0.12, 1, 0, 1))) + 0.014 * Math.sin(t * 1.7);
        rocketC.position.set(rx, ry);
        rocketC.rotation = rot;
        rocketC.scale.set(sc);
        cryoG.alpha = 0.35 + 0.45 * chill * (0.6 + 0.4 * Math.sin(t * 3.4));

        // Vehicle "up" in world space is (sin r, -cos r); exhaust is the
        // opposite, and the plume's half-width axis is that turned 90°.
        const dx = -Math.sin(rot);
        const dy = Math.cos(rot);
        const px = Math.cos(rot);
        const py = Math.sin(rot);

        // Booster: rides with the stack, then falls away tumbling.
        const post = (p - SEP_P) / 0.3;
        if (p < SEP_P) {
          boosterC.visible = true;
          boosterC.position.set(rx, ry);
          boosterC.rotation = rot;
          boosterC.scale.set(sc);
          boosterC.alpha = 1;
        } else {
          const kk = cubicOut(clamp01(post));
          const back = 26 + 1080 * kk;
          boosterC.visible = post < 1.3;
          boosterC.position.set(rx + dx * back + 90 * kk * kk, ry + dy * back);
          boosterC.rotation = rot + 2.6 * kk + 1.1 * kk * kk;
          boosterC.scale.set(sc * (1 - 0.42 * kk));
          boosterC.alpha = 1 - clamp01((post - 0.5) / 0.5);
        }

        // Engine plane: bottom of the booster pre-sep, upper stage after.
        const nozzle = p < SEP_P ? 170 * sc : 4 * sc;
        const bx = rx + dx * nozzle;
        const by = ry + dy * nozzle;

        const throttle =
          (0.92 + 0.06 * Math.sin(t * 26.3)) *
          (1 - 0.22 * maxq) *
          (1 - 0.85 * sepShake) *
          (p > 0.88 ? 0.62 : 1);
        const flare = 1 + 0.09 * Math.sin(t * 33.1) + 0.05 * Math.sin(t * 51.7 + 2);
        const bell = 1 + 1.7 * highAlt; // vacuum plume balloons out
        const len = (p < SEP_P ? 330 : 250) * sc * throttle * flare * (0.85 + 0.5 * highAlt);
        const w0 = (p < SEP_P ? 30 : 20) * sc * flare;
        const glow = 0.75 + 0.5 * bloom;

        plumeG.clear();
        lobe(plumeG, bx, by, dx, dy, px, py, len * 1.35, w0 * 2.5 * bell, palette.warm, 0.1 * glow, 0.18, t * 7.1);
        lobe(plumeG, bx, by, dx, dy, px, py, len * 1.05, w0 * 1.55 * bell, palette.lipid, 0.2 * glow, 0.14, t * 9.3);
        lobe(plumeG, bx, by, dx, dy, px, py, len * 0.78, w0 * 0.85, palette.warm, 0.42 * glow, 0.1, t * 12.7);
        lobe(plumeG, bx, by, dx, dy, px, py, len * 0.5, w0 * 0.38, palette.ink, 0.85 * glow, 0.07, t * 15.1);
        // Mach diamonds: overexpanded nozzle, low in the atmosphere only.
        const diam = (1 - highAlt) * throttle;
        for (let i = 0; i < 5; i++) {
          const u = 0.1 + i * 0.09;
          const a = diam * (0.55 - i * 0.09) * (0.7 + 0.3 * Math.sin(t * 22 - i));
          if (a <= 0.01) continue;
          const cx2 = bx + dx * len * u;
          const cy2 = by + dy * len * u;
          const hw = w0 * 0.5;
          plumeG
            .moveTo(cx2 - px * hw, cy2 - py * hw)
            .lineTo(cx2 + px * hw, cy2 + py * hw)
            .stroke({ width: 3, color: palette.ink, alpha: a });
        }

        // Smoke column trailing the vehicle, only while there is air.
        const smoke = (1 - clamp01(remap(alt, 8, 70, 0, 1))) * clamp01(remap(p, 0, 0.04, 0, 1));
        trailG.clear();
        if (smoke > 0.01) {
          for (const q of puffs) {
            const u = (q.u + t * 0.16) % 1;
            const d = len * 0.9 + u * 900 * sc;
            const lat = q.lat * (18 + u * 150) * sc + Math.sin(t * 1.4 + q.wob) * 22 * u;
            const cx2 = bx + dx * d + px * lat;
            const cy2 = by + dy * d + py * lat;
            // Cull both ways: puffs stream a long way past the bottom edge,
            // and off-frame geometry is pure cost.
            if (cy2 < -120 || cy2 > H + 120) continue;
            trailG
              .circle(cx2, cy2, q.r * sc * (0.5 + u * 2.6))
              .fill({ color: mix(palette.warm, palette.inkFaint, u), alpha: q.a * smoke * (1 - u) });
          }
        }

        // Separation flash.
        fxG.clear();
        if (sepShake > 0.02) {
          const k = clamp01((p - SEP_P + 0.02) / 0.06);
          fxG
            .circle(rx + dx * 60 * sc, ry + dy * 60 * sc, 40 * sc + 320 * sc * k)
            .stroke({ width: 4, color: palette.ink, alpha: 0.7 * (1 - k) });
          fxG
            .circle(rx + dx * 60 * sc, ry + dy * 60 * sc, 20 * sc + 160 * sc * k)
            .fill({ color: palette.lipid, alpha: 0.35 * (1 - k) });
        }

        // ---- foreground speed lines --------------------------------------------
        const rush = 0.18 + 0.82 * clamp01(vel / 7.66);
        const streakVis = (0.35 + 0.65 * (1 - 0.5 * highAlt)) * (0.85 + 0.15 * Math.sin(t * 1.3));
        streakG.clear();
        for (const band of streakBands) {
          const L = band.len * (0.22 + 1.6 * rush);
          const spd = t * band.speed * (0.3 + 1.5 * rush);
          for (const it of band.items) {
            const y = ((((it.phase + spd) % 1) + 1) % 1) * (H + 420) - 210;
            streakG.moveTo(it.x, y).lineTo(it.x, y + L);
          }
          streakG.stroke({
            width: band.w,
            color: band.tint,
            alpha: clamp01(band.a * streakVis),
          });
        }

        // ---- HUD ------------------------------------------------------------------
        hudG.clear();
        hudG.rect(TAPE_X, TAPE_TOP, 3, TAPE_BOT - TAPE_TOP).fill({ color: palette.rule });
        const first = Math.ceil((alt - 88) / 10) * 10;
        let li = 0;
        for (let v = first; v <= alt + 88; v += 10) {
          if (v < 0) continue;
          const y = TAPE_MID + (alt - v) * TAPE_PX_KM;
          if (y < TAPE_TOP || y > TAPE_BOT) continue;
          const major = v % 50 === 0;
          const edge = clamp01(remap(y, TAPE_TOP, TAPE_TOP + 44, 0, 1)) * clamp01(remap(y, TAPE_BOT, TAPE_BOT - 44, 0, 1));
          hudG
            .moveTo(TAPE_X, y)
            .lineTo(TAPE_X + (major ? 34 : 16), y)
            .stroke({ width: 3, color: major ? palette.inkFaint : palette.rule, alpha: edge });
          if (major && li < tickLabels.length) {
            const tl = tickLabels[li++];
            tl.visible = true;
            tl.y = y;
            tl.alpha = edge * 0.85;
            const str = String(v);
            if (tl.text !== str) tl.text = str;
          }
        }
        for (let i = li; i < tickLabels.length; i++) tickLabels[i].visible = false;

        hudG
          .moveTo(TAPE_X - 26, TAPE_MID - 12)
          .lineTo(TAPE_X - 4, TAPE_MID)
          .lineTo(TAPE_X - 26, TAPE_MID + 12)
          .stroke({ width: 4, color: palette.signal, alpha: 0.9 });
        hudG.rect(TAPE_X, 560, 338, 3).fill({ color: palette.rule });

        const pulse = 0.45 + 0.55 * Math.abs(Math.sin(t * 2.4));
        hudG.circle(1470, 603, 8).fill({ color: palette.signal, alpha: pulse });
        hudG.circle(1470, 603, 15).stroke({ width: 3, color: palette.signal, alpha: 0.28 * pulse });

        const altStr = String(Math.round(alt)).padStart(3, '0');
        if (altValue.text !== altStr) altValue.text = altStr;
        const velStr = vel.toFixed(2);
        if (velValue.text !== velStr) velValue.text = velStr;

        const secs = Math.floor(p * 512);
        const clk =
          'T+ ' +
          String(Math.floor(secs / 60)).padStart(2, '0') +
          ':' +
          String(secs % 60).padStart(2, '0');
        if (clockLabel.text !== clk) clockLabel.text = clk;
        clockLabel.alpha = 0.55 + 0.25 * Math.abs(Math.sin(t * 1.2));

        let ei = 0;
        for (let i = 0; i < EVENTS.length; i++) if (p >= EVENTS[i].at) ei = i;
        const ev = EVENTS[ei];
        if (eventLabel.text !== ev.label) eventLabel.text = ev.label;
        const since = settle(clamp01((p - ev.at) / 0.045));
        eventLabel.x = 1496 - 30 * (1 - since);
        eventLabel.alpha = clamp01(since) * (0.8 + 0.2 * Math.sin(t * 3.1));
      },
    };
  },
};
