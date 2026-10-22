// Where session moths live (page/state.js sync, page/scene.js ringHome): spread evenly round the lantern, worked out from
// the server's session list alone so every window agrees, and gliding (page/frame.js glideHome) when sessions come or go.
// sync() runs for real; the DOM is a stub that accepts anything.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/** @type {any} */
const stub = new Proxy(function () {}, { get: (_, k) => k === Symbol.toPrimitive ? () => '' : stub, apply: () => stub, construct: () => stub, set: () => true });
// a window on the lantern, `kx` times as wide as it is tall
function open(kx = 1) {
  const page = vm.createContext({ URLSearchParams, location: { search: '' }, performance, document: stub,
    alertMe() {} }); // notifications aren't loaded
  for (const f of ['scene', 'dev', 'lanterns', 'state', 'stale', 'frame', 'card']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'page', f + '.js'), 'utf8'), page, { filename: f + '.js' });
  const run = code => JSON.parse(vm.runInContext(`JSON.stringify((() => { ${code} })())`, page) ?? 'null');
  run(`VIEW.kx = ${kx}`);
  const homes = what => run(`return Object.fromEntries([...moths].filter(([, m]) => !m.leaving && !m.satellite).map(([k, m]) => [k, m.${what}]))`);
  return {
    /** the server sends these sessions ('side' is one 'api' started); the spot each one on its own was given */
    show: (ids, idle = [], extra = {}) => { run(`raw = ${JSON.stringify(ids.map(id => ({ id, state: idle.includes(id) ? 'idle' : 'working', subagents: [], parent: id === 'side' ? 'api' : undefined, ...extra })))}; sync()`); return homes('spot'); },
    run,
    homes: () => homes('home'),
    glide: dt => run(`for (const m of moths.values()) if (m.spot && !m.satellite) glideHome(m, ${dt})`),
  };
}
const KEYS = ['blog', 'api', 'docs', 'infra', 'site', 'lantern', 'admin', 'extension', 'gitops', 'notes', 'scratch', 'web', 'ios', 'data', 'ops', 'side', 'music'];
const closest = homes => {
  const h = Object.values(homes);
  let min = Infinity;
  for (let i = 0; i < h.length; i++) for (let j = i + 1; j < h.length; j++) min = Math.min(min, Math.hypot(h[i][0] - h[j][0], h[i][1] - h[j][1]));
  return min;
};

test('two windows agree on every home, whatever order sessions reached them in and whatever their size', () => {
  const a = open(1), b = open(1.8);
  let one, two;
  for (let i = 1; i <= KEYS.length; i++) one = a.show(KEYS.slice(0, i)); // one by one
  const late = [...KEYS].reverse(); // the other way round, 'side' before the 'api' that started it, and missing 'docs' a while
  for (let i = 1; i <= late.length; i++) b.show(late.slice(0, i).filter(k => k !== 'docs'));
  two = b.show(late);
  assert.strictEqual(Object.keys(one).length, 16, 'sixteen on their own; side orbits api');
  assert.strictEqual(a.run(`return moths.get('side').spot ?? null`), null, 'side, which orbits api, holds no spot of its own');
  assert.deepStrictEqual(two, one, 'the same spot for every session in both windows');
});

