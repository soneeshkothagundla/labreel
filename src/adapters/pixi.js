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
    const w = this.width;
    const h = this.height;
    const pad = Math.round(w * 0.045);

    // Vignette keeps the eye centre-frame under bright room light.
    const vignette = new PIXI.Graphics();
    vignette
      .rect(0, 0, w, h)
      .fill({
        color: this.palette.void,
        alpha: 0,
      });
    this.overlay.addChild(vignette);

    this.titleText = this._text('', { size: Math.round(h * 0.052), weight: '600' });
    this.titleText.position.set(pad, h - pad - Math.round(h * 0.11));
    this.overlay.addChild(this.titleText);

    this.subText = this._text('', {
      size: Math.round(h * 0.026),
      color: this.palette.inkDim,
    });
    this.subText.position.set(pad, h - pad - Math.round(h * 0.042));
    this.overlay.addChild(this.subText);

    this.readout = this._text('', {
      size: Math.round(h * 0.024),
      color: this.palette.signal,
      mono: true,
      letterSpacing: 1.5,
    });
    this.readout.anchor.set(1, 0);
    this.readout.position.set(w - pad, pad);
    this.overlay.addChild(this.readout);

    // Progress hairline. No scrubber handle, no buttons: this reel never stops.
    this.progressBg = new PIXI.Graphics();
    this.progressBg.rect(pad, h - pad, w - pad * 2, 2).fill({
      color: this.palette.rule,
    });
    this.progressFg = new PIXI.Graphics();
    this.overlay.addChild(this.progressBg, this.progressFg);
  }

  /** Called once per frame by Transport. */
  render(frame) {
    if (!this.ready) return;

    for (const [id, scene] of this.scenes) {
      const hit = frame.active.find((a) => a.beat.id === id);
      if (hit) {
        scene.view.visible = true;
        scene.view.alpha = hit.weight;
        scene.update?.(frame, hit.weight, hit.progress);
      } else if (scene.view.visible) {
        scene.view.visible = false;
        scene.view.alpha = 0;
      }
    }

    const lead = frame.lead;
    if (lead) {
      const b = lead.beat;
      if (this.titleText.text !== b.title) this.titleText.text = b.title;
      if (this.subText.text !== b.subtitle) this.subText.text = b.subtitle;
      const r = b.data?.readout ?? '';
      if (this.readout.text !== r) this.readout.text = r;

      // Type fades with the beat so nothing pops on a hard cut.
      const a = Math.min(1, lead.weight * 1.4);
      this.titleText.alpha = a;
      this.subText.alpha = a * 0.85;
      this.readout.alpha = a * 0.9;
    }

    const pad = Math.round(this.width * 0.045);
    this.progressFg
      .clear()
      .rect(pad, this.height - pad, (this.width - pad * 2) * frame.progress, 2)
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
