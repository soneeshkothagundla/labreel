/**
 * freeze - "Cold chain" (beat 6 of the flagship reel).
 *
 * The sixteen-tube rack sits in an open cryo box while the whole frame cools.
 * A large mono readout falls from +22 to -80 C, the liquid in each tube goes
 * from clear to opaque ice (staggered, one tube at a time, because a rack
 * never freezes all at once), and frost creeps in from all four edges as
 * branching crystal lines.
 *
 * Everything is authored in a 1920x1080 design box and scaled once into
 * ctx.width/ctx.height, so there is exactly one place where resolution enters.
 *
 * Determinism: every scatter value is drawn from a seeded LCG inside build().
 * update() only reads precomputed geometry and frame.time, so an offline
 * capture at 60 fps and a live projector render produce identical pixels.
 */

import { clamp01, remap, cubicOut, sineInOut, settle } from '../core/easing.js';

/* ------------------------------------------------------------------ *
 * Design-box constants (1920 x 1080)
 * ------------------------------------------------------------------ */

const DW = 1920;
const DH = 1080;

// Reserved by the renderer overlay. Nothing in this scene enters these.
const SAFE_BOTTOM = 816; // title / subtitle / progress hairline
const CLEAR_X = 1450; // top-right readout box
const CLEAR_Y = 130;

// Cryo box floor, in perspective: a trapezoid seen slightly from above.
const FLOOR_BACK_Y = 430;
const FLOOR_FRONT_Y = 780;
const FLOOR_BACK_HW = 268;
const FLOOR_FRONT_HW = 350;
const RIM_LIFT = 40; // wall height in screen space
const WALL_BASE_Y = 796;
const WALL_BASE_HW = 360;

const CX = DW / 2;

// Temperature ramp. The reel compresses hours of blast freezing into 8 s,
// so the curve is eased rather than literal.
const T_START = 22;
const T_END = -80;

// Gauge (right column).
const GX = 1520;
const G_TOP_Y = 210;
const G_BOT_Y = 770;
const G_TOP_T = 25;
const G_BOT_T = -90;

const lerp = (a, b, t) => a + (b - a) * t;

/** Blend two palette colours. Only palette values are ever passed in. */
function mixColor(a, b, t) {
  const k = clamp01(t);
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * k) & 0xff;
  const g = Math.round(ag + (bg - ag) * k) & 0xff;
  const b2 = Math.round(ab + (bb - ab) * k) & 0xff;
  return (r << 16) | (g << 8) | b2;
}

const floorY = (t) => lerp(FLOOR_BACK_Y, FLOOR_FRONT_Y, t);
const floorHW = (t) => lerp(FLOOR_BACK_HW, FLOOR_FRONT_HW, t);
const rimY = (t) => floorY(t) - RIM_LIFT;
const rimHW = (t) => floorHW(t) * 1.06;

/** Beat progress -> sample temperature in C. */
const tempAt = (p) =>
  T_START + (T_END - T_START) * sineInOut(clamp01(remap(p, 0.06, 0.86, 0, 1)));

/** Temperature -> y on the right-hand gauge. */
const tempToY = (T) =>
  G_TOP_Y + ((G_TOP_T - T) / (G_TOP_T - G_BOT_T)) * (G_BOT_Y - G_TOP_Y);

/** "+22 C" / "-80 C", monospace-stable (number always two columns wide). */
function formatTemp(T) {
  const r = Math.round(T);
  const sign = r < 0 ? '−' : '+';
  return `${sign}${String(Math.abs(r)).padStart(2, ' ')} °C`;
}