test('sessions spread evenly round the lantern, clear of the stand and the string', () => {
  // Sixteen evenly round the oval are 60.8 apart, fewer further; the old overflow put a moth 39 from another.
  const own = KEYS.filter(k => k !== 'side'), w = open();
  for (let n = 2; n <= own.length; n++) {
    const spots = open().show(own.slice(0, n));
    assert.ok(closest(spots) > 55, `${n} sessions: the closest two are ${closest(spots).toFixed(1)} apart`);
    // up to eight, each has a spot of its own as far apart as the ring allows: nobody bunches on one side
    const ring = w.run(`return Array.from({ length: ${Math.max(n, 3)} }, (_, i) => ringHome(i, ${Math.max(n, 3)}))`);
    if (n <= 8) assert.ok(closest(spots) >= closest(ring) - 0.01, `${n} sessions are as spread as ${ring.length} spots: ${closest(spots).toFixed(1)} of ${closest(ring).toFixed(1)}`);
  }
  for (let n = 1; n <= 20; n++) for (let i = 0; i < n; i++) for (const layer of [0, 1]) {
    const [x, y] = w.run(`return ringHome(${i}, ${n}, ${layer})`);
    assert.ok(Math.abs(x - 340) >= 60 - 1e-9 || y > 240, `spot ${i} of ${n} keeps 60 off the string: ${x.toFixed(1)}, ${y.toFixed(1)}`);
    assert.ok(Math.abs(x - 340) >= 150 - 1e-9 || y < 420, `spot ${i} of ${n} keeps off the candle's stand: ${x.toFixed(1)}, ${y.toFixed(1)}`);
  }
  // past sixteen they double up, the second a little further in, never on top of another
  const many = open().show([...own, 'a', 'b', 'c', 'd']);
  assert.strictEqual(Object.keys(many).length, 20);
  assert.ok(closest(many) > 35, `twenty sessions: the closest two are ${closest(many).toFixed(1)} apart`);
});

test('a resting session takes a free spot rather than push out an active one that wants the same', () => {
  // six active and one resting session share seven spots; each wants the spot at its seeded angle
  const w = open(), active = KEYS.slice(0, 6), pref = id => w.run(`const f = seeded(hash('${id}'))(); return [Math.floor(f * 7), f]`);
  const wants = active.map(pref), mine = wants.filter(([i], _, all) => all.filter(([j]) => j === i).length === 1);
  // one that wants a spot only one active session wants, and would get it first if it chose in plain seeded order
  let rest, victim;
  for (let r = 0; r < 500 && !rest; r++) {
    const [i, f] = pref('rest' + r), hit = mine.find(([j, g]) => j === i && f < g);
    if (hit) { rest = 'rest' + r; victim = active[wants.indexOf(hit)]; }
  }
  assert.ok(rest, 'found a resting session that clashes with an active one');
  const both = w.show([...active, rest], [rest]), ring = w.run('return Array.from({ length: 7 }, (_, i) => ringHome(i, 7))');
  assert.deepStrictEqual(both[victim], ring[pref(victim)[0]], `${victim} keeps the spot it wants when ${rest} wants it too`);
  assert.ok(closest(both) >= closest(Object.fromEntries(ring.entries())) - 0.01, `${rest} found a spot of its own: ${closest(both).toFixed(1)}`);
});

test('when a session joins, the others glide to their new homes', () => {
  const w = open();
  w.show(KEYS.slice(0, 11));
  const before = w.homes(), spots = w.show(KEYS.slice(0, 12)); // 'web' joins
  const moved = Object.keys(before).filter(k => Math.hypot(spots[k][0] - before[k][0], spots[k][1] - before[k][1]) > 5);
  assert.ok(moved.length >= 5, `the join makes room: ${moved.length} moths get a new spot`);
  const at = w.homes();
  for (const k of moved) assert.deepStrictEqual(at[k], before[k], `${k}'s home hasn't jumped yet`);
  w.glide(1 / 60);
  const next = w.homes();
  for (const k of moved) {
    const step = Math.hypot(next[k][0] - before[k][0], next[k][1] - before[k][1]), far = Math.hypot(spots[k][0] - before[k][0], spots[k][1] - before[k][1]);
    assert.ok(step > 0 && step < far * 0.05, `${k} sets off a little, ${step.toFixed(2)} of ${far.toFixed(1)}, in one frame`);
  }
  for (let t = 0; t < 4; t += 1 / 60) w.glide(1 / 60);
  const end = w.homes();
  for (const k of moved) assert.ok(Math.hypot(end[k][0] - spots[k][0], end[k][1] - spots[k][1]) < 1, `${k} is there within four seconds`);
});

