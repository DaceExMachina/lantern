// Scorched moths on the candle (src/scene/frame.ts). A session moth whose PR checks are failing flies too close to the flame
// once a minute, on a schedule every window shares (the wall clock, the moth's key), and darts about smoking until it
// settles. Each "window" here is the page loaded afresh (its own modules). The wall clock (Date.now) is the test's own
// `clock`, shared by every window; each window keeps its own frame clock, as a real one does.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { layOut } from './page.js';

const BASE = Date.parse('2026-10-18T15:00:00Z');
const clock = { wall: BASE };
beforeEach(() => { clock.wall = BASE; vi.spyOn(Date, 'now').mockImplementation(() => clock.wall); });
afterEach(() => { vi.restoreAllMocks(); });

// One window: the page afresh on the candle (a frame run so the flame's tongue is there to aim at), with its own frame
// clock (perf.t, ms). `search` is its query string.
async function context(origin = 1000, search = '') {
  layOut(search);
  vi.resetModules();
  const [f, scene, lanterns, { live }] = await Promise.all(['frame', 'scene', 'lanterns', 'live'].map(m => import(`../src/scene/${m}.ts`)));
  lanterns.applyStyle('candle');
  f.frame(performance.now());
  f.sparks.length = 0;
  return { perf: { t: origin }, f, scene, lanterns, live, moths: live.moths, sparks: f.sparks, SCORCH: f.SCORCH };
}
// a moth's group in the real #moths layer
const mothGroup = ctx => ctx.scene.$('moths', SVGGElement).appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'g'));

const pr = (n, need) => ({ url: `https://github.com/acme/app/pull/${n}`, need, label: `app#${n}`, title: `PR ${n}` });
const OTHER_NEEDS = ['ready', 'changes', 'waiting', 'draft', 'merged', 'closed'];
const redSession = (id, o = {}) => ({ id, state: 'working', github: [pr(1, 'ready'), pr(2, 'failing'), pr(3, 'changes')], ...o });
const sessionMoth = (key, o = {}) => ({ key, session: redSession(key), home: [150, 170], phase: 1.3, size: 1.4, x: 220, y: 230, tilt: 0,
  leaving: false, cool: 0, ...o });
// a key's scheduled episode starts (wall ms) at or after `from`, found with the page's own schedule
const startsOf = (ctx, key, from, count) => {
  const out = [];
  for (let now = from; out.length < count; now += 10000) { // an episode is longer than the step
    const e = ctx.f.scorchClock(key, now), at = e && now - e.t * 1000;
    if (e && at >= from && !out.some(s => s.slot === e.slot)) out.push({ slot: e.slot, at });
  }
  return out;
};
// keys whose scheduled episodes start `offsets[i]` ms after wall time `from`, to within 25ms: moths due together or in turn
const keysStarting = (ctx, from, offsets) => {
  const keys = [];
  for (let k = 0; keys.filter(Boolean).length < offsets.length; k++) {
    const key = `sess-due-${k}`, [{ at }] = startsOf(ctx, key, from, 1);
    const i = offsets.findIndex((o, j) => !keys[j] && at - from >= o && at - from < o + 25);
    if (i >= 0) keys[i] = key;
  }
  return keys;
};
// one frame of mothTarget at wall time `now` (ms), the frame clock following the window's own performance.now
const frameAt = (ctx, m, now, dt = 1 / 60) => {
  ctx.perf.t += now - clock.wall; clock.wall = now;
  return ctx.f.mothTarget(m.key, m, dt, ctx.perf.t / 1000);
};

