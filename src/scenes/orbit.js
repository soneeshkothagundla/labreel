/**
 * 1:56 - "Orbit isn't the destination. It's the clean room."
 *
 * The one place the reel is allowed to move fast. Everything before this has
 * been a slow push through liquid; this is a climb, and the speed is what
 * makes 408 km feel like a distance rather than a caption.
 */
import { drawLimb, starfield, span } from './kit.js';

export default {
  id: 'orbit',

  build(ctx) {
    const { PIXI, palette, layout } = ctx;
    const view = new PIXI.Container();

    const stars = starfield(PIXI, { w: layout.W, h: layout.H, count: 300, seed: 4 });
    const gLimb = new PIXI.Graphics();
    const gStation = new PIXI.Graphics();
    const gTrail = new PIXI.Graphics();
    view.addChild(stars, gLimb, gTrail, gStation);

    const limbBox = {
      x: -layout.W * 0.1,
      y: layout.safe.y + layout.safe.h * 0.42,
      w: layout.W * 1.2,
      h: layout.safe.h * 0.7,
    };

    return {
      view,

      update(frame, weight, p) {
        const t = frame.time;
        const climb = span(p, 0, 0.75);

        // The limb drops away as altitude increases.
        gLimb.clear();
        drawLimb(
          gLimb,
          { ...limbBox, y: limbBox.y + climb * layout.safe.h * 0.3 },
          palette,
          { lift: 0.7, glow: 0.7 + climb * 0.3 }
        );

        stars.alpha = 0.35 + climb * 0.55;
        stars.position.y = -climb * 26;

        /* -- station ------------------------------------------------------ */
        // A silhouette, not a model. At this size a detailed ISS reads as
        // clutter, and the beat is about altitude rather than hardware.
        gStation.clear();
        const arrive = span(p, 0.3, 0.85);
        if (arrive > 0.01) {
          const cx = layout.cx + layout.safe.w * 0.16;
          const cy = layout.safe.y + layout.safe.h * 0.26 + Math.sin(t * 0.4) * 4;
          const s = layout.safe.w * 0.052 * arrive;

          // truss
          gStation
            .rect(cx - s * 2.6, cy - s * 0.09, s * 5.2, s * 0.18)
            .fill({ color: palette.inkDim, alpha: 0.95 });
          // modules
          gStation
            .roundRect(cx - s * 0.72, cy - s * 0.3, s * 1.44, s * 0.6, s * 0.28)
            .fill({ color: palette.ink, alpha: 0.9 });
          // arrays
          for (const sx of [-1, 1]) {
            for (const sy of [-1, 1]) {
              gStation
                .rect(cx + sx * s * 1.5 - s * 0.62, cy + sy * s * 0.34, s * 1.24, s * 0.52)
                .fill({ color: palette.cold, alpha: 0.34 })
                .stroke({ width: 1, color: palette.cold, alpha: 0.6 });
            }
          }
          gStation.alpha = arrive;

          // ground track
          gTrail.clear();
          gTrail
            .moveTo(cx - s * 9, cy + s * 1.1)
            .lineTo(cx - s * 3.2, cy + s * 0.3)
            .stroke({ width: 1, color: palette.signal, alpha: 0.28 * arrive });
        }

        view.alpha = weight;
      },
    };
  },
};
