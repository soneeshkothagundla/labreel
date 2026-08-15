/**
 * 2:06 - "Sixteen tubes. Two shell formulations. Half fly, half stay behind."
 *
 * The shot the whole film is built to earn.
 *
 * Both ends of the zoom are on screen together: the station at 408 km, and
 * inset within it the same tube the camera flew out of, with the same particle
 * still visible inside at 80 nm. A hairline connects them, and the two scale
 * labels sit at either end of it.
 *
 * This only reads because the audience travelled between those two numbers in
 * the previous ninety seconds. Shown cold at the top of a deck it would be a
 * diagram; shown here it is a payoff.
 */
import { drawLimb, drawTube, drawParticle, starfield, span, winF } from './kit.js';

export default {
  id: 'merge',

  build(ctx) {
    const { PIXI, palette, layout, text } = ctx;
    const view = new PIXI.Container();

    const stars = starfield(PIXI, { w: layout.W, h: layout.H, count: 260, seed: 12 });
    const gLimb = new PIXI.Graphics();
    const gStation = new PIXI.Graphics();
    const gLink = new PIXI.Graphics();
    const gInset = new PIXI.Graphics();
    view.addChild(stars, gLimb, gStation, gLink, gInset);

    // Station upper-left of the readable region, inset lower-right. The inset
    // is kept clear of the scale rail by construction rather than by eye.
    const stCx = layout.safe.x + layout.safe.w * 0.24;
    const stCy = layout.safe.y + layout.safe.h * 0.26;

    const inW = layout.safe.w * 0.34;
    const inH = layout.safe.h * 0.5;
    const inX = layout.safe.x + layout.safe.w - inW;
    const inY = layout.safe.y + layout.safe.h - inH;

    const mkLabel = (s, size, color, mono = true) =>
      text(s, {
        size: Math.round(layout.H * size),
        color,
        mono,
        letterSpacing: mono ? 1.6 : 0,
      });

    const lblOrbit = mkLabel('408 km', 0.019, palette.cold);
    lblOrbit.anchor.set(0.5, 0);
    lblOrbit.position.set(stCx, stCy + layout.safe.h * 0.13);

    const lblNano = mkLabel('80 nm', 0.019, palette.cold);
    lblNano.anchor.set(0.5, 0);
    lblNano.position.set(inX + inW / 2, inY + inH + layout.H * 0.008);

    const lblSame = mkLabel('THE SAME TUBE', 0.013, palette.inkFaint);
    lblSame.anchor.set(0.5, 1);
    lblSame.position.set(inX + inW / 2, inY - layout.H * 0.012);

    const arms = mkLabel('8 FLIGHT   ·   8 GROUND TWIN', 0.015, palette.inkDim);
    arms.anchor.set(0, 1);
    arms.position.set(layout.safe.x, layout.safe.y + layout.safe.h * 0.86);

    const armsCap = mkLabel('MATCHED ARMS', 0.012, palette.inkFaint);
    armsCap.anchor.set(0, 1);
    armsCap.position.set(layout.safe.x, arms.position.y - layout.H * 0.028);

    view.addChild(lblOrbit, lblNano, lblSame, arms, armsCap);

    return {
      view,

      update(frame, weight, p) {
        const t = frame.time;

        gLimb.clear();
        drawLimb(
          gLimb,
          {
            x: -layout.W * 0.15,
            y: layout.safe.y + layout.safe.h * 0.72,
            w: layout.W * 1.3,
            h: layout.safe.h * 0.6,
          },
          palette,
          { lift: 0.82, glow: 0.55 }
        );
        stars.alpha = 0.5;

        /* -- station ------------------------------------------------------ */
        gStation.clear();
        const s = layout.safe.w * 0.05;
        const cy = stCy + Math.sin(t * 0.35) * 3;
        gStation
          .rect(stCx - s * 2.6, cy - s * 0.09, s * 5.2, s * 0.18)
          .fill({ color: palette.inkDim, alpha: 0.95 });
        gStation
          .roundRect(stCx - s * 0.72, cy - s * 0.3, s * 1.44, s * 0.6, s * 0.28)
          .fill({ color: palette.ink, alpha: 0.9 });
        for (const sx of [-1, 1]) {
          for (const sy of [-1, 1]) {
            gStation
              .rect(stCx + sx * s * 1.5 - s * 0.62, cy + sy * s * 0.34, s * 1.24, s * 0.52)
              .fill({ color: palette.cold, alpha: 0.34 })
              .stroke({ width: 1, color: palette.cold, alpha: 0.6 });
          }
        }

        /* -- inset -------------------------------------------------------- */
        const open = span(p, 0.12, 0.42);
        gInset.clear();
        gLink.clear();

        if (open > 0.01) {
          const h = inH * open;
          const y = inY + inH - h;

          gInset.rect(inX, y, inW, h).fill({ color: palette.void, alpha: 0.82 });
          gInset.rect(inX, y, inW, h).stroke({
            width: 1,
            color: palette.rule,
            alpha: 0.9 * open,
          });

          // corner ticks, so the inset reads as an instrument crop rather than
          // a floating card
          const tk = Math.min(inW, h) * 0.09;
          for (const [cx0, cy0, dx, dy] of [
            [inX, y, 1, 1],
            [inX + inW, y, -1, 1],
            [inX, y + h, 1, -1],
            [inX + inW, y + h, -1, -1],
          ]) {
            gInset
              .moveTo(cx0 + dx * tk, cy0)
              .lineTo(cx0, cy0)
              .lineTo(cx0, cy0 + dy * tk)
              .stroke({ width: 2, color: palette.cold, alpha: 0.7 * open });
          }

          if (open > 0.5) {
            const a = span(open, 0.5, 1);
            // the tube, at bench scale
            const tw = inW * 0.19;
            const th = h * 0.62;
            drawTube(
              gInset,
              { x: inX + inW * 0.16, y: y + h * 0.19, w: tw, h: th },
              palette,
              { level: 0.62, cap: palette.signal, liquid: palette.cold }
            );

            // and inside it, the particle, at 80 nm
            const pr = inW * 0.115;
            const pcx = inX + inW * 0.66;
            const pcy = y + h * 0.5;
            drawParticle(gInset, pcx, pcy, pr, palette, t, {
              crack: 0.2,
              detail: 0.9,
              alpha: a,
            });

            // magnification cone from tube to particle
            gInset
              .moveTo(inX + inW * 0.16 + tw, y + h * 0.36)
              .lineTo(pcx - pr, pcy - pr * 0.8)
              .moveTo(inX + inW * 0.16 + tw, y + h * 0.56)
              .lineTo(pcx - pr, pcy + pr * 0.8)
              .stroke({ width: 1, color: palette.rule, alpha: 0.55 * a });
          }

          // hairline tying the station to the inset: the literal claim that
          // these two things are the same object at two scales
          const lk = span(p, 0.34, 0.56);
          if (lk > 0.01) {
            gLink
              .moveTo(stCx + s * 2.7, cy + s * 0.2)
              .lineTo(inX + inW * 0.5 - (inW * 0.5) * (1 - lk), y - layout.H * 0.045)
              .stroke({ width: 1, color: palette.cold, alpha: 0.4 * lk });
          }
        }

        lblOrbit.alpha = span(p, 0.06, 0.2) * 0.95;
        lblNano.alpha = span(p, 0.46, 0.6) * 0.95;
        lblSame.alpha = span(p, 0.5, 0.66) * 0.85;
        armsCap.alpha = span(p, 0.6, 0.74) * 0.85;
        arms.alpha = span(p, 0.62, 0.78);

        // a slow pulse tying the two ends together
        const pulse = winF(p, 0.7, 1, 0.4);
        lblOrbit.style.fill = palette.cold;
        lblNano.style.fill = pulse > 0.5 ? palette.signal : palette.cold;

        view.alpha = weight;
      },
    };
  },
};
