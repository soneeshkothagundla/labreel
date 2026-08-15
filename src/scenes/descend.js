/**
 * 0:30 - "Here's what's actually breaking."
 *
 * The transition that makes the film work. The camera does not cut to the
 * nanoscale, it travels there: the vial scales past the frame edges, the
 * liquid becomes the whole picture, and the motes that were suspended in it
 * at 0:00 resolve into the particle field that the next beat lands inside.
 *
 * Nothing here is labelled. It is ten seconds of falling, and the scale rail
 * on the right is the only thing telling you how far.
 */
import { drawVial, drawParticle, rng, span } from './kit.js';
import { VIAL_BOX } from './vial.js';

export default {
  id: 'descend',

  build(ctx) {
    const { PIXI, palette, layout } = ctx;
    const view = new PIXI.Container();
    const box = VIAL_BOX(layout);

    const gVial = new PIXI.Graphics();
    const gField = new PIXI.Graphics();
    const gHero = new PIXI.Graphics();

    const vialRig = new PIXI.Container();
    vialRig.addChild(gVial);
    vialRig.pivot.set(box.x + box.w / 2, box.y + box.h / 2);
    vialRig.position.set(box.x + box.w / 2, box.y + box.h / 2);

    view.addChild(vialRig, gField, gHero);

    // Particle field. Each one carries its own depth so the field parallaxes
    // as the camera falls through it, which is what sells travel rather than
    // a zoom on a flat image.
    const rand = rng(57);
    const field = [];
    for (let i = 0; i < 260; i++) {
      field.push({
        x: (rand() - 0.5) * 2.4,
        y: (rand() - 0.5) * 2.4,
        z: rand(),
        r: 0.5 + rand() * 0.9,
        ph: rand() * Math.PI * 2,
      });
    }

    const cx = layout.cx;
    const cy = layout.cy;

    return {
      view,

      update(frame, weight, p) {
        const t = frame.time;

        // The vial rushes past. Cubic so it accelerates away rather than
        // drifting, which is what a camera moving into something looks like.
        const rush = span(p, 0, 0.62);
        const s = 1 + rush * rush * 13;
        vialRig.scale.set(s);
        vialRig.alpha = Math.max(0, 1 - span(p, 0.16, 0.52));

        gVial.clear();
        if (vialRig.alpha > 0.01) {
          drawVial(gVial, box, palette, { fill: 0.62, glow: 0.1 });
        }

        // Field arrives as the glass leaves. It has to be established *before*
        // the vial has fully gone, or the middle of the beat is an empty frame,
        // which on stage reads as the reel having crashed.
        const fieldIn = span(p, 0.12, 0.4);
        gField.clear();
        if (fieldIn > 0.01) {
          const spread = layout.safe.h * 0.62;
          for (const f of field) {
            // z sweeps toward the camera across the beat
            const z = (f.z + span(p, 0.25, 1) * 0.85) % 1;
            const k = 0.25 + z * 2.6;
            const x = cx + f.x * spread * k;
            const y = cy + f.y * spread * k + Math.sin(t * 0.5 + f.ph) * 4;
            if (x < -200 || x > layout.W + 200 || y < -200 || y > layout.H + 200) continue;
            const rr = f.r * k * 5.2;
            const a = fieldIn * (1 - Math.abs(z - 0.55) * 0.9);
            if (a <= 0.02) continue;
            gField.circle(x, y, rr).fill({ color: palette.lipid, alpha: a * 0.75 });
            gField.circle(x, y, rr * 0.42).fill({ color: palette.signal, alpha: a * 0.85 });
          }
        }

        // One particle pulls ahead of the field and becomes the subject of the
        // next beat, so `lnp` opens on something already on screen.
        gHero.clear();
        const heroIn = span(p, 0.6, 1);
        if (heroIn > 0.01) {
          const r = layout.square().s * 0.06 + heroIn * heroIn * layout.square().s * 0.22;
          drawParticle(gHero, cx, cy, r, palette, t, {
            crack: 0,
            detail: heroIn,
            alpha: heroIn,
          });
        }

        view.alpha = weight;
      },
    };
  },
};