test('no thread or dotted line ever crosses another, flying or landed, as sessions come and go', () => {
  const own = KEYS.filter(k => k !== 'side');
  // one by one up to sixteen, then a few leave from the middle and the ends, then some come back
  const steps = [...own.map((_, i) => own.slice(0, i + 1)), own.filter(k => !['docs', 'site'].includes(k)),
    own.filter(k => !['docs', 'site', 'blog', 'ops'].includes(k)), own.slice(4, 9), own.slice(0, 12)];
  const resting = own.filter((_, i) => i % 2); // every other one idle, so it lands; the rest are working and fly
  const cross = ([a, b], [c, d]) => { // whether two segments properly intersect
    const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  };
  let landed = 0, flying = 0;
  for (const key of ['chochin', 'moroccan', 'barrel', 'candle']) for (const kx of [1, 1.6]) {
    const w = open(kx);
    w.run(`style = STYLES.${key}`);
    let s = 0;
    for (const ids of steps) {
      w.show(ids, resting);
      w.run('for (const [k, m] of moths) if (m.leaving) moths.delete(k)'); // the ones that left fly off (frame.js drops them)
      for (let f = 0; f < 180; f++, s += 1 / 60) { // three seconds: the others glide to their new homes, the new ones fly in
        // the lantern swaying to and fro by up to 2.5 degrees, which carries the moths on it
        w.run(`swayAngle = ${2.5 * Math.sin(s * 1.7)};
          for (const [k, m] of moths) if (!m.parentId && !m.satellite) { const aim = mothTarget(k, m, 1 / 60, ${s}); if (aim) mothMove(m, aim, 1 / 60, ${s}); }`);
        if (f % 15) continue;
        // every moth's thread, and each landed moth's dotted line from its home to its spot, turned with the lantern
        // (with its home, last)
        const segs = w.run(`return [...moths].filter(([k, m]) => ${JSON.stringify(ids)}.includes(k)).flatMap(([k, m]) => [[k + ' thread', ...threadEnds(m), stretch(m.home)],
          ...m.wasLanded ? [[k + ' dotted line', stretch(m.home), rot(m.perch[0], m.perch[1]), stretch(m.home)]] : []])`);
        for (const [name, [ax, ay], [bx, by]] of segs) if (name.endsWith('thread') && Math.hypot(bx - ax, by - ay) > 20) flying++;
        landed += segs.filter(([name]) => name.endsWith('line')).length;
        for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
          // two homes gliding through each other meet at one point for a moment, and so do their lines: an X with its
          // middle on the homes can't be told from a V. Spots stay put as the lantern sways (perchAt works them out at
          // rest), so a line's far end swings a little past its neighbour's then.
          const [hx, hy] = segs[i][3], [gx, gy] = segs[j][3];
          if (Math.hypot(hx - gx, hy - gy) < 4) continue;
          assert.ok(!cross(segs[i].slice(1, 3), segs[j].slice(1, 3)), `${key} ${kx}x, ${ids.length} sessions, ${f} frames in: ${segs[i][0]} crosses ${segs[j][0]}`);
        }
      }
    }
  }
  assert.ok(landed > 5000 && flying > 5000, `checked ${landed} dotted lines and ${flying} flying moths' threads`);
});

// a frame of every session moth's aim at wall-clock `t` (ms) and frame clock `s`: what each is doing, and where along its line it sits
const fidgets = (w, t, s) => w.run(`Date.now = () => ${t}; for (const [k, m] of moths) if (!m.parentId && !m.satellite) m.wasLanded = mothTarget(k, m, 1 / 30, ${s})?.needsMe;
  return Object.fromEntries([...moths].map(([k, m]) => [k, [m.fidget, m.along]]))`);
const HOP_IDS = KEYS.filter(k => k !== 'side').slice(0, 10);