test('only a flying session moth with failing checks, on the candle, starts a scorch', async () => {
  const ctx = await context();
  const cases = [
    ['a working moth with a failing PR among others', true, () => sessionMoth('sess-a')],
    ['a satellite with its own failing PR', true, () => {
      ctx.moths.set('sess-p', sessionMoth('sess-p', { session: { id: 'sess-p', state: 'working' } }));
      return sessionMoth('sess-s', { satellite: 'sess-p', size: 0.9 });
    }],
    ['a working moth in quiet hours', true, () => { ctx.live.quietUntil = clock.wall + 3600e3; return sessionMoth('sess-q'); }],
    ['the barrel', false, () => { ctx.lanterns.applyStyle('barrel'); return sessionMoth('sess-b'); }],
    ['a subagent holding its session\'s failing PR', false, () => {
      const parent = sessionMoth('sess-a');
      ctx.moths.set('sess-a', parent);
      return { key: 'sess-a/a1', parentId: 'sess-a', session: parent.session, a: 1, r: 40, speed: 1.2, phase: 2, size: 0.55, x: 230, y: 230, tilt: 0, leaving: false, cool: 0 };
    }],
    ['waiting (landed)', false, () => sessionMoth('sess-w', { session: redSession('sess-w', { state: 'waiting', waitingSince: clock.wall - 1000 }) })],
    ['idle', false, () => sessionMoth('sess-i', { session: redSession('sess-i', { state: 'idle' }) })],
    ['leaving', false, () => sessionMoth('sess-l', { leaving: true, x: 300, y: 300 })],
    ['no github', false, () => sessionMoth('sess-n', { session: { id: 'sess-n', state: 'working' } })],
    ['github: []', false, () => sessionMoth('sess-e', { session: redSession('sess-e', { github: [] }) })],
    ['every other need, no failing', false, () => sessionMoth('sess-o', { session: redSession('sess-o', { github: OTHER_NEEDS.map((n, i) => pr(i, n)) }) })],
  ];
  for (const [name, starts, make] of cases) {
    ctx.moths.clear(); ctx.lanterns.applyStyle('candle'); ctx.live.quietUntil = 0;
    const m = make(); // may set the style or quiet hours, and place a parent
    ctx.moths.set(m.key, m);
    const [first] = startsOf(ctx, m.key, clock.wall + 1000, 1);
    frameAt(ctx, m, first.at + 100);
    assert.strictEqual(!!m.scorch, starts, `${name}: ${starts ? 'starts' : 'never starts'} a scorch 0.1s past its start`);
  }
});

test('each moth scorches once a slot, in the slot\'s first window, for the episode\'s length', async () => {
  const ctx = await context(), { slot, window, length } = ctx.SCORCH, firsts = new Set();
  assert.ok(slot - window - length > 0, 'a calm gap between episodes');
  for (let k = 0; k < 200; k++) {
    const key = `sess-${k}`, starts = startsOf(ctx, key, BASE, 200);
    firsts.add(starts[0].at);
    const lead = starts.map(s => s.at - s.slot * slot * 1000);
    assert.ok(Math.max(...lead) - Math.min(...lead) < window * 1000, `${key}: every start sits in its slot's first ${window}s`);
    starts.forEach((s, i) => {
      if (i) {
        assert.strictEqual(s.slot, starts[i - 1].slot + 1, `${key}: one start in every slot`);
        const gap = (s.at - starts[i - 1].at) / 1000;
        assert.ok(gap >= slot - window && gap <= slot + window, `${key}: starts ${gap}s apart`);
        assert.ok((s.at - starts[i - 1].at) / 1000 - length >= slot - window - length, `${key}: calm before slot ${s.slot}`);
      }
      assert.strictEqual(ctx.f.scorchClock(key, s.at + (length - 0.01) * 1000)?.slot, s.slot, `${key}: still going just before ${length}s`);
      assert.strictEqual(ctx.f.scorchClock(key, s.at + (length + 0.01) * 1000), null, `${key}: over at ${length}s`);
      assert.deepStrictEqual(ctx.f.scorchClock(key, s.at + 5000), ctx.f.scorchClock(key, s.at + 5000), `${key}: the same answer twice`);
    });
  }
  assert.strictEqual(firsts.size, 200, 'every key keeps its own schedule');
});

