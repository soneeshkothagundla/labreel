/**
 * microgravity — the scientific heart of the reel.
 *
 * A split screen. Two identical tubes, one variable removed.
 *
 *   LEFT  "1 g / GROUND"    Thawing liquid is buoyant, so it convects. The
 *                           picture is a cellular (Rayleigh–Bénard) flow drawn
 *                           from a real stream function ψ = −sin(2πX)·sin(2πY):
 *                           four counter-rotating rolls, closed streamlines,
 *                           comet arrows riding them, horizontal strata torn
 *                           into waves, and dense particles raining out of
 *                           suspension into a pellet at the bottom.
 *
 *   RIGHT "MICROGRAVITY"    Same tube, same particles, no buoyancy. Nothing
 *                           circulates. Particles hold station with Brownian
 *                           jitter only, the strata stay ruler-flat, the dye
 *                           blooms by diffusion instead of being swept away,
 *                           the pellet never forms, and surface tension pulls
 *                           the meniscus into a deep capillary curve.
 *
 * Determinism: every trajectory is integrated ONCE in build() with RK4 and
 * stored as a resampled polyline; update() only samples those tables. All
 * scatter comes from the seeded LCG below — never the platform RNG — and no
 * display object is allocated past build().
 */

import { clamp01, remap, cubicOut, sineInOut, settle } from '../core/easing.js';

const TAU = Math.PI * 2;

/** Integer RGB blend. Used for warm/cold thermal casts. */
function lerpColor(a, b, t) {
  const k = clamp01(t);
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const bl = Math.round(ab + (bb - ab) * k);
  return (r << 16) | (g << 8) | bl;
}

/**
 * Incompressible cellular flow on a w×h box, in pixel units.
 * ψ = −sin(2πx/w)·sin(2πy/h) → four counter-rotating rolls.
 * Velocity is scaled so max |vy| = 1 px per unit of field-time.
 */
function makeField(w, h) {
  const kx = TAU / w;
  const ky = TAU / h;
  const ax = -(w / h);
  return function field(x, y, out) {
    const sx = Math.sin(kx * x);
    const cs = Math.cos(kx * x);
    const sy = Math.sin(ky * y);
    const cy = Math.cos(ky * y);
    out[0] = ax * sx * cy;
    out[1] = cs * sy;
    return out;
  };
}