test('two windows show the same breaths and hops at the same moments, and hop to the same spots', () => {
  // ten sessions waiting 20 minutes, so they're restless and hop now and then; one window has been open a while, the
  // other opens 37 seconds later, each with its own frame clock and window shape
  const t0 = 1.8e12, waiting = { state: 'waiting', waitingSince: t0 - 20 * 60000 }, ids = HOP_IDS, frame = fidgets;
  const a = open(), b = open(1.8);
  a.show(ids, [], waiting);
  for (let i = 0; i < 37 * 30; i++) frame(a, t0 + i / 30 * 1000, i / 30);
  b.show(ids, [], waiting);
  let hops = 0, first = true;
  for (let i = 37 * 30; i < 157 * 30; i++) {
    const one = frame(a, t0 + i / 30 * 1000, i / 30), two = frame(b, t0 + i / 30 * 1000, 500 + i / 30);
    if (first) assert.ok(b.run('return [...moths.values()].some(m => m.hopSlot !== undefined)'), 'the later window opens on moths that have already hopped');
    first = false;
    assert.deepStrictEqual(two, one, `${(i / 30).toFixed(2)}s in, both windows show every moth doing the same thing in the same spot`);
    hops += Object.values(one).filter(([f]) => f === 'hop').length;
  }
  assert.ok(hops > 30, `moths hopped while both watched: ${hops} hop frames`);
});

// A snoozed moth doesn't fidget, but it still moves to each hop's spot (easing over, without the hop), so a window that
// has been open for ages and one opened now put it in the same place. Quiet hours snooze every waiting moth the same way.
test('two windows put snoozed moths in the same spots, however long each has been open', () => {
  const t0 = 1.8e12, snoozed = { state: 'waiting', snoozed: true, waitingSince: t0 - 20 * 60000 };
  const a = open(), b = open(1.8);
  a.show(HOP_IDS, [], snoozed);
  const first = fidgets(a, t0, 0);
  for (let i = 1; i <= 10 * 60; i++) fidgets(a, t0 + i * 1000, i); // ten minutes, a frame a second
  b.show(HOP_IDS, [], snoozed);
  const t = t0 + 600 * 1000, one = fidgets(a, t, 600), two = fidgets(b, t, 5);
  assert.ok(HOP_IDS.every(k => one[k][1] !== first[k][1]), 'every snoozed moth has moved to a later hop\'s spot in the window open all along');
  assert.ok(Object.values(one).every(([f]) => f === ''), 'snoozed moths never breathe or hop');
  assert.deepStrictEqual(two, one, 'both windows show every snoozed moth in the same spot');
});

// Each window is a view of the server's latest snapshot and nothing else. A window open through a snapshot that briefly
// left an agent or a session out (a sweep dropping it a moment before the next one finds it again) used to keep that agent's moth
// marked as leaving after the agent came back, so it flew off and was gone until some later snapshot, while a window
// opened afterwards showed it: "windows that have been open for longer have different # of agents".
test('two windows opened at different times show the same sessions and agents', () => {
  const snap = (docs, ...agents) => JSON.stringify([{ id: 'api', state: 'paused', subagents: agents.map(id => ({ id, type: 'sonnet-implement' })) },
    ...docs ? [{ id: 'docs', state: 'waiting', subagents: [] }] : []]);
  const shows = w => w.run(`return [...moths].filter(([, m]) => !m.leaving).map(([k]) => k).sort()`);
  // a frame's hover areas follow each snapshot (frame.js mothZones), and a leaving moth's turns off
  const zones = w => w.run('for (const m of moths.values()) if (m.zone) mothZones(m, false)');
  const early = open();
  for (const s of [snap(true, 'a1', 'a2'), snap(false, 'a1'), snap(true, 'a1', 'a2')]) { early.run(`raw = ${s}; sync()`); zones(early); } // docs and a2 gone for one
  const late = open();
  late.run(`raw = ${snap(true, 'a1', 'a2')}; sync()`);
  assert.deepStrictEqual(shows(late), ['api', 'api/a1', 'api/a2', 'docs']);
  assert.deepStrictEqual(shows(early), shows(late));
  // and the ones that came back can be hovered and clicked again (card.js zoneAt skips areas that are off)
  assert.deepStrictEqual(early.run(`return [...moths].filter(([, m]) => m.zone?.off).map(([k]) => k)`), []);
});

