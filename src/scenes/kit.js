/**
 * Shared drawing primitives for the Flagship reel.
 *
 * The first cut had eleven scenes averaging six hundred lines, each with its
 * own private copy of "draw a tube", "draw a starfield", "draw a particle".
 * That is why they looked like eleven different films: the shapes genuinely
 * were different. One kit, used everywhere, is most of what makes a continuous
 * zoom read as continuous.
 *
 * Everything here takes a rect from `ctx.layout` rather than raw coordinates,
 * so a primitive cannot be placed outside the readable region by accident.
 */

/**
 * Deterministic PRNG. Frame-exact capture is the whole point of the clock in
 * this engine, so nothing decorative is allowed to call Math.random().
 */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Ramp 0..1 across [a,b] of a 0..1 progress value. */
export function span(p, a, b) {
  if (b <= a) return p >= b ? 1 : 0;
  return clamp01((p - a) / (b - a));
}

/** Rise then fall: 0 at the edges, 1 across the middle of [a,b]. */
export function winF(p, a, b, edge = 0.18) {
  const t = span(p, a, b);
  const e = Math.min(edge, 0.49);
  if (t < e) return t / e;
  if (t > 1 - e) return (1 - t) / e;
  return 1;
}

/**
 * Star layer. Drawn once into a Graphics and then parallaxed by the caller,
 * because regenerating a thousand stars per frame is the single easiest way to
 * drop a reel below 60fps on a venue laptop.
 */
export function starfield(PIXI, { w, h, count = 220, seed = 7, color = 0xf2f7fb }) {
  const g = new PIXI.Graphics();
  const rand = rng(seed);
  for (let i = 0; i < count; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 0.4 + rand() * 1.5;
    g.circle(x, y, r).fill({ color, alpha: 0.08 + rand() * 0.5 });
  }
  return g;
}

/**
 * The vaccine vial: a shouldered glass cylinder with a crimped cap.
 * Drawn in a unit box so it can be scaled to any rect without redrawing.
 */
export function drawVial(g, { x, y, w, h }, palette, { fill = 0.62, glow = 0 } = {}) {
  const capH = h * 0.11;
  const neckH = h * 0.07;
  const bodyTop = y + capH + neckH;
  const bodyH = h - capH - neckH;
  const neckW = w * 0.52;
  const r = w * 0.09;

  // cap
  g.roundRect(x + w * 0.5 - neckW * 0.62, y, neckW * 1.24, capH, capH * 0.28).fill({
    color: palette.inkDim,
    alpha: 0.9,
  });
  // neck
  g.rect(x + w * 0.5 - neckW / 2, y + capH, neckW, neckH).fill({
    color: palette.panel,
    alpha: 0.95,
  });

  // body glass
  g.roundRect(x, bodyTop, w, bodyH, r).fill({ color: palette.panel, alpha: 0.55 });
  g.roundRect(x, bodyTop, w, bodyH, r).stroke({
    width: 2.5,
    color: palette.ink,
    alpha: 0.55,
  });

  // liquid
  if (fill > 0) {
    const lh = bodyH * 0.82 * fill;
    const ly = bodyTop + bodyH - lh - bodyH * 0.04;
    g.roundRect(x + 4, ly, w - 8, lh, r * 0.8).fill({
      color: palette.cold,
      alpha: 0.24 + glow * 0.3,
    });
    g.moveTo(x + 6, ly)
      .lineTo(x + w - 6, ly)
      .stroke({ width: 2, color: palette.cold, alpha: 0.75 });
  }

  // specular
  g.roundRect(x + w * 0.12, bodyTop + bodyH * 0.08, w * 0.1, bodyH * 0.6, w * 0.05).fill({
    color: palette.ink,
    alpha: 0.14,
  });
}

/**
 * A 0.2 mL sample tube, conical bottom, coloured cap.
 * `level` 0..1 fills it; `cap` recolours the lid so the two formulations read
 * apart without needing a legend.
 */
export function drawTube(g, { x, y, w, h }, palette, { level = 0.6, cap = null, liquid = null } = {}) {
  const capH = h * 0.1;
  const bodyH = h * 0.62;
  const coneH = h - capH - bodyH;
  const bodyTop = y + capH;

  g.roundRect(x - w * 0.06, y, w * 1.12, capH, capH * 0.35).fill({
    color: cap ?? palette.inkDim,
    alpha: 0.95,
  });

  g.moveTo(x, bodyTop)
    .lineTo(x, bodyTop + bodyH)
    .lineTo(x + w / 2, bodyTop + bodyH + coneH)
    .lineTo(x + w, bodyTop + bodyH)
    .lineTo(x + w, bodyTop)
    .closePath()
    .fill({ color: palette.panel, alpha: 0.5 })
    .stroke({ width: 2, color: palette.ink, alpha: 0.45 });

  if (level > 0) {
    const lh = (bodyH + coneH) * level;
    const top = bodyTop + bodyH + coneH - lh;
    const c = liquid ?? palette.cold;
    if (top >= bodyTop + bodyH) {
      const t = (bodyTop + bodyH + coneH - top) / coneH;
      const hw = (w / 2) * t;
      g.moveTo(x + w / 2 - hw, top)
        .lineTo(x + w / 2 + hw, top)
        .lineTo(x + w / 2, bodyTop + bodyH + coneH)
        .closePath()
        .fill({ color: c, alpha: 0.5 });
    } else {
      g.moveTo(x + 2, top)
        .lineTo(x + w - 2, top)
        .lineTo(x + w - 2, bodyTop + bodyH)
        .lineTo(x + w / 2, bodyTop + bodyH + coneH)
        .lineTo(x + 2, bodyTop + bodyH)
        .closePath()
        .fill({ color: c, alpha: 0.5 });
    }
  }
}