test('a moth that turns eligible just after a start waits for the next slot, and never longer', async () => {
  const ctx = await context(), { slot, window, start } = ctx.SCORCH;
  const eligibleFrom = (key, u) => {
    const m = sessionMoth(key);
    for (let now = u; now < u + 200e3; now += 100) if (ctx.f.scorchStep(m, true, now)) return { m, at: now };
    return null;
  };
  for (let k = 0; k < 40; k++) {
    const key = `sess-late-${k}`, [a, b] = startsOf(ctx, key, BASE + k * 7777, 2);
    const got = eligibleFrom(key, a.at + (start + 0.01) * 1000);
    assert.ok(got && got.at >= b.at && got.at < b.at + 100, `${key}: begins at the next start (${b.at}), not ${got?.at}`);
    for (const u of [BASE + k * 1234.5, BASE + k * 999 + 31e3, BASE + k * 4321 + 59e3]) {
      const w = eligibleFrom(key, u);
      assert.ok(w && w.at - u <= (slot + window - start) * 1000 + 100, `${key}: eligible from ${u}, waited ${(w?.at - u) / 1000}s`);
    }
  }
});

test('char and agitation are 0 before the hit and after the episode, char peaking just after the hit', async () => {
  const ctx = await context(), { hit, length } = ctx.SCORCH, flight = ctx.f.scorchFlight;
  for (const t of [0, 1, hit - 0.01, length, length + 1]) {
    const f = flight(t);
    assert.deepStrictEqual([f.char, f.a], [0, 0], `at ${t}s`);
  }
  const peak = flight(hit + 0.01).char;
  assert.ok(peak > 0.15, `tinted at the hit: ${peak}`);
  for (let t = hit + 0.1; t < length; t += 0.1) assert.ok(flight(t).char <= peak, `char at ${t.toFixed(1)}s past its peak`);
  assert.ok(flight(hit + 2).a > 0, 'agitated after the hit');
});

// 60 frames a second from a moth's scheduled start, calling `at(t)` once each frame before it runs
const fly = (ctx, m, until, at = () => {}) => {
  const [first] = startsOf(ctx, m.key, clock.wall + 1000, 1), frames = [];
  for (let i = 0; i * 1000 / 60 <= until * 1000; i++) {
    const t = i / 60;
    at(t);
    const before = ctx.sparks.length, aim = frameAt(ctx, m, first.at + 1 + i * 1000 / 60); // 1ms in: the start itself can round to just before
    frames.push({ t, scorch: m.scorch ? { ...m.scorch } : null, added: ctx.sparks.length - before, aim });
  }
  return frames;
};

test('checks going green before the hit end the scorch silently; after it, it runs its length', async () => {
  const ctx = await context(), { hit, length } = ctx.SCORCH;
  for (const [name, green] of [['green', s => { s.github = s.github.map(p => ({ ...p, need: 'ready' })); }], ['GitHub off', s => { delete s.github; }]]) {
    ctx.moths.clear(); ctx.sparks.length = 0;
    let m = sessionMoth('sess-g'), went = false;
    const early = fly(ctx, m, hit + 1, t => { if (!went && t >= hit - 0.05) { went = true; green(m.session); } });
    const i = early.findIndex(f => f.t >= hit - 0.05);
    assert.ok(early[i - 1].scorch, `${name}: the approach was under way`);
    assert.strictEqual(early[i].scorch, null, `${name}: ended on the frame it went green`);
    assert.ok(early.every(f => !f.scorch?.hit && f.added === 0), `${name}: no hit and no sparks`);
    m = sessionMoth('sess-g'); went = false;
    const late = fly(ctx, m, length + 0.5, t => { if (!went && t >= hit + 0.05) { went = true; green(m.session); } });
    assert.ok(late.filter(f => f.t < length - 0.02).every(f => f.scorch), `${name} after the hit: it runs on`);
    assert.ok(late.filter(f => f.t > length + 0.02).every(f => !f.scorch), `${name} after the hit: and ends at ${length}s`);
  }
});