// A frame of every session moth, the lantern swaying with the clock as in the test above
const step = (w, s) => w.run(`swayAngle = ${2.5 * Math.sin(s * 1.7)};
  for (const [k, m] of moths) if (!m.parentId && !m.satellite) { const aim = mothTarget(k, m, 1 / 60, ${s}); if (aim) mothMove(m, aim, 1 / 60, ${s}); }`);
// each landed moth's spot in the lantern's own frame, how far round its side of the lantern's middle that is (0 straight
// down, PI straight up), how far round the ring its home is, and its side
const spots = w => w.run(`const b = style.body, mid = (b.top + b.bottom) / 2;
  return Object.fromEntries([...moths].filter(([, m]) => m.wasLanded).map(([k, m]) => [k, [m.perch[0], m.perch[1], Math.atan2(Math.abs(m.perch[0] - 340), m.perch[1] - mid), ringRound(m.home), Math.sign(m.perch[0] - 340)]]))`);

// perchAt starts each line as high on the paper as its home is round the ring, so landed moths use the paper's whole
// height in their homes' order. Before, every line fanned out from one point at the paper's middle height, and most
// moths landed within a few units of a neighbour (2.5 to 7 apart at worst, on a third of the height).
test('landed moths spread up and down the paper, in their homes\' order, never on top of each other', () => {
  const own = KEYS.filter(k => k !== 'side');
  for (const key of ['chochin', 'moroccan', 'barrel', 'candle']) for (const kx of [1, 1.6]) for (const n of [3, 5, 8]) for (const total of [n, 12, 16]) for (const skip of [1, 3, 7]) {
    const w = open(kx), ids = own.slice(0, total), idle = ids.filter((_, i) => (i * skip) % total < n);
    w.run(`style = STYLES.${key}`);
    w.show(ids, idle);
    w.run('for (const m of moths.values()) m.home = m.spot'); // settled at home
    for (let f = 0; f < 300; f++) step(w, f / 60);
    const at = spots(w), all = Object.values(at), where = `${key} ${kx}x, ${idle.length} of ${total} landed`;
    assert.strictEqual(all.length, idle.length, `${where}: every resting moth landed`);
    for (const [a, pa] of Object.entries(at)) for (const [b, pb] of Object.entries(at)) if (a < b) {
      const gap = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
      assert.ok(gap > 12, `${where}: ${a} and ${b} sit ${gap.toFixed(1)} apart`);
      // on one side, the one whose home is further round the ring sits further round the lantern
      if (pa[4] === pb[4]) assert.ok((pa[3] - pb[3]) * (pa[2] - pb[2]) > 0, `${where}: ${a} and ${b} sit in their homes' order`);
    }
    if (idle.length >= 5) { // with a few on the paper, they reach most of the way up and down it
      const height = w.run('const b = style.body; return (b.bottom - b.top) * 2 * PERCH_SPREAD'), ys = all.map(p => p[1]);
      assert.ok(Math.max(...ys) - Math.min(...ys) > 0.6 * height, `${where}: they span ${(Math.max(...ys) - Math.min(...ys)).toFixed(0)} of ${height.toFixed(0)}`);
    }
  }
});

