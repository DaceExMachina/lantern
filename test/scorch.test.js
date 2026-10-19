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
  for (const f of ['scene', 'lanterns', 'state', 'stale', 'frame']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'page', f + '.js'), 'utf8'), page, { filename: f + '.js' });
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

test('smoke, char and agitation are 0 before the hit and after the episode, char peaking just after the hit', () => {
  const ctx = context(), { hit, length } = ctx.SCORCH, flight = ctx.run('scorchFlight');
  for (const t of [0, 1, hit - 0.01, length, length + 1]) {
    const f = flight(t);
    assert.deepStrictEqual([f.char, f.smoke, f.a], [0, 0, 0], `at ${t}s`);
  }
  const peak = flight(hit + 0.01).char;
  assert.ok(peak > 0.15, `tinted at the hit: ${peak}`);
  for (let t = hit + 0.1; t < length; t += 0.1) assert.ok(flight(t).char <= peak, `char at ${t.toFixed(1)}s past its peak`);
  assert.ok(flight(hit + 2).smoke > 0 && flight(hit + 2).a > 0, 'smoking and agitated after the hit');
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

test('nothing grows: 50 scorches on one moth leave no elements and keep the spark pool', () => {
  const { els, document } = domStub(), ctx = context(1000, document), { length } = ctx.SCORCH;
  ctx.run('level = 1'); // the flame at full brightness, its own sparks filling the pool
  const [drawSparks, drawScorch, dropMoth, WING_UP, WING_SIDE] = ctx.run('[drawSparks, drawScorch, dropMoth, WING_UP, WING_SIDE]');
  const make = key => { const m = sessionMoth(key, { g: els.moths.appendChild(node('g')) }); ctx.moths.set(key, m); return m; };
  const extra = m => els.moths.children.filter(c => c !== m.g).length;
  const live = () => ctx.sparks.filter(p => p.scorch && p.life > 0).length;
  const step = (m, dt = 0.05) => {
    ctx.perf.t += dt * 1000; clock.wall += dt * 1000;
    const s = ctx.perf.t / 1000;
    drawSparks(dt, s, 1);
    ctx.mothTarget(m.key, m, dt, s);
    drawScorch(m, WING_UP, WING_SIDE, dt);
  };
  const m = make('sess-grow');
  let episodes = 0, was = null, most = 0;
  while (episodes < 50) {
    step(m);
    if (m.scorch && !was) episodes++;
    was = m.scorch;
    most = Math.max(most, extra(m));
    assert.ok(extra(m) <= 7, `at most 7 scorch elements: ${extra(m)}`);
    if (!m.scorch) assert.strictEqual(extra(m), 0, 'none between episodes');
    assert.ok(live() <= 5, `at most 5 live scorch sparks: ${live()}`);
    assert.ok(ctx.sparks.length <= 17, `the pool holds: ${ctx.sparks.length}`);
  }
  assert.strictEqual(most, 7, 'the puff and its smoke did show');
  // dropped mid-episode
  while (!m.scorch?.hit || m.scorch.t < length / 2) step(m);
  assert.ok(extra(m) > 0);
  dropMoth(m.key, m);
  assert.strictEqual(els.moths.children.length, 0, 'dropMoth takes its smoke with it');
  // the lantern switched mid-episode
  const n = make('sess-switch');
  while (!n.scorch?.hit || n.scorch.t < length / 2) step(n);
  ctx.run('style = STYLES.barrel');
  step(n);
  assert.ok(!n.scorch && extra(n) === 0, 'switching to the barrel ends it on the next frame');
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
