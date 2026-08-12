/**
 * labreel - choreograph scientific protocols as continuous motion graphics.
 *
 * Core has zero runtime dependencies. Renderer adapters are opt-in:
 *   import { PixiRenderer } from 'labreel/pixi'   (requires pixi.js + gsap)
 *   import { Canvas2DRenderer } from 'labreel/canvas'
 */

export { Clock } from './core/clock.js';
export { Beat, Track, Reel, Transport } from './core/reel.js';
export {
  captureReel,
  WebMSink,
  FramesSink,
  downloadBlob,
} from './core/capture.js';
export {
  EASINGS,
  resolveEase,
  lerp,
  remap,
  clamp,
  clamp01,
  progress,
  linear,
  quadIn, quadOut, quadInOut,
  cubicIn, cubicOut, cubicInOut,
  quartOut, quintOut,
  sineIn, sineOut, sineInOut,
  expoOut, expoInOut,
  circOut, backOut, elasticOut, settle,
} from './core/easing.js';

export const VERSION = '0.1.0';
