/**
 * 1:26 - "So why can't we just answer this in a lab downstairs?"
 *
 * The reverse of `descend`, and deliberately the same move played backwards:
 * particle, droplet, one tube, sixteen tubes. Retracing the path is what makes
 * the nanoscale and the bench read as one place rather than two illustrations,
 * and it is the setup the `merge` shot at 2:06 cashes in.
 */
import { drawParticle, drawTube, rng, span, lerp } from './kit.js';

export default {
  id: 'ascend',

  build(ctx) {
    const { PIXI, palette, layout } = ctx;
    const view = new PIXI.Container();

    const gField = new PIXI.Graphics();
    const gHero = new PIXI.Graphics();
    const gRack = new PIXI.Graphics();
    view.addChild(gField, gHero, gRack);

    const rand = rng(77);
    const field = [];
    for (let i = 0; i < 200; i++) {
      field.push({
        x: (rand() - 0.5) * 2,
        y: (rand() - 0.5) * 2,
        z: rand(),
        r: 0.5 + rand() * 0.8,
        ph: rand() * Math.PI * 2,
      });
    }

    const sq = layout.square();

    return {
      view,

      update(frame, weight, p) {
        const t = frame.time;

        // The hero particle shrinks away as the camera retreats from it.
        const pull = span(p, 0, 0.42);
        gHero.clear();
        if (pull < 0.98) {
          const r = sq.s * 0.3 * (1 - pull) + sq.s * 0.01;
          drawParticle(gHero, layout.cx, layout.cy, r, palette, t, {
            crack: 0.55 * (1 - pull * 0.6),
            detail: 1 - pull * 0.7,
            alpha: 1 - pull * 0.85,
          });
        }

        // The field rushes outward past the camera.
        gField.clear();
        const fieldA = 1 - span(p, 0.3, 0.62);
        if (fieldA > 0.02) {
          const spread = layout.safe.h * 0.5;
          for (const f of field) {
            const z = (f.z + span(p, 0, 0.62) * 0.9) % 1;
            const k = 0.3 + z * 3;
            const x = layout.cx + f.x * spread * k;
            const y = layout.cy + f.y * spread * k + Math.sin(t * 0.5 + f.ph) * 3;
            if (x < -150 || x > layout.W + 150 || y < -150 || y > layout.H + 150) continue;
            const rr = f.r * k * 4;
            const a = fieldA * (1 - Math.abs(z - 0.5) * 1.1) * 0.8;
            if (a <= 0.02) continue;
            gField.circle(x, y, rr).fill({ color: palette.lipid, alpha: a * 0.55 });
          }
        }

        /* -- the rack resolves out of the retreat ------------------------- */
        gRack.clear();
        const rackIn = span(p, 0.44, 0.9);
        if (rackIn > 0.01) {
          const cols = 8;
          const rows = 2;
          const gw = layout.safe.w * 0.86;
          const tw = (gw / cols) * 0.66;
          const th = tw * 3.1;
          const x0 = layout.cx - gw / 2 + (gw / cols - tw) / 2;
          const y0 = layout.cy - th * 1.05;

          // The whole rack scales up from nothing so it arrives *through* the
          // field rather than fading in on top of it.
          const s = lerp(0.55, 1, rackIn);
          gRack.setStrokeStyle({ width: 1 });
          for (let r0 = 0; r0 < rows; r0++) {
            for (let c = 0; c < cols; c++) {
              const i = r0 * cols + c;
              const highPeg = c >= cols / 2;
              const cx = layout.cx + (x0 + c * (gw / cols) + tw / 2 - layout.cx) * s;
              const cy = layout.cy + (y0 + r0 * th * 1.18 + th / 2 - layout.cy) * s;
              // stagger the arrival left to right so the rack builds
              const a = span(rackIn, (i / 16) * 0.5, (i / 16) * 0.5 + 0.4);
              if (a <= 0.02) continue;
              const box = { x: cx - (tw * s) / 2, y: cy - (th * s) / 2, w: tw * s, h: th * s };
              const g2 = gRack;
              g2.alpha = 1;
              drawTube(g2, box, palette, {
                level: 0.62,
                cap: highPeg ? palette.signal : palette.lipid,
                liquid: palette.cold,
              });
            }
          }
          gRack.alpha = rackIn;
        }

        view.alpha = weight;
      },
    };
  },
};
