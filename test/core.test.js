import test from 'node:test';
import assert from 'node:assert/strict';
import { Clock } from '../src/core/clock.js';
import { Beat, Track, Reel } from '../src/core/reel.js';
import { progress, clamp01, remap, settle } from '../src/core/easing.js';

test('fixed clock is deterministic and rate-aware', () => {
  const a = new Clock({ mode: 'fixed', fps: 30 }).start();
  const b = new Clock({ mode: 'fixed', fps: 30 }).start();
  for (let i = 0; i < 90; i++) {
    a.tick(Math.random() * 1e6);
    b.tick(0);
  }
  assert.equal(a.time, b.time, 'wall clock must not affect fixed mode');
  assert.equal(a.frame, 90);
  assert.ok(Math.abs(a.time - 3) < 1e-9);

  const half = new Clock({ mode: 'fixed', fps: 30, rate: 0.5 }).start();
  for (let i = 0; i < 30; i++) half.tick();
  assert.ok(Math.abs(half.time - 0.5) < 1e-9);
});

test('realtime clock clamps tab-restore jumps', () => {
  const c = new Clock({ mode: 'realtime' }).start(0);
  c.tick(0);
  c.tick(60_000); // 60s away
  assert.ok(c.time <= 0.25, `expected clamp, got ${c.time}`);
});

test('clock rejects invalid fps', () => {
  assert.throws(() => new Clock({ fps: 0 }), RangeError);
});

test('beat weight cross-dissolves at both edges', () => {
  const b = new Beat({ id: 'x', at: 10, duration: 4, fade: 1 });
  assert.equal(b.weightAt(8.5), 0);
  assert.equal(b.weightAt(9.5), 0.5);
  assert.equal(b.weightAt(12), 1);
  assert.equal(b.weightAt(14.5), 0.5);
  assert.equal(b.weightAt(15.5), 0);
  assert.equal(b.end, 14);
});

test('beat rejects non-positive duration', () => {
  assert.throws(() => new Beat({ id: 'x', at: 0, duration: 0 }), RangeError);
  assert.throws(() => new Beat({ at: 0, duration: 1 }), TypeError);
});

test('track chains cues, inferring `from` from the running value', () => {
  const t = new Track({
    key: 'zoom',
    initial: 1,
    cues: [
      { at: 0, duration: 2, to: 3 },
      { at: 4, duration: 2, to: 0.5 },
    ],
  });
  assert.equal(t.valueAt(0), 1);
  assert.equal(t.valueAt(1), 2);
  assert.equal(t.valueAt(2), 3);
  assert.equal(t.valueAt(3), 3, 'holds between cues');
  assert.equal(t.valueAt(5), 1.75);
  assert.equal(t.valueAt(99), 0.5, 'holds final value');
  assert.equal(t.end, 6);
});

test('track sorts out-of-order cues', () => {
  const t = new Track({
    key: 'k',
    initial: 0,
    cues: [
      { at: 5, duration: 1, to: 10 },
      { at: 0, duration: 1, to: 2 },
    ],
  });
  assert.equal(t.cues[0].at, 0);
  assert.equal(t.valueAt(1), 2);
});

test('reel refuses to build with a hole in the timeline', () => {
  assert.throws(
    () =>
      new Reel({
        id: 'holed',
        beats: [
          { id: 'a', at: 0, duration: 2 },
          { id: 'b', at: 9, duration: 2 },
        ],
      }),
    /gap from 2s to 9s/
  );
});

test('reel refuses to start late', () => {
  assert.throws(
    () => new Reel({ id: 'late', beats: [{ id: 'a', at: 3, duration: 2 }] }),
    /gap from 0s to 3s/
  );
});

test('reel accepts overlapping beats', () => {
  const r = new Reel({
    id: 'ok',
    beats: [
      { id: 'a', at: 0, duration: 5 },
      { id: 'b', at: 3, duration: 5 },
    ],
  });
  assert.equal(r.duration, 8);
});

test('reel loops seamlessly and reports cycle index', () => {
  const r = new Reel({
    id: 'loop',
    beats: [{ id: 'a', at: 0, duration: 10 }],
  });
  assert.equal(r.localTime(0), 0);
  assert.equal(r.localTime(10), 0);
  assert.equal(r.localTime(25), 5);
  assert.equal(r.sample(25).cycle, 2);
  assert.equal(r.sample(-1).time, 9, 'negative time wraps forward');
});

test('sample surfaces the lead beat and its metadata', () => {
  const r = new Reel({
    id: 'meta',
    beats: [
      { id: 'freeze', at: 0, duration: 6, fade: 1, title: 'Freeze', data: { temp: '-80 C' } },
      { id: 'launch', at: 5, duration: 6, fade: 1, title: 'Launch' },
    ],
    tracks: [{ key: 'glow', initial: 0, cues: [{ at: 0, duration: 4, to: 1 }] }],
  });
  const f = r.sample(2);
  assert.equal(f.lead.beat.id, 'freeze');
  assert.equal(f.lead.beat.data.temp, '-80 C');
  assert.equal(f.values.glow, 0.5);

  const overlap = r.sample(5.5);
  assert.equal(overlap.active.length, 2, 'both beats live during the dissolve');
});

test('easing helpers behave at the boundaries', () => {
  assert.equal(clamp01(-4), 0);
  assert.equal(clamp01(9), 1);
  assert.equal(remap(5, 0, 10, 0, 100), 50);
  assert.equal(progress(5, 0, 10), 0.5);
  assert.equal(progress(-3, 0, 10), 0, 'before window');
  assert.equal(progress(99, 0, 10), 1, 'holds after window');
  assert.equal(progress(3, 3, 0), 1, 'zero duration is a step');
  assert.ok(Math.abs(settle(0)) < 1e-9);
  assert.ok(Math.abs(settle(1) - 1) < 0.05);
});