test('landing or leaving before the hit ends the scorch silently; landing after it keeps the moth on its perch', async () => {
  const ctx = await context(), { hit, length } = ctx.SCORCH;
  const land = m => () => Object.assign(m.session, { state: 'waiting', waitingSince: clock.wall });
  // lands before the hit
  let m = sessionMoth('sess-l'), done = false;
  ctx.moths.set(m.key, m);
  let frames = fly(ctx, m, hit + 0.5, t => { if (!done && t >= hit - 0.5) { done = true; land(m)(); } });
  let i = frames.findIndex(f => f.t >= hit - 0.5);
  assert.ok(frames[i - 1].scorch && !frames[i].scorch, 'landing ends it on that frame');
  assert.ok(frames.every(f => !f.scorch?.hit && f.added === 0), 'no hit, no sparks');
  assert.ok(frames.slice(i).every(f => f.aim.needsMe && f.aim.tx === m.perch[0] + 2 * m.size), 'it heads for its perch');
  // leaves before the hit
  ctx.moths.clear(); ctx.sparks.length = 0;
  m = sessionMoth('sess-v', { x: 330, y: 300 }); done = false;
  ctx.moths.set(m.key, m);
  frames = fly(ctx, m, hit + 0.5, t => { if (!done && t >= hit - 0.5) { done = true; m.leaving = true; } });
  i = frames.findIndex(f => f.t >= hit - 0.5);
  assert.ok(frames[i - 1].scorch && !frames[i].scorch, 'leaving ends it on that frame');
  assert.ok(frames.every(f => f.added === 0), 'no sparks');
  assert.ok(frames.slice(i).every(f => Math.hypot(f.aim.tx - 340, f.aim.ty - 330) > 500), 'it heads out of the scene');
  // lands after the hit
  ctx.moths.clear();
  m = sessionMoth('sess-h'); done = false;
  ctx.moths.set(m.key, m);
  frames = fly(ctx, m, length + 0.5, t => { if (!done && t >= hit + 0.5) { done = true; land(m)(); } });
  const after = frames.filter(f => f.t >= hit + 0.5 && f.t < length - 0.02);
  assert.ok(after.every(f => f.scorch?.hit && f.aim.needsMe && f.aim.tx === m.perch[0] + 2 * m.size), 'runs on, the moth on its perch');
  // a waiting moth with a failing PR never starts one
  ctx.moths.clear();
  m = sessionMoth('sess-z', { session: redSession('sess-z', { state: 'waiting', waitingSince: clock.wall }) });
  ctx.moths.set(m.key, m);
  frames = fly(ctx, m, length + 1);
  assert.ok(frames.every(f => !f.scorch && f.aim.needsMe), 'a landed moth is never scorched');
});

test('a hit throws at most 5 sparks from scorches, from the contact point, counting only live scorch sparks', async () => {
  const ctx = await context(), { hit } = ctx.SCORCH, [fx, fy, k] = ctx.lanterns.STYLES.candle.flame, { FLAME_BASE } = ctx.scene;
  const flame = life => ({ x: 340, y: 300, vx: 0, vy: -20, life }), ember = life => ({ ...flame(life), scorch: true });
  for (const [name, pool, adds] of [
    ['none alive (4 flame sparks, 2 dead scorch sparks)', [flame(0.5), flame(0.6), flame(0.7), flame(0.8), ember(0), ember(-0.1)], 5],
    ['5 alive', [1, 2, 3, 4, 5].map(i => ember(i / 6)), 0],
    ['2 alive among flame sparks', [ember(0.5), flame(0.5), ember(0.3), flame(0.9), flame(0.2)], 3],
  ]) {
    ctx.moths.clear(); ctx.sparks.length = 0; ctx.sparks.push(...pool);
    const m = sessionMoth(`sess-${adds}`), frames = fly(ctx, m, hit + 0.2);
    const at = frames.find(f => f.scorch?.hit);
    assert.strictEqual(at.added, adds, `${name}: adds ${adds}`);
    assert.strictEqual(frames.reduce((n, f) => n + f.added, 0), adds, `${name}: and only at the hit`);
    for (const p of ctx.sparks.slice(pool.length)) {
      assert.ok(p.scorch && p.life === 1, `${name}: a fresh scorch spark`);
      assert.ok(Math.hypot(fx + (p.x - 340) * k - at.scorch.aim[0], fy + (p.y - FLAME_BASE) * k - at.scorch.aim[1]) < 1e-9, `${name}: thrown from the contact point`);
    }
  }
});

