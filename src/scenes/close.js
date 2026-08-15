/**
 * 2:58 - "Medicine has to survive the trip. We're the people who find out
 * whether it does."
 *
 * Four seconds. The scale rail fades out here (see the `railFade` track), so
 * the last thing on screen is the limb, the mark, and the line, with nothing
 * else competing. Then the reel loops straight back to the vial, which is the
 * argument restarting rather than a film ending.
 */
import { drawLimb, starfield, span } from './kit.js';

export default {
  id: 'close',

  build(ctx) {
    const { PIXI, palette, layout, text } = ctx;
    const view = new PIXI.Container();

    const stars = starfield(PIXI, { w: layout.W, h: layout.H, count: 320, seed: 88 });
    const gLimb = new PIXI.Graphics();
    const gRule = new PIXI.Graphics();
    view.addChild(stars, gLimb, gRule);

    const url = text('capsulelabs.space', {
      size: Math.round(layout.H * 0.024),
      color: palette.signal,
      mono: true,
      letterSpacing: 3,
    });
    url.anchor.set(0.5, 0);
    url.position.set(layout.cx, layout.safe.y + layout.safe.h * 0.56);
    view.addChild(url);

    return {
      view,

      update(frame, weight, p) {
        gLimb.clear();
        drawLimb(
          gLimb,
          {
            x: -layout.W * 0.15,
            y: layout.safe.y + layout.safe.h * 0.66,
            w: layout.W * 1.3,
            h: layout.safe.h * 0.7,
          },
          palette,
          { lift: 0.86, glow: 0.9 }
        );

        gRule.clear();
        const w = layout.safe.w * 0.22 * span(p, 0.1, 0.6);
        gRule
          .moveTo(layout.cx - w / 2, layout.safe.y + layout.safe.h * 0.5)
          .lineTo(layout.cx + w / 2, layout.safe.y + layout.safe.h * 0.5)
          .stroke({ width: 1, color: palette.signal, alpha: 0.6 });

        url.alpha = span(p, 0.25, 0.6);
        stars.alpha = 0.55;
        view.alpha = weight;
      },
    };
  },
};