/**
 * The lipid nanoparticle. One shape, used at every scale in the film: full
 * frame at 80 nm, a dot inside a tube at 4 cm, a motif on a cold-chain route
 * at planetary scale. Reusing the literal same drawing is what ties the ends
 * of the zoom together.
 *
 * `crack` 0..1 opens the shell; `spill` 0..1 releases mRNA.
 */
export function drawParticle(g, cx, cy, r, palette, t = 0, { crack = 0, detail = 1, alpha = 1 } = {}) {
  const rand = rng(11);

  // PEG corona. Short, dense, and low contrast: in the first cut these were
  // long spikes at full alpha and they sat on top of the efficiency gauge.
  if (detail > 0.3) {
    const spikes = Math.round(64 * detail);
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * Math.PI * 2 + t * 0.06;
      const len = r * (0.1 + rand() * 0.07);
      g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
        .lineTo(cx + Math.cos(a) * (r + len), cy + Math.sin(a) * (r + len))
        .stroke({ width: 1.4, color: palette.lipid, alpha: 0.3 * alpha * detail });
    }
  }

  // lipid shell
  g.circle(cx, cy, r).fill({ color: palette.panel, alpha: 0.75 * alpha });
  g.circle(cx, cy, r).stroke({
    width: Math.max(2, r * 0.055),
    color: palette.lipid,
    alpha: (0.9 - crack * 0.45) * alpha,
  });
  g.circle(cx, cy, r * 0.88).stroke({
    width: Math.max(1, r * 0.02),
    color: palette.lipid,
    alpha: 0.28 * alpha,
  });

  // mRNA coil inside
  if (detail > 0.2) {
    const turns = 3.1;
    const pts = 130;
    let first = true;
    for (let i = 0; i <= pts; i++) {
      const f = i / pts;
      const a = f * Math.PI * 2 * turns + t * 0.25;
      const rr = r * (0.16 + f * 0.52) * (1 - crack * 0.18);
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr * 0.92;
      if (first) {
        g.moveTo(px, py);
        first = false;
      } else g.lineTo(px, py);
    }
    g.stroke({ width: Math.max(1.6, r * 0.028), color: palette.signal, alpha: 0.85 * alpha });
  }

  // fracture
  if (crack > 0.02) {
    const a0 = -0.7;
    const wdt = crack * 0.9;
    g.moveTo(cx + Math.cos(a0 - wdt) * r, cy + Math.sin(a0 - wdt) * r);
    const steps = 7;
    for (let i = 1; i <= steps; i++) {
      const f = i / steps;
      const a = a0 - wdt + f * wdt * 2;
      const jitter = (rand() - 0.5) * r * 0.08 * crack;
      g.lineTo(cx + Math.cos(a) * (r + jitter), cy + Math.sin(a) * (r + jitter));
    }
    g.stroke({ width: Math.max(2, r * 0.05), color: palette.void, alpha: crack * alpha });
  }
}

/** Hairline callout: a leader from a point out to a label anchor. */
export function leader(g, x1, y1, x2, y2, palette, alpha = 1) {
  g.moveTo(x1, y1)
    .lineTo(x2, y2)
    .stroke({ width: 1, color: palette.inkDim, alpha: 0.55 * alpha });
  g.circle(x1, y1, 2.5).fill({ color: palette.ink, alpha: 0.8 * alpha });
}

/** Earth's limb across the bottom of a rect. Used by orbit, globe and close. */
export function drawLimb(g, { x, y, w, h }, palette, { lift = 0.72, glow = 1 } = {}) {
  const cx = x + w / 2;
  const r = w * 1.15;
  const cy = y + h + r * lift;

  g.circle(cx, cy, r).fill({ color: 0x061119, alpha: 1 });
  g.circle(cx, cy, r).stroke({ width: 3, color: palette.cold, alpha: 0.5 * glow });
  for (let i = 1; i <= 5; i++) {
    g.circle(cx, cy, r + i * 7).stroke({
      width: 2,
      color: palette.cold,
      alpha: (0.12 / i) * glow,
    });
  }
}