test('nothing grows: 50 scorches on one moth add no elements, keep the spark pool, and smoke only from the hit on', async () => {
  const ctx = await context(1000, '?flame=1'), { length, hit } = ctx.SCORCH; // ?flame=1: the flame at full brightness, its own sparks filling the pool
  const { drawSparks, dropMoth, smoke } = ctx.f, mothsLayer = ctx.scene.$('moths', SVGGElement), plumes = now => smoke(now, now / 1000, 0, null).plumes;
  const make = key => { const m = sessionMoth(key, { g: mothGroup(ctx) }); ctx.moths.set(key, m); return m; };
  const live = () => ctx.sparks.filter(p => p.scorch && p.life > 0).length;
  const step = (m, dt = 0.05) => {
    ctx.perf.t += dt * 1000; clock.wall += dt * 1000;
    const s = ctx.perf.t / 1000;
    drawSparks(dt, s, { size: 1, tip: [340, 200] });
    ctx.f.mothTarget(m.key, m, dt, s);
  };
  const m = make('sess-grow');
  let episodes = 0, was = null, smoked = 0;
  while (episodes < 50) {
    step(m);
    if (m.scorch && !was) episodes++;
    was = m.scorch;
    assert.strictEqual(mothsLayer.children.length, 1, 'no elements beside the moth');
    const smoke = plumes(clock.wall); // the singe's plume, drawn by the background
    assert.strictEqual(smoke.length, m.scorch?.hit ? 1 : 0, `one plume from the hit to the episode's end, the singe's: ${smoke.length} at ${m.scorch?.t}`);
    if (smoke.length) { smoked++; assert.deepStrictEqual([smoke[0][0], smoke[0][1], smoke[0][2]], [...m.scorch.aim, m.scorch.t - hit], 'from where the wing touched, as old as the hit'); }
    assert.ok(live() <= 5, `at most 5 live scorch sparks: ${live()}`);
    assert.ok(ctx.sparks.length <= 17, `the pool holds: ${ctx.sparks.length}`);
  }
  assert.ok(smoked > 0, 'the singe did smoke');
  // dropped mid-episode, its plume goes with it
  while (!m.scorch?.hit || m.scorch.t < length / 2) step(m);
  dropMoth(m.key, m);
  assert.strictEqual(plumes(clock.wall).length, 0, 'dropMoth takes its smoke with it');
  // the lantern switched mid-episode
  const n = make('sess-switch');
  while (!n.scorch?.hit || n.scorch.t < length / 2) step(n);
  ctx.lanterns.applyStyle('barrel');
  step(n);
  assert.ok(!n.scorch && plumes(clock.wall).length === 0, 'switching to the barrel ends it on the next frame');
});

