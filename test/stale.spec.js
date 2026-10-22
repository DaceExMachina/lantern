// How ghost moths and wisps move (src/scene/stale.js): they keep a clear spot rather than flicker between two, and they
// glide to a new one slowly, easing in and out.
import assert from 'node:assert';
import { afterEach, test, vi } from 'vitest';
import { layOut } from './page.js';
import { angleGap, nextAim, planStale, settle } from '../src/scene/stale.js';
import { VIEW } from '../src/scene/scene.js';
import * as lanterns from '../src/scene/lanterns.js';

afterEach(() => vi.restoreAllMocks());

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
  lanterns.applyStyle('candle'); // the standing lantern
  const stands = lanterns.style.stands; // the slab's half-width and the pan it starts from
  assert.ok(stands, 'the candle stands on a pedestal');
  let s = 0; // planStale plans twice a second at most, so each plan is a second on
  for (const ky of [1, 1.6]) { // a square window and a tall one
    VIEW.ky = ky;
    // crowded past the room there is (living moths and ghosts take slices too), so some fall back to any clear spot
    const loose = Array.from({ length: 60 }, (_, i) => ({ pref: i * 6.283 / 60, dist: 180 + (i * 37) % 100 }));
    const at = d => [340 + Math.cos(d.aim) * d.dist, 320 + Math.sin(d.aim) * d.dist * 0.95 * ky]; // as driftTo places it, stretched down
    const inBand = ([x, y]) => Math.abs(x - 340) < stands.half && y > stands.top;
    assert.ok(loose.some(d => inBand(at({ ...d, aim: d.pref }))), 'some would start behind the pedestal');
    planStale(s += 1, loose);
    for (const d of loose) assert.ok(!inBand(at(d)), `a wisp preferring ${d.pref.toFixed(2)} lands clear at ky ${ky}: ${at(d).map(v => v.toFixed(0))}`);
  }
  lanterns.applyStyle('barrel'); // a hanging lantern leaves its spot be
  assert.strictEqual(lanterns.style.stands, undefined);
  const d = { pref: Math.PI / 2, dist: 200 };
  planStale(s += 1, [d]);
  assert.strictEqual(d.aim, d.pref);
});

// The wisps and ghost moths are light and shapes in the background shader (flyLights and ghostWings, drawn by
// background.js), hovered through plain circles (card.js zones), so nothing in the scene's SVG moves for them.
const BASE = Date.UTC(2026, 9, 20, 12);
const NEEDS = ['ready', 'failing', 'draft', 'review', 'changes', 'quiet'];
const stale = NEEDS.map((need, i) => ({ url: `https://github.com/o/r/pull/${i}`, label: `#${i}`, title: `PR ${i}`, need, updatedAt: new Date(BASE - (8 + i) * 864e5).toISOString(),
  owner: i < 2 ? { id: 'old-session', title: 'Old session', last: BASE - 9 * 864e5 } : undefined })); // the first two made by one old session

