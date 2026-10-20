// Scorched moths on the candle (page/frame.js). A session moth whose PR checks are failing flies too close to the flame
// once a minute, on a schedule every window shares (the wall clock, the moth's key), and darts about smoking until it
// settles. The page is plain classic scripts, run here in a vm context in index.html's order. Each context's Date.now
// is the test's own wall clock; its frame clock and performance.now are separate, as they are in a real window.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = Date.parse('2026-10-18T15:00:00Z');
// A stub DOM holding only what the scorch's effects and the sparks touch: elements that keep their children.
const node = tag => {
  const n = { tag, attrs: {}, children: [], parent: null, style: {},
    getAttribute: k => n.attrs[k] ?? null, setAttribute: (k, v) => { n.attrs[k] = String(v); },
    remove: () => { if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n), 1); n.parent = null; },
    appendChild: c => { c.remove(); c.parent = n; n.children.push(c); return c; },
    insertBefore: (c, ref) => { c.remove(); c.parent = n; const i = n.children.indexOf(ref); n.children.splice(i < 0 ? n.children.length : i, 0, c); return c; },
    replaceChildren: (...cs) => { for (const c of [...n.children]) c.remove(); cs.forEach(n.appendChild); },
    get childElementCount() { return n.children.length; } };
  n.append = (...cs) => cs.forEach(n.appendChild);
  return n;
};
const domStub = () => {
  const els = { moths: node('g'), sparks: node('g') };
  return { els, document: { getElementById: id => els[id] ?? null, querySelectorAll: () => [], createElementNS: (_, tag) => node(tag) } };
};

// One window, with its own performance.now origin (ms). The wall clock is shared through `clock`.
const clock = { wall: BASE };
function context(origin = 1000, document = undefined) {
  const perf = { t: origin, now: () => perf.t };
  const page = vm.createContext({ URLSearchParams, location: { search: '' }, performance: perf, wall: () => clock.wall, document });
  for (const f of ['scene', 'dev', 'lanterns', 'state', 'stale', 'frame']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'page', f + '.js'), 'utf8'), page, { filename: f + '.js' });
  const run = code => vm.runInContext(code, page);
  run('Date.now = () => wall(); style = STYLES.candle; tongue = { cx: 341, half: 11, height: 62 };');
  return { page, run, perf, SCORCH: run('SCORCH'), mothTarget: run('mothTarget'), scorchStep: run('scorchStep'), scorchClock: run('scorchClock'),
    moths: run('moths'), sparks: run('sparks') };
}

const pr = (n, need) => ({ url: `https://github.com/acme/app/pull/${n}`, need, label: `app#${n}`, title: `PR ${n}` });
const OTHER_NEEDS = ['ready', 'changes', 'waiting', 'draft', 'merged', 'closed'];
const redSession = (id, o = {}) => ({ id, state: 'working', github: [pr(1, 'ready'), pr(2, 'failing'), pr(3, 'changes')], ...o });
const sessionMoth = (key, o = {}) => ({ key, session: redSession(key), home: [150, 170], phase: 1.3, size: 1.4, x: 220, y: 230, tilt: 0,
  leaving: false, cool: 0, ...o });
// a key's scheduled episode starts (wall ms) at or after `from`, found with the page's own schedule
const startsOf = (ctx, key, from, count) => {
  const out = [];
  for (let now = from; out.length < count; now += 1000) {
    const e = ctx.scorchClock(key, now), at = e && now - e.t * 1000;
    if (e && at >= from && !out.some(s => s.slot === e.slot)) out.push({ slot: e.slot, at });
  }
  return out;
};
// one frame of mothTarget at wall time `now` (ms), the frame clock following the window's own performance.now
const frameAt = (ctx, m, now, dt = 1 / 60) => {
  ctx.perf.t += now - clock.wall; clock.wall = now;
  return ctx.mothTarget(m.key, m, dt, ctx.perf.t / 1000);
};

test('only a flying session moth with failing checks, on the candle, starts a scorch', () => {
  const ctx = context();
  const cases = [
    ['a working moth with a failing PR among others', true, () => sessionMoth('sess-a')],
    ['a satellite with its own failing PR', true, () => {
      ctx.moths.set('sess-p', sessionMoth('sess-p', { session: { id: 'sess-p', state: 'working' } }));
      return sessionMoth('sess-s', { satellite: 'sess-p', size: 0.9 });
    }],
    ['a working moth in quiet hours', true, () => { ctx.run(`quietUntil = ${clock.wall + 3600e3}`); return sessionMoth('sess-q'); }],
    ['the barrel', false, () => { ctx.run('style = STYLES.barrel'); return sessionMoth('sess-b'); }],
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
    ctx.moths.clear(); ctx.run('style = STYLES.candle; quietUntil = 0');
    const m = make(); // may set the style or quiet hours, and place a parent
    ctx.moths.set(m.key, m);
    const [first] = startsOf(ctx, m.key, clock.wall + 1000, 1);
    frameAt(ctx, m, first.at + 100);
    assert.strictEqual(!!m.scorch, starts, `${name}: ${starts ? 'starts' : 'never starts'} a scorch 0.1s past its start`);
  }
});

