// How ghost moths and wisps move (page/stale.js): they keep a clear spot rather than flicker between two, and they glide
// to a new one slowly, easing in and out.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const page = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'page', 'stale.js'), 'utf8'), page, { filename: 'stale.js' });
const { nextAim, settle, angleGap } = vm.runInContext('({ nextAim, settle, angleGap })', page);

test('a ghost keeps its spot until a moth crowds it, then moves clear and stays there', () => {
  const aim = 1;
  assert.strictEqual(nextAim(aim, 0, [[aim + 0.45, 0.42]]), aim, 'a moth just outside its slice leaves it be');
  const moved = nextAim(aim, 0, [[aim + 0.4, 0.42]]);
  assert.notStrictEqual(moved, aim, 'a moth whose slice covers it moves it');
  assert.ok(angleGap(moved, aim + 0.4) > 0.42 + 0.12 - 1e-9, `it moves with room to spare: ${moved}`);
  // the moth edges back out: the ghost doesn't snap back to where it was
  assert.strictEqual(nextAim(moved, 0, [[aim + 0.45, 0.42]]), moved);
});

test('the glide eases in, never overshoots, peaks slowly and settles in about ten seconds', () => {
  let x = 0, v = 0, peak = 0;
  const dt = 1 / 60;
  [x, v] = settle(x, v, 1, 0.5, dt);
  assert.ok(v < 0.01, `it starts from rest, not with a jump: ${v}`);
  for (let t = dt; t < 12; t += dt) {
    [x, v] = settle(x, v, 1, 0.5, dt);
    peak = Math.max(peak, v);
    assert.ok(x <= 1, `no overshoot at ${t.toFixed(2)}s: ${x}`);
  }
  assert.ok(peak < 0.19, `peak speed is under a fifth of the distance a second: ${peak}`);
  assert.ok(x > 0.98, `settled by 12s: ${x}`);
});

test('a long frame lands the glide exactly where many short ones would', () => {
  let [x, v] = [0, 0.1];
  for (let i = 0; i < 180; i++) [x, v] = settle(x, v, 1, 0.5, 1 / 60);
  const [x1, v1] = settle(0, 0.1, 1, 0.5, 3);
  assert.ok(Math.abs(x - x1) < 1e-9 && Math.abs(v - v1) < 1e-9, `3s in one step: ${x1}, ${v1}; in 180: ${x}, ${v}`);
});

test("with a standing lantern, no loose wisp's spot lands in the band its pedestal fills", () => {
  const stands = { half: 112, top: 461 }; // the candle's (lanterns.js): the slab's half-width, from the pan down
  Object.assign(page, { style: { stands }, VIEW: { ky: 1 }, moths: new Map() });
  for (const ky of [1, 1.6]) { // a square window and a tall one
    page.VIEW.ky = ky;
    // crowded past the room there is (living moths and ghosts take slices too), so some fall back to any clear spot
    const loose = Array.from({ length: 60 }, (_, i) => ({ pref: i * 6.283 / 60, dist: 180 + (i * 37) % 100 }));
    const at = d => [340 + Math.cos(d.aim) * d.dist, 320 + Math.sin(d.aim) * d.dist * 0.95 * ky]; // as driftTo places it, stretched down
    const inBand = ([x, y]) => Math.abs(x - 340) < stands.half && y > stands.top;
    assert.ok(loose.some(d => inBand(at({ ...d, aim: d.pref }))), 'some would start behind the pedestal');
    vm.runInContext('stalePlannedAt = -1', page);
    page.planStale(0, loose);
    for (const d of loose) assert.ok(!inBand(at(d)), `a wisp preferring ${d.pref.toFixed(2)} lands clear at ky ${ky}: ${at(d).map(v => v.toFixed(0))}`);
  }
  page.style = { stands: undefined }; // a hanging lantern leaves its spot be
  const d = { pref: Math.PI / 2, dist: 200 };
  vm.runInContext('stalePlannedAt = -1', page);
  page.planStale(0, [d]);
  assert.strictEqual(d.aim, d.pref);
});