// background.ts's smokeBend, run as JS: it's written in scalars, so it reads as JS once typed
const smokeBendAt = () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'scene', 'background.ts'), 'utf8').match(/float smokeBend\(float age, float now, float curl\) \{[\s\S]*?\n\}/);
  assert.ok(src, 'background.ts has smokeBend');
  const js = src[0].replace('float smokeBend(float age, float now, float curl)', 'return (age, now, curl) =>').replace(/\bfloat /g, 'let ').replace(/\b(min|sin)\(/g, 'Math.$1(');
  return new Function('S_SIZE', 'S_LENGTH', 'RISE', js)(21, 160, 29);
};
test('smoke curls into Ss that swell from nothing as it ages', async () => {
  const still = smokeBendAt(), nows = Array.from({ length: 200 }, (_, i) => i * 0.1);
  assert.ok(still(0, 3, 1) === 0, 'none where it was let go');
  const swing = age => Math.max(...nows.map(n => Math.abs(still(age, n, 1))));
  assert.ok(swing(0.1) < 3 && swing(2) > 21, `the curl swells with age: ${swing(0.1).toFixed(2)} then ${swing(2).toFixed(2)}`);
  for (const n of nows) for (let age = 0; age < 6; age += 0.2)
    assert.ok(Math.abs(still(age + 0.2, n, 1) - still(age, n, 1)) < 15, `neighbours 0.2s apart stay together, at ${age.toFixed(1)}s`);
  assert.notStrictEqual(still(2, 5, 1), still(2, 5 + 41, 1), 'a seed offsets it');
});
test('a trail is full width while its head is on the moth, and tapers to a point there once it has stopped following', async () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'scene', 'background.ts'), 'utf8').match(/float trailTaper\(float age, float head\) \{.*\}/);
  assert.ok(src, 'background.ts has trailTaper');
  const smoothstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const taper = new Function('smoothstep', src[0].replace('float trailTaper(float age, float head) {', 'return (age, head) => {'))(smoothstep);
  for (const age of [0, 0.1, 0.3, 1]) assert.strictEqual(taper(age, 0), 1, `following, ${age}s along: full width`);
  assert.ok(Math.abs(taper(1, 1) - 0.15) < 1e-9, 'stopped: its head a point');
  assert.strictEqual(taper(1.5, 1), 1, 'and full width a little way back');
});

test('a fast moth\'s trail is laid by distance, within its budget, and curls into Ss across its path', async () => {
  const ctx = await context(), { hit } = ctx.SCORCH, { smoke } = ctx.f, { TRAIL } = ctx.scene;
  const m = sessionMoth('sess-fast', { g: mothGroup(ctx) });
  ctx.moths.set(m.key, m);
  const step = () => { ctx.perf.t += 50; clock.wall += 50; ctx.f.mothTarget(m.key, m, 0.05, ctx.perf.t / 1000); };
  while (!m.scorch?.hit) step();
  const y0 = m.y;
  while (!m.scorch.trailDone) { m.x += 6; m.y = y0; step(); } // flying straight right at 120 units a second
  const laid = m.scorch.trail.slice(0, -1); // all but the last, where it stopped following
  assert.ok(laid.length <= TRAIL.most, `within its budget: ${laid.length} points`);
  for (let i = 1; i < laid.length; i++) assert.ok(laid[i][0] - laid[i - 1][0] <= TRAIL.apart + 6, `a point every ${TRAIL.apart} units or so: ${laid[i][0] - laid[i - 1][0]} at ${i}`);
  const across = smoke(clock.wall, ctx.perf.t / 1000, 0, null).trail.filter(p => p[2] > 0.3).map(p => Math.abs(p[1] - y0));
  assert.ok(Math.max(...across) > TRAIL.s / 2 && Math.max(...across) <= TRAIL.s + 1e-9, `curled across its straight path, up to ${TRAIL.s}: ${Math.max(...across).toFixed(2)}`);
});

