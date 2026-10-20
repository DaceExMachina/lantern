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
    hoverZone: () => ({}), areas: { get: () => ({}) }, alertMe() {} }); // the hover cards (card.js) and notifications aren't loaded
  for (const f of ['scene', 'dev', 'lanterns', 'state', 'stale', 'frame']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'page', f + '.js'), 'utf8'), page, { filename: f + '.js' });
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

test('the dotted lines from homes to landed moths never cross, as sessions come and go', () => {
  const own = KEYS.filter(k => k !== 'side');
  // one by one up to sixteen, then a few leave from the middle and the ends, then some come back
  const steps = [...own.map((_, i) => own.slice(0, i + 1)), own.filter(k => !['docs', 'site'].includes(k)),
    own.filter(k => !['docs', 'site', 'blog', 'ops'].includes(k)), own.slice(4, 9), own.slice(0, 12)];
  const cross = ([a, b], [c, d]) => { // whether two segments properly intersect
    const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  };
  let lines = 0;
  for (const key of ['chochin', 'moroccan', 'barrel', 'candle']) for (const kx of [1, 1.6]) {
    const w = open(kx);
    w.run(`style = STYLES.${key}`);
    let s = 0;
    for (const ids of steps) {
      w.show(ids, ids); // all of them idle, so every moth lands
      w.run('for (const [k, m] of moths) if (m.leaving) moths.delete(k)'); // the ones that left fly off (frame.js drops them)
      for (let f = 0; f < 180; f++, s += 1 / 60) { // three seconds: the others glide to their new homes
        // the lantern swaying to and fro by up to 2.5 degrees, which carries the moths on it
        w.run(`swayAngle = ${2.5 * Math.sin(s * 1.7)}; for (const [k, m] of moths) if (!m.parentId && !m.satellite) m.wasLanded = mothTarget(k, m, 1 / 60, ${s})?.needsMe`); // mothMove would set wasLanded
        if (f % 15) continue;
        // each line runs from the home to the landed moth's wing joint, its perch turned with the lantern
        const segs = w.run(`return [...moths].filter(([k, m]) => ${JSON.stringify(ids)}.includes(k) && m.perch).map(([k, m]) => [k, stretch(m.home), rot(m.perch[0], m.perch[1])])`);
        assert.strictEqual(segs.length, ids.length, `${key}: all ${ids.length} landed`);
        lines += segs.length;
        for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
          assert.ok(!cross(segs[i].slice(1), segs[j].slice(1)), `${key} ${kx}x, ${ids.length} sessions, ${f} frames in: ${segs[i][0]}'s line crosses ${segs[j][0]}'s`);
        }
      }
    }
  }
  assert.ok(lines > 10000, `checked ${lines} lines`);
});

test('two windows show the same breaths and hops at the same moments, and hop to the same spots', () => {
  // ten sessions waiting 20 minutes, so they're restless and hop now and then; one window has been open a while, the
  // other opens 37 seconds later, each with its own frame clock and window shape
  const t0 = 1.8e12, waiting = { state: 'waiting', waitingSince: t0 - 20 * 60000 }, ids = KEYS.filter(k => k !== 'side').slice(0, 10);
  const frame = (w, t, s) => w.run(`Date.now = () => ${t}; for (const [k, m] of moths) if (!m.parentId && !m.satellite) m.wasLanded = mothTarget(k, m, 1 / 30, ${s})?.needsMe;
    return Object.fromEntries([...moths].map(([k, m]) => [k, [m.fidget, m.along]]))`);
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
