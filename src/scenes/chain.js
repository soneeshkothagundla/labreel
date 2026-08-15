/**
 * 0:14 - "It had to stay colder than the South Pole. Break that chain and the
 * dose is dead. It still looks perfectly fine."
 *
 * The vial does not change. That is the entire point of the beat, and it is
 * why the frost grows on the *outside* of the glass while the liquid inside
 * stays exactly as it looked at 0:00: a ruined dose is visually identical to a
 * good one, which is the reason this company exists.
 *
 * The temperature figure is the only number on screen, and it lives in the
 * layout's readable region rather than wherever it happened to fit.
 */
import { drawVial, rng, span } from './kit.js';
import { VIAL_BOX } from './vial.js';

export default {
  id: 'chain',

  build(ctx) {
    const { PIXI, palette, layout, text } = ctx;
    const view = new PIXI.Container();
    const box = VIAL_BOX(layout);

    const gGlow = new PIXI.Graphics();
    const gVial = new PIXI.Graphics();
    const gFrost = new PIXI.Graphics();
    view.addChild(gGlow, gVial, gFrost);

    // Frost crystals, seeded once. They grow by revealing more of a fixed set
    // rather than by being regenerated, so the capture stays frame-exact.
    const rand = rng(91);
    const crystals = [];
    for (let i = 0; i < 90; i++) {
      crystals.push({
        u: rand(),
        v: rand(),
        a: rand() * Math.PI * 2,
        len: 6 + rand() * 16,
        arms: 3 + Math.floor(rand() * 3),
        born: rand() * 0.7,
      });
    }

    // Temperature readout. Anchored to the safe rect's left edge at the
    // vertical centre of the subject, which keeps it clear of both the title
    // lane and the scale rail no matter what the vial does.
    const tempVal = text('0', {
      size: Math.round(layout.H * 0.072),
      weight: '700',
      mono: true,
    });
    tempVal.anchor.set(0, 0.5);
    tempVal.position.set(layout.safe.x, layout.cy - layout.H * 0.03);

    const tempCap = text('CORE TEMPERATURE', {
      size: Math.round(layout.H * 0.014),
      color: palette.inkFaint,
      mono: true,
      letterSpacing: 2.2,
    });
    tempCap.anchor.set(0, 1);
    tempCap.position.set(layout.safe.x, tempVal.position.y - layout.H * 0.05);

    const tempNote = text('', {
      size: Math.round(layout.H * 0.018),
      color: palette.inkDim,
    });
    tempNote.anchor.set(0, 0);
    tempNote.position.set(layout.safe.x, tempVal.position.y + layout.H * 0.042);

    view.addChild(tempCap, tempVal, tempNote);

    return {
      view,

      update(frame, weight, p) {
        const t = frame.time;

        gVial.clear();
        drawVial(gVial, box, palette, { fill: 0.62, glow: 0 });

        // Cold halo replaces the warm glow from the previous beat.
        gGlow.clear();
        const bodyTop = box.y + box.h * 0.18;
        const cold = span(p, 0.05, 0.5);
        for (let i = 6; i > 0; i--) {
          gGlow
            .roundRect(
              box.x - i * 5,
              bodyTop - i * 5,
              box.w + i * 10,
              box.h * 0.82 + i * 10,
              box.w * 0.12
            )
            .stroke({ color: palette.cold, alpha: (0.05 + cold * 0.06) / i, width: 6 });
        }

        // Frost climbs from the base.
        gFrost.clear();
        const grow = span(p, 0.08, 0.72);
        for (const c of crystals) {
          if (grow < c.born) continue;
          const life = span(grow, c.born, Math.min(1, c.born + 0.3));
          const cx = box.x + c.u * box.w;
          const cy = bodyTop + box.h * 0.82 * (1 - c.v * 0.95);
          const len = c.len * life;
          for (let a = 0; a < c.arms; a++) {
            const ang = c.a + (a / c.arms) * Math.PI * 2;
            gFrost
              .moveTo(cx, cy)
              .lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len)
              .stroke({ width: 1.2, color: palette.cold, alpha: 0.5 * life });
          }
          gFrost.circle(cx, cy, 1.1 * life).fill({ color: palette.ink, alpha: 0.4 * life });
        }

        // Figure falls from ambient to storage and holds.
        const fall = span(p, 0.1, 0.6);
        const deg = Math.round(21 + (-80 - 21) * fall);
        const s = `${deg} °C`;
        if (tempVal.text !== s) tempVal.text = s;
        tempVal.style.fill = fall > 0.55 ? palette.cold : palette.ink;

        const note = fall > 0.75 ? 'The vial looks identical either way' : '';
        if (tempNote.text !== note) tempNote.text = note;
        tempNote.alpha = span(p, 0.62, 0.8) * 0.9;

        tempCap.alpha = span(p, 0.04, 0.16) * 0.9;
        tempVal.alpha = span(p, 0.04, 0.16);

        view.alpha = weight;
      },
    };
  },
};
