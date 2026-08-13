/**
 * Scene: "lnp" - cutaway anatomy of a lipid nanoparticle. The hero shot.
 *
 * The particle is drawn as a sectioned specimen, the way an anatomy plate or a
 * cryo-EM figure would show it: a wedge of the shell is removed so the audience
 * looks straight into the core where the mRNA is coiled. Three layers, named:
 *
 *   PEG-lipid corona    short radial hairs, the steric brush that keeps
 *                       particles from aggregating in the vial
 *   ionizable lipid     a bilayer cross-section, two leaflets of head groups
 *   mRNA payload        one continuous strand, coiled and slowly writhing
 *
 * Everything is procedural and deterministic. Scatter is seeded in build(), so
 * frame N is byte-identical on every run and an offline capture matches the
 * live render exactly. Nothing is allocated per frame except numbers.
 */

import { clamp01, remap, cubicOut, sineInOut, settle } from '../core/easing.js';

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;

/** Mix two 0xRRGGBB integers. Cheap, allocation-free, good enough for tints. */
function mix(a, b, t) {
  const k = clamp01(t);
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return (
    ((ar + (br - ar) * k) << 16) |
    ((ag + (bg - ag) * k) << 8) |
    (ab + (bb - ab) * k)
  );
}

/** Shortest signed angular distance, wrapped to [-PI, PI]. */
function angDelta(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Append an arc as a polyline subpath in the container's local space. */
function arcPath(g, r, a0, a1, steps) {
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps);
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
}

/** Append a dashed arc as many short subpaths (one stroke() covers them all). */
function dashArc(g, r, a0, a1, dashes, duty) {
  const step = (a1 - a0) / dashes;
  for (let i = 0; i < dashes; i++) {
    const s0 = a0 + step * i;
    arcPath(g, r, s0, s0 + step * duty, 2);
  }
}

// Scratch space for partial-length leader drawing. Module scope so update()
// never allocates.
const _segLen = [0, 0, 0, 0];

/**
 * Draw the first `k` (0..1) of a polyline given as a flat [x,y,x,y,...] array.
 * Leaves the path on the Graphics; the caller strokes it. Returns false when
 * nothing was drawn, so the caller can skip a stroke on an empty path.
 */
function partialPoly(g, pts, k) {
  const segs = pts.length / 2 - 1;
  let total = 0;
  for (let i = 0; i < segs; i++) {
    const dx = pts[i * 2 + 2] - pts[i * 2];
    const dy = pts[i * 2 + 3] - pts[i * 2 + 1];
    const L = Math.sqrt(dx * dx + dy * dy);
    _segLen[i] = L;
    total += L;
  }
  let want = total * clamp01(k);
  if (want <= 0.5) return false;
  g.moveTo(pts[0], pts[1]);
  for (let i = 0; i < segs; i++) {
    const L = _segLen[i];
    if (want >= L) {
      g.lineTo(pts[i * 2 + 2], pts[i * 2 + 3]);
      want -= L;
    } else {
      const f = want / L;
      g.lineTo(
        pts[i * 2] + (pts[i * 2 + 2] - pts[i * 2]) * f,
        pts[i * 2 + 1] + (pts[i * 2 + 3] - pts[i * 2 + 1]) * f
      );
      return true;
    }
  }
  return true;
}

