/**
 * Easing functions, all normalised f(0) = 0, f(1) = 1.
 *
 * These are deliberately duplicated from GSAP rather than imported: the core
 * of labreel has zero runtime dependencies, so a Canvas2D-only consumer never
 * has to install GSAP at all. The Pixi/GSAP adapter is opt-in.
 */

export const linear = (t) => t;

export const quadIn = (t) => t * t;
export const quadOut = (t) => t * (2 - t);
export const quadInOut = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

export const cubicIn = (t) => t * t * t;
export const cubicOut = (t) => 1 - Math.pow(1 - t, 3);
export const cubicInOut = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const quartOut = (t) => 1 - Math.pow(1 - t, 4);
export const quintOut = (t) => 1 - Math.pow(1 - t, 5);

export const sineIn = (t) => 1 - Math.cos((t * Math.PI) / 2);
export const sineOut = (t) => Math.sin((t * Math.PI) / 2);
export const sineInOut = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

export const expoOut = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const expoInOut = (t) => {
  if (t === 0) return 0;
  if (t === 1) return 1;
  return t < 0.5
    ? Math.pow(2, 20 * t - 10) / 2
    : (2 - Math.pow(2, -20 * t + 10)) / 2;
};

export const circOut = (t) => Math.sqrt(1 - Math.pow(t - 1, 2));

export const backOut = (t, overshoot = 1.70158) =>
  1 + (overshoot + 1) * Math.pow(t - 1, 3) + overshoot * Math.pow(t - 1, 2);

export const elasticOut = (t, amplitude = 1, period = 0.3) => {
  if (t === 0 || t === 1) return t;
  const s = (period / (2 * Math.PI)) * Math.asin(1 / Math.max(amplitude, 1));
  return (
    amplitude * Math.pow(2, -10 * t) * Math.sin(((t - s) * (2 * Math.PI)) / period) + 1
  );
};

/**
 * Critically-damped spring settle. Unlike elastic it never overshoots twice,
 * which matters when a label snaps into place next to a number a room is
 * trying to read.
 */
export const settle = (t) => 1 - Math.exp(-6 * t) * Math.cos(3 * t);

export const EASINGS = {
  linear,
  quadIn, quadOut, quadInOut,
  cubicIn, cubicOut, cubicInOut,
  quartOut, quintOut,
  sineIn, sineOut, sineInOut,
  expoOut, expoInOut,
  circOut, backOut, elasticOut, settle,
};

/** Resolve a string name or function to an easing function. */
export function resolveEase(ease) {
  if (typeof ease === 'function') return ease;
  if (typeof ease === 'string' && EASINGS[ease]) return EASINGS[ease];
  return linear;
}

/** Linear interpolation. */
export const lerp = (a, b, t) => a + (b - a) * t;

/** Map v from [inMin,inMax] to [outMin,outMax] without clamping. */
export const remap = (v, inMin, inMax, outMin, outMax) =>
  outMin + ((v - inMin) / (inMax - inMin)) * (outMax - outMin);

export const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));

export const clamp01 = (v) => clamp(v, 0, 1);

/**
 * Normalised progress of `time` within [start, start+duration], eased.
 * Returns 0 before the window and 1 after it, so cues hold their end state.
 */
export function progress(time, start, duration, ease = linear) {
  if (duration <= 0) return time >= start ? 1 : 0;
  return resolveEase(ease)(clamp01((time - start) / duration));
}