export default {
  id: 'freeze',

  build(ctx) {
    const { PIXI, palette, width, height, text, font, mono } = ctx;

    /* -------------------------------------------------------------- *
     * Seeded scatter. Nothing below this line calls Math.random().
     * -------------------------------------------------------------- */
    let s = 12345;
    const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;

    const view = new PIXI.Container();
    view.pivot.set(width / 2, height / 2);
    view.position.set(width / 2, height / 2);

    // One scale hop: design coordinates in, device coordinates out.
    const stage = new PIXI.Container();
    stage.scale.set(width / DW, height / DH);
    view.addChild(stage);

    /* -------------------------------------------------------------- *
     * Layers, created once and only ever cleared + redrawn.
     * -------------------------------------------------------------- */
    const gGlow = new PIXI.Graphics();
    const gBox = new PIXI.Graphics(); // back wall, floor grid, rim
    const gTubes = new PIXI.Graphics();
    const gWall = new PIXI.Graphics(); // front wall, drawn over the front row
    const gVapor = new PIXI.Graphics();
    const frostLayer = new PIXI.Container();
    const gFrost = [new PIXI.Graphics(), new PIXI.Graphics(), new PIXI.Graphics()];
    frostLayer.addChild(gFrost[0], gFrost[1], gFrost[2]);
    const gHud = new PIXI.Graphics();
    const gGauge = new PIXI.Graphics();

    stage.addChild(gGlow, gBox, gTubes, gWall, gVapor, frostLayer, gHud, gGauge);

    /* -------------------------------------------------------------- *
     * Sixteen tubes: 4 rows deep x 4 across, back rows smaller + dimmer.
     * -------------------------------------------------------------- */
    const ROW_T = [0.10, 0.37, 0.65, 0.93];
    const tubes = [];
    for (let r = 0; r < 4; r++) {
      const t = ROW_T[r];
      const rowY = floorY(t);
      const rowHW = floorHW(t);
      const rowS = 0.78 + t * 0.25;
      const gap = rowHW * 0.47;
      for (let c = 0; c < 4; c++) {
        const jitter = rnd();
        const crystals = [];
        for (let k = 0; k < 7; k++) {
          crystals.push({
            u: (rnd() - 0.5) * 0.78,
            v: 0.1 + rnd() * 0.82,
            a: rnd() * Math.PI,
            len: 6 + rnd() * 9,
            tw: rnd() * Math.PI * 2,
          });
        }
        tubes.push({
          row: r,
          x: CX + (c - 1.5) * gap,
          base: rowY,
          s: rowS,
          depth: 0.62 + t * 0.38, // opacity layering, back to front
          formA: c < 2, // two formulations, marked by shape not colour
          phase: rnd() * Math.PI * 2,
          // Each tube nucleates at its own temperature: a 44 C spread, so the
          // rack freezes as a visible cascade instead of all at once.
          tStart: -1 - jitter * 44,
          crystals,
        });
      }
    }

    /* -------------------------------------------------------------- *
     * Frost. Branching lines are grown once here; update() reveals a
     * fraction of them, interpolating the frontier segment so the
     * growth edge is smooth rather than popping segment by segment.
     * -------------------------------------------------------------- */
    const segs = [];
    const inClearCorner = (x, y) => x > CLEAR_X && y < CLEAR_Y;

    // Frost is a border effect: it creeps in from the edges and thins out
    // before it reaches the rack, so the subject stays clean.
    const FROST_REACH = 290;
    const edgeDist = (x, y) =>
      Math.min(x, DW - x, y, SAFE_BOTTOM - y);

    const push = (x1, y1, x2, y2, o0, o1, tier) => {
      if (inClearCorner(x1, y1) || inClearCorner(x2, y2)) return;
      if (y1 > SAFE_BOTTOM || y2 > SAFE_BOTTOM) return;
      if (edgeDist((x1 + x2) / 2, (y1 + y2) / 2) > FROST_REACH) return;
      segs.push({ x1, y1, x2, y2, o0, o1, tier });
    };

    // A frost fern: a nearly straight spine with ribs at ~60 degrees on both
    // sides, each rib repeating the pattern once more. Very little angular
    // wander, because ice grows along crystal axes and not like a root.
    const RIB_P = [0, 0.82, 0.28]; // rib probability per tier
    const RIB_STEPS = [0, 3, 2];

    const grow = (x, y, ang, len, tier, o0, oSpan, steps) => {
      let cx = x;
      let cy = y;
      let a = ang;
      const per = oSpan / steps;
      for (let i = 0; i < steps; i++) {
        a += (rnd() - 0.5) * 0.18;
        const L = len * (0.78 + rnd() * 0.44);
        const nx = cx + Math.cos(a) * L;
        const ny = cy + Math.sin(a) * L;
        const s0 = o0 + per * i;
        const s1 = o0 + per * (i + 1);
        push(cx, cy, nx, ny, s0, s1, tier);
        if (tier < 2 && i >= 1) {
          for (const side of [1, -1]) {
            if (rnd() > RIB_P[tier + 1]) continue;
            grow(
              nx,
              ny,
              a + side * (0.95 + rnd() * 0.22),
              L * 0.5,
              tier + 1,
              s1,
              oSpan * 0.4,
              RIB_STEPS[tier + 1]
            );
          }
        }
        cx = nx;
        cy = ny;
        if (cx < -40 || cx > DW + 40 || cy < -40 || cy > SAFE_BOTTOM + 20) break;
      }
    };

    const seed = (x, y, ang) =>
      grow(x, y, ang, 30, 0, rnd() * 0.24, 0.5 + rnd() * 0.32, 6);

    for (let i = 0; i < 12; i++) {
      // Top edge, growing down. Skipped where the readout lives.
      const x = 50 + (i / 11) * (DW - 100) + (rnd() - 0.5) * 80;
      if (x < CLEAR_X - 40) seed(x, -6, Math.PI / 2 + (rnd() - 0.5) * 0.9);
    }
    for (let i = 0; i < 12; i++) {
      // Bottom edge, growing up from the title safe line.
      const x = 50 + (i / 11) * (DW - 100) + (rnd() - 0.5) * 80;
      seed(x, SAFE_BOTTOM - 2, -Math.PI / 2 + (rnd() - 0.5) * 0.9);
    }
    for (let i = 0; i < 8; i++) {
      const y = 60 + (i / 7) * (SAFE_BOTTOM - 130) + (rnd() - 0.5) * 60;
      seed(-6, y, (rnd() - 0.5) * 0.9);
      const yr = 155 + (i / 7) * (SAFE_BOTTOM - 220) + (rnd() - 0.5) * 60;
      seed(DW + 6, yr, Math.PI + (rnd() - 0.5) * 0.9);
    }

    let maxOrd = 0.0001;
    for (const g of segs) maxOrd = Math.max(maxOrd, g.o1);
    for (const g of segs) {
      g.o0 /= maxOrd;
      g.o1 /= maxOrd;
      g.dx = g.x2 - g.x1;
      g.dy = g.y2 - g.y1;
      g.span = Math.max(0.0001, g.o1 - g.o0);
    }
    // Bucketed by tier so each tier is one path and one stroke() per frame,
    // and sorted by arrival so the reveal loop can stop early.
    const frostTier = [[], [], []];
    for (const g of segs) frostTier[g.tier].push(g);
    for (const bucket of frostTier) bucket.sort((a, b) => a.o0 - b.o0);

    /* -------------------------------------------------------------- *
     * Cold vapour spilling over the front rim.
     * -------------------------------------------------------------- */
    const vapor = [];
    for (let i = 0; i < 30; i++) {
      vapor.push({
        x0: CX + (rnd() - 0.5) * 660,
        phase: rnd(),
        speed: 0.10 + rnd() * 0.12,
        r: 5 + rnd() * 11,
        sway: 12 + rnd() * 26,
      });
    }

    /* -------------------------------------------------------------- *
     * Type. All >= 30px in the design box.
     * -------------------------------------------------------------- */
    const label = text('CORE TEMPERATURE', {
      size: 30,
      color: palette.inkDim,
      weight: '600',
      letterSpacing: 6,
    });
    label.position.set(104, 168);

    const tempBig = new PIXI.Text({
      text: formatTemp(T_START),
      style: new PIXI.TextStyle({
        fontFamily: mono,
        fontSize: 116,
        fontWeight: '600',
        fill: palette.ink,
        letterSpacing: 2,
      }),
    });
    tempBig.position.set(100, 202);

    const phaseText = text('PHASE   LIQUID', {
      size: 32,
      color: palette.cold,
      mono: true,
      letterSpacing: 2,
    });
    phaseText.position.set(104, 372);

    const frozenText = text('FROZEN  00/16', {
      size: 32,
      color: palette.inkDim,
      mono: true,
      letterSpacing: 2,
    });
    frozenText.position.set(104, 418);

    const targetText = text('TARGET  −80 °C', {
      size: 30,
      color: palette.inkFaint,
      mono: true,
      letterSpacing: 2,
    });
    targetText.position.set(104, 464);

    const holdText = text('HOLD −80 °C', {
      size: 32,
      color: palette.cold,
      mono: true,
      weight: '600',
      letterSpacing: 3,
    });
    holdText.position.set(126, 524);
    holdText.alpha = 0;

    const gaugeTitle = text('CHAMBER °C', {
      size: 30,
      color: palette.inkDim,
      mono: true,
      letterSpacing: 3,
    });
    gaugeTitle.position.set(1466, 158);

    const tickLabels = [];
    for (const [T, str] of [[20, '+20'], [0, '  0'], [-40, '−40'], [-80, '−80']]) {
      const tl = text(str, { size: 30, color: palette.inkFaint, mono: true });
      tl.position.set(GX + 48, tempToY(T) - 18);
      tickLabels.push(tl);
      stage.addChild(tl);
    }

    stage.addChild(
      label,
      tempBig,
      phaseText,
      frozenText,
      targetText,
      holdText,
      gaugeTitle
    );

    /* -------------------------------------------------------------- *
     * Cached style state, so we never touch a TextStyle unless the
     * visible result actually changed (each write re-rasterises).
     * -------------------------------------------------------------- */
    const cache = {
      temp: '',
      tempFill: -1,
      phase: '',
      frozen: '',
      phaseFill: -1,
    };

    const COLD_ICE = mixColor(palette.cold, palette.ink, 0.45);
    const FROST_COL = [
      mixColor(palette.cold, palette.ink, 0.3),
      mixColor(palette.cold, palette.ink, 0.5),
      mixColor(palette.cold, palette.ink, 0.68),
    ];
    const FROST_W = [5, 4, 3];
    const FROST_A = [0.6, 0.4, 0.26];

    /* -------------------------------------------------------------- *
     * Tube renderer. Reads only precomputed geometry + scalars.
     * -------------------------------------------------------------- */
    function drawTube(g, t, tempC, time, chill) {
      const sc = t.s;
      const w = 76 * sc;
      const bodyH = 112 * sc;
      const capH = 22 * sc;
      const x = t.x;
      const base = t.base;
      const bodyTop = base - bodyH;
      const capTop = bodyTop - capH - 2.5 * sc;
      const rr = w * 0.32;
      const dep = t.depth;

      // Nucleation: each tube crosses its own threshold over 20 C.
      const fz = clamp01((t.tStart - tempC) / 20);
      const liquid = 1 - fz;

      // Glass body.
      g.roundRect(x - w / 2, bodyTop, w, bodyH, rr).fill({
        color: mixColor(palette.ground, palette.panel, 0.4),
        alpha: (0.82 + fz * 0.14) * dep,
      });

      // Contents. Clear and slightly sloshing, then opaque and still.
      const bob = Math.sin(time * 0.9 + t.phase) * 1.8 * liquid;
      const liqTop = bodyTop + bodyH * 0.3 - fz * 4 * sc + bob;
      const liqBot = base - 5 * sc;
      g.roundRect(x - w / 2 + 3, liqTop, w - 6, liqBot - liqTop, rr * 0.78).fill({
        color: mixColor(palette.cold, palette.ink, 0.1 + fz * 0.34),
        alpha: (0.36 + fz * 0.56) * dep,
      });

      // Meniscus: the one line that says "there is liquid in here".
      g.moveTo(x - w / 2 + 5, liqTop)
        .lineTo(x + w / 2 - 5, liqTop)
        .stroke({
          width: 3,
          color: mixColor(palette.ink, palette.cold, 0.3),
          alpha: (0.5 + fz * 0.4) * dep,
        });

      // Ice facets, twinkling slowly so a held frame is never dead.
      if (fz > 0.03) {
        for (const f of t.crystals) {
          const px = x + f.u * (w - 14);
          const py = lerp(liqTop + 6, liqBot - 6, f.v);
          const L = f.len * sc * (0.55 + fz * 0.55);
          const ca = Math.cos(f.a) * L;
          const sa = Math.sin(f.a) * L;
          g.moveTo(px - ca, py - sa).lineTo(px + ca, py + sa);
          const cb = Math.cos(f.a + 1.05) * L * 0.62;
          const sb = Math.sin(f.a + 1.05) * L * 0.62;
          g.moveTo(px - cb, py - sb).lineTo(px + cb, py + sb);
        }
        g.stroke({
          width: 3,
          color: mixColor(palette.ink, palette.cold, 0.3),
          alpha:
            fz * dep * (0.26 + 0.2 * Math.sin(time * 1.6 + t.phase * 3)),
        });
      }

      // Specular, sliding as the room light moves.
      const spec = 0.10 + 0.10 * Math.sin(time * 0.6 + t.phase);
      g.moveTo(x - w * 0.29, bodyTop + 14 * sc)
        .lineTo(x - w * 0.29, base - 16 * sc)
        .stroke({ width: 3, color: palette.ink, alpha: spec * liquid * dep + 0.04 });

      // Glass rim: the only thing that brightens as the sample solidifies.
      g.roundRect(x - w / 2, bodyTop, w, bodyH, rr).stroke({
        width: 3,
        color: mixColor(palette.rule, palette.cold, 0.3 + fz * 0.55),
        alpha: (0.7 + fz * 0.3) * dep,
      });

      // Cap.
      g.roundRect(x - w * 0.57, capTop, w * 1.14, capH, 5 * sc).fill({
        color: mixColor(palette.panel, palette.rule, 0.35),
        alpha: 0.94 * dep,
      });
      g.roundRect(x - w * 0.57, capTop, w * 1.14, capH, 5 * sc).stroke({
        width: 3,
        color: mixColor(palette.rule, palette.cold, 0.25 + fz * 0.4),
        alpha: 0.85 * dep,
      });

      // Formulation marker: filled disc vs open ring, never colour alone.
      const mkY = bodyTop + 19 * sc;
      const mkC = mixColor(
        t.formA ? palette.signal : palette.lipid,
        palette.cold,
        0.3 + 0.5 * Math.max(fz, chill)
      );
      if (t.formA) {
        g.circle(x, mkY, 7 * sc).fill({ color: mkC, alpha: 0.85 * dep });
      } else {
        g.circle(x, mkY, 7 * sc).stroke({ width: 3, color: mkC, alpha: 0.9 * dep });
      }
    }

    /* -------------------------------------------------------------- *
     * Frame
     * -------------------------------------------------------------- */
    function update(frame, weight, progress) {
      const time = frame?.time ?? 0;
      const vals = frame?.values ?? {};
      const chill = clamp01(vals.chill ?? 0);
      const bloom = vals.bloom ?? 0.15;
      const drift = vals.drift ?? 0;
      const p = clamp01(progress ?? 0);

      // The scene never fully lands: a slow breath keeps it alive on a hold.
      const breath = 0.5 + 0.5 * Math.sin(time * 0.42 + drift * 0.6);
      view.scale.set(0.988 + 0.012 * clamp01(weight ?? 1));
      view.position.set(width / 2, height / 2 + Math.sin(time * 0.31) * 3);

      const tempC = tempAt(p);
      const cooled = clamp01(remap(tempC, T_START, T_END, 0, 1));
      const frostAmt = cubicOut(clamp01(remap(p, 0.1, 0.94, 0, 1)));

      /* ---- cold pool behind the box ---- */
      gGlow.clear();
      for (let i = 9; i >= 0; i--) {
        const rx = 250 + i * 42 + breath * 12;
        const ry = 120 + i * 19 + breath * 6;
        gGlow.ellipse(CX, 520, rx, ry).fill({
          color: palette.cold,
          alpha: 0.017 * (1 - i / 11) * (0.35 + 0.65 * Math.max(cooled, chill)),
        });
      }

      /* ---- cryo box: back wall, floor grid, rim ---- */
      gBox.clear();
      const bkHW = rimHW(0);
      const bkY = rimY(0);
      gBox
        .poly([
          CX - bkHW, bkY,
          CX + bkHW, bkY,
          CX + FLOOR_BACK_HW, FLOOR_BACK_Y,
          CX - FLOOR_BACK_HW, FLOOR_BACK_Y,
        ])
        .fill({ color: palette.panel, alpha: 0.45 + cooled * 0.15 });

      const gridA = 0.30 + cooled * 0.34 + breath * 0.05;
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        const y = floorY(t);
        const hw = floorHW(t);
        gBox.moveTo(CX - hw, y).lineTo(CX + hw, y);
      }
      for (let i = 0; i <= 4; i++) {
        const u = (i / 4 - 0.5) * 2;
        gBox
          .moveTo(CX + u * FLOOR_BACK_HW, FLOOR_BACK_Y)
          .lineTo(CX + u * FLOOR_FRONT_HW, FLOOR_FRONT_Y);
      }
      gBox.stroke({
        width: 3,
        color: mixColor(palette.grid, palette.cold, 0.25 + cooled * 0.4),
        alpha: gridA,
      });

      // Rim opening.
      const frHW = rimHW(1);
      const frY = rimY(1);
      gBox
        .poly([CX - bkHW, bkY, CX + bkHW, bkY, CX + frHW, frY, CX - frHW, frY])
        .stroke({
          width: 4,
          color: mixColor(palette.rule, palette.cold, 0.3 + cooled * 0.5),
          alpha: 0.75 + cooled * 0.25,
        });

      /* ---- tubes, back rows first so the front occludes ---- */
      gTubes.clear();
      for (const t of tubes) drawTube(gTubes, t, tempC, time, chill);

      /* ---- front wall, drawn over the front row ---- */
      gWall.clear();
      gWall
        .poly([
          CX - frHW, frY,
          CX + frHW, frY,
          CX + WALL_BASE_HW, WALL_BASE_Y,
          CX - WALL_BASE_HW, WALL_BASE_Y,
        ])
        .fill({ color: palette.ground, alpha: 0.94 });
      gWall
        .poly([
          CX - frHW, frY,
          CX + frHW, frY,
          CX + WALL_BASE_HW, WALL_BASE_Y,
          CX - WALL_BASE_HW, WALL_BASE_Y,
        ])
        .stroke({
          width: 4,
          color: mixColor(palette.rule, palette.cold, 0.25 + cooled * 0.5),
          alpha: 0.85,
        });
      // Frost line riding the front lip.
      const lipW = frHW * (0.2 + 0.8 * frostAmt);
      gWall
        .moveTo(CX - lipW, frY + 3)
        .lineTo(CX + lipW, frY + 3)
        .stroke({
          width: 3,
          color: COLD_ICE,
          alpha: (0.25 + 0.35 * frostAmt) * (0.7 + 0.3 * breath),
        });

      /* ---- vapour spilling over the lip ---- */
      gVapor.clear();
      const vAmt = 0.35 + 0.65 * cooled;
      for (const v of vapor) {
        const f = (time * v.speed + v.phase) % 1;
        // Travel and radius are capped so the widest blob still clears the
        // title safe line at y = 816.
        const vy = frY + 2 + f * 46;
        const vx =
          v.x0 +
          Math.sin(time * 0.7 + v.phase * 6.283) * v.sway +
          (v.x0 - CX) * f * 0.16;
        const vr = v.r * (0.6 + f * 1.1);
        // Squashed, so it reads as vapour rolling over the lip and not as
        // a bubble stuck to the front of the box.
        gVapor.ellipse(vx, vy, vr * 2.4, vr * 0.55).fill({
          color: palette.cold,
          alpha: Math.sin(f * Math.PI) * 0.05 * vAmt,
        });
      }

      /* ---- frost creeping in from the edges ---- */
      const shimmer = 0.82 + 0.18 * Math.sin(time * 1.05 + drift);
      const reveal = frostAmt * 0.985 + 0.015 * (0.5 + 0.5 * Math.sin(time * 0.5));
      for (let tier = 0; tier < 3; tier++) {
        const g = gFrost[tier];
        g.clear();
        const bucket = frostTier[tier];
        let drew = false;
        for (let i = 0; i < bucket.length; i++) {
          const sg = bucket[i];
          if (sg.o0 >= reveal) break; // sorted by arrival
          const f = Math.min(1, (reveal - sg.o0) / sg.span);
          g.moveTo(sg.x1, sg.y1).lineTo(sg.x1 + sg.dx * f, sg.y1 + sg.dy * f);
          drew = true;
        }
        if (drew) {
          g.stroke({
            width: FROST_W[tier],
            color: FROST_COL[tier],
            alpha: FROST_A[tier] * shimmer * (0.5 + 0.5 * frostAmt),
          });
        }
      }

      /* ---- HUD: descent bar + hold chip ---- */
      gHud.clear();
      gHud.rect(104, 344, 380, 6).fill({ color: palette.rule, alpha: 0.55 });
      gHud.rect(104, 344, 380 * cooled, 6).fill({
        color: mixColor(palette.warm, palette.cold, cooled),
        alpha: 0.95,
      });
      gHud
        .circle(104 + 380 * cooled, 347, 7 + breath * 1.5)
        .fill({ color: palette.ink, alpha: 0.9 });

      const holdIn = settle(clamp01(remap(tempC, -74, -79.4, 0, 1)));
      if (holdIn > 0.01) {
        const hx = 104 + (1 - holdIn) * -34;
        gHud.roundRect(hx, 508, 300, 48, 8).fill({
          color: palette.panel,
          alpha: 0.8 * clamp01(holdIn),
        });
        gHud.roundRect(hx, 508, 300, 48, 8).stroke({
          width: 3,
          color: palette.cold,
          alpha: clamp01(holdIn) * (0.6 + 0.4 * breath),
        });
        holdText.position.set(hx + 22, 516);
      }
      holdText.alpha = clamp01(holdIn) * (0.75 + 0.25 * breath);

      /* ---- right-hand gauge ---- */
      gGauge.clear();
      gGauge.moveTo(GX, G_TOP_Y).lineTo(GX, G_BOT_Y).stroke({
        width: 3,
        color: palette.rule,
        alpha: 0.85,
      });
      for (let T = 20; T >= -80; T -= 20) {
        const y = tempToY(T);
        gGauge.moveTo(GX - 26, y).lineTo(GX + 26, y);
      }
      gGauge.stroke({ width: 3, color: palette.rule, alpha: 0.7 });
      for (let T = 10; T >= -80; T -= 20) {
        const y = tempToY(T);
        gGauge.moveTo(GX - 13, y).lineTo(GX + 13, y);
      }
      gGauge.stroke({ width: 3, color: palette.grid, alpha: 0.8 });

      const yStart = tempToY(T_START);
      const yNow = tempToY(tempC) + Math.sin(time * 2.2) * 1.6;
      gGauge.rect(GX - 5, yStart, 10, Math.max(0, yNow - yStart)).fill({
        color: palette.cold,
        alpha: 0.4 + 0.15 * breath,
      });
      gGauge.moveTo(GX - 44, yNow).lineTo(GX + 44, yNow).stroke({
        width: 4,
        color: palette.ink,
        alpha: 0.95,
      });
      gGauge.circle(GX, yNow, 9 + breath * 1.2).fill({
        color: palette.ink,
        alpha: 0.95,
      });

      /* ---- type ---- */
      const str = formatTemp(tempC);
      if (str !== cache.temp) {
        cache.temp = str;
        tempBig.text = str;
      }
      const warmCol = mixColor(palette.warm, palette.ink, 0.65);
      const coldCol = mixColor(palette.cold, palette.ink, 0.3);
      const fill = mixColor(warmCol, coldCol, cooled);
      if (fill !== cache.tempFill) {
        cache.tempFill = fill;
        tempBig.style.fill = fill;
      }

      let frozenCount = 0;
      for (const t of tubes) {
        if (clamp01((t.tStart - tempC) / 20) > 0.5) frozenCount++;
      }
      const fStr = `FROZEN  ${String(frozenCount).padStart(2, '0')}/16`;
      if (fStr !== cache.frozen) {
        cache.frozen = fStr;
        frozenText.text = fStr;
      }
      frozenText.alpha = 0.7 + 0.3 * clamp01(frozenCount / 16);

      const phase =
        frozenCount >= 16
          ? 'PHASE   SOLID'
          : frozenCount > 0
            ? 'PHASE   FREEZING'
            : tempC <= 0.5
              ? 'PHASE   SUPERCOOLED'
              : 'PHASE   LIQUID';
      if (phase !== cache.phase) {
        cache.phase = phase;
        phaseText.text = phase;
      }
      const pFill = mixColor(palette.inkDim, palette.cold, 0.3 + cooled * 0.7);
      if (pFill !== cache.phaseFill) {
        cache.phaseFill = pFill;
        phaseText.style.fill = pFill;
      }
      phaseText.alpha = 0.85 + 0.15 * breath;

      label.alpha = 0.7 + 0.15 * breath;
      targetText.alpha = 0.62 + 0.28 * cooled;
      gaugeTitle.alpha = 0.65 + 0.2 * breath;
      const tickA = 0.5 + 0.3 * bloom;
      for (const tl of tickLabels) tl.alpha = tickA;
    }

    return { view, update };
  },
};
