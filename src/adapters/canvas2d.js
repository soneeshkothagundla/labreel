import { PALETTE } from './pixi.js';

/**
 * Zero-dependency Canvas2D renderer.
 *
 * This is the fallback path, and it exists for one specific reason: WebGL is
 * disabled or software-emulated more often than you would expect on machines
 * you do not control (locked-down conference laptops, remote desktop, older
 * integrated GPUs with blocklisted drivers). When that happens a Pixi app
 * either fails to init or runs at 4 fps.
 *
 * Scenes for this adapter implement the same shape as the Pixi ones but draw
 * imperatively:
 *   { id, draw(ctx2d, frame, weight, progress, env) }
 *
 * It is intentionally less capable. It is not meant to be as pretty; it is
 * meant to still be running when the nice one cannot.
 */

const hex = (n, alpha = 1) => {
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
};

export { hex as toCssColor };

/** Feature-detects a usable WebGL context. Cheap, runs once. */
export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return false;
    // A software rasteriser reports itself here on most Chromium builds.
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) {
      const name = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
      if (/swiftshader|llvmpipe|software/i.test(name)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export class Canvas2DRenderer {
  constructor({ mount, scenes = [], width = 1920, height = 1080, palette = {} }) {
    if (!mount) throw new Error('Canvas2DRenderer: mount element required');
    this.mount = mount;
    this.palette = { ...PALETTE, ...palette };
    this.scenes = new Map(scenes.map((s) => [s.id, s]));
    this.width = width;
    this.height = height;
  }

  async init() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.mount.appendChild(this.canvas);
    this.ready = true;
    return this;
  }

  render(frame) {
    const c = this.ctx;
    const { width: w, height: h, palette: p } = this;

    c.fillStyle = hex(p.void);
    c.fillRect(0, 0, w, h);

    const env = { palette: p, width: w, height: h, hex };

    for (const { beat, weight, progress } of frame.active) {
      const scene = this.scenes.get(beat.id);
      if (!scene) continue;
      c.save();
      c.globalAlpha = weight;
      scene.draw(c, frame, weight, progress, env);
      c.restore();
    }

    this._overlay(frame);
  }

  _overlay(frame) {
    const c = this.ctx;
    const { width: w, height: h, palette: p } = this;
    const pad = Math.round(w * 0.045);
    const lead = frame.lead;

    if (lead) {
      const a = Math.min(1, lead.weight * 1.4);
      const b = lead.beat;

      c.textBaseline = 'alphabetic';
      c.textAlign = 'left';

      c.font = `600 ${Math.round(h * 0.052)}px Inter, Helvetica, Arial, sans-serif`;
      c.fillStyle = hex(p.ink, a);
      c.fillText(b.title ?? '', pad, h - pad - Math.round(h * 0.075));

      c.font = `400 ${Math.round(h * 0.026)}px Inter, Helvetica, Arial, sans-serif`;
      c.fillStyle = hex(p.inkDim, a * 0.85);
      c.fillText(b.subtitle ?? '', pad, h - pad - Math.round(h * 0.028));

      const readout = b.data?.readout;
      if (readout) {
        c.textAlign = 'right';
        c.font = `500 ${Math.round(h * 0.024)}px ui-monospace, Consolas, monospace`;
        c.fillStyle = hex(p.signal, a * 0.9);
        c.fillText(readout, w - pad, pad + Math.round(h * 0.024));
      }
    }

    c.fillStyle = hex(p.rule);
    c.fillRect(pad, h - pad, w - pad * 2, 2);
    c.fillStyle = hex(p.signal);
    c.fillRect(pad, h - pad, (w - pad * 2) * frame.progress, 2);
  }

  resize() {
    // Canvas is a fixed design box scaled by CSS, so there is nothing to do.
    // Keeping the method satisfies the renderer interface.
  }

  destroy() {
    this.canvas?.remove();
  }
}