export default {
  id: 'lnp',

  build(ctx) {
    const { PIXI, palette, width, height, text, font, mono } = ctx;
    const view = new PIXI.Container();

    // ---------------------------------------------------------------- scale
    // Authored against the 1920x1080 design box; K keeps the drawing honest if
    // the box is ever authored at another size.
    const K = Math.min(width / 1920, height / 1080);
    const px = (v) => v * K;

    const CX = width * 0.3437; // 660
    const CY = height * 0.3889; // 420

    const R_CORE = px(196); // exposed core surface
    const R_HEAD_IN = px(205); // inner leaflet head groups
    const R_MID = px(223); // bilayer mid-plane, where tails meet
    const R_HEAD_OUT = px(241); // outer leaflet head groups
    const R_SHELL_OUT = px(248);
    const R_CORONA = px(300); // PEG hair tips -> this is the 80 nm diameter
    const R_CALIPER = px(318);

    const LIGHT = -125 * D2R; // key light, upper-left, gives the sphere a limb
    const WEDGE_MID = 55 * D2R; // cut opens toward lower-right, into the labels
    const WEDGE_MAX = 37 * D2R;

    const LIPIDS = 96;
    const HAIRS = 92;
    const RNA_STEPS = 208;
    const RNA_CHUNKS = 4;

    const LABEL_X = width * 0.5813; // 1116
    const LABEL_Y = [height * 0.1981, height * 0.3741, height * 0.5815];
    const ELBOW_X = [width * 0.5208, width * 0.526, width * 0.5313];
    const SCALE_Y = height * 0.7315; // 790, clear of the lower title band

    // ------------------------------------------------------------ seeded rng
    let s = 12345;
    const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;

    // ------------------------------------------------------------- pre-scatter
    const hair = [];
    for (let i = 0; i < HAIRS; i++) {
      hair.push({
        a: (i / HAIRS) * TAU + (rnd() - 0.5) * 0.035,
        len: px(38 + rnd() * 26),
        bend: (rnd() - 0.5) * 0.22,
        sp: 0.55 + rnd() * 0.85,
        ph: rnd() * TAU,
        tier: rnd(),
      });
    }

    const lipid = [];
    for (let i = 0; i < LIPIDS; i++) {
      lipid.push({
        a: (i / LIPIDS) * TAU,
        jitter: (rnd() - 0.5) * 0.012,
        sp: 0.4 + rnd() * 0.9,
        ph: rnd() * TAU,
        amp: px(1.6 + rnd() * 2.6),
      });
    }

    // Loose ionizable lipid / cargo in the core, out of focus behind the strand.
    const core = [];
    for (let i = 0; i < 30; i++) {
      const rr = px(28) + rnd() * (R_CORE - px(58));
      core.push({
        r: rr,
        a: rnd() * TAU,
        rad: px(2.4 + rnd() * 4.4),
        sp: (rnd() - 0.5) * 0.34,
        wob: px(4 + rnd() * 9),
        ph: rnd() * TAU,
        al: 0.1 + rnd() * 0.2,
      });
    }

    // Depth field: other particles, far out of focus. Kept off the hero and out
    // of the two reserved zones (lower band, top-right readout corner).
    const dust = [];
    for (let tries = 0; tries < 900 && dust.length < 54; tries++) {
      const x = width * 0.02 + rnd() * width * 0.96;
      const y = height * 0.03 + rnd() * height * 0.66;
      const d = Math.hypot(x - CX, y - CY);
      if (d < R_CALIPER + px(46)) continue;
      if (x > width * 0.74 && y < height * 0.15) continue;
      dust.push({
        x,
        y,
        r: px(1.5 + rnd() * 4.4),
        al: 0.05 + rnd() * 0.13,
        sp: 0.1 + rnd() * 0.36,
        ph: rnd() * TAU,
        amp: px(5 + rnd() * 20),
      });
    }
    const bokeh = [];
    for (let tries = 0; tries < 400 && bokeh.length < 7; tries++) {
      const x = width * 0.03 + rnd() * width * 0.94;
      const y = height * 0.05 + rnd() * height * 0.55;
      const d = Math.hypot(x - CX, y - CY);
      if (d < R_CALIPER + px(120)) continue;
      if (x > width * 0.72 && y < height * 0.18) continue;
      bokeh.push({
        x,
        y,
        r: px(24 + rnd() * 46),
        al: 0.035 + rnd() * 0.05,
        sp: 0.06 + rnd() * 0.18,
        ph: rnd() * TAU,
        amp: px(6 + rnd() * 14),
      });
    }

    // ------------------------------------------------------------------ layers
    const gBack = new PIXI.Graphics();
    const orb = new PIXI.Container();
    orb.position.set(CX, CY);
    const gCaliper = new PIXI.Graphics();
    const gCore = new PIXI.Graphics();
    const gRna = new PIXI.Graphics();
    const gShell = new PIXI.Graphics();
    const gCorona = new PIXI.Graphics();
    orb.addChild(gCaliper, gCore, gRna, gShell, gCorona);

    const gLead = new PIXI.Graphics();
    const gScale = new PIXI.Graphics();
    view.addChild(gBack, orb, gLead, gScale);

    // ------------------------------------------------------------------- type
    const NAMES = ['PEG-lipid corona', 'ionizable lipid shell', 'mRNA payload'];
    const NUMS = ['01', '02', '03'];
    const labels = [];
    const nums = [];
    for (let i = 0; i < 3; i++) {
      const t = text(NAMES[i], { size: px(34), weight: '500', color: palette.ink });
      t.anchor.set(0, 0.5);
      t.position.set(LABEL_X, LABEL_Y[i]);
      labels.push(t);

      const n = text(NUMS[i], {
        size: px(30),
        mono: true,
        color: palette.inkFaint,
        letterSpacing: px(3),
      });
      n.anchor.set(0, 0.5);
      n.position.set(LABEL_X, LABEL_Y[i] - px(42));
      nums.push(n);

      view.addChild(n, t);
    }

    const scaleLabel = text('80 nm', {
      size: px(32),
      mono: true,
      color: palette.inkDim,
      letterSpacing: px(2),
    });
    scaleLabel.anchor.set(1, 0.5);
    scaleLabel.position.set(CX - px(322), SCALE_Y);
    view.addChild(scaleLabel);

    // Callout geometry. Anchors point at a *layer*, so they stay put on screen
    // while the particle rotates underneath them.
    const callouts = [
      {
        ang: -50 * D2R,
        rad: px(292),
        accent: palette.cold,
        pts: [0, 0, ELBOW_X[0], LABEL_Y[0], LABEL_X - px(12), LABEL_Y[0]],
      },
      {
        ang: -8 * D2R,
        rad: R_MID,
        accent: palette.lipid,
        pts: [0, 0, ELBOW_X[1], LABEL_Y[1], LABEL_X - px(12), LABEL_Y[1]],
      },
      {
        // Starts inside the core and exits through the cut, which is the whole
        // point of sectioning the particle in the first place.
        ang: 52 * D2R,
        rad: px(112),
        accent: palette.signal,
        pts: [0, 0, ELBOW_X[2], LABEL_Y[2], LABEL_X - px(12), LABEL_Y[2]],
      },
    ];
    const labelW = labels.map((t) => t.width);

    // Reusable buffer for the strand. No allocation inside update().
    const rna = new Float64Array(RNA_STEPS * 2);

    return {
      view,

      update(frame, weight, progress) {
        const t = frame?.time ?? 0;
        const v = frame?.values ?? {};
        const bloom = v.bloom ?? 0.2;
        const chill = v.chill ?? 0;
        const drift = v.drift ?? 0;
        const p = clamp01(progress);
        const w = clamp01(weight);

        // ------------------------------------------------------------ timing
        // Reveal curves ride `progress`; every base motion rides `frame.time`,
        // so the picture keeps breathing at p = 0 and p = 1 alike.
        const enter = cubicOut(clamp01(remap(p, 0, 0.22, 0, 1)));
        const rnaGrow = 0.52 + 0.48 * cubicOut(clamp01(remap(p, 0.04, 0.36, 0, 1)));
        const barIn = cubicOut(clamp01(remap(p, 0.14, 0.4, 0, 1)));
        const outro = cubicOut(clamp01(remap(p, 0.86, 1, 0, 1)));

        const rot = t * 0.075 + drift * 0.6;
        const breathe = 1 + 0.007 * Math.sin(t * 0.72) + 0.012 * outro;
        const pScale = (0.9 + 0.1 * enter) * breathe;
        orb.scale.set(pScale);

        // Cut always stands at least partly open: the interior is the subject.
        const wedgeHalf =
          WEDGE_MAX *
          (0.62 + 0.38 * sineInOut(clamp01(remap(p, 0.02, 0.24, 0, 1)))) *
          (1 + 0.035 * Math.sin(t * 0.5));
        const aL = WEDGE_MID - wedgeHalf;
        const aR = WEDGE_MID + wedgeHalf;

        const cLip = mix(palette.lipid, palette.cold, chill * 0.45);
        const cPeg = mix(palette.cold, palette.ink, 0.15 + bloom * 0.1);
        const cRna = mix(palette.signal, palette.ink, 0.08 + bloom * 0.12);

        // ------------------------------------------------------- depth field
        gBack.clear();
        for (const b of bokeh) {
          const bx = b.x + Math.sin(t * b.sp + b.ph) * b.amp;
          const by = b.y + Math.cos(t * b.sp * 0.8 + b.ph) * b.amp * 0.6;
          gBack.circle(bx, by, b.r * (1 + 0.05 * Math.sin(t * 0.4 + b.ph)));
        }
        gBack.stroke({ width: px(3), color: palette.rule, alpha: 0.5 * (0.6 + w * 0.4) });

        for (const d of dust) {
          const dx = d.x + Math.sin(t * d.sp + d.ph) * d.amp;
          const dy = d.y + Math.cos(t * d.sp * 0.7 + d.ph) * d.amp * 0.5;
          gBack.circle(dx, dy, d.r);
        }
        gBack.fill({ color: palette.inkFaint, alpha: 0.34 });

        // Soft halo: stacked fills instead of a gradient texture. Anamorphic,
        // both because it reads as lens bloom and because a round one would
        // spill into the lower band the overlay reserves for the title.
        const halo = (0.35 + bloom * 0.65) * (0.55 + 0.45 * enter);
        for (let i = 0; i < 7; i++) {
          const k = i / 6;
          const r = R_CALIPER + px(210) * (1 - k) * (1 + 0.02 * Math.sin(t * 0.6 + k * 3));
          gBack.ellipse(CX, CY, r * pScale, r * pScale * 0.7);
          gBack.fill({
            color: mix(palette.signalDim, palette.cold, 0.35 + chill * 0.4),
            alpha: 0.016 * halo,
          });
        }

        // ------------------------------------------------- caliper / envelope
        gCaliper.clear();
        const spin = -t * 0.031;
        for (let i = 0; i < 48; i++) {
          const a = spin + (i / 48) * TAU;
          const long = i % 4 === 0;
          const r0 = R_CALIPER;
          const r1 = R_CALIPER + (long ? px(16) : px(8));
          gCaliper.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
          gCaliper.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
        }
        gCaliper.stroke({
          width: px(3),
          color: palette.inkFaint,
          alpha: (0.18 + 0.1 * Math.sin(t * 0.9)) * enter,
        });
        gCaliper.circle(0, 0, R_CALIPER);
        gCaliper.stroke({ width: px(3), color: palette.rule, alpha: 0.55 * enter });

        // ------------------------------------------------------------- core
        gCore.clear();
        gCore.circle(0, 0, R_CORE);
        gCore.fill({ color: mix(palette.void, palette.panel, 0.75), alpha: 0.94 });
        for (let i = 0; i < 4; i++) {
          const k = i / 3;
          gCore.circle(
            -R_CORE * 0.16 * k,
            -R_CORE * 0.16 * k,
            R_CORE * (1 - 0.2 * k)
          );
          gCore.fill({ color: palette.panel, alpha: 0.1 });
        }

        for (const c of core) {
          const a = c.a + rot * 0.6 + c.sp * t * 0.25;
          const rr = c.r + Math.sin(t * 0.5 + c.ph) * c.wob;
          gCore.circle(Math.cos(a) * rr, Math.sin(a) * rr * 0.94, c.rad);
        }
        gCore.fill({ color: cLip, alpha: 0.22 * enter });

        // Exposed core surface: bright where the shell has been taken away.
        gCore.circle(0, 0, R_CORE);
        gCore.stroke({ width: px(3), color: palette.inkFaint, alpha: 0.35 });
        arcPath(gCore, R_CORE, aL, aR, 34);
        gCore.stroke({
          width: px(5),
          color: mix(cLip, palette.ink, 0.4),
          alpha: 0.85 * enter,
          cap: 'round',
        });

        // Ghost of the removed material, so the cut reads as removal, not a gap.
        dashArc(gCore, R_HEAD_IN, aL, aR, 15, 0.5);
        dashArc(gCore, R_HEAD_OUT, aL, aR, 17, 0.5);
        dashArc(gCore, R_CORONA - px(16), aL, aR, 21, 0.45);
        gCore.stroke({ width: px(3), color: cLip, alpha: 0.11 * enter });

        // -------------------------------------------------------------- mRNA
        // One continuous chain: an outward spiral with two writhe harmonics, so
        // it moves like a polymer rather than a clock hand.
        for (let i = 0; i < RNA_STEPS; i++) {
          const u = i / (RNA_STEPS - 1);
          const ang =
            u * TAU * 3.55 +
            rot * 1.15 +
            0.34 * Math.sin(u * TAU * 1.5 + t * 0.52);
          const baseR = px(24) + px(150) * Math.pow(u, 0.78);
          const wob =
            px(13) * Math.sin(u * TAU * 4 + t * 1.05) +
            px(6.5) * Math.sin(u * TAU * 7 - t * 0.83);
          const r = baseR + wob * (0.32 + 0.68 * u);
          rna[i * 2] = Math.cos(ang) * r;
          rna[i * 2 + 1] = Math.sin(ang) * r * 0.93;
        }

        const vis = Math.max(6, Math.floor(RNA_STEPS * rnaGrow));
        gRna.clear();

        for (let i = 0; i < vis; i++) {
          if (i === 0) gRna.moveTo(rna[0], rna[1]);
          else gRna.lineTo(rna[i * 2], rna[i * 2 + 1]);
        }
        gRna.stroke({
          width: px(17),
          color: cRna,
          alpha: 0.07 + 0.05 * bloom + 0.02 * Math.sin(t * 1.3),
          cap: 'round',
          join: 'round',
        });

        for (let c = 0; c < RNA_CHUNKS; c++) {
          const i0 = Math.floor((c * vis) / RNA_CHUNKS);
          const i1 = Math.min(vis - 1, Math.floor(((c + 1) * vis) / RNA_CHUNKS));
          if (i1 - i0 < 2) continue;
          for (let i = i0; i <= i1; i++) {
            if (i === i0) gRna.moveTo(rna[i * 2], rna[i * 2 + 1]);
            else gRna.lineTo(rna[i * 2], rna[i * 2 + 1]);
          }
          gRna.stroke({
            width: px(4.5 + c * 0.4),
            color: cRna,
            alpha: 0.5 + 0.13 * c,
            cap: 'round',
            join: 'round',
          });
        }

        // A translation-like pulse running the length of the chain. It never
        // stops, which is what keeps a held beat from going dead.
        const pulseLen = 20;
        const span = Math.max(1, vis - pulseLen - 1);
        const ps = Math.min(vis - 2, Math.floor(((t * 0.16) % 1) * span));
        for (let i = ps; i < ps + pulseLen && i < vis; i++) {
          if (i === ps) gRna.moveTo(rna[i * 2], rna[i * 2 + 1]);
          else gRna.lineTo(rna[i * 2], rna[i * 2 + 1]);
        }
        gRna.stroke({
          width: px(7),
          color: mix(cRna, palette.ink, 0.55),
          alpha: 0.9 * enter,
          cap: 'round',
          join: 'round',
        });

        // Free 5' end, marked so the strand reads as a chain with a beginning.
        gRna.circle(rna[0], rna[1], px(6.5) + px(2) * Math.sin(t * 2.1));
        gRna.fill({ color: palette.ink, alpha: 0.8 });

        // ------------------------------------------------------------- shell
        gShell.clear();
        for (let tier = 0; tier < 3; tier++) {
          let any = false;
          for (const L of lipid) {
            const a = L.a + rot + L.jitter;
            const d = Math.abs(angDelta(a, WEDGE_MID));
            const edge = clamp01((d - wedgeHalf) / 0.16);
            if (edge <= 0.01) continue;

            const lit = 0.5 + 0.5 * Math.cos(a - LIGHT);
            const band = lit > 0.72 ? 0 : lit > 0.4 ? 1 : 2;
            if (band !== tier) continue;
            any = true;

            const sway = Math.sin(t * L.sp + L.ph) * L.amp;
            const ca = Math.cos(a);
            const sa = Math.sin(a);
            const ro = R_HEAD_OUT + sway * 0.5;
            const ri = R_HEAD_IN - sway * 0.3;
            // outer leaflet: head + tail running inward to the mid-plane
            gShell.moveTo(ca * ro, sa * ro);
            gShell.lineTo(ca * (R_MID + px(3)), sa * (R_MID + px(3)));
            // inner leaflet: tail out to the mid-plane, meeting the other
            gShell.moveTo(ca * ri, sa * ri);
            gShell.lineTo(ca * (R_MID - px(3)), sa * (R_MID - px(3)));
          }
          if (!any) continue;
          gShell.stroke({
            width: px(3),
            color: cLip,
            alpha: (tier === 0 ? 0.62 : tier === 1 ? 0.4 : 0.22) * enter,
            cap: 'round',
          });
        }

        for (let tier = 0; tier < 3; tier++) {
          let any = false;
          for (const L of lipid) {
            const a = L.a + rot + L.jitter;
            const d = Math.abs(angDelta(a, WEDGE_MID));
            const edge = clamp01((d - wedgeHalf) / 0.16);
            if (edge <= 0.01) continue;
            const lit = 0.5 + 0.5 * Math.cos(a - LIGHT);
            const band = lit > 0.72 ? 0 : lit > 0.4 ? 1 : 2;
            if (band !== tier) continue;
            any = true;
            const sway = Math.sin(t * L.sp + L.ph) * L.amp;
            const ca = Math.cos(a);
            const sa = Math.sin(a);
            const ro = R_HEAD_OUT + sway * 0.5;
            const ri = R_HEAD_IN - sway * 0.3;
            const rad = px(4.6) * (0.7 + 0.3 * edge);
            gShell.circle(ca * ro, sa * ro, rad);
            gShell.circle(ca * ri, sa * ri, rad * 0.82);
          }
          if (!any) continue;
          gShell.fill({
            color: cLip,
            alpha: (tier === 0 ? 0.95 : tier === 1 ? 0.62 : 0.34) * enter,
          });
        }

        // Section faces. In a cutaway these are the only edges that get a hard
        // bright line, which is what tells the eye the shell has thickness.
        for (let e = 0; e < 2; e++) {
          const a = e === 0 ? aL : aR;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          gShell.moveTo(ca * (R_CORE - px(2)), sa * (R_CORE - px(2)));
          gShell.lineTo(ca * R_SHELL_OUT, sa * R_SHELL_OUT);
        }
        gShell.stroke({ width: px(5), color: cLip, alpha: 0.9 * enter, cap: 'round' });

        for (let e = 0; e < 2; e++) {
          const a = e === 0 ? aL : aR;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          const nx = -sa;
          const ny = ca;
          const sign = e === 0 ? -1 : 1;
          for (let i = 0; i < 6; i++) {
            const r = R_CORE + px(6) + (px(44) * i) / 5;
            const hx = ca * r;
            const hy = sa * r;
            gShell.moveTo(hx, hy);
            gShell.lineTo(hx + nx * px(9) * sign, hy + ny * px(9) * sign);
          }
          // the corona is cut too: fade the section line out through the brush
          gShell.moveTo(ca * R_SHELL_OUT, sa * R_SHELL_OUT);
          gShell.lineTo(ca * (R_CORONA - px(14)), sa * (R_CORONA - px(14)));
        }
        gShell.stroke({ width: px(3), color: cLip, alpha: 0.32 * enter, cap: 'round' });

        // ------------------------------------------------------------ corona
        gCorona.clear();
        const hairGrow = (0.55 + 0.45 * enter) * (1 + 0.06 * outro);
        for (let tier = 0; tier < 3; tier++) {
          let any = false;
          for (const H of hair) {
            const a = H.a + rot;
            const d = Math.abs(angDelta(a, WEDGE_MID));
            const edge = clamp01((d - wedgeHalf) / 0.2);
            if (edge <= 0.02) continue;
            const band = H.tier < 0.34 ? 0 : H.tier < 0.7 ? 1 : 2;
            if (band !== tier) continue;
            any = true;

            // Bend is damped toward the cut, so no hair leans across the
            // opening and blurs the section edge.
            const flex = (H.bend + 0.11 * Math.sin(t * H.sp + H.ph)) * edge * 0.6;
            const len = H.len * edge * hairGrow;
            const r0 = R_SHELL_OUT + px(2);
            const r1 = r0 + len * 0.5;
            const r2 = r0 + len;
            const a1 = a + flex * 0.45;
            const a2 = a + flex;
            gCorona.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
            gCorona.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
            gCorona.lineTo(Math.cos(a2) * r2, Math.sin(a2) * r2);
          }
          if (!any) continue;
          gCorona.stroke({
            width: px(3),
            color: cPeg,
            alpha: (tier === 0 ? 0.6 : tier === 1 ? 0.42 : 0.26) * enter,
            cap: 'round',
            join: 'round',
          });
        }

        let tips = 0;
        for (const H of hair) {
          const a = H.a + rot;
          const d = Math.abs(angDelta(a, WEDGE_MID));
          const edge = clamp01((d - wedgeHalf) / 0.2);
          if (edge <= 0.02 || H.tier > 0.55) continue;
          const flex = (H.bend + 0.11 * Math.sin(t * H.sp + H.ph)) * edge * 0.6;
          const len = H.len * edge * hairGrow;
          const r2 = R_SHELL_OUT + px(2) + len;
          const a2 = a + flex;
          gCorona.circle(Math.cos(a2) * r2, Math.sin(a2) * r2, px(3.4));
          tips++;
        }
        if (tips) gCorona.fill({ color: cPeg, alpha: 0.68 * enter });

        // ------------------------------------------------------ callouts
        gLead.clear();
        for (let i = 0; i < 3; i++) {
          const c = callouts[i];
          const inK = cubicOut(clamp01(remap(p, 0.28 + i * 0.11, 0.52 + i * 0.11, 0, 1)));
          const slide = settle(clamp01(remap(p, 0.3 + i * 0.11, 0.6 + i * 0.11, 0, 1)));

          const wob = 0.012 * Math.sin(t * 0.6 + i * 2.1);
          const ax = CX + Math.cos(c.ang + wob) * c.rad * pScale;
          const ay = CY + Math.sin(c.ang + wob) * c.rad * pScale;
          c.pts[0] = ax;
          c.pts[1] = ay;

          if (inK > 0.001) {
            if (partialPoly(gLead, c.pts, inK)) {
              gLead.stroke({
                width: px(3),
                color: palette.ink,
                alpha: 0.5 * inK,
                cap: 'round',
                join: 'round',
              });
            }

            // underline carries the layer's accent, next to a written name
            const uw = labelW[i] * clamp01(remap(inK, 0.35, 1, 0, 1));
            if (uw > 1) {
              gLead.moveTo(LABEL_X, LABEL_Y[i] + px(27));
              gLead.lineTo(LABEL_X + uw, LABEL_Y[i] + px(27));
              gLead.stroke({ width: px(3), color: c.accent, alpha: 0.85 * inK });
            }

            // anchor: solid dot plus a slow ping so it never sits still
            gLead.circle(ax, ay, px(5.5) * inK);
            gLead.fill({ color: c.accent, alpha: 0.95 * inK });
            const ping = (t * 0.42 + i * 0.33) % 1;
            gLead.circle(ax, ay, px(7) + px(15) * ping);
            gLead.stroke({
              width: px(3),
              color: c.accent,
              alpha: 0.45 * (1 - ping) * inK,
            });
          }

          labels[i].alpha = inK * 0.98;
          labels[i].position.x = LABEL_X + px(26) * (1 - slide);
          nums[i].alpha = inK * 0.7;
          nums[i].position.x = LABEL_X + px(26) * (1 - slide);
        }

        // -------------------------------------------------------- scale bar
        gScale.clear();
        const half = R_CORONA * pScale * barIn;
        if (half > 2) {
          gScale.moveTo(CX - half, SCALE_Y);
          gScale.lineTo(CX + half, SCALE_Y);
          gScale.moveTo(CX - half, SCALE_Y - px(9));
          gScale.lineTo(CX - half, SCALE_Y + px(9));
          gScale.moveTo(CX + half, SCALE_Y - px(9));
          gScale.lineTo(CX + half, SCALE_Y + px(9));
          gScale.moveTo(CX, SCALE_Y - px(5));
          gScale.lineTo(CX, SCALE_Y + px(5));
          gScale.stroke({
            width: px(3),
            color: palette.inkDim,
            alpha: (0.62 + 0.08 * Math.sin(t * 0.8)) * barIn,
          });
          // tie-lines up to the particle so the bar is read as its diameter
          gScale.moveTo(CX - half, SCALE_Y - px(9));
          gScale.lineTo(CX - half, CY + px(120));
          gScale.moveTo(CX + half, SCALE_Y - px(9));
          gScale.lineTo(CX + half, CY + px(120));
          gScale.stroke({ width: px(3), color: palette.rule, alpha: 0.5 * barIn });
        }
        scaleLabel.alpha = barIn * 0.85;
        scaleLabel.position.x = CX - R_CORONA * pScale - px(22);
      },
    };
  },
};