function rk4(field, x, y, dt, tmp, out) {
  field(x, y, tmp);
  const k1x = tmp[0];
  const k1y = tmp[1];
  field(x + k1x * dt * 0.5, y + k1y * dt * 0.5, tmp);
  const k2x = tmp[0];
  const k2y = tmp[1];
  field(x + k2x * dt * 0.5, y + k2y * dt * 0.5, tmp);
  const k3x = tmp[0];
  const k3y = tmp[1];
  field(x + k3x * dt, y + k3y * dt, tmp);
  const k4x = tmp[0];
  const k4y = tmp[1];
  out[0] = x + (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
  out[1] = y + (dt / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);
}

/**
 * Integrate one closed streamline through (x0,y0) around roll centre (ccx,ccy)
 * until the unwrapped angle sweeps a full turn, then resample uniformly in
 * TIME so a constant index rate reproduces the true speed variation along it.
 */
function traceLoop(field, x0, y0, ccx, ccy, samples) {
  const dt = 0.85;
  const maxSteps = 14000;
  const px = [x0];
  const py = [y0];
  const tmp = [0, 0];
  const out = [0, 0];
  let x = x0;
  let y = y0;
  let prev = Math.atan2(y0 - ccy, x0 - ccx);
  let acc = 0;
  let closeAt = -1;

  for (let i = 1; i <= maxSteps; i++) {
    rk4(field, x, y, dt, tmp, out);
    x = out[0];
    y = out[1];
    px.push(x);
    py.push(y);
    const a = Math.atan2(y - ccy, x - ccx);
    let d = a - prev;
    if (d > Math.PI) d -= TAU;
    else if (d < -Math.PI) d += TAU;
    prev = a;
    const before = Math.abs(acc);
    acc += d;
    const now = Math.abs(acc);
    if (now >= TAU) {
      closeAt = i - 1 + (TAU - before) / Math.max(1e-9, now - before);
      break;
    }
  }
  if (closeAt < 1) closeAt = px.length - 1;

  const xs = new Float32Array(samples);
  const ys = new Float32Array(samples);
  const top = px.length - 2;
  for (let j = 0; j < samples; j++) {
    const u = (j / samples) * closeAt;
    const i0 = Math.max(0, Math.min(top, Math.floor(u)));
    const f = u - i0;
    xs[j] = px[i0] + (px[i0 + 1] - px[i0]) * f;
    ys[j] = py[i0] + (py[i0 + 1] - py[i0]) * f;
  }
  return { xs, ys, nat: closeAt * dt };
}

/**
 * Integrate a dense particle: cellular flow plus a settling velocity larger
 * than the flow's peak, so it always makes downward progress but still visibly
 * swerves through the rolls on the way.
 */
function traceFall(field, x0, y0, yStop, vFall, samples) {
  const dt = 1.0;
  const maxSteps = 6000;
  const xs = [x0];
  const ys = [y0];
  const tmp = [0, 0];
  let x = x0;
  let y = y0;
  let steps = 0;
  while (y < yStop && steps < maxSteps) {
    field(x, y, tmp);
    const mx = x + tmp[0] * dt * 0.5;
    const my = y + (tmp[1] + vFall) * dt * 0.5;
    field(mx, my, tmp);
    x += tmp[0] * dt;
    y += (tmp[1] + vFall) * dt;
    xs.push(x);
    ys.push(y);
    steps++;
  }
  if (xs.length < 2) {
    xs.push(x0);
    ys.push(yStop);
  }
  const rx = new Float32Array(samples);
  const ry = new Float32Array(samples);
  const last = xs.length - 1;
  for (let j = 0; j < samples; j++) {
    const u = (j / (samples - 1)) * last;
    const i0 = Math.max(0, Math.min(last - 1, Math.floor(u)));
    const f = u - i0;
    rx[j] = xs[i0] + (xs[i0 + 1] - xs[i0]) * f;
    ry[j] = ys[i0] + (ys[i0 + 1] - ys[i0]) * f;
  }
  return { xs: rx, ys: ry, nat: Math.max(1, steps) * dt };
}

export default {
  id: 'microgravity',

  build(ctx) {
    const { PIXI, palette, width, height, text, font, mono } = ctx;
    const W = width;
    const H = height;
    const view = new PIXI.Container();

    // ------------------------------------------------------------------ seed
    let s = 12345;
    const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const rr = (a, b) => a + (b - a) * rnd();

    // ---------------------------------------------------------------- layout
    const cxL = Math.round(W * 0.25); // 480
    const cxR = Math.round(W * 0.75); // 1440
    const divX = Math.round(W * 0.5); // 960

    // Vertical stack is pinned so the risen title still clears the top-right
    // readout box (x>1450, y<130) and the deepest ink clears y=820.
    const TITLE_Y = Math.round(H * 0.1648); // 178
    const TITLE_RISE = 8;
    const SUB_Y = Math.round(H * 0.2148); // 232
    const CAP_Y = Math.round(H * 0.2481); // 268
    const CAP_H = Math.round(H * 0.0389); // 42
    const CAP_HW = Math.round(W * 0.1115); // 214
    const BODY_Y = Math.round(H * 0.2833); // 306
    const BODY_H = Math.round(H * 0.4519); // 488 -> bottom 794, clear of 820
    const TUBE_HW = Math.round(W * 0.1042); // 200

    const LIQ_TOP = Math.round(H * 0.3389); // 366
    const FLOW_H = Math.round(H * 0.3778); // 408
    const FLOW_HW = Math.round(W * 0.0969); // 186
    const FLOW_W = FLOW_HW * 2; // 372
    const LIQ_BOT = LIQ_TOP + FLOW_H; // 780
    const GROUP_CY = Math.round((CAP_Y + BODY_Y + BODY_H) * 0.5);

    const DIV_TOP = Math.round(H * 0.12);
    const DIV_BOT = Math.round(H * 0.752);

    const xL = cxL - FLOW_HW; // flow-box origin, left
    const xR = cxR - FLOW_HW; // flow-box origin, right

    // ------------------------------------------------------- flow + tracing
    const field = makeField(FLOW_W, FLOW_H);
    const cellCx = [FLOW_W * 0.25, FLOW_W * 0.75, FLOW_W * 0.25, FLOW_W * 0.75];
    const cellCy = [FLOW_H * 0.25, FLOW_H * 0.25, FLOW_H * 0.75, FLOW_H * 0.75];
    const cellHW = FLOW_W * 0.25;

    const loops = [];
    for (let c = 0; c < 4; c++) {
      for (const k of [0.3, 0.55, 0.78]) {
        loops.push(
          traceLoop(field, cellCx[c] + cellHW * k, cellCy[c], cellCx[c], cellCy[c], 256)
        );
      }
    }
    let minNat = Infinity;
    for (const L of loops) minNat = Math.min(minNat, L.nat);
    // Field-time units per real second, pinned so the tightest roll turns in 4 s.
    const UPS = minNat / 4.0;
    // Compress the period spread a little so outer rolls do not crawl.
    for (const L of loops) L.sec = 3.8 * Math.sqrt(L.nat / minNat);

    // --------------------------------------------------------------- display
    const groupL = new PIXI.Container();
    const groupR = new PIXI.Container();
    groupL.pivot.set(cxL, GROUP_CY);
    groupL.position.set(cxL, GROUP_CY);
    groupR.pivot.set(cxR, GROUP_CY);
    groupR.position.set(cxR, GROUP_CY);

    const gDiv = new PIXI.Graphics();
    const gDivPulse = new PIXI.Graphics();
    const gNode = new PIXI.Graphics();
    view.addChild(gDiv, gDivPulse, gNode, groupL, groupR);

    // divider, static
    gDiv.moveTo(divX, DIV_TOP).lineTo(divX, DIV_BOT).stroke({ width: 3, color: palette.rule });
    for (let y = DIV_TOP + 22; y < DIV_BOT; y += 46) {
      gDiv.moveTo(divX - 9, y).lineTo(divX + 9, y);
    }
    gDiv.stroke({ width: 3, color: palette.grid });

    // rotating node on the rule
    gNode.moveTo(0, -15).lineTo(15, 0).lineTo(0, 15).lineTo(-15, 0).closePath()
      .fill({ color: palette.void, alpha: 0.95 })
      .stroke({ width: 3, color: palette.inkFaint });
    gNode.position.set(divX, GROUP_CY);

    // ------------------------------------------------------------ tube shell
    const buildTube = (cx) => {
      const g = new PIXI.Graphics();
      g.roundRect(cx - CAP_HW, CAP_Y, CAP_HW * 2, CAP_H, 12)
        .fill({ color: palette.panel, alpha: 0.95 })
        .stroke({ width: 3, color: palette.rule });
      for (let i = 0; i < 7; i++) {
        const x = cx - CAP_HW + 30 + (i * (CAP_HW * 2 - 60)) / 6;
        g.moveTo(x, CAP_Y + 11).lineTo(x, CAP_Y + CAP_H - 11);
      }
      g.stroke({ width: 3, color: palette.grid });
      g.roundRect(cx - TUBE_HW, BODY_Y, TUBE_HW * 2, BODY_H, 34)
        .stroke({ width: 4, color: palette.rule });
      g.roundRect(cx - TUBE_HW + 10, BODY_Y + 10, (TUBE_HW - 10) * 2, BODY_H - 20, 26)
        .stroke({ width: 3, color: palette.grid });
      for (let i = 1; i <= 6; i++) {
        const y = BODY_Y + 46 + (i * (BODY_H - 110)) / 7;
        g.moveTo(cx + TUBE_HW - 36, y).lineTo(cx + TUBE_HW - 15, y);
      }
      g.stroke({ width: 3, color: palette.inkFaint, alpha: 0.55 });
      return g;
    };

    /**
     * The glass interior, filled BEHIND the liquid. Tinting the barrel from the
     * front would knock 60 % off every comet, arrowhead and pellet, and this
     * scene has to carry to the back row of a lit auditorium.
     */
    const buildGlass = (cx) => {
      const g = new PIXI.Graphics();
      g.roundRect(cx - TUBE_HW, BODY_Y, TUBE_HW * 2, BODY_H, 34)
        .fill({ color: palette.void, alpha: 0.72 });
      return g;
    };

    const buildSpec = (cx) => {
      const g = new PIXI.Graphics();
      g.roundRect(cx - TUBE_HW + 24, BODY_Y + 34, 7, BODY_H - 130, 4)
        .fill({ color: palette.ink, alpha: 0.18 });
      g.roundRect(cx + TUBE_HW - 44, BODY_Y + 70, 4, BODY_H - 210, 3)
        .fill({ color: palette.ink, alpha: 0.09 });
      return g;
    };

    const glassL = buildGlass(cxL);
    const glassR = buildGlass(cxR);
    const tubeL = buildTube(cxL);
    const tubeR = buildTube(cxR);
    const specL = buildSpec(cxL);
    const specR = buildSpec(cxR);

    const liqL = new PIXI.Graphics();
    const liqR = new PIXI.Graphics();
    const gStream = new PIXI.Graphics(); // static streamlines, left only
    const gFlow = new PIXI.Graphics(); // comets + arrowheads, left only
    const gRings = new PIXI.Graphics(); // diffusion rings, right only

    const dotsL = new PIXI.Container();
    const dotsR = new PIXI.Container();

    groupL.addChild(glassL, liqL, gStream, gFlow, dotsL, tubeL, specL);
    groupR.addChild(glassR, liqR, gRings, dotsR, tubeR, specR);

    // static streamlines
    for (const L of loops) {
      const n = L.xs.length;
      gStream.moveTo(xL + L.xs[0], LIQ_TOP + L.ys[0]);
      for (let i = 1; i < n; i++) gStream.lineTo(xL + L.xs[i], LIQ_TOP + L.ys[i]);
      gStream.closePath();
    }
    gStream.stroke({ width: 3, color: palette.inkFaint, alpha: 0.5 });

    // ------------------------------------------------------------- particles
    const mkDot = (r, color, alpha) => {
      const g = new PIXI.Graphics();
      g.circle(0, 0, r).fill({ color: 0xffffff });
      g.tint = color;
      g.alpha = alpha;
      return g;
    };

    const N_SUSP = 96;
    const N_HEAVY = 24;
    const N_TRACE = 28;

    // Left: 96 tracers of the flow itself, strung along the twelve streamlines.
    const suspL = [];
    for (let i = 0; i < N_SUSP; i++) {
      const li = i % loops.length;
      const r = rr(2.2, 4.6);
      const d = {
        loop: li,
        phase: rnd(),
        r,
        base: remap(r, 2.2, 4.6, 0.52, 1.0),
        tw: rr(0.7, 1.9),
        tp: rr(0, TAU),
        g: mkDot(r, palette.inkDim, 0.7),
      };
      dotsL.addChild(d.g);
      suspL.push(d);
    }

    // Right: the same 96, holding station.
    const suspR = [];
    for (let i = 0; i < N_SUSP; i++) {
      const r = rr(2.2, 4.6);
      const d = {
        hx: xR + rr(16, FLOW_W - 16),
        hy: LIQ_TOP + rr(46, FLOW_H - 16),
        a: rr(2.6, 5.0),
        b: rr(1.0, 2.2),
        w1: rr(0.6, 2.4),
        w2: rr(0.9, 3.1),
        w3: rr(0.6, 2.4),
        w4: rr(0.9, 3.1),
        p1: rr(0, TAU),
        p2: rr(0, TAU),
        p3: rr(0, TAU),
        p4: rr(0, TAU),
        r,
        base: remap(r, 2.2, 4.6, 0.52, 1.0),
        tw: rr(0.7, 1.9),
        tp: rr(0, TAU),
        g: mkDot(r, palette.inkDim, 0.7),
      };
      dotsR.addChild(d.g);
      suspR.push(d);
    }

    // Left: dense material that rains out of suspension.
    const heavyL = [];
    const Y_STOP = FLOW_H - 14;
    for (let i = 0; i < N_HEAVY; i++) {
      const traj = traceFall(field, rr(14, FLOW_W - 14), rr(10, 34), Y_STOP, 1.25, 260);
      const r = rr(3.4, 5.4);
      const d = {
        traj,
        cycle: (traj.nat / UPS) * 2.0,
        off: rr(0, 40),
        r,
        jw: rr(1.4, 3.2),
        jp: rr(0, TAU),
        g: mkDot(r, palette.lipid, 0.9),
      };
      dotsL.addChild(d.g);
      heavyL.push(d);
    }

    // Right: the same dense material, which never settles.
    const heavyR = [];
    for (let i = 0; i < N_HEAVY; i++) {
      const r = rr(3.4, 5.4);
      const d = {
        hx: xR + rr(20, FLOW_W - 20),
        hy: LIQ_TOP + rr(52, FLOW_H - 24),
        a: rr(1.6, 3.2),
        b: rr(0.7, 1.5),
        w1: rr(0.5, 2.0),
        w2: rr(0.8, 2.7),
        w3: rr(0.5, 2.0),
        w4: rr(0.8, 2.7),
        p1: rr(0, TAU),
        p2: rr(0, TAU),
        p3: rr(0, TAU),
        p4: rr(0, TAU),
        r,
        g: mkDot(r, palette.lipid, 0.9),
      };
      dotsR.addChild(d.g);
      heavyR.push(d);
    }

    // Dye, injected at two identical spots on both sides.
    const blobs = [
      { x: 140, y: 112, c: 0, sp: 26 },
      { x: 312, y: 318, c: 3, sp: 26 },
    ];
    const R_MAX = 54;

    const traceL = [];
    let refSec = 0;
    for (let bi = 0; bi < blobs.length; bi++) {
      const B = blobs[bi];
      const per = N_TRACE / blobs.length;
      for (let i = 0; i < per; i++) {
        const ang = i * 2.3999632;
        const rad = 7 + B.sp * Math.sqrt((i + 0.4) / per);
        let px = B.x + Math.cos(ang) * rad * 0.9;
        let py = B.y + Math.sin(ang) * rad * 1.05;
        // keep the seed on a well-behaved closed orbit inside its roll
        const ccx = cellCx[B.c];
        const ccy = cellCy[B.c];
        let dx = px - ccx;
        let dy = py - ccy;
        const dist = Math.hypot(dx, dy);
        const want = Math.max(13, Math.min(70, dist));
        px = ccx + (dx / (dist || 1)) * want;
        py = ccy + (dy / (dist || 1)) * want;
        const L = traceLoop(field, px, py, ccx, ccy, 192);
        L.sec = 3.8 * Math.sqrt(L.nat / minNat);
        refSec += L.sec;
        const g = mkDot(4.2, palette.signal, 0.95);
        dotsL.addChild(g);
        traceL.push({ L, g, sw: rr(1.1, 2.6), sp2: rr(0, TAU) });
      }
    }
    refSec /= Math.max(1, traceL.length);

    const traceR = [];
    for (let bi = 0; bi < blobs.length; bi++) {
      const B = blobs[bi];
      const per = N_TRACE / blobs.length;
      for (let i = 0; i < per; i++) {
        const ang = i * 2.3999632 + bi * 0.7;
        const g = mkDot(4.2, palette.signal, 0.95);
        dotsR.addChild(g);
        traceR.push({
          bx: xR + B.x,
          by: LIQ_TOP + B.y,
          dx: Math.cos(ang),
          dy: Math.sin(ang),
          rf: 0.18 + 0.82 * Math.sqrt((i + 0.4) / per),
          a: rr(1.8, 3.6),
          w1: rr(0.6, 2.2),
          w2: rr(0.8, 2.6),
          p1: rr(0, TAU),
          p2: rr(0, TAU),
          g,
        });
      }
    }

    // -------------------------------------------------------------- lettering
    const mkLabel = (str, cx, y, size, weight, color, ls, isMono) => {
      const tx = text(str, {
        size,
        weight,
        color,
        letterSpacing: ls,
        mono: !!isMono,
      });
      tx.anchor.set(0.5);
      tx.position.set(cx, y);
      view.addChild(tx);
      return tx;
    };

    const TSIZE = Math.max(38, Math.round(H * 0.041)); // 44
    const SSIZE = Math.max(30, Math.round(H * 0.0296)); // 32
    const titleL = mkLabel('1 g  /  GROUND', cxL, TITLE_Y, TSIZE, '700', palette.ink, 4);
    const titleR = mkLabel('MICROGRAVITY', cxR, TITLE_Y, TSIZE, '700', palette.ink, 4);
    // NOT "convection + settling". Sedimentation is absent in BOTH conditions:
    // the gravitational length scale kT/(m'g) is about 16.3 mm, which exceeds the
    // liquid column in a 25 uL tube, and the Peclet number is about 0.61. Showing
    // particles settling on the ground side would contradict the physics that
    // makes convection the interesting variable in the first place.
    const subL = mkLabel(
      'BULK  CONVECTION',
      cxL,
      SUB_Y,
      SSIZE,
      '500',
      palette.warm,
      2,
      true
    );
    const subR = mkLabel('DIFFUSION  ONLY', cxR, SUB_Y, SSIZE, '500', palette.cold, 2, true);

    // ------------------------------------------------------------- scratchpad
    const smp = [0, 0, 0, 0];
    const menis = new Array(64);
    const NB = 16; // thermal bands
    const STRATA = [0.12, 0.28, 0.44, 0.6, 0.76, 0.92];
    const NX = 26; // samples across a stratum
    const kxF = TAU / FLOW_W;
    const kyF = TAU / FLOW_H;

    const sampleLoop = (L, u, out) => {
      const n = L.xs.length;
      const f = u - Math.floor(u);
      const fi = f * n;
      const i0 = Math.floor(fi) % n;
      const i1 = (i0 + 1) % n;
      const k = fi - Math.floor(fi);
      out[0] = L.xs[i0] + (L.xs[i1] - L.xs[i0]) * k;
      out[1] = L.ys[i0] + (L.ys[i1] - L.ys[i0]) * k;
      out[2] = L.xs[i1] - L.xs[i0];
      out[3] = L.ys[i1] - L.ys[i0];
    };

    /** Liquid body, thermal field, strata, meniscus, settle line, pellet. */
    const drawLiquid = (g, cx, x0, ground, t, p) => {
      g.clear();
      const dipMax = ground ? 7 : 30;
      const dip = ground
        ? 7 + 1.4 * Math.sin(t * 1.1)
        : 30 + 1.3 * Math.sin(t * 0.42);

      // body, with the free surface as its top edge
      let k = 0;
      for (let i = 0; i < NX; i++) {
        const xn = i / (NX - 1);
        const wob = ground ? 2.6 * Math.sin(xn * 9.2 - t * 3.1) : 0;
        menis[k++] = x0 + xn * FLOW_W;
        menis[k++] = LIQ_TOP + dip * Math.sin(xn * Math.PI) + wob;
      }
      menis[k++] = x0 + FLOW_W;
      menis[k++] = LIQ_BOT;
      menis[k++] = x0;
      menis[k++] = LIQ_BOT;
      const poly = menis.slice(0, k);
      g.poly(poly, true).fill({ color: palette.ground, alpha: 0.72 });

      // Thermal bands. Warm sits UNDER cold — the unstable stack that drives
      // convection at 1 g. On the ground it overturns and homogenises; in
      // orbit the identical unstable stack just sits there, perfectly layered.
      const bTop = LIQ_TOP + dipMax + 4;
      const bH = (LIQ_BOT - bTop) / NB;
      const mixAmt = ground ? 0.24 + 0.56 * cubicOut(p) : 0;
      for (let i = 0; i < NB; i++) {
        const yn = (i + 0.5) / NB;
        let wm;
        if (ground) {
          const base = yn;
          wm = base + (0.5 - base) * mixAmt + 0.14 * Math.sin(yn * 7.5 - t * 1.7);
        } else {
          const wdt = 0.05 + 0.08 * Math.sqrt(p);
          wm = clamp01((yn - (0.58 - wdt)) / (2 * wdt));
          wm += 0.025 * Math.sin(t * 0.5 + yn * 2.2);
        }
        wm = clamp01(wm);
        // Held down in orbit: a saturated warm slab at the bottom of the RIGHT
        // tube reads from the back row as settled sediment, which is the exact
        // opposite of the point. The interface line below carries the layering.
        const bandK = ground ? 1 : 0.5;
        g.rect(x0 + 3, bTop + i * bH, FLOW_W - 6, bH + 0.6).fill({
          color: lerpColor(palette.cold, palette.warm, wm),
          alpha: (0.03 + 0.072 * Math.abs(wm - 0.5) * 2) * bandK,
        });
      }

      // In orbit the density interface survives the thaw intact, so it is drawn
      // as a boundary — a ruled line, not a heap.
      if (!ground) {
        const iy = LIQ_TOP + FLOW_H * 0.58 + 1.3 * Math.sin(t * 0.4);
        for (let i = 0; i < 13; i++) {
          const dx0 = x0 + 10 + i * ((FLOW_W - 20) / 13);
          g.moveTo(dx0, iy).lineTo(dx0 + 14, iy);
        }
        g.stroke({
          width: 3,
          color: palette.cold,
          alpha: 0.34 + 0.12 * Math.sin(t * 0.9),
        });
      }

      // horizontal strata: torn into waves on the ground, ruler-flat in orbit
      const amp = ground ? 24 * Math.sin(t * 0.55) + 9 * Math.sin(t * 0.93 + 1.1) : 0;
      for (const yn of STRATA) {
        const yy = yn * FLOW_H;
        const sh = Math.sin(kyF * yy);
        for (let i = 0; i < NX; i++) {
          const xn = i / (NX - 1);
          const xx = xn * FLOW_W;
          const off = ground
            ? amp * Math.cos(kxF * xx) * sh
            : 0.9 * Math.sin(t * 0.35 + yn * 3.1);
          const px = x0 + xx;
          const py = LIQ_TOP + yy + off;
          if (i === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
      }
      g.stroke({ width: 3, color: palette.inkFaint, alpha: 0.4 });

      // free surface
      for (let i = 0; i < NX; i++) {
        const xn = i / (NX - 1);
        const wob = ground ? 2.6 * Math.sin(xn * 9.2 - t * 3.1) : 0;
        const px = x0 + xn * FLOW_W;
        const py = LIQ_TOP + dip * Math.sin(xn * Math.PI) + wob;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.stroke({
        width: 4,
        color: ground ? palette.inkDim : palette.cold,
        alpha: 0.9,
        cap: 'round',
      });

      // settle line, identical on both sides
      const sy = LIQ_BOT - 6;
      for (let i = 0; i < 12; i++) {
        const dx0 = x0 + 6 + i * ((FLOW_W - 12) / 12);
        g.moveTo(dx0, sy).lineTo(dx0 + 15, sy);
      }
      g.stroke({ width: 3, color: palette.inkFaint, alpha: 0.55 });

      // No pellet on either side. An earlier version grew one on the ground tube,
      // which was wrong: at 25 uL the gravitational length scale kT/(m'g) of about
      // 16.3 mm exceeds the liquid column, Stokes settling over 20 h is ~20 um
      // against ~0.80 mm of Brownian displacement, and Pe is about 0.61. Particles
      // do not sort by gravity here. The only honest difference between the two
      // tubes is bulk convective transport, which is drawn above.
    };

    // ------------------------------------------------------------------ frame
    return {
      view,

      update(frame, weight, progress) {
        const t = frame && typeof frame.time === 'number' ? frame.time : 0;
        const vals = (frame && frame.values) || {};
        const bloom = typeof vals.bloom === 'number' ? vals.bloom : 0.5;
        const p = clamp01(progress);
        const intro = cubicOut(clamp01(p / 0.16));
        const lab = clamp01(settle(clamp01(p / 0.3)));
        const flowOn = 0.45 + 0.55 * cubicOut(clamp01((p - 0.05) / 0.26));
        const breath = 1 + 0.0035 * Math.sin(t * 0.47);
        const sc = breath * (0.988 + 0.012 * intro);

        groupL.scale.set(sc);
        groupR.scale.set(sc);
        groupL.position.set(cxL, GROUP_CY + 1.6 * Math.sin(t * 0.31));
        groupR.position.set(cxR, GROUP_CY + 1.6 * Math.sin(t * 0.31 + 2.1));

        // lettering
        const la = (0.55 + 0.45 * lab) * (0.95 + 0.05 * Math.sin(t * 0.9));
        titleL.alpha = la;
        titleR.alpha = la;
        subL.alpha = la * (0.78 + 0.16 * Math.sin(t * 1.3));
        subR.alpha = la * (0.78 + 0.16 * Math.sin(t * 1.3 + Math.PI));
        const rise = TITLE_RISE * (1 - lab);
        titleL.y = TITLE_Y - rise;
        titleR.y = TITLE_Y - rise;
        subL.y = SUB_Y - rise * 0.7;
        subR.y = SUB_Y - rise * 0.7;

        // divider life
        gDiv.alpha = 0.5 + 0.5 * intro;
        const fr = (t * 0.085) % 1;
        const env = fr < 0.5 ? sineInOut(fr * 2) : sineInOut((1 - fr) * 2);
        const py0 = DIV_TOP + (DIV_BOT - DIV_TOP) * fr;
        const clampY = (y) => (y < DIV_TOP ? DIV_TOP : y > DIV_BOT ? DIV_BOT : y);
        gDivPulse.clear();
        gDivPulse
          .moveTo(divX, clampY(py0 - 54))
          .lineTo(divX, clampY(py0 + 54))
          .stroke({ width: 3, color: palette.signal, alpha: 0.5 * env * intro });
        gDivPulse
          .moveTo(divX, clampY(py0 - 16))
          .lineTo(divX, clampY(py0 + 16))
          .stroke({ width: 5, color: palette.signal, alpha: 0.85 * env * intro });
        gNode.rotation = t * 0.34;
        gNode.scale.set(0.86 + 0.14 * Math.sin(t * 1.15));
        gNode.alpha = 0.5 + 0.5 * intro;

        specL.alpha = 0.5 + 0.5 * Math.abs(Math.sin(t * 0.23));
        specR.alpha = 0.5 + 0.5 * Math.abs(Math.sin(t * 0.23 + 1.4));
        tubeL.alpha = 0.62 + 0.38 * intro;
        tubeR.alpha = 0.62 + 0.38 * intro;

        drawLiquid(liqL, cxL, xL, true, t, p);
        drawLiquid(liqR, cxR, xR, false, t, p);

        gStream.alpha = flowOn * (0.62 + 0.16 * Math.sin(t * 0.8)) * (0.5 + 0.5 * bloom);

        // ---- left: everything is carried by the flow
        for (let i = 0; i < suspL.length; i++) {
          const d = suspL[i];
          const L = loops[d.loop];
          sampleLoop(L, t / L.sec + d.phase, smp);
          d.g.position.set(xL + smp[0], LIQ_TOP + smp[1]);
          const stepScale = L.nat / L.xs.length;
          const up = clamp01(0.5 - (smp[3] / stepScale) * 0.5);
          d.g.tint = lerpColor(palette.cold, palette.warm, up);
          d.g.alpha = d.base * flowOn * (0.78 + 0.22 * Math.sin(t * d.tw + d.tp));
          d.g.scale.set(0.85 + 0.3 * up);
        }

        for (let i = 0; i < heavyL.length; i++) {
          const d = heavyL[i];
          const u = (((t + d.off) / d.cycle) % 1 + 1) % 1;
          const q = clamp01(u * 2.0);
          const n = d.traj.xs.length;
          const fi = q * (n - 1);
          const i0 = Math.min(n - 2, Math.floor(fi));
          const f = fi - i0;
          const px = d.traj.xs[i0] + (d.traj.xs[i0 + 1] - d.traj.xs[i0]) * f;
          const pyy = d.traj.ys[i0] + (d.traj.ys[i0 + 1] - d.traj.ys[i0]) * f;
          const rest = q >= 1 ? 1 : 0;
          d.g.position.set(
            xL + px + rest * 1.6 * Math.sin(t * d.jw + d.jp),
            LIQ_TOP + pyy + rest * 1.1 * Math.sin(t * d.jw * 0.7 + d.jp)
          );
          let a = 1;
          if (u < 0.05) a = u / 0.05;
          else if (u > 0.82) a = 1 - clamp01((u - 0.82) / 0.14);
          d.g.alpha = a * (0.55 + 0.45 * intro);
          d.g.scale.set(0.92 + 0.12 * Math.sin(t * 1.6 + d.jp));
        }

        const turns = p * 2.6;
        for (let i = 0; i < traceL.length; i++) {
          const d = traceL[i];
          sampleLoop(d.L, turns * (refSec / d.L.sec), smp);
          d.g.position.set(xL + smp[0], LIQ_TOP + smp[1]);
          d.g.alpha = (0.6 + 0.4 * Math.sin(t * d.sw + d.sp2)) * (0.45 + 0.55 * intro);
          d.g.scale.set(0.85 + 0.2 * Math.sin(t * 1.9 + d.sp2));
        }

        // comets: two per roll, the outer one trailing the inner
        gFlow.clear();
        for (let c = 0; c < 4; c++) {
          for (let k = 0; k < 2; k++) {
            const L = loops[c * 3 + 1 + k];
            const head = t / L.sec + c * 0.25 + k * 0.5;
            sampleLoop(L, head, smp);
            const stepScale = L.nat / L.xs.length;
            const upRaw = clamp01(0.5 - (smp[3] / stepScale) * 0.5);
            // polarise so a rising arm reads warm and a falling arm reads cold
            const up = clamp01((upRaw - 0.5) * 2.3 + 0.5);
            const col = lerpColor(palette.cold, palette.warm, up);
            const bright = k === 0 ? 1 : 0.62;
            const tiers = [
              [0.32, 5, 0.2],
              [0.18, 7, 0.5],
              [0.08, 9, 1.0],
            ];
            for (let ti = 0; ti < tiers.length; ti++) {
              const span = tiers[ti][0];
              const segs = 14;
              for (let sIdx = 0; sIdx <= segs; sIdx++) {
                sampleLoop(L, head - span * (1 - sIdx / segs), smp);
                const X = xL + smp[0];
                const Y = LIQ_TOP + smp[1];
                if (sIdx === 0) gFlow.moveTo(X, Y);
                else gFlow.lineTo(X, Y);
              }
              gFlow.stroke({
                width: tiers[ti][1],
                color: col,
                alpha: tiers[ti][2] * bright * flowOn,
                cap: 'round',
                join: 'round',
              });
            }
            // arrowhead
            sampleLoop(L, head, smp);
            const hx = xL + smp[0];
            const hy = LIQ_TOP + smp[1];
            const m = Math.hypot(smp[2], smp[3]) || 1;
            const tx = smp[2] / m;
            const ty = smp[3] / m;
            const nx = -ty;
            const ny = tx;
            gFlow
              .moveTo(hx - tx * 23 + nx * 14, hy - ty * 23 + ny * 14)
              .lineTo(hx + tx * 8, hy + ty * 8)
              .lineTo(hx - tx * 23 - nx * 14, hy - ty * 23 - ny * 14)
              .stroke({
                width: 7,
                color: col,
                alpha: 1.0 * bright * flowOn,
                cap: 'round',
                join: 'round',
              });
          }
        }

        // ---- right: station keeping only
        const bulkX = 1.7 * Math.sin(t * 0.11);
        const bulkY = 1.3 * Math.cos(t * 0.09);
        for (let i = 0; i < suspR.length; i++) {
          const d = suspR[i];
          d.g.position.set(
            d.hx + bulkX + d.a * Math.sin(t * d.w1 + d.p1) + d.b * Math.sin(t * d.w2 + d.p2),
            d.hy + bulkY + d.a * Math.sin(t * d.w3 + d.p3) + d.b * Math.sin(t * d.w4 + d.p4)
          );
          d.g.alpha = d.base * flowOn * (0.78 + 0.22 * Math.sin(t * d.tw + d.tp));
          d.g.scale.set(0.95 + 0.08 * Math.sin(t * d.tw * 1.3 + d.tp));
        }

        for (let i = 0; i < heavyR.length; i++) {
          const d = heavyR[i];
          d.g.position.set(
            d.hx + bulkX + d.a * Math.sin(t * d.w1 + d.p1) + d.b * Math.sin(t * d.w2 + d.p2),
            d.hy + bulkY + d.a * Math.sin(t * d.w3 + d.p3) + d.b * Math.sin(t * d.w4 + d.p4)
          );
          d.g.alpha = 0.55 + 0.45 * intro;
          d.g.scale.set(0.94 + 0.1 * Math.sin(t * 1.4 + d.p1));
        }

        const rad = R_MAX * Math.sqrt(0.05 + 0.95 * p);
        for (let i = 0; i < traceR.length; i++) {
          const d = traceR[i];
          d.g.position.set(
            d.bx + bulkX + d.dx * rad * d.rf + d.a * Math.sin(t * d.w1 + d.p1),
            d.by + bulkY + d.dy * rad * d.rf + d.a * Math.sin(t * d.w2 + d.p2)
          );
          d.g.alpha = (0.6 + 0.4 * Math.sin(t * d.w1 + d.p2)) * (0.45 + 0.55 * intro);
          d.g.scale.set(0.85 + 0.2 * Math.sin(t * 1.9 + d.p1));
        }

        gRings.clear();
        for (let bi = 0; bi < blobs.length; bi++) {
          const B = blobs[bi];
          const bx = xR + B.x + bulkX;
          const by = LIQ_TOP + B.y + bulkY;
          const mults = [0.55, 0.85, 1.15];
          for (let mi = 0; mi < mults.length; mi++) {
            const rr2 = rad * mults[mi] * (1 + 0.02 * Math.sin(t * 0.8 + mi));
            gRings.circle(bx, by, rr2).stroke({
              width: 3,
              color: palette.signal,
              alpha: (0.3 - mi * 0.09) * (0.5 + 0.5 * intro),
            });
          }
        }
      },
    };
  },
};
