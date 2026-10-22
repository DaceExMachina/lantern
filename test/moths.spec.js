// How a moth flies toward a new target (src/scene/frame.ts's mothMove): it speeds up and slows down smoothly, the way the
// ghost moths and wisps glide, instead of snapping onto a new heading at full speed.
import assert from 'node:assert';
import { test } from 'vitest';
import { mothMove } from '../src/scene/frame';
import { GUST } from '../src/scene/lanterns';

// a moment the wind is still: the first time it changes sign, halved in on; and the first moment it blows about 1.6 to the right
let calm = 0, hi = 0.05, windy = 0;
while (Math.sign(GUST(hi)) === Math.sign(GUST(calm))) { calm = hi; hi += 0.05; }
for (let i = 0; i < 40; i++) { const mid = (calm + hi) / 2; if (Math.sign(GUST(mid)) === Math.sign(GUST(calm))) calm = mid; else hi = mid; }
while (!(GUST(windy) > 1.4 && GUST(windy) < 1.8)) windy += 0.05;

test('a moth whose target jumps eases off from rest, then glides in without overshooting', () => {
  const m = { x: 0, y: 0, phase: 0 }, aim = { tx: 100, ty: 0, ease: 2.4, needsMe: false }, dt = 1 / 60;
  assert.ok(Math.abs(GUST(calm)) < 1e-9, `the wind is still then: ${GUST(calm)}`);
  mothMove(m, aim, dt, calm);
  assert.ok(m.x > 0, `it does set off: ${m.x}`);
  assert.ok(m.x < 0.5, `the first frame barely moves it, rather than leaping at full speed: ${m.x}`);
  for (let t = dt; t < 4; t += dt) {
    mothMove(m, aim, dt, calm); // the clock held where the wind (GUST) is still, so only the easing moves it
    assert.ok(m.x <= 100, `no overshoot at ${t.toFixed(2)}s: ${m.x}`);
  }
  assert.ok(m.x > 95, `there within four seconds: ${m.x}`);
});

test('the wind pushes a flying moth a little downwind, never a landed one', () => {
  const s = windy, gust = GUST(s), dt = 1 / 60; // about 1.6: blowing to the right
  const fly = (needsMe) => { const m = { x: 100, y: 0, phase: 0 }; for (let i = 0; i < 300; i++) mothMove(m, { tx: 100, ty: 0, ease: 2.4, needsMe }, dt, s); return m.x - 100; };
  assert.ok(gust > 1, `the test's moment is a real gust: ${gust}`);
  const pushed = fly(false);
  assert.ok(pushed > 2 && pushed < 4, `a flying moth gives a few pixels: ${pushed}`);
  assert.ok(Math.abs(fly(true)) < 0.01, `a landed one holds its spot: ${fly(true)}`);
});
