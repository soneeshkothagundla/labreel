/**
 * PixiJS renderer adapter.
 *
 * Scenes are plain modules implementing:
 *   { id, build(ctx) -> { view, update(frame, weight, progress), destroy? } }
 *
 * The adapter owns the stage, the beat-weighted cross-dissolve between scenes,
 * and the persistent overlay (title, readout, transport). Scenes only draw.
 *
 * Contrast note, since this is built to survive a conference projector: the
 * palette below is deliberately high-key on a near-black ground. Venue
 * projectors crush the bottom two stops and wash the top one, so everything
 * that must be readable sits between 25% and 90% luminance, and nothing
 * important is encoded in colour alone.
 */

import { makeLayout, scaleLabelAt } from '../core/layout.js';

export const PALETTE = {
  void: 0x05070a,
  ground: 0x0b1015,
  panel: 0x121a22,
  grid: 0x1d2833,
  rule: 0x2c3a47,

  ink: 0xf2f7fb,
  inkDim: 0x93a4b3,
  inkFaint: 0x5a6b7a,

  signal: 0x1fff7e, // GFP green, the brand accent
  signalDim: 0x0f7a3d,
  cold: 0x6ec6ff, // frozen / cryo
  warm: 0xffb347, // thaw / detergent
  alert: 0xff5c5c,
  lipid: 0xffd166,
};

const DEFAULT_FONT =
  'Inter, "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif';