// A landed moth rides its spot exactly (mothMove), so its spot has to glide, never jump. Landing depends on nothing but
// the moth's own home, and a home glides round the ring (glideHome), so its spot glides with it. Before, a home gliding
// across the top took its spot over to the other side in a single frame, 87 units.
test('a moth landing, or a session joining, never makes a landed moth jump', () => {
  const w = open(), ids = KEYS.filter(k => k !== 'side').slice(0, 10), idle = ids.filter((_, i) => i % 2);
  w.show(ids, idle);
  w.run('for (const m of moths.values()) m.home = m.spot');
  let s = 0;
  for (; s < 5; s += 1 / 60) step(w, s);
  const pos = () => w.run(`return Object.fromEntries([...moths].filter(([, m]) => m.wasLanded).map(([k, m]) => [k, [m.x, m.y]]))`);
  // the most any landed moth but `skip` moves in a frame, over four seconds
  const worst = skip => {
    let most = 0;
    for (let f = 0; f < 240; f++, s += 1 / 60) {
      const a = pos();
      step(w, s);
      const b = pos();
      for (const k of Object.keys(a)) if (b[k] && k !== skip) most = Math.max(most, Math.hypot(b[k][0] - a[k][0], b[k][1] - a[k][1]));
    }
    return most;
  };
  w.run(`raw = raw.map(s => s.id === 'blog' ? { ...s, state: 'waiting' } : s); sync()`); // blog needs you and lands; no home moves
  const landing = worst('blog');
  assert.ok(landing < 1, `as blog lands, the others only ride the sway: ${landing.toFixed(2)} a frame at most`);
  const before = w.homes(), spot = w.show([...ids, 'web', 'ios'], [...idle, 'blog']); // two more join, and homes move round to make room
  const moved = Object.keys(before).filter(k => Math.hypot(spot[k][0] - before[k][0], spot[k][1] - before[k][1]) > 20);
  assert.ok(moved.some(k => w.run(`return moths.get('${k}').wasLanded`)), `the join moves landed moths' homes: ${moved}`);
  const joining = worst();
  assert.ok(joining < 15, `as homes glide round, a landed moth moves ${joining.toFixed(2)} a frame at most`);
});

// A landed moth's spot is worked out on the lantern at rest (perchAt), so it stays put on the paper however the lantern
// sways, and the moth rides it. Before, the spot was worked out from the home turned into the swaying lantern's frame,
// so it slid 5 to 8 units over a swing, further the lower it sat.
test('a landed moth stays put on the paper as the lantern sways', () => {
  for (const key of ['chochin', 'moroccan', 'barrel', 'candle']) {
    const w = open(), ids = KEYS.filter(k => k !== 'side').slice(0, 12);
    w.run(`style = STYLES.${key}`);
    w.show(ids, ids.filter((_, i) => i % 2));
    w.run('for (const m of moths.values()) m.home = m.spot');
    const frame = (a, s) => w.run(`swayAngle = ${a};
      for (const [k, m] of moths) { const aim = mothTarget(k, m, 1 / 60, ${s}); if (aim) mothMove(m, aim, 1 / 60, ${s}); }
      return Object.fromEntries([...moths].filter(([, m]) => m.wasLanded).map(([k, m]) => [k, rot(m.x - 2 * m.size, m.y - 6 * m.size, -swayAngle)]))`); // its wing joint, on the paper, in the lantern's frame
    let s = 0;
    for (; s < 6; s += 1 / 60) frame(0, s); // landed and settled, the lantern still
    const rest = frame(0, s);
    assert.strictEqual(Object.keys(rest).length, 6, `${key}: six moths landed`);
    for (let i = 1; i <= 600; i++) { // one full swing, out to 2.5 degrees each way (the candle never sways, but its spots hold the same)
      const at = frame(2.5 * Math.sin(i / 600 * 2 * Math.PI), s += 1 / 60);
      for (const k in rest) {
        const d = Math.hypot(at[k][0] - rest[k][0], at[k][1] - rest[k][1]);
        assert.ok(d < 0.05, `${key}: ${k}, landed at y ${rest[k][1].toFixed(0)}, has slid ${d.toFixed(2)} along the paper ${i} frames into the swing`);
      }
    }
  }
});