// a window on the page afresh, its wall clock `clock.t` (Date.now is shared, so every screen in a test keeps the one clock)
async function screen(clock) {
  layOut(); vi.resetModules();
  vi.spyOn(Date, 'now').mockImplementation(() => clock.t);
  const [{ live }, st, card, fireflies, lanterns] = await Promise.all(['live', 'stale', 'card', 'fireflies', 'lanterns'].map(f => import(`../src/scene/${f}.js`)));
  live.stalePRs = JSON.parse(JSON.stringify(stale));
  // one frame, then what the shader would be handed: each light's x, y, radius, brightness, r, g, b, and the ghosts' wing corners
  const frame = (dt, s) => {
    st.drawStale(dt, s);
    const out = { lights: [...fireflies.flyLights.slice(0, 7 * live.flyLightN)], wings: [...st.ghostWings.slice(0, 3 * live.ghostWingN)] };
    live.flyLightN = 0; live.ghostWingN = 0;
    return out;
  };
  return { frame, w: { hex: lanterns.hex, mix: lanterns.mix, FLY: fireflies.FLY, WISP_TINT: st.WISP_TINT, GHOST_TRIS: st.GHOST_TRIS, zones: card.zones, zoneAt: card.zoneAt, wisps: st.wisps, ghosts: st.ghosts, off: () => { live.staleOn = false; } } };
}
test('every stale PR leaves a pale light for the shader, its old session a ghost moth, and turning them off leaves neither', async () => {
  const clock = { t: BASE }, { w, frame } = await screen(clock);
  let out;
  for (let i = 0; i < 3; i++) { clock.t += 16; out = frame(0.016, i * 0.016); }
  assert.strictEqual(out.lights.length / 7, stale.length, 'one light per stale PR');
  const pale = stale.map(p => w.hex(w.mix(w.FLY[p.need], w.WISP_TINT, 0.55)).map(v => v / 255));
  for (let i = 0; i < stale.length; i++) {
    const l = out.lights.slice(7 * i, 7 * i + 7);
    assert.strictEqual(l[2], 40, 'a wisp-sized glow');
    assert.ok(l[3] > 0.05, `lit: ${l[3]}`);
    l.slice(4).forEach((v, k) => assert.ok(Math.abs(v - pale[i][k]) < 1e-6, `${stale[i].need}: its colour washed out toward the tint`));
  }
  assert.strictEqual(out.wings.length / 9, 2 * w.GHOST_TRIS, 'one ghost moth: two wings of triangles');
  w.off();
  clock.t += 16; out = frame(0.016, 0.064);
  assert.deepStrictEqual([out.lights.length, out.wings.length], [0, 0]);
  assert.ok([...w.zones].every(z => z.off), 'and none can be hovered');
});

test('hovering a wisp or a ghost moth finds it where it is drawn now, after it has moved', async () => {
  const clock = { t: BASE }, { w, frame } = await screen(clock);
  const at = () => { clock.t += 16; return frame(0.016, (clock.t - BASE) / 1000).lights; };
  const hits = lights => [...w.wisps.values()].map((d, i) => w.zoneAt(w.zones, lights[7 * i], lights[7 * i + 1])?.target);
  const before = at();
  assert.deepStrictEqual(hits(before).map(t => t?.stale.url), stale.map(p => p.url), 'each light hovers its own PR');
  clock.t += 20e3; // 20s on, everything has drifted
  const after = at();
  assert.deepStrictEqual(hits(after).map(t => t?.stale.url), stale.map(p => p.url), 'and still does where it has drifted to');
  const moved = stale.filter((p, i) => Math.hypot(after[7 * i] - before[7 * i], after[7 * i + 1] - before[7 * i + 1]) > 12);
  assert.ok(moved.length >= 3, `most moved further than their hover areas are wide: ${moved.length}`);
  for (const p of moved) {
    const i = stale.indexOf(p);
    assert.notStrictEqual(w.zoneAt(w.zones, before[7 * i], before[7 * i + 1])?.target?.stale, p, `${p.label}'s old spot isn't it any more`);
  }
  const ghost = [...w.ghosts.values()][0];
  assert.strictEqual(w.zoneAt(w.zones, ghost.x, ghost.y)?.target.ghost, ghost, 'the ghost moth hovers as itself');
});

test('every screen draws the wisps and ghosts in the same places, whatever its frame rate and whenever it opened', async () => {
  const clock = { t: BASE }, a = await screen(clock), b = await screen(clock);
  let outA, outB;
  for (let t = 0; t <= 30; t += 1 / 60) { // the app at 60 fps since BASE; the panel at 20, opened 10s later with its own page clock
    clock.t = BASE + t * 1000;
    outA = a.frame(1 / 60, t);
    if (t >= 10 && Math.round(t * 60) % 3 === 0) outB = b.frame(0.05, 100 + t - 10);
  }
  clock.t = BASE + 30.5e3; outA = a.frame(0.5, 30.5); outB = b.frame(0.5, 120.5);
  assert.strictEqual(outB.lights.length, outA.lights.length); // the same to a thousandth of a unit (the shader gets 32-bit floats)
  outA.lights.forEach((v, i) => assert.ok(Math.abs(v - outB.lights[i]) < 1e-3, `light value ${i}: ${v} against ${outB.lights[i]}`));
  assert.strictEqual(outB.wings.length, outA.wings.length);
  outA.wings.forEach((v, i) => assert.ok(Math.abs(v - outB.wings[i]) < 1e-3, `ghost wing value ${i}: ${v} against ${outB.wings[i]}`));
});