const MONO_FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export class PixiRenderer {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.mount
   * @param {object} opts.PIXI      The pixi.js module namespace.
   * @param {Array}  opts.scenes    Scene modules, matched to beats by id.
   * @param {number} [opts.width]
   * @param {number} [opts.height]
   * @param {object} [opts.palette]
   */
  constructor({ mount, PIXI, scenes = [], width, height, palette = {} }) {
    if (!mount) throw new Error('PixiRenderer: mount element required');
    if (!PIXI) throw new Error('PixiRenderer: pass the pixi.js namespace');
    this.PIXI = PIXI;
    this.mount = mount;
    this.palette = { ...PALETTE, ...palette };
    this.sceneModules = scenes;
    this.scenes = new Map();
    this.width = width ?? mount.clientWidth ?? 1920;
    this.height = height ?? mount.clientHeight ?? 1080;
    this.ready = false;
  }

  async init() {
    const { PIXI } = this;
    this.app = new PIXI.Application();
    await this.app.init({
      width: this.width,
      height: this.height,
      background: this.palette.void,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: 'webgl', // webgpu is faster but still uneven on venue laptops
      autoStart: false, // the Transport owns the clock, not Pixi's ticker
    });
    this.canvas = this.app.canvas;
    this.mount.appendChild(this.canvas);

    this.root = new PIXI.Container();
    this.sceneLayer = new PIXI.Container();
    this.overlay = new PIXI.Container();
    this.root.addChild(this.sceneLayer, this.overlay);
    this.app.stage.addChild(this.root);

    const ctx = {
      PIXI,
      palette: this.palette,
      width: this.width,
      height: this.height,
      // Scenes are authored against the 1920x1080 master, not the surface the
      // renderer happens to be running at, so the layout is built from the
      // design box and letterboxed by resize().
      layout: makeLayout(1920, 1080),
      font: DEFAULT_FONT,
      mono: MONO_FONT,
      text: (str, opts = {}) => this._text(str, opts),
    };
    this.ctx = ctx;

    for (const mod of this.sceneModules) {
      const scene = mod.build(ctx);
      scene.view.visible = false;
      scene.view.alpha = 0;
      this.sceneLayer.addChild(scene.view);
      this.scenes.set(mod.id, scene);
    }

    this._buildOverlay();
    this.ready = true;
    return this;
  }

  _text(str, { size = 24, color, weight = '400', mono = false, letterSpacing = 0 } = {}) {
    const { PIXI } = this;
    return new PIXI.Text({
      text: str,
      style: new PIXI.TextStyle({
        fontFamily: mono ? MONO_FONT : DEFAULT_FONT,
        fontSize: size,
        fontWeight: weight,
        fill: color ?? this.palette.ink,
        letterSpacing,
      }),
    });
  }

  _buildOverlay() {
    const { PIXI } = this;
    const L = this.ctx.layout;
    const { W, H, pad, titleBand, readout, rail } = L;

    /* -- title lane occluder ----------------------------------------------
       Four of the scenes in this reel predate the layout contract and draw
       straight into the 1920x1080 box, so their axis labels, legends and scale
       bars ran down through the title. Porting each of them is a rewrite of
       several thousand lines; enforcing the lane here fixes all of them at
       once and, more importantly, makes it impossible for the next scene
       someone writes to reintroduce the problem.

       The ramp is short and the floor is effectively opaque: a half-transparent
       scrim is what let the spectrum plot's wavelength axis stay legible
       underneath "Nothing has flown yet". */
    const scrim = new PIXI.Graphics();
    const rampTop = titleBand.y - Math.round(pad * 0.85);
    const rampH = Math.round(pad * 1.15);
    const bands = 22;
    for (let i = 0; i < bands; i++) {
      const t0 = i / bands;
      const t1 = (i + 1) / bands;
      scrim
        .rect(0, rampTop + rampH * t0, W, rampH / bands + 1)
        .fill({ color: this.palette.void, alpha: 0.985 * t1 * t1 });
    }
    scrim
      .rect(0, rampTop + rampH - 1, W, H - rampTop - rampH + 2)
      .fill({ color: this.palette.void, alpha: 0.985 });
    this.overlay.addChild(scrim);

    /* -- title lane --------------------------------------------------------
       One pair of type, and its opacity is derived from the lead beat's own
       boundaries rather than from beat weight.

       Two earlier attempts failed here and are worth recording. Driving the
       type off beat weight hard-swapped the string mid-dissolve, so the words
       named one scene while two were on screen. Giving each beat its own slot
       and cross-fading them was worse: both slots share a baseline, so the
       outgoing and incoming strings rendered on top of each other and the
       lower third turned to mush for the whole dissolve.

       Type cannot cross-dissolve with type in the same position. It has to
       dip: out, gap, in. Ramping on the lead beat's start and end does that,
       and because it is a pure function of reel time it survives scrubbing. */
    this.titleText = this._text('', { size: Math.round(H * 0.052), weight: '600' });
    this.titleText.position.set(titleBand.x, titleBand.y + Math.round(pad * 0.5));

    this.subText = this._text('', {
      size: Math.round(H * 0.026),
      color: this.palette.inkDim,
    });
    this.subText.position.set(
      titleBand.x,
      titleBand.y + Math.round(pad * 0.5) + Math.round(H * 0.052 * 1.32)
    );
    this.overlay.addChild(this.titleText, this.subText);

    this.readout = this._text('', {
      size: Math.round(H * 0.024),
      color: this.palette.signal,
      mono: true,
      letterSpacing: 1.5,
    });
    this.readout.anchor.set(1, 0);
    this.readout.position.set(readout.x + readout.w, readout.y);
    this.overlay.addChild(this.readout);

    /* -- scale rail --------------------------------------------------------
       The film's only persistent chrome. A first-time viewer has no idea
       whether they are looking at something 80 nanometres or 400 kilometres
       across, and the reel moves between those two in ninety seconds. The rail
       answers that continuously so the narration never has to. */
    this.railGfx = new PIXI.Graphics();
    this.overlay.addChild(this.railGfx);

    this.railLabel = this._text('', {
      size: Math.round(H * 0.021),
      color: this.palette.cold,
      mono: true,
      letterSpacing: 1,
    });
    this.railLabel.anchor.set(1, 0.5);
    this.overlay.addChild(this.railLabel);

    this.railCap = this._text('SCALE', {
      size: Math.round(H * 0.013),
      color: this.palette.inkFaint,
      mono: true,
      letterSpacing: 2.4,
    });
    this.railCap.anchor.set(0.5, 1);
    this.railCap.position.set(rail.x + rail.w / 2, rail.y - Math.round(H * 0.016));
    this.overlay.addChild(this.railCap);

    // Progress hairline. No scrubber handle, no buttons: this reel never stops.
    this.progressBg = new PIXI.Graphics();
    this.progressBg.rect(pad, H - Math.round(pad * 0.5), W - pad * 2, 2).fill({
      color: this.palette.rule,
    });
    this.progressFg = new PIXI.Graphics();
    this.overlay.addChild(this.progressBg, this.progressFg);
  }

  /** Draw the scale rail for a given camera depth (0 nano .. 1 orbital). */
  _drawRail(depth) {
    const L = this.ctx.layout;
    const { rail } = L;
    const g = this.railGfx;
    const d = Math.max(0, Math.min(1, depth));

    g.clear();

    // Axis. Nano at the bottom, orbital at the top, so "zooming out" reads as
    // travelling up the rail, which matches the way the camera actually moves.
    const axisX = rail.x + rail.w - 1;
    g.moveTo(axisX, rail.y).lineTo(axisX, rail.y + rail.h).stroke({
      width: 1,
      color: this.palette.rule,
    });

    for (let i = 0; i <= 10; i++) {
      const y = rail.y + rail.h * (i / 10);
      const major = i % 5 === 0;
      g.moveTo(axisX - (major ? 12 : 6), y)
        .lineTo(axisX, y)
        .stroke({ width: 1, color: this.palette.rule, alpha: major ? 0.9 : 0.5 });
    }

    const markerY = rail.y + rail.h * (1 - d);
    g.moveTo(rail.x, markerY).lineTo(axisX, markerY).stroke({
      width: 1,
      color: this.palette.cold,
      alpha: 0.55,
    });
    g.circle(axisX, markerY, 4.5).fill({ color: this.palette.cold });
    g.circle(axisX, markerY, 9).stroke({ width: 1, color: this.palette.cold, alpha: 0.35 });

    this.railLabel.position.set(rail.x - Math.round(L.pad * 0.18), markerY);
    const label = scaleLabelAt(d);
    if (this.railLabel.text !== label) this.railLabel.text = label;
  }

  /** Called once per frame by Transport. */
  render(frame) {
    if (!this.ready) return;

    for (const [id, scene] of this.scenes) {
      const hit = frame.active.find((a) => a.beat.id === id);
      if (hit) {
        scene.view.visible = true;
        // Constant-power crossfade. With a linear envelope both scenes sit near
        // half alpha through the middle of a dissolve, and two half-strength
        // subjects on a near-black ground read as one muddy picture rather than
        // as either of them. sin() keeps the pair closer to full brightness.
        scene.view.alpha = Math.sin(hit.weight * Math.PI * 0.5);
        scene.update?.(frame, hit.weight, hit.progress);
      } else if (scene.view.visible) {
        scene.view.visible = false;
        scene.view.alpha = 0;
      }
    }

    // The lead beat owns the lane outright. Swapping the string only while
    // the lane is invisible is what keeps two titles from ever coexisting.
    const lead = frame.lead;
    if (lead) {
      const b = lead.beat;
      const T = 0.55; // dip length at each end, seconds
      const inA = (frame.time - b.at) / T;
      const outA = (b.end - frame.time) / T;
      const a = Math.max(0, Math.min(1, inA, outA));

      // No latch on the swap. An earlier version only changed the string while
      // the lane was already invisible, which is correct during playback and
      // completely wrong under a seek: jumping straight to the middle of a beat
      // left the previous title latched and the lane blank for the whole beat.
      // None of that bookkeeping is needed, because the lead beat only changes
      // at a boundary and `a` is already 0 there from both sides, so the text
      // is swapped while invisible for free.
      if (this.titleText.text !== b.title) this.titleText.text = b.title;
      if (this.subText.text !== b.subtitle) this.subText.text = b.subtitle;
      this.titleText.alpha = a;
      this.subText.alpha = a * 0.85;

      const r = b.data?.readout ?? '';
      if (this.readout.text !== r) this.readout.text = r;
      this.readout.alpha = a * 0.9;
    }

    const L = this.ctx.layout;
    const railAlpha = frame.values?.railFade ?? 1;
    this._drawRail(frame.values?.depth ?? 0);
    this.railGfx.alpha = railAlpha;
    this.railLabel.alpha = railAlpha;
    this.railCap.alpha = railAlpha * 0.8;

    this.progressFg
      .clear()
      .rect(
        L.pad,
        L.H - Math.round(L.pad * 0.5),
        (L.W - L.pad * 2) * frame.progress,
        2
      )
      .fill({ color: this.palette.signal });

    this.app.renderer.render(this.app.stage);
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.app?.renderer.resize(width, height);
    // Scenes are authored against a 16:9 design box and letterboxed, so a
    // projector at an unexpected aspect never crops the readout.
    const scale = Math.min(width / 1920, height / 1080);
    this.root.scale.set(scale);
    this.root.position.set(
      (width - 1920 * scale) / 2,
      (height - 1080 * scale) / 2
    );
  }

  destroy() {
    for (const s of this.scenes.values()) s.destroy?.();
    this.app?.destroy(true, { children: true });
  }
}
