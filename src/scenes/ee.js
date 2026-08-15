/**
 * 1:12 - "How much medicine is still inside the shell. That's the number."
 *
 * In the first cut this was a separate scene called `assay` that drew fresh
 * tubes and a fresh diagram, which meant the audience had to re-anchor at the
 * exact moment the one quantity in the whole pitch was being defined.
 *
 * Here the number is built out of what is already on screen: the particles the
 * camera has been sitting inside since 0:40 sort themselves into the ones that
 * still hold their cargo and the ones that have spilled it, and the ratio of
 * those two piles *is* encapsulation efficiency. No new picture.
 */
import { drawParticle, rng, span, lerp } from './kit.js';

export default {
  id: 'ee',

  build(ctx) {
    const { PIXI, palette, layout, text } = ctx;
    const view = new PIXI.Container();

    const sq = layout.square();
    const N = 24; // 24 particles: a clean 18/6 split reads as ~75% by eye
    const INTACT = 18;

    const rand = rng(303);
    const seeds = [];
    for (let i = 0; i < N; i++) {
      seeds.push({ ph: rand() * Math.PI * 2, sp: 0.5 + rand() * 0.7 });
    }

    // Two columns inside the readable region: intact on the left, spilled on
    // the right. Positions are derived from `safe`, so the piles cannot drift
    // under the rail no matter how the frame is letterboxed.
    const colGap = layout.safe.w * 0.34;
    const leftX = layout.cx - colGap * 0.62;
    const rightX = layout.cx + colGap * 0.62;
    const topY = layout.safe.y + layout.safe.h * 0.2;

    const gCloud = new PIXI.Graphics();
    const gRule = new PIXI.Graphics();
    view.addChild(gCloud, gRule);

    const mkCap = (s, x) => {
      const el = text(s, {
        size: Math.round(layout.H * 0.016),
        color: palette.inkFaint,
        mono: true,
        letterSpacing: 2.2,
      });
      el.anchor.set(0.5, 1);
      el.position.set(x, topY - layout.H * 0.05);
      view.addChild(el);
      return el;
    };
    const capL = mkCap('STILL SEALED', leftX);
    const capR = mkCap('LEAKED', rightX);

    const eqn = text('EE = (TOTAL − FREE) / TOTAL', {
      size: Math.round(layout.H * 0.021),
      color: palette.inkDim,
      mono: true,
      letterSpacing: 1.4,
    });
    eqn.anchor.set(0.5, 0);
    eqn.position.set(layout.cx, layout.safe.y + layout.safe.h * 0.74);

    const value = text('', {
      size: Math.round(layout.H * 0.1),
      weight: '700',
      mono: true,
      color: palette.signal,
    });
    value.anchor.set(0.5, 0);
    value.position.set(layout.cx, layout.safe.y + layout.safe.h * 0.79);

    view.addChild(eqn, value);

    return {
      view,

      update(frame, weight, p) {
        const t = frame.time;
        const sort = span(p, 0.05, 0.55); // particles migrate to their pile
        const r = sq.s * 0.036;

        gCloud.clear();
        for (let i = 0; i < N; i++) {
          const intact = i < INTACT;
          const s = seeds[i];

          // Start scattered where `leak` left them, end in two tidy columns.
          const a0 = (i / N) * Math.PI * 2;
          const sx = layout.cx + Math.cos(a0) * sq.s * 0.26;
          const sy = layout.cy - sq.s * 0.04 + Math.sin(a0) * sq.s * 0.2;

          const idx = intact ? i : i - INTACT;
          const cols = intact ? 6 : 3;
          const gx = (intact ? leftX : rightX) + ((idx % cols) - (cols - 1) / 2) * r * 2.9;
          const gy = topY + Math.floor(idx / cols) * r * 2.9;

          const x = lerp(sx, gx, sort) + Math.sin(t * s.sp + s.ph) * 2.2;
          const y = lerp(sy, gy, sort) + Math.cos(t * s.sp * 0.8 + s.ph) * 2.2;

          drawParticle(gCloud, x, y, r, palette, t + s.ph, {
            crack: intact ? 0 : 0.75,
            detail: 0.42,
            alpha: 0.95,
          });

          // Spilled cargo drifts away from the broken ones.
          if (!intact) {
            const d = r * (1.5 + Math.sin(t * 0.6 + s.ph) * 0.25);
            gCloud
              .moveTo(x + r * 0.7, y - r * 0.5)
              .lineTo(x + d, y - d * 0.55)
              .stroke({ width: 2, color: palette.signal, alpha: 0.5 });
          }
        }

        // Divider between the two piles, drawn only once they have separated.
        gRule.clear();
        if (sort > 0.4) {
          const a = span(sort, 0.4, 0.9) * 0.45;
          gRule
            .moveTo(layout.cx, topY - layout.H * 0.035)
            .lineTo(layout.cx, layout.safe.y + layout.safe.h * 0.68)
            .stroke({ width: 1, color: palette.rule, alpha: a });
        }

        capL.alpha = span(p, 0.18, 0.34) * 0.9;
        capR.alpha = span(p, 0.22, 0.38) * 0.9;
        eqn.alpha = span(p, 0.4, 0.55) * 0.9;

        // The figure counts up to the ratio actually on screen, so the number
        // and the picture can never disagree.
        const show = span(p, 0.38, 0.56);
        const pct = (INTACT / N) * 100 * show;
        value.text = `${pct.toFixed(1)} %`;
        value.alpha = show;

        view.alpha = weight;
      },
    };
  },
};
