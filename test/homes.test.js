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
    hoverZone: () => ({}), areas: { get: () => ({}) } }); // the hover cards (card.js) aren't loaded
  for (const f of ['scene', 'dev', 'lanterns', 'state', 'stale', 'frame']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'page', f + '.js'), 'utf8'), page, { filename: f + '.js' });
  const run = code => JSON.parse(vm.runInContext(`JSON.stringify((() => { ${code} })())`, page) ?? 'null');
  run(`VIEW.kx = ${kx}`);
  const homes = what => run(`return Object.fromEntries([...moths].filter(([, m]) => !m.leaving && !m.satellite).map(([k, m]) => [k, m.${what}]))`);
  return {
    /** the server sends these sessions ('side' is one 'api' started); the spot each one on its own was given */
    show: (ids, idle = []) => { run(`raw = ${JSON.stringify(ids.map(id => ({ id, state: idle.includes(id) ? 'idle' : 'working', subagents: [], parent: id === 'side' ? 'api' : undefined })))}; sync()`); return homes('spot'); },
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

test('one to sixteen sessions stay well apart', () => {
  // Sixteen evenly round the oval are 67.6 apart, fewer further; the old overflow put a moth 39 from another.
  const own = KEYS.filter(k => k !== 'side');
  for (let n = 2; n <= own.length; n++) {
    const spots = open().show(own.slice(0, n));
    assert.ok(closest(spots) > 65, `${n} sessions: the closest two are ${closest(spots).toFixed(1)} apart`);
  }
  // past sixteen they double up, the second a little further in, never on top of another
  const many = open().show([...own, 'a', 'b', 'c', 'd']);
  assert.strictEqual(Object.keys(many).length, 20);
  assert.ok(closest(many) > 35, `twenty sessions: the closest two are ${closest(many).toFixed(1)} apart`);
});

test('a resting session takes a free spot rather than push out an active one that wants the same', () => {
  const w = open(), active = KEYS.slice(0, 6), pref = id => w.run(`return [Math.floor(seeded(hash('${id}'))() * 8), seeded(hash('${id}'))()]`);
  const taken = active.map(pref);
  // one that wants a spot an active session holds, and would get it first if it chose in plain hash order
  const rest = Array.from({ length: 200 }, (_, i) => 'rest' + i).find(id => taken.some(([i, f]) => pref(id)[0] === i && pref(id)[1] < f));
  assert.ok(rest, 'found a resting session that clashes with an active one');
  const alone = w.show(active), both = w.show([...active, rest], [rest]);
  for (const k of active) assert.deepStrictEqual(both[k], alone[k], `${k} keeps its spot when ${rest} rests nearby`);
  assert.ok(closest(both) > 100, `${rest} found a spot of its own: ${closest(both).toFixed(1)}`);
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
