/**
 * 0:00 - "This is an mRNA vaccine."
 *
 * The film opens on the one object in this entire story that a non-scientist
 * already recognises. No labels, no gauges, no HUD: if the first frame needs
 * explaining, the next three minutes have already failed.
 *
 * `vial`, `chain` and `descend` all place the vial through VIAL_BOX so the
 * cross-dissolves between them are invisible. The audience should believe they
 * are watching one continuous push-in, because they are.
 */
import { drawVial, rng, span, winF } from './kit.js';

/**
 * The shared vial rect, derived from the layout square so every scene in the
 * opening arc agrees on where the glass is. Slightly taller than wide and
 * lifted off centre, because a vial photographed head-on reads as a diagram
 * and a vial seen slightly from above reads as an object on a bench.
 */
export function VIAL_BOX(layout) {
  // The subject is allowed to use the full height between the top margin and
  // the title lane, not just the `safe` rect: `safe` governs where text and
  // numbers may go, while the hero object may bleed toward the edges. Sizing
  // the vial to `safe` made it read as a small diagram floating in a wide
  // frame, which is death on a projector at the back of a room.
  const top = layout.pad * 1.1;
  const bottom = layout.titleBand.y - layout.pad * 0.6;
  const h = (bottom - top) * 0.94;
  const w = h * 0.44;
  return {
    x: layout.cx - w / 2,
    y: top + (bottom - top - h) / 2,
    w,
    h,
  };
}

export default {
  id: 'vial',

  build(ctx) {
    const { PIXI, palette, layout } = ctx;
    const view = new PIXI.Container();

    const box = VIAL_BOX(layout);

    // Motes suspended in the liquid. They are the only hint that there is
    // anything inside worth looking at, and they become the particle field
    // the camera flies into at 0:30.
    const MOTES = 46;
    const rand = rng(23);
    const motes = [];
    for (let i = 0; i < MOTES; i++) {
      motes.push({
        x: rand(),
        y: rand(),
        r: 0.9 + rand() * 1.9,
        sp: 0.12 + rand() * 0.4,
        ph: rand() * Math.PI * 2,
      });
    }

    const gGlow = new PIXI.Graphics();
    const gVial = new PIXI.Graphics();
    const gMotes = new PIXI.Graphics();
    const gSpec = new PIXI.Graphics();
    view.addChild(gGlow, gVial, gMotes, gSpec);

    // The whole subject sits in one container so the push-in is a single
    // transform rather than every primitive re-deriving its own scale.
    const rig = new PIXI.Container();
    rig.addChild(gGlow, gVial, gMotes, gSpec);
    view.removeChildren();
    view.addChild(rig);
    rig.pivot.set(box.x + box.w / 2, box.y + box.h / 2);
    rig.position.set(box.x + box.w / 2, box.y + box.h / 2);

    return {
      view,

      update(frame, weight, p) {
        const t = frame.time;

        // Slow, continuous push. Never stops, so the cut into `chain` at 0:14
        // does not land on a static frame.
        const push = 1 + span(p, 0, 1) * 0.16;
        rig.scale.set(push);
        rig.position.y = box.y + box.h / 2 + Math.sin(t * 0.35) * 3;

        gVial.clear();
        drawVial(gVial, box, palette, { fill: 0.62, glow: 0.05 });

        gGlow.clear();
        const bodyTop = box.y + box.h * 0.18;
        for (let i = 6; i > 0; i--) {
          gGlow
            .roundRect(
              box.x - i * 5,
              bodyTop - i * 5,
              box.w + i * 10,
              box.h * 0.82 + i * 10,
              box.w * 0.12
            )
            .stroke({ color: palette.cold, alpha: 0.045 / i, width: 6 });
        }

        gMotes.clear();
        const lx = box.x + 6;
        const lw = box.w - 12;
        const lTop = box.y + box.h * 0.42;
        const lh = box.h * 0.5;
        for (const m of motes) {
          const y = lTop + ((m.y + t * m.sp * 0.05) % 1) * lh;
          const x = lx + (m.x + Math.sin(t * 0.4 + m.ph) * 0.02) * lw;
          gMotes.circle(x, y, m.r).fill({
            color: palette.signal,
            alpha: 0.22 + 0.2 * Math.sin(t * 1.1 + m.ph),
          });
        }

        // Specular sweep, once per beat, so the glass reads as glass.
        gSpec.clear();
        const sweep = winF(p, 0.18, 0.62, 0.35);
        if (sweep > 0.01) {
          const sx = box.x + box.w * (0.1 + span(p, 0.18, 0.62) * 0.75);
          gSpec
            .roundRect(sx, bodyTop + box.h * 0.04, box.w * 0.07, box.h * 0.7, box.w * 0.04)
            .fill({ color: palette.ink, alpha: 0.1 * sweep });
        }

        view.alpha = weight;
      },
    };
  },
};