test('a scorched moth trails one band of smoke along its path, aging toward its old end, and bounded', async () => {
  const ctx = await context(), { hit } = ctx.SCORCH;
  const { smoke, smokeDrift } = ctx.f, { TRAIL, TRAIL_POINTS, PLUME, PLUMES, SMOKERS } = ctx.scene, life = PLUME.life, smokeTrail = () => smoke(clock.wall, ctx.perf.t / 1000, 0, null).trail;
  assert.ok(ctx.SCORCH.length >= hit + TRAIL.secs + life, 'the episode lasts as long as its smoke, so it never ends mid-trail');
  const make = key => { const m = sessionMoth(key, { g: mothGroup(ctx) }); ctx.moths.set(key, m); return m; };
  const step = (ms, dt = 0.05) => { ctx.perf.t += dt * 1000; clock.wall += dt * 1000; for (const m of ms) ctx.f.mothTarget(m.key, m, dt, ctx.perf.t / 1000); };
  const m = make('sess-trail');
  while (!m.scorch?.hit || m.scorch.t < hit + 1) { if (!m.scorch?.hit) assert.strictEqual(smokeTrail().length, 0, 'no trail before the hit'); step([m]); }
  const a = smokeTrail(), head = a[0];
  assert.ok(a.length >= 4, `points all along its path: ${a.length}`);
  assert.deepStrictEqual([head[0], head[1], head[2]], [m.x, m.y, 0], 'its head first, joined to the moth while it smokes');
  assert.ok(a.every(p => p[2] >= 0), 'one band, unbroken');
  for (let i = 1; i < a.length; i++) assert.ok(a[i][2] > a[i - 1][2], `older toward its old end, at ${i}`);
  // a frame as frame() runs it: the moth's step, then its move (mothMove, here 3 units over), then the smoke drawn. Its
  // head sits where the moth is drawn, on the frames it leaves a point too
  for (let i = 0; i < 6; i++) {
    step([m]); m.x += 3;
    const [hx, hy, age] = smokeTrail()[0];
    assert.deepStrictEqual([hx, hy, age], [m.x, m.y, 0], `its head on the moth as drawn, ${i} frames on`);
  }
  // as it stops following the moth (which moves a unit a frame here), its head stays where the moth was then, no further
  // back, and is left there to fade out PLUME.life later
  const fly = () => { m.x += 1; step([m]); };
  let before = smokeTrail()[0];
  while (!m.scorch.trailDone) { before = smokeTrail()[0]; fly(); }
  const after = smokeTrail()[0], jump = Math.hypot(after[0] - before[0], after[1] - before[1]);
  assert.ok(m.scorch.t - hit >= TRAIL.secs && m.scorch.t - hit < TRAIL.secs + 0.1, `it stopped following ${TRAIL.secs}s after the hit`);
  assert.ok(jump <= 1, `its head stays where it was as the smoke stops following: it jumped ${jump.toFixed(2)}`);
  const left = [after[0] - smokeDrift(ctx.perf.t / 1000, after[2]), after[1]]; // where it was left, before the wind's push
  for (let i = 0; i < 5; i++) fly();
  const later = smokeTrail()[0], off = Math.hypot(later[0] - smokeDrift(ctx.perf.t / 1000, later[2]) - left[0], later[1] - left[1]);
  assert.ok(off <= TRAIL.s, `and stays there as the moth flies on, but for the wind and its curl: ${off.toFixed(2)} off`);
  while (m.scorch && m.scorch.t < hit + TRAIL.secs + life) step([m]);
  assert.strictEqual(smokeTrail().length, 0, 'gone');
  // twelve moths due at once: only SMOKERS start (the rest wait their turn), each its own band, parted by a point aged
  // -1, every point of every trail drawn, within TRAIL_POINTS
  ctx.moths.delete(m.key); // its episode still runs, and would take a turn
  const ms = keysStarting(ctx, clock.wall, Array(12).fill(0)).map(make), smokers = SMOKERS; // every moth's episode starting now
  for (let i = 0; i < 80; i++) step(ms);
  const scorched = ms.filter(n => n.scorch?.hit), c = smokeTrail();
  assert.strictEqual(scorched.length, smokers, `${smokers} smoking, the rest waiting`);
  const drawn = scorched.reduce((sum, n) => sum + n.scorch.trail.length + (n.scorch.trail.at(-1)[2] === n.scorch.t || n.scorch.trailDone ? 0 : 1), 0) + smokers - 1; // each trail, joined to its moth, parted from the next
  assert.strictEqual(c.length, drawn, 'every point drawn');
  assert.strictEqual(c.filter(p => p[2] === -1).length, smokers - 1, 'parted between moths');
  assert.ok(SMOKERS * (TRAIL.most + 3) <= TRAIL_POINTS && 1 + SMOKERS <= PLUMES, 'the most that can smoke fit the shader');
});

