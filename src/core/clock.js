/**
 * Deterministic time source.
 *
 * Two modes:
 *   'realtime' - advances by wall-clock delta, clamped. Use for live playback.
 *   'fixed'    - advances by exactly 1/fps each tick, ignoring wall clock.
 *                Use for frame-exact video capture. Rendering the same reel
 *                twice in fixed mode produces byte-identical frames.
 *
 * The fixed mode is the reason this file exists. Every browser animation
 * library ties itself to requestAnimationFrame, which means you cannot
 * reproduce a render, and you cannot capture a smooth video on a machine
 * that is busy. A protocol animation is a scientific figure; it has to be
 * reproducible.
 */

const MAX_REALTIME_DELTA = 0.25; // seconds. Guards against tab-restore jumps.

export class Clock {
  /**
   * @param {object} [opts]
   * @param {'realtime'|'fixed'} [opts.mode='realtime']
   * @param {number} [opts.fps=60]   Only used in fixed mode.
   * @param {number} [opts.rate=1]   Playback rate multiplier.
   */
  constructor({ mode = 'realtime', fps = 60, rate = 1 } = {}) {
    if (fps <= 0) throw new RangeError('Clock: fps must be > 0');
    this.mode = mode;
    this.fps = fps;
    this.rate = rate;
    this.time = 0;
    this.frame = 0;
    this.running = false;
    this._last = null;
  }

  /** Total seconds elapsed, honouring rate. */
  get elapsed() {
    return this.time;
  }

  /** Fixed-mode step size in seconds. */
  get step() {
    return 1 / this.fps;
  }

  start(now = 0) {
    this.running = true;
    this._last = now;
    return this;
  }

  pause() {
    this.running = false;
    this._last = null;
    return this;
  }

  /**
   * Advance the clock.
   * @param {number} [now] Wall-clock ms. Ignored in fixed mode.
   * @returns {number} delta in seconds that was applied (0 if paused).
   */
  tick(now = 0) {
    if (!this.running) return 0;

    let delta;
    if (this.mode === 'fixed') {
      delta = this.step;
    } else {
      if (this._last === null) {
        this._last = now;
        return 0;
      }
      delta = (now - this._last) / 1000;
      this._last = now;
      // A backgrounded tab returns a huge delta. Clamping keeps the reel
      // from teleporting when the presenter alt-tabs back to the browser.
      if (delta > MAX_REALTIME_DELTA) delta = MAX_REALTIME_DELTA;
      if (delta < 0) delta = 0;
    }

    delta *= this.rate;
    this.time += delta;
    this.frame += 1;
    return delta;
  }

  /** Jump to an absolute time. Does not emit deltas. */
  seek(seconds) {
    this.time = Math.max(0, seconds);
    this.frame = Math.round(this.time * this.fps);
    return this;
  }

  reset() {
    this.time = 0;
    this.frame = 0;
    this._last = null;
    return this;
  }
}
