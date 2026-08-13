/**
 * cold-open — title card / establishing shot.
 *
 * A limb pass. The Earth's edge is a nearly flat bright arc across the lower
 * third, an airglow stack sits on top of it, a seeded star field breathes
 * above, and the ISS tracks left to right a hundred pixels off the horizon
 * with a dotted wake and one quiet annotation. A schematic orbit ellipse
 * traces itself once and then keeps a highlight running around it forever, so
 * the frame is never still even while the beat holds.
 *
 * Everything here is a pure function of `frame.time` and `progress`. No state
 * accumulates between frames and no randomness is drawn after build(), so an
 * offline capture that seeks around produces identical pixels to a live play.
 */

import { clamp01, remap, cubicOut, sineInOut, settle } from '../core/easing.js';

const TAU = Math.PI * 2;

export default {
  id: 'cold-open',

  build(ctx) {
    const { PIXI, palette, width: W, height: H, text, font, mono } = ctx;

    const view = new PIXI.Container();
    // Pivot at frame centre so the slow push-in scales about the horizon
    // centre rather than the top-left corner.
    view.pivot.set(W / 2, H / 2);
    view.position.set(W / 2, H / 2);

    const cx = W / 2;

    // Seeded LCG. Called only during build; update() never touches it.
    let s = 12345;
    const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;

    // ---- geometry ---------------------------------------------------------
    // A real limb from 400 km is far flatter than the cartoon version. The
    // radius is chosen so the arc never dips below y = 820 anywhere a caption
    // could be, even at the widest push-in.
    const LIMB_R = W * 3.646;
    const LIMB_CY = H * 0.6907 + LIMB_R;
    const HALF = W / 2 + 70;

    const arcY = (r, dx) => LIMB_CY - Math.sqrt(Math.max(0, r * r - dx * dx));
    const limbY = (x) => arcY(LIMB_R, x - cx);

    /** Stroke a limb-concentric band as a polyline (no arc primitive needed). */
    const strokeLimb = (g, radius, width, color, alpha) => {
      const steps = 96;
      for (let i = 0; i <= steps; i++) {
        const dx = -HALF + (2 * HALF * i) / steps;
        const y = arcY(radius, dx);
        if (i === 0) g.moveTo(cx + dx, y);
        else g.lineTo(cx + dx, y);
      }
      g.stroke({ width, color, alpha });
    };

    const starLayer = new PIXI.Container();
    const ringLayer = new PIXI.Container();
    const earthLayer = new PIXI.Container();
    const cityLayer = new PIXI.Container();
    const craftLayer = new PIXI.Container();
    view.addChild(starLayer, ringLayer, earthLayer, cityLayer, craftLayer);

    // ---- star field -------------------------------------------------------
    const TINTS = [
      palette.ink, palette.ink, palette.ink, palette.ink,
      palette.ink, palette.cold, palette.cold, palette.lipid, palette.warm,
    ];
    const STAR_SPAN = W + 180;
    const stars = [];
    for (let i = 0; i < 140; i++) {
      const bx = rnd() * STAR_SPAN - 90;
      let by = 26 + Math.pow(rnd(), 1.05) * (H * 0.64);
      // Keep the readout corner clear, with margin for drift and push-in.
      if (by < 150 && bx > W * 0.62) by += 165 + rnd() * 130;

      const mag = Math.pow(rnd(), 2.2);
      const r = 1.3 + mag * 2.5;
      // Atmospheric extinction: stars sink into the airglow near the horizon.
      const ext = clamp01(remap(by, limbY(bx) - 30, limbY(bx) - 300, 0.16, 1));
      const color = TINTS[Math.floor(rnd() * TINTS.length)];

      const g = new PIXI.Graphics();
      if (mag > 0.6) g.circle(0, 0, r * 3.6).fill({ color, alpha: 0.09 });
      g.circle(0, 0, r).fill({ color });
      g.position.set(bx, by);
      starLayer.addChild(g);

      stars.push({
        g, bx, by,
        base: (0.22 + mag * 0.7) * ext,
        rate: 0.22 + rnd() * 1.25,
        phase: rnd() * TAU,
      });
    }

    // ---- orbit ring (schematic; occluded by the planet because it sits in a
    //      lower layer than the Earth body) -----------------------------------
    const RCY = H * 0.548;
    const RRX = W * 0.469;
    const RRY0 = H * 0.234;
    const A0 = Math.PI; // start the trace at the left extreme

    let rryNow = RRY0;
    const ex = (th) => cx + RRX * Math.cos(th);
    const ey = (th) => RCY + rryNow * Math.sin(th);

    const ringBase = new PIXI.Graphics();
    const ringGlint = new PIXI.Graphics();
    const ringHead = new PIXI.Graphics();
    ringHead.circle(0, 0, 13).fill({ color: palette.cold, alpha: 0.16 });
    ringHead.circle(0, 0, 4.5).fill({ color: palette.ink });
    ringLayer.addChild(ringBase, ringGlint, ringHead);

    // ---- Earth ------------------------------------------------------------
    const body = new PIXI.Graphics();
    body.circle(cx, LIMB_CY, LIMB_R).fill({ color: palette.ground });
    strokeLimb(body, LIMB_R - 10, 20, palette.panel, 0.9);
    strokeLimb(body, LIMB_R - 32, 30, palette.panel, 0.45);
    strokeLimb(body, LIMB_R - 66, 42, palette.grid, 0.3);
    earthLayer.addChild(body);

    const HAZE = [
      { r: 5, w: 7, c: palette.warm, a: 0.17, rate: 0.31 },
      { r: 13, w: 11, c: palette.lipid, a: 0.1, rate: 0.24 },
      { r: 24, w: 15, c: palette.cold, a: 0.22, rate: 0.19 },
      { r: 44, w: 24, c: palette.cold, a: 0.13, rate: 0.15 },
      { r: 76, w: 40, c: palette.cold, a: 0.075, rate: 0.11 },
      { r: 126, w: 66, c: palette.cold, a: 0.04, rate: 0.08 },
      { r: 200, w: 118, c: palette.cold, a: 0.02, rate: 0.06 },
    ];
    const hazeBands = HAZE.map((h) => {
      const g = new PIXI.Graphics();
      strokeLimb(g, LIMB_R + h.r, h.w, h.c, 1);
      g.alpha = h.a;
      earthLayer.addChild(g);
      return g;
    });

    const limbLine = new PIXI.Graphics();
    strokeLimb(limbLine, LIMB_R + 1, 4, palette.cold, 0.9);
    earthLayer.addChild(limbLine);

    // ---- city lights drifting under the limb ------------------------------
    const CITY_HALF = W * 0.281; // ±540 px, well clear of the caption band
    const cities = [];
    for (let i = 0; i < 22; i++) {
      const g = new PIXI.Graphics();
      const r = 1.5 + rnd() * 1.5;
      g.circle(0, 0, r).fill({ color: rnd() > 0.35 ? palette.lipid : palette.warm });
      cityLayer.addChild(g);
      cities.push({
        g,
        bx: rnd() * (CITY_HALF * 2) - CITY_HALF,
        off: 5 + rnd() * 28,
        base: 0.1 + rnd() * 0.22,
        rate: 0.5 + rnd() * 1.6,
        phase: rnd() * TAU,
      });
    }

    // ---- ISS wake ---------------------------------------------------------
    const trail = [];
    for (let i = 0; i < 26; i++) {
      const g = new PIXI.Graphics();
      g.circle(0, 0, 2.6 - (i / 26) * 1.4).fill({ color: palette.cold });
      craftLayer.addChild(g);
      trail.push(g);
    }

    // ---- ISS silhouette ---------------------------------------------------
    const iss = new PIXI.Container();
    const issGlow = new PIXI.Graphics();
    const issArrays = new PIXI.Graphics();
    const issBody = new PIXI.Graphics();
    const issNav = new PIXI.Graphics();
    iss.addChild(issGlow, issArrays, issBody, issNav);
    craftLayer.addChild(iss);

    issGlow.circle(0, 0, 46).fill({ color: palette.cold, alpha: 0.05 });
    issGlow.circle(0, 0, 22).fill({ color: palette.cold, alpha: 0.05 });

    for (const side of [-1, 1]) {
      for (let col = 0; col < 2; col++) {
        for (const row of [-1, 1]) {
          const px = side * (32 + col * 27);
          const py = row * 23;
          issArrays
            .rect(px - 11.5, py - 16, 23, 32)
            .fill({ color: palette.panel, alpha: 0.55 })
            .stroke({ width: 4, color: palette.cold, alpha: 0.72 });
        }
      }
    }

    issBody.rect(-60, -2.5, 120, 5).fill({ color: palette.ink, alpha: 0.88 });
    for (const k of [-44, -30, 30, 44]) {
      issBody.rect(k - 1.5, -7, 3, 14).fill({ color: palette.inkDim, alpha: 0.6 });
    }
    issBody.rect(-30, 9, 20, 3.5).fill({ color: palette.inkDim, alpha: 0.5 });
    issBody.rect(10, 9, 20, 3.5).fill({ color: palette.inkDim, alpha: 0.5 });
    issBody.roundRect(-20, -9, 40, 18, 6).fill({ color: palette.ink, alpha: 0.9 });
    issBody.rect(-3, -24, 6, 15).fill({ color: palette.ink, alpha: 0.75 });
    issBody.rect(-3, 9, 6, 13).fill({ color: palette.ink, alpha: 0.6 });
    issNav.circle(0, -2, 3.4).fill({ color: palette.signal });

    // ---- annotation -------------------------------------------------------
    const leader = new PIXI.Graphics();
    const labA = text('ISS', {
      size: 34, weight: '600', color: palette.ink, letterSpacing: 6,
    });
    const labB = text('408 km · 7.66 km s⁻¹', {
      size: 30, mono: true, color: palette.inkDim, letterSpacing: 1,
    });
    labA.anchor.set(0, 1);
    labB.anchor.set(0, 0);
    craftLayer.addChild(leader, labA, labB);

    // ---- motion constants -------------------------------------------------
    const ISS_SPEED = W * 0.0302;
    const ISS_SPAN = W + 440;
    const ISS_ALT = H * 0.098;
    const issX = (t) =>
      (((W * 0.13 + 220 + ISS_SPEED * t) % ISS_SPAN) + ISS_SPAN) % ISS_SPAN - 220;
    const issY = (x, t) => limbY(x) - ISS_ALT + Math.sin(t * 0.47) * 4.5;

    return {
      view,

      update(frame, weight, progress) {
        const t = frame.time;
        const p = clamp01(progress);
        const bloom = frame.values?.bloom ?? 0.15;

        // Slow, continuous push-in. Never enough to reach a caption.
        view.scale.set(
          1 + 0.02 * sineInOut(p) + 0.0035 * Math.sin(t * 0.29)
        );

        // ---- stars ---------------------------------------------------------
        const drift = t * 3.2;
        for (let i = 0; i < stars.length; i++) {
          const st = stars[i];
          let x = st.bx - drift + 90;
          x = ((x % STAR_SPAN) + STAR_SPAN) % STAR_SPAN - 90;
          st.g.x = x;
          st.g.y = st.by + Math.sin(t * 0.11 + st.phase) * 1.4;
          const tw = 0.6 + 0.4 * Math.sin(t * st.rate + st.phase);
          // The drift wraps stars across the whole span, so the build-time
          // exclusion cannot hold the readout corner on its own — a star
          // seeded low-left arrives top-right a wrap later. Re-mask against
          // the corner every frame. Both ramps are soft, and a star re-enters
          // from the right already faded out, so nothing pops.
          const corner =
            clamp01(remap(x, 1355, 1435, 0, 1)) *
            clamp01(remap(st.g.y, 205, 145, 0, 1));
          st.g.alpha = st.base * tw * (1 - corner);
          st.g.scale.set(0.9 + 0.16 * tw);
        }

        // ---- orbit ring ----------------------------------------------------
        rryNow = RRY0 * (1 + 0.055 * Math.sin(t * 0.19));
        const traced = cubicOut(clamp01(remap(p, 0.05, 0.58, 0, 1)));
        const total = TAU * traced;

        ringBase.clear();
        if (total > 0.002) {
          const CH = 30;
          const sub = 8;
          for (let i = 0; i < CH; i++) {
            const th0 = A0 + (i / CH) * total;
            const th1 = A0 + ((i + 1) / CH) * total;
            const near = 0.5 + 0.5 * Math.sin((th0 + th1) * 0.5);
            const a =
              (0.12 + 0.3 * near) * (0.86 + 0.14 * Math.sin(t * 0.7 + i * 0.21));
            ringBase.moveTo(ex(th0), ey(th0));
            for (let k = 1; k <= sub; k++) {
              const th = th0 + ((th1 - th0) * k) / sub;
              ringBase.lineTo(ex(th), ey(th));
            }
            ringBase.stroke({ width: 3, color: palette.cold, alpha: a });
          }
        }

        const headTh = A0 + total;
        ringHead.position.set(ex(headTh), ey(headTh));
        const headPulse = 0.72 + 0.28 * Math.sin(t * 3.1);
        ringHead.alpha =
          clamp01(remap(traced, 0, 0.05, 0, 1)) *
          (1 - clamp01(remap(traced, 0.9, 1, 0, 1))) *
          headPulse;
        ringHead.scale.set(0.92 + 0.2 * headPulse);

        // A highlight keeps lapping the ring once the trace lands, so the
        // scene still breathes at progress 1.0.
        ringGlint.clear();
        const gA = clamp01(remap(traced, 0.9, 1, 0, 1));
        if (gA > 0.01) {
          const gTh = A0 + TAU * ((t * 0.075) % 1);
          const SEG = 12;
          const SPAN = 0.55;
          for (let i = 0; i < SEG; i++) {
            const th0 = gTh - SPAN * (1 - i / SEG);
            const th1 = gTh - SPAN * (1 - (i + 1) / SEG);
            const near = 0.5 + 0.5 * Math.sin((th0 + th1) * 0.5);
            ringGlint.moveTo(ex(th0), ey(th0)).lineTo(ex(th1), ey(th1));
            ringGlint.stroke({
              width: 3.5,
              color: palette.ink,
              alpha: gA * Math.pow((i + 1) / SEG, 2.2) * (0.28 + 0.5 * near),
            });
          }
          ringGlint.circle(ex(gTh), ey(gTh), 3.4).fill({
            color: palette.ink,
            alpha: gA * 0.9,
          });
        }

        // ---- airglow -------------------------------------------------------
        const glow = 0.9 + 0.25 * bloom;
        for (let i = 0; i < hazeBands.length; i++) {
          const h = HAZE[i];
          hazeBands[i].alpha =
            h.a * glow * (0.8 + 0.2 * Math.sin(t * h.rate + i * 0.9));
          hazeBands[i].y = Math.sin(t * 0.13 + i * 0.7) * 1.6;
        }
        limbLine.alpha = 0.82 + 0.18 * Math.sin(t * 0.23);

        // ---- city lights ---------------------------------------------------
        for (let i = 0; i < cities.length; i++) {
          const c = cities[i];
          let d = c.bx - t * 7.5 + CITY_HALF;
          d = ((d % (CITY_HALF * 2)) + CITY_HALF * 2) % (CITY_HALF * 2) - CITY_HALF;
          const x = cx + d;
          c.g.x = x;
          c.g.y = limbY(x) + c.off;
          c.g.alpha =
            c.base *
            (0.55 + 0.45 * Math.sin(t * c.rate + c.phase)) *
            clamp01(remap(Math.abs(d), CITY_HALF, CITY_HALF * 0.78, 0, 1));
        }

        // ---- station -------------------------------------------------------
        const ix = issX(t);
        const iy = issY(ix, t);
        iss.position.set(ix, iy);
        iss.rotation = (ix - cx) / LIMB_R + Math.sin(t * 0.33) * 0.028;
        iss.scale.set(0.82 + 0.012 * Math.sin(t * 0.61));
        issArrays.alpha = 0.72 + 0.28 * Math.sin(t * 0.42 + 1.1);
        const nav = 0.5 + 0.5 * Math.sin(t * 2.4);
        issNav.alpha = 0.4 + 0.6 * nav;
        issNav.scale.set(0.85 + 0.3 * nav);
        issGlow.alpha = clamp01(0.7 + 0.22 * Math.sin(t * 0.55) + 0.3 * bloom);

        for (let i = 0; i < trail.length; i++) {
          const tx = ix - (i + 1) * 21;
          trail[i].position.set(tx, issY(tx, t));
          const f = 1 - (i + 1) / (trail.length + 1);
          trail[i].alpha =
            0.32 * Math.pow(f, 1.9) * (0.7 + 0.3 * Math.sin(t * 1.4 - i * 0.45));
        }

        // ---- annotation ----------------------------------------------------
        const an = clamp01(remap(p, 0.22, 0.44, 0, 1));
        const sl = settle(clamp01(remap(p, 0.24, 0.62, 0, 1)));
        const lx = ix + 58;
        const ly = iy - 88;

        leader.clear();
        if (an > 0.01) {
          leader
            .moveTo(ix + 16, iy - 38)
            .lineTo(lx, ly)
            .lineTo(lx + 340 * sl, ly);
          leader.stroke({ width: 3, color: palette.inkDim, alpha: an * 0.7 });
        }
        labA.position.set(lx - 16 * (1 - sl), ly - 12);
        labB.position.set(lx - 10 * (1 - sl), ly + 12);
        labA.alpha = an;
        labB.alpha = an * 0.8;
      },
    };
  },
};