test('each moth scorches once a slot, in the slot\'s first window, for the episode\'s length', () => {
  const ctx = context(), { slot, window, length } = ctx.SCORCH, firsts = new Set();
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
      assert.strictEqual(ctx.scorchClock(key, s.at + (length - 0.01) * 1000)?.slot, s.slot, `${key}: still going just before ${length}s`);
      assert.strictEqual(ctx.scorchClock(key, s.at + (length + 0.01) * 1000), null, `${key}: over at ${length}s`);
      assert.deepStrictEqual(ctx.scorchClock(key, s.at + 5000), ctx.scorchClock(key, s.at + 5000), `${key}: the same answer twice`);
    });
  }
  assert.strictEqual(firsts.size, 200, 'every key keeps its own schedule');
});

test('a moth that turns eligible just after a start waits for the next slot, and never longer', () => {
  const ctx = context(), { slot, window, start } = ctx.SCORCH;
  const eligibleFrom = (key, u) => {
    const m = sessionMoth(key);
    for (let now = u; now < u + 200e3; now += 100) if (ctx.scorchStep(m, true, now)) return { m, at: now };
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

test('char and agitation are 0 before the hit and after the episode, char peaking just after the hit', () => {
  const ctx = context(), { hit, length } = ctx.SCORCH, flight = ctx.run('scorchFlight');
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

test('checks going green before the hit end the scorch silently; after it, it runs its length', () => {
  const ctx = context(), { hit, length } = ctx.SCORCH;
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

test('landing or leaving before the hit ends the scorch silently; landing after it keeps the moth on its perch', () => {
  const ctx = context(), { hit, length } = ctx.SCORCH;
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

test('a hit throws at most 5 sparks from scorches, from the contact point, counting only live scorch sparks', () => {
  const ctx = context(), { hit } = ctx.SCORCH, [fx, fy, k] = ctx.run('STYLES.candle.flame'), FLAME_BASE = ctx.run('FLAME_BASE');
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

test('nothing grows: 50 scorches on one moth add no elements, keep the spark pool, and smoke only from the hit on', () => {
  const { els, document } = domStub(), ctx = context(1000, document), { length, hit } = ctx.SCORCH;
  ctx.run('level = 1'); // the flame at full brightness, its own sparks filling the pool
  const [drawSparks, dropMoth, smoke] = ctx.run('[drawSparks, dropMoth, smoke]'), plumes = now => smoke(now, 0, null).plumes;
  const make = key => { const m = sessionMoth(key, { g: els.moths.appendChild(node('g')) }); ctx.moths.set(key, m); return m; };
  const live = () => ctx.sparks.filter(p => p.scorch && p.life > 0).length;
  const step = (m, dt = 0.05) => {
    ctx.perf.t += dt * 1000; clock.wall += dt * 1000;
    const s = ctx.perf.t / 1000;
    drawSparks(dt, s, 1);
    ctx.mothTarget(m.key, m, dt, s);
  };
  const m = make('sess-grow');
  let episodes = 0, was = null, smoked = 0;
  while (episodes < 50) {
    step(m);
    if (m.scorch && !was) episodes++;
    was = m.scorch;
    assert.strictEqual(els.moths.children.length, 1, 'no elements beside the moth');
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
  ctx.run('style = STYLES.barrel');
  step(n);
  assert.ok(!n.scorch && plumes(clock.wall).length === 0, 'switching to the barrel ends it on the next frame');
});

// background.js's smokeBend, run as JS with the wind at `wind`: it's written in scalars, so it reads as JS once typed
const smokeBendAt = wind => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'page', 'background.js'), 'utf8').match(/float smokeBend\(float age, float now, float curl\) \{[\s\S]*?\n\}/);
  assert.ok(src, 'background.js has smokeBend');
  const js = src[0].replace('float smokeBend(float age, float now, float curl)', 'return (age, now, curl) =>').replace(/\bfloat /g, 'let ').replace(/\b(min|sin)\(/g, 'Math.$1(');
  return new Function('uSmoke', 'uSmokeS', 'RISE', js)({ w: wind }, { x: 24, y: 90 }, 29);
};
test('smoke bends downwind the higher it has risen, and curls into Ss that swell from nothing as it ages', () => {
  const still = smokeBendAt(0), windy = smokeBendAt(0.6), nows = Array.from({ length: 200 }, (_, i) => i * 0.1);
  assert.strictEqual(still(0, 3, 1), 0, 'none where it was let go');
  assert.strictEqual(windy(1, 3, 0), 0.6 * (29 * 29 / 150 + 29 * 0.3), 'the wind alone, a second up');
  assert.ok(windy(3, 3, 0) > 3 * windy(1, 3, 0), 'bent further the higher it is');
  const swing = age => Math.max(...nows.map(n => Math.abs(still(age, n, 1))));
  assert.ok(swing(0.1) < 3 && swing(2) > 24, `the curl swells with age: ${swing(0.1).toFixed(2)} then ${swing(2).toFixed(2)}`);
  for (const n of nows) for (let age = 0; age < 6; age += 0.2)
    assert.ok(Math.abs(still(age + 0.2, n, 1) - still(age, n, 1)) < 15, `neighbours ${TRAIL_STEP}s apart stay together, at ${age.toFixed(1)}s`);
  assert.notStrictEqual(still(2, 5, 1), still(2, 5 + 41, 1), 'a seed offsets it');
});
const TRAIL_STEP = 0.25;
test('a scorched moth trails one band of smoke along its path, aging toward its old end, and bounded', t => {
  const wall = clock.wall;
  t.after(() => { clock.wall = wall; }); // the next test's windows start where they would without this one
  const { els, document } = domStub(), ctx = context(1000, document), { hit } = ctx.SCORCH;
  const [smoke, TRAIL, TRAIL_POINTS, life] = ctx.run('[smoke, TRAIL, TRAIL_POINTS, PLUME.life]'), smokeTrail = () => smoke(clock.wall, 0, null).trail;
  assert.strictEqual(TRAIL[1], TRAIL_STEP);
  assert.ok(ctx.SCORCH.length >= hit + TRAIL[0] + life, 'the episode lasts as long as its smoke, so it never ends mid-trail');
  const make = key => { const m = sessionMoth(key, { g: els.moths.appendChild(node('g')) }); ctx.moths.set(key, m); return m; };
  const step = (ms, dt = 0.05) => { ctx.perf.t += dt * 1000; clock.wall += dt * 1000; for (const m of ms) ctx.mothTarget(m.key, m, dt, ctx.perf.t / 1000); };
  const m = make('sess-trail');
  while (!m.scorch?.hit || m.scorch.t < hit + 1) { if (!m.scorch?.hit) assert.strictEqual(smokeTrail().length, 0, 'no trail before the hit'); step([m]); }
  const a = smokeTrail(), head = a[0];
  assert.ok(a.length >= 4, `points all along its path: ${a.length}`);
  assert.deepStrictEqual([head[0], head[1], head[2]], [m.x, m.y, 0], 'its head first, joined to the moth while it smokes');
  assert.ok(a.every(p => p[2] >= 0 && p[3] === a[0][3]), 'one band, unbroken, on one clock');
  for (let i = 1; i < a.length; i++) assert.ok(a[i][2] > a[i - 1][2], `older toward its old end, at ${i}`);
  // as it stops following the moth (which moves a unit a frame here), its head stays where the moth was then, no further
  // back, and is left there to fade out PLUME.life later
  const fly = () => { m.x += 1; step([m]); };
  let before = smokeTrail()[0];
  while (!m.scorch.trailDone) { before = smokeTrail()[0]; fly(); }
  const after = smokeTrail()[0], jump = Math.hypot(after[0] - before[0], after[1] - before[1]);
  assert.ok(m.scorch.t - hit >= TRAIL[0] && m.scorch.t - hit < TRAIL[0] + 0.1, `it stopped following ${TRAIL[0]}s after the hit`);
  assert.ok(jump <= 1, `its head stays where it was as the smoke stops following: it jumped ${jump.toFixed(2)}`);
  for (let i = 0; i < 5; i++) fly();
  assert.deepStrictEqual(smokeTrail()[0].slice(0, 2), after.slice(0, 2), 'and stays there as the moth flies on');
  while (m.scorch && m.scorch.t < hit + TRAIL[0] + life) step([m]);
  assert.strictEqual(smokeTrail().length, 0, 'gone');
  // twelve moths due at once: only `smokers` start (the rest wait their turn), each its own band, parted by a point aged
  // -1, every point of every trail drawn, within TRAIL_POINTS
  ctx.moths.delete(m.key); // its episode still runs, and would take a turn
  const ms = Array.from({ length: 12 }, (_, i) => make(`sess-t${i}`)), smokers = ctx.run('smokers');
  ctx.run(`scorchClock = (key, now) => ({ slot: 0, t: (now - ${clock.wall}) / 1000 })`); // every moth's episode starting now
  for (let i = 0; i < 80; i++) step(ms);
  const scorched = ms.filter(n => n.scorch?.hit), c = smokeTrail();
  assert.strictEqual(scorched.length, smokers, `${smokers} smoking, the rest waiting`);
  const drawn = scorched.reduce((sum, n) => sum + n.scorch.trail.length + (n.scorch.trail.at(-1)[2] === n.scorch.t || n.scorch.trailDone ? 0 : 1), 0) + smokers - 1; // each trail, joined to its moth, parted from the next
  assert.strictEqual(c.length, drawn, 'every point drawn');
  assert.strictEqual(c.filter(p => p[2] === -1).length, smokers - 1, 'parted between moths');
  assert.ok(ctx.run('SMOKERS_MAX * (Math.ceil(TRAIL[0] / TRAIL[1]) + 3) <= TRAIL_POINTS && 1 + SMOKERS_MAX <= PLUMES'), 'the most that can smoke fit the shader');
});

test('every window scorches a moth at the same moments, whatever its own clocks and whenever it opened, with no Math.random', () => {
  const a = context(3000), b = context(987654.3), { slot, window, length } = a.SCORCH;
  for (const c of [a, b]) c.run('Math.random = () => { throw new Error("Math.random on the scorch\'s path"); }');
  const ma = sessionMoth('sess-step'), mb = sessionMoth('sess-step');
  a.moths.set(ma.key, ma); b.moths.set(mb.key, mb);
  const pick = sc => sc && { slot: sc.slot, t: sc.t, hit: sc.hit };
  // window b opens 37 s after a, so each one's first frame comes at its own wall time; they're compared from the first
  // frame after b opens with no episode running in a (b can't join one already under way)
  let starts = 0, was = null, compare = false;
  const from = clock.wall, opens = from + 37000;
  for (let now = from + 100; now <= opens + (2 * (slot + window) + length) * 1000; now += 100) {
    clock.wall = now;
    for (const [c, m] of now > opens ? [[a, ma], [b, mb]] : [[a, ma]]) {
      c.perf.t += 100; // each window's own clocks move on with the wall, from their own origins
      c.mothTarget(m.key, m, 0.1, c.perf.t / 1000);
    }
    compare ||= now > opens && !ma.scorch;
    if (!compare) continue;
    assert.deepStrictEqual(pick(ma.scorch), pick(mb.scorch), `the two windows agree at ${now}`);
    if (ma.scorch && !was) starts++;
    was = ma.scorch;
  }
  assert.ok(starts >= 2, `at least two episodes seen: ${starts}`);
});

test('the flame lets go one plume at a time, carrying on the one that\'s going', () => {
  const ctx = context(), smoke = ctx.run('smoke');
  let was = null;
  for (let t = 0; t < 3 * 3600; t += 0.25) {
    const now = BASE + t * 1000, out = smoke(now, 1, [340, 200]).plumes; // burning its hardest, its smoke the most often
    assert.ok(out.length <= 1, `${out.length} plumes at once, ${t}s in`);
    if (out[0] && was) assert.ok(out[0][2] > was[2] || out[0][2] < 0.3, `a new plume ${t}s in cut off the one going`);
    was = out[0];
  }
});

test('a scorched moth\'s smoke stays until it fades, however many smoke at once', () => {
  const { els, document } = domStub(), ctx = context(1000, document), { hit, length } = ctx.SCORCH;
  const smoke = ctx.run('smoke');
  // twelve moths scorched a quarter of a second apart, all smoking together
  ctx.run(`scorchClock = (key, now) => ({ slot: 0, t: (now - ${clock.wall}) / 1000 - Number(key.slice(6)) / 4 })`);
  const ms = Array.from({ length: 12 }, (_, i) => { const m = sessionMoth(`sess-${i}`, { g: els.moths.appendChild(node('g')), x: 100 + 30 * i }); ctx.moths.set(m.key, m); return m; });
  const gone = new Set();
  for (let i = 0; i < 20 * length; i++) {
    ctx.perf.t += 50; clock.wall += 50;
    for (const m of ms) ctx.mothTarget(m.key, m, 0.05, ctx.perf.t / 1000);
    const { plumes, trail } = smoke(clock.wall, 0, null), singes = plumes.map(p => p.slice(0, 2).join());
    for (const m of ms) {
      const sc = m.scorch;
      if (!sc?.hit) continue;
      const on = singes.includes(sc.aim.join()) || trail.some(p => p[2] >= 0 && sc.trail?.some(q => q[0] === p[0] && q[1] === p[1]));
      if (on) assert.ok(!gone.has(m.key), `${m.key}'s smoke came back ${(sc.t - hit).toFixed(2)}s after its hit`);
      else gone.add(m.key);
    }
  }
});
