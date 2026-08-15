/**
 * 2:40 - "Nothing has flown yet. This is the hypothesis and the instrument
 * that settles it."
 *
 * The replacement for `compare`, which had the worst collisions in the first
 * cut: its ILLUSTRATIVE banner was pinned at (334, 150), directly on top of
 * the chart's own top axis label, and the right-hand value ran off the frame.
 *
 * Everything here is positioned from `layout.safe`, and the banner sits in its
 * own reserved lane above the plot rather than floating inside it. The honesty
 * flag is not a disclaimer hidden in a corner: at a demo day where every other
 * founder is overstating traction, saying this out loud is the asset.
 */
import { span, winF } from './kit.js';

const BARS = [
  { label: 'STANDARD PEG', ground: 68.2, flight: 79.4 },
  { label: 'HIGH PEG', ground: 81.6, flight: 86.0 },
];

export default {
  id: 'finalist',

  build(ctx) {
    const { PIXI, palette, layout, text } = ctx;
    const view = new PIXI.Container();

    // Reserved lane for the banner, then the plot beneath it. Deriving both
    // from `safe` is what makes the old overlap impossible rather than fixed.
    const bannerH = layout.H * 0.052;
    const plot = {
      x: layout.safe.x + layout.safe.w * 0.13,
      y: layout.safe.y + bannerH + layout.H * 0.035,
      w: layout.safe.w * 0.6,
      h: layout.safe.h * 0.6,
    };

    const gBanner = new PIXI.Graphics();
    const gAxes = new PIXI.Graphics();
    const gBars = new PIXI.Graphics();
    view.addChild(gBanner, gAxes, gBars);

    const banner = text('PREDICTED · NOTHING HAS FLOWN', {
      size: Math.round(layout.H * 0.017),
      color: palette.warm,
      mono: true,
      letterSpacing: 2.4,
    });
    banner.anchor.set(0, 0.5);
    banner.position.set(layout.safe.x + layout.H * 0.018, layout.safe.y + bannerH / 2);
    view.addChild(banner);

    const yLab = text('Encapsulation efficiency (%)', {
      size: Math.round(layout.H * 0.016),
      color: palette.inkDim,
    });
    yLab.anchor.set(0.5, 0.5);
    yLab.rotation = -Math.PI / 2;
    yLab.position.set(plot.x - layout.H * 0.062, plot.y + plot.h / 2);
    view.addChild(yLab);

    const ticks = [];
    for (let v = 0; v <= 100; v += 20) {
      const el = text(String(v), {
        size: Math.round(layout.H * 0.015),
        color: palette.inkFaint,
        mono: true,
      });
      el.anchor.set(1, 0.5);
      el.position.set(plot.x - layout.H * 0.012, plot.y + plot.h * (1 - v / 100));
      view.addChild(el);
      ticks.push(el);
    }

    const groupLabels = [];
    const valueLabels = [];
    BARS.forEach((b, i) => {
      const gl = text(b.label, {
        size: Math.round(layout.H * 0.015),
        color: palette.inkDim,
        mono: true,
        letterSpacing: 1.6,
      });
      gl.anchor.set(0.5, 0);
      gl.position.set(
        plot.x + plot.w * (0.27 + i * 0.46),
        plot.y + plot.h + layout.H * 0.018
      );
      view.addChild(gl);
      groupLabels.push(gl);

      ['ground', 'flight'].forEach((k, j) => {
        const el = text('', {
          size: Math.round(layout.H * 0.022),
          weight: '700',
          mono: true,
          color: k === 'flight' ? palette.signal : palette.ink,
        });
        el.anchor.set(0.5, 1);
        view.addChild(el);
        valueLabels.push({ el, i, j, key: k, val: b[k] });
      });
    });

    // Legend in the gutter right of the plot, inside `safe`, so it can never
    // collide with the bars the way the old key did.
    const legX = plot.x + plot.w + layout.safe.w * 0.06;
    const mkLeg = (label, color, dy) => {
      const el = text(label, {
        size: Math.round(layout.H * 0.015),
        color,
        mono: true,
        letterSpacing: 1.2,
      });
      el.anchor.set(0, 0.5);
      el.position.set(legX + layout.H * 0.028, plot.y + dy);
      view.addChild(el);
      return el;
    };
    const legG = mkLeg('GROUND, MODELLED', palette.ink, layout.H * 0.02);
    const legF = mkLeg('FLIGHT, PREDICTED', palette.signal, layout.H * 0.06);
    const gLegend = new PIXI.Graphics();
    view.addChild(gLegend);

    const note = text(
      'Both series modelled from published\nLNP freeze/thaw literature.\nn = 8 tubes per bar, planned.',
      { size: Math.round(layout.H * 0.014), color: palette.inkFaint }
    );
    note.anchor.set(0, 0);
    note.position.set(legX, plot.y + layout.H * 0.1);
    view.addChild(note);

    return {
      view,

      update(frame, weight, p) {
        const grow = span(p, 0.1, 0.6);

        gBanner.clear();
        const bw = banner.width + layout.H * 0.036;
        gBanner
          .rect(layout.safe.x, layout.safe.y, bw, bannerH)
          .stroke({ width: 1, color: palette.warm, alpha: 0.55 });
        gBanner.alpha = span(p, 0, 0.12);
        banner.alpha = gBanner.alpha;

        gAxes.clear();
        for (let v = 0; v <= 100; v += 20) {
          const y = plot.y + plot.h * (1 - v / 100);
          gAxes.moveTo(plot.x, y).lineTo(plot.x + plot.w, y).stroke({
            width: 1,
            color: palette.grid,
            alpha: v === 0 ? 0.9 : 0.42,
          });
        }

        gBars.clear();
        BARS.forEach((b, i) => {
          ['ground', 'flight'].forEach((k, j) => {
            const v = b[k] * grow;
            const bw2 = plot.w * 0.15;
            const cx = plot.x + plot.w * (0.27 + i * 0.46) + (j - 0.5) * bw2 * 1.25;
            const h = plot.h * (v / 100);
            const y = plot.y + plot.h - h;
            if (k === 'ground') {
              gBars.rect(cx - bw2 / 2, y, bw2, h).fill({ color: palette.cold, alpha: 0.75 });
            } else {
              gBars
                .rect(cx - bw2 / 2, y, bw2, h)
                .fill({ color: palette.signal, alpha: 0.12 })
                .stroke({ width: 2, color: palette.signal, alpha: 0.95 });
            }
          });
        });

        valueLabels.forEach(({ el, i, j, val }) => {
          const v = val * grow;
          const bw2 = plot.w * 0.15;
          const cx = plot.x + plot.w * (0.27 + i * 0.46) + (j - 0.5) * bw2 * 1.25;
          el.position.set(cx, plot.y + plot.h * (1 - v / 100) - layout.H * 0.008);
          el.text = v.toFixed(1);
          el.alpha = span(p, 0.34, 0.5);
        });

        gLegend.clear();
        const la = span(p, 0.42, 0.58);
        gLegend
          .rect(legX, plot.y + layout.H * 0.014, layout.H * 0.018, layout.H * 0.012)
          .fill({ color: palette.cold, alpha: 0.75 * la });
        gLegend
          .rect(legX, plot.y + layout.H * 0.054, layout.H * 0.018, layout.H * 0.012)
          .stroke({ width: 2, color: palette.signal, alpha: 0.95 * la });
        legG.alpha = la;
        legF.alpha = la;
        note.alpha = span(p, 0.55, 0.72) * 0.85;

        yLab.alpha = 0.8;
        for (const t2 of ticks) t2.alpha = 0.7;
        for (const g of groupLabels) g.alpha = span(p, 0.2, 0.34) * 0.9;

        // slow blink so the flag keeps drawing the eye without animating
        banner.alpha = gBanner.alpha * (0.72 + 0.28 * winF((frame.time % 3) / 3, 0, 1, 0.45));

        view.alpha = weight;
      },
    };
  },
};