test('every window scorches a moth at the same moments, whatever its own clocks and whenever it opened, with no Math.random', async () => {
  const a = await context(3000), b = await context(987654.3), { slot, window, length } = a.SCORCH;
  vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random on the scorch\'s path'); });
  const ma = sessionMoth('sess-step'), mb = sessionMoth('sess-step');
  a.moths.set(ma.key, ma); b.moths.set(mb.key, mb);
  const pick = sc => sc ? { slot: sc.slot, t: sc.t, hit: sc.hit } : null; // no scorch is null whether it never had one or its last ended
  // window b opens 37 s after a, so each one's first frame comes at its own wall time; they're compared from the first
  // frame after b opens with no episode running in a (b can't join one already under way)
  let starts = 0, was = null, compare = false;
  const from = clock.wall, opens = from + 37000;
  for (let now = from + 100; now <= opens + (2 * (slot + window) + length) * 1000; now += 100) {
    clock.wall = now;
    for (const [c, m] of now > opens ? [[a, ma], [b, mb]] : [[a, ma]]) {
      c.perf.t += 100; // each window's own clocks move on with the wall, from their own origins
      c.f.mothTarget(m.key, m, 0.1, c.perf.t / 1000);
    }
    compare ||= now > opens && !ma.scorch;
    if (!compare) continue;
    assert.deepStrictEqual(pick(ma.scorch), pick(mb.scorch), `the two windows agree at ${now}`);
    if (ma.scorch && !was) starts++;
    was = ma.scorch;
  }
  assert.ok(starts >= 2, `at least two episodes seen: ${starts}`);
});

test('the flame lets go one plume at a time, carrying on the one that\'s going', async () => {
  const ctx = await context(), { smoke } = ctx.f;
  let was = null;
  for (let t = 0; t < 3 * 3600; t += 0.25) {
    const now = BASE + t * 1000, out = smoke(now, now / 1000, 1, [340, 200]).plumes; // burning its hardest, its smoke the most often
    assert.ok(out.length <= 1, `${out.length} plumes at once, ${t}s in`);
    if (out[0] && was) assert.ok(out[0][2] > was[2] || out[0][2] < 0.3, `a new plume ${t}s in cut off the one going`);
    was = out[0];
  }
});

test('a scorched moth\'s smoke, once it fades, never comes back, with twice as many moths scorched as can smoke at once', async () => {
  const ctx = await context(), { hit, length } = ctx.SCORCH, { smoke } = ctx.f;
  // twelve moths scorched a quarter of a second apart, all smoking together
  const keys = keysStarting(ctx, clock.wall, Array.from({ length: 12 }, (_, i) => i * 250));
  const ms = keys.map((key, i) => { const m = sessionMoth(key, { g: mothGroup(ctx), x: 100 + 30 * i }); ctx.moths.set(m.key, m); return m; });
  const gone = new Set();
  for (let i = 0; i < 20 * length; i++) {
    ctx.perf.t += 50; clock.wall += 50;
    for (const m of ms) ctx.f.mothTarget(m.key, m, 0.05, ctx.perf.t / 1000);
    const { plumes, trail } = smoke(clock.wall, ctx.perf.t / 1000, 0, null), singes = plumes.map(p => p.slice(0, 2).join());
    for (const m of ms) {
      const sc = m.scorch;
      if (!sc?.hit) continue;
      const on = singes.includes(sc.aim.join()) || trail.some(p => p[2] >= 0 && sc.trail?.some(q => q[0] === p[0] && q[1] === p[1]));
      if (on) assert.ok(!gone.has(m.key), `${m.key}'s smoke came back ${(sc.t - hit).toFixed(2)}s after its hit`);
      else gone.add(m.key);
    }
  }
});
