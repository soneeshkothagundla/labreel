/**
 * The frame contract.
 *
 * Every collision in the first cut of the Flagship reel came from the same
 * hole: scenes hardcoded absolute coordinates into a 1920x1080 box, the
 * renderer drew title, subtitle and readout into that same box afterwards,
 * and nothing in between knew what the other had put where. `compare.js`
 * pinned its banner at (334, 150), which is exactly where the chart's top
 * axis label lands. That is not a bug that got missed, it is a bug that
 * nothing prevented.
 *
 * So the frame is now divided once, here, and handed to scenes as `ctx.layout`.
 * The division is deliberately not "one safe rectangle". A zoom film needs the
 * subject to bleed off the edges while the numbers stay pinned inside, so
 * there are two different regions with two different rules:
 *
 *   bleed   The whole frame. Atmosphere, starfields, ice, the subject itself.
 *           Allowed to run off every edge.
 *
 *   safe    Where anything a viewer has to *read* must live: labels, axes,
 *           values, callouts. Nothing legible goes outside it.
 *
 * The reserved bands (title, readout, rail) are carved out of `safe` rather
 * than defended by convention, and the renderer lays a scrim under the title
 * so the subject can pass beneath type without fighting it.
 */

/**
 * @param {number} width
 * @param {number} height
 * @returns {object} layout
 */
export function makeLayout(width = 1920, height = 1080) {
  const W = width;
  const H = height;

  // One padding unit derived from the long edge, so a 16:9 and a 2:1 master
  // get visually equal margins rather than equal pixel counts.
  const pad = Math.round(W * 0.045);

  // Bottom lane: title + subtitle. Measured from the type sizes the renderer
  // actually sets (0.052H title, 0.026H subtitle) plus leading and a floor for
  // the progress hairline, so the band is derived rather than guessed.
  const titleH = Math.round(H * 0.052);
  const subH = Math.round(H * 0.026);
  const titleBandH = Math.round(pad * 0.6 + titleH * 1.25 + subH * 1.6 + pad);

  // Top-right: the beat readout.
  const readoutH = Math.round(H * 0.024 * 2.2);

  // Right edge: the scale rail. This is the film's one piece of persistent
  // chrome, and it earns the space by being what tells a first-time viewer
  // where the camera is.
  const railW = Math.round(W * 0.052);

  const titleBand = {
    x: pad,
    y: H - titleBandH,
    w: W - pad * 2,
    h: titleBandH,
  };

  const readout = {
    x: W - pad - railW - Math.round(W * 0.22),
    y: pad - Math.round(readoutH * 0.15),
    w: Math.round(W * 0.22),
    h: readoutH,
  };

  const rail = {
    x: W - pad - railW,
    y: pad + readoutH + Math.round(H * 0.03),
    w: railW,
    h: H - titleBandH - pad - readoutH - Math.round(H * 0.06),
  };

  const safe = {
    x: pad,
    y: pad + readoutH,
    w: W - pad * 2 - railW - Math.round(pad * 0.5),
    h: H - titleBandH - pad - readoutH,
  };

  return {
    W,
    H,
    pad,
    bleed: { x: 0, y: 0, w: W, h: H },
    safe,
    titleBand,
    readout,
    rail,

    /** Centre of the readable region; where a single subject should sit. */
    cx: safe.x + safe.w / 2,
    cy: safe.y + safe.h / 2,

    /**
     * Largest square that fits the readable region, centred. Most scenes here
     * have one round subject (a particle, a globe, a tube), and asking for the
     * square keeps them from being authored against the 16:9 and then colliding
     * with the rail the moment they grow.
     */
    square() {
      const s = Math.min(safe.w, safe.h);
      return {
        x: safe.x + (safe.w - s) / 2,
        y: safe.y + (safe.h - s) / 2,
        w: s,
        h: s,
        s,
      };
    },

    /**
     * Inset the readable region. Positive shrinks.
     * @param {number} dx
     * @param {number} [dy=dx]
     */
    inset(dx, dy = dx) {
      return {
        x: safe.x + dx,
        y: safe.y + dy,
        w: safe.w - dx * 2,
        h: safe.h - dy * 2,
      };
    },

    /**
     * True when a rect is fully inside the readable region. The shot harness
     * asserts on this, which is what turns "looks fine on my laptop" into a
     * test that fails.
     */
    contains(rect) {
      return (
        rect.x >= safe.x - 0.5 &&
        rect.y >= safe.y - 0.5 &&
        rect.x + rect.w <= safe.x + safe.w + 0.5 &&
        rect.y + rect.h <= safe.y + safe.h + 0.5
      );
    },
  };
}

/**
 * The camera's scale ladder, in metres, from the vial down to one particle and
 * back out to orbit. `depth` runs 0 at the nanoscale to 1 at the orbital end,
 * which is the axis the run sheet plots and the only number scenes need in
 * order to know where the camera is.
 */
const LOG_MIN = Math.log10(8e-8); // one particle
const LOG_MAX = Math.log10(1.27e7); // Earth

/**
 * Depth is a *physical* axis: the base-10 log of the subject's size in metres,
 * normalised so one lipid nanoparticle is 0 and the whole Earth is 1.
 *
 * This has to be physical rather than narrative. The first pass authored depth
 * per beat straight off the run sheet, which put the sixteen-tube rack (20 cm)
 * at a lower depth than the vial (2 cm) because it came later in the story.
 * The rail then counted *upward* while the camera was pushing *in*: it read
 * "2 cm" then "20 cm" on the way down to 80 nm. A scale readout that lies is
 * worse than no scale readout, so the ladder is derived from metres and the
 * beats quote depths taken from it.
 */
export function depthForMetres(m) {
  const d = (Math.log10(m) - LOG_MIN) / (LOG_MAX - LOG_MIN);
  return d < 0 ? 0 : d > 1 ? 1 : d;
}

export const SCALE_STOPS = [
  { metres: 8e-8, label: '80 nm' },
  { metres: 1e-6, label: '1 µm' },
  { metres: 1e-3, label: '1 mm' },
  { metres: 0.02, label: '2 cm' },
  { metres: 0.04, label: '4 cm' },
  { metres: 0.2, label: '20 cm' },
  { metres: 50, label: '50 m' },
  { metres: 4.08e5, label: '408 km' },
  { metres: 1.27e7, label: '12 700 km' },
].map((s) => ({ ...s, depth: depthForMetres(s.metres) }));

/** Named depths, so beats and track cues never hand-write a magic number. */
export const DEPTH = {
  particle: depthForMetres(8e-8),
  micron: depthForMetres(1e-6),
  droplet: depthForMetres(1e-3),
  vial: depthForMetres(0.02),
  tube: depthForMetres(0.04),
  rack: depthForMetres(0.2),
  pad: depthForMetres(50),
  orbit: depthForMetres(4.08e5),
  earth: depthForMetres(1.27e7),
};

/**
 * Human-readable scale for a depth value. Interpolating the *label* is
 * meaningless, so this snaps to the nearest authored stop: the rail should
 * read "80 nm", never "63.4 nm".
 */
export function scaleLabelAt(depth) {
  let best = SCALE_STOPS[0];
  let bestD = Infinity;
  for (const s of SCALE_STOPS) {
    const d = Math.abs(s.depth - depth);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best.label;
}
