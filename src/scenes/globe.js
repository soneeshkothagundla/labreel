/**
 * 2:50 - "Every mRNA therapy being built right now inherits this same fragile
 * shell, and there is no standard for how much cold chain abuse it can take."
 *
 * The motif closes here. The particle drawn at full frame at 0:40 is now a dot
 * riding each cold-chain route, which is the whole argument in one image: the
 * thing the camera spent ninety seconds inside is on every one of those lines.
 *
 * This replaces the old `why` scene, which was a bulleted list and the single
 * moment in the reel that looked like a slide deck.
 */
import { drawParticle, starfield, rng, span } from './kit.js';

export default {
  id: 'globe',

  build(ctx) {
    const { PIXI, palette, layout } = ctx;
    const view = new PIXI.Container();

    const stars = starfield(PIXI, { w: layout.W, h: layout.H, count: 280, seed: 31 });
    const gGlobe = new PIXI.Graphics();
    const gRoutes = new PIXI.Graphics();
    const gPods = new PIXI.Graphics();
    view.addChild(stars, gGlobe, gRoutes, gPods);

    const R = Math.min(layout.safe.w, layout.safe.h) * 0.44;
    const cx = layout.cx;
    const cy = layout.safe.y + layout.safe.h * 0.54;

    // Routes as great-circle-ish arcs across the disc. Seeded once.
    const rand = rng(64);
    const routes = [];
    for (let i = 0; i < 9; i++) {
      const a0 = rand() * Math.PI * 2;
      const a1 = a0 + (0.6 + rand() * 1.5) * (rand() > 0.5 ? 1 : -1);
      routes.push({ a0, a1, lift: 0.24 + rand() * 0.4, ph: rand(), sp: 0.1 + rand() * 0.12 });
    }

    const arcPoint = (r, f) => {
      const a = r.a0 + (r.a1 - r.a0) * f;
      const bulge = Math.sin(f * Math.PI) * r.lift;
      const rr = R * (0.82 + bulge * 0.5);
      return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.58];
    };

    return {
      view,

      update(frame, weight, p) {
        const t = frame.time;
        const grow = span(p, 0, 0.45);

        gGlobe.clear();
        gGlobe.ellipse(cx, cy, R, R * 0.58).fill({ color: 0x071219, alpha: 0.95 });
        gGlobe.ellipse(cx, cy, R, R * 0.58).stroke({
          width: 2,
          color: palette.cold,
          alpha: 0.55,
        });
        for (let i = 1; i <= 4; i++) {
          gGlobe.ellipse(cx, cy, R + i * 6, R * 0.58 + i * 4).stroke({
            width: 2,
            color: palette.cold,
            alpha: 0.09 / i,
          });
        }
        // graticule
        for (let i = 1; i <= 3; i++) {
          const f = i / 4;
          gGlobe.ellipse(cx, cy, R, R * 0.58 * (1 - f * 1.4) || 1).stroke({
            width: 1,
            color: palette.cold,
            alpha: 0.14,
          });
        }

        gRoutes.clear();
        gPods.clear();
        routes.forEach((r, i) => {
          const on = span(grow, i / routes.length * 0.6, i / routes.length * 0.6 + 0.4);
          if (on <= 0.02) return;
          let first = true;
          for (let s = 0; s <= 28; s++) {
            const f = (s / 28) * on;
            const [x, y] = arcPoint(r, f);
            if (first) {
              gRoutes.moveTo(x, y);
              first = false;
            } else gRoutes.lineTo(x, y);
          }
          gRoutes.stroke({ width: 1.4, color: palette.signal, alpha: 0.32 * on });

          // the particle motif riding the route
          const f = ((t * r.sp + r.ph) % 1) * on;
          const [px, py] = arcPoint(r, f);
          drawParticle(gPods, px, py, layout.H * 0.011, palette, t, {
            crack: 0,
            detail: 0.35,
            alpha: 0.9 * on,
          });
        });

        stars.alpha = 0.4;
        view.alpha = weight;
      },
    };
  },
};
