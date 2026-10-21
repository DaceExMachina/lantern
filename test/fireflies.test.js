// How a PR's firefly leaves (page/fireflies.js swarm): merged, closed and just gone each take their own way out, one
// flying off goes only once it and its bloom are wholly outside the window, and the path is the same in every window,
// timed from when the server saw the change. Plain classic scripts run in a vm context.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const T0 = 1.8e12, FRAME = 1000 / 60, URL = 'https://github.com/o/r/pull/7';
// a window `kx` times as wide and `ky` times as tall as the 600-unit square, laid out as fitView does
function window(kx = 1, ky = 1) {
  const page = vm.createContext({ URLSearchParams, location: { search: '' }, performance });
  for (const f of ['scene', 'dev', 'lanterns', 'state', 'fireflies', 'stale', 'frame']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'page', f + '.js'), 'utf8'), page, { filename: f + '.js' });
  const run = code => vm.runInContext(code, page);
  run(`Object.assign(VIEW, { kx: ${kx}, ky: ${ky}, box: [${340 - 300 * kx}, ${320 - 300 * ky}, ${600 * kx}, ${600 * ky}] })`);
  // one frame at wall clock `now`: the firefly's light [x, y, radius, brightness], or null once it's gone
  run(`var step = (flies, want, home, now) => { flyLightN = 0; swarm(flies, want, home, [34, 55], 1 / 60, now / 1000 - ${T0 / 1000}, now); return flyLightN ? [...flyLights.slice(0, 4)] : null; }`);
  return { run, box: run('VIEW.box'), flies: run('new Map()') };
}
// A draft PR's firefly circles `home` from `from` (ms before T0), then from T0 the server says `then` (null: it's not in
// the list any more), which this window hears `late` ms after. Its lights from T0 on, until it goes, and the firefly.
function play(win, home, then, { from = 3000, late = 0 } = {}) {
  const live = new Map([[URL, { need: 'draft', seen: 0, since: 0 }]]), after = new Map(then ? [[URL, then]] : []), lights = [];
  for (let i = -Math.round(from / FRAME); i < 0; i++) win.run('step')(win.flies, live, home, T0 + i * FRAME);
  const fly = win.flies.get(URL);
  for (let i = 0; i < 1200; i++) {
    const now = T0 + i * FRAME, light = win.run('step')(win.flies, now < T0 + late ? live : after, home, now);
    if (!light) return { lights, fly, at: now };
    lights.push(light);
  }
  return { lights, fly, at: null };
}
const merged = { need: 'merged', was: 'draft', seen: 0, since: T0 }, closed = { need: 'closed', was: 'draft', seen: 0, since: T0 };

test('merged, closed and just gone each leave their own way', () => {
  const left = [150, 320]; // a moth's home left of the lantern, nearer the left edge than any other
  { // merged: a flare, a loop up and over, then out the far (right) side, still bright
    const win = window(), [bx, , bw] = win.box, { lights, at } = play(win, left, merged);
    assert.ok(at, 'it goes in the end');
    assert.ok(Math.max(...lights.map(l => l[3])) > 1.5, 'it flares brighter than a firefly ever swells');
    assert.ok(Math.min(...lights.map(l => l[1])) < lights[0][1] - 50, 'it loops up');
    const last = lights.at(-1);
    assert.ok(last[0] > bx + bw, `it leaves through the right edge: ${last}`);
    assert.ok(last[3] > 1, `and is still bright as it goes: ${last[3]}`);
  }
  { // closed: dimmer, out the nearest (left) edge
    const win = window(), [bx] = win.box, { lights, at } = play(win, left, closed);
    assert.ok(at, 'it goes in the end');
    assert.ok(Math.max(...lights.map(l => l[3])) <= 1, 'no flare');
    assert.ok(lights.at(-1)[3] < 0.6, 'it dims');
    assert.ok(lights.at(-1)[0] < bx, `it leaves through the left edge: ${lights.at(-1)}`);
  }
  { // gone: it drifts a little way out and fades where it is, over 2.5s
    const win = window(), [bx, by, bw, bh] = win.box, { lights, at } = play(win, left, null), [x, y, , glow] = lights.at(-1);
    assert.ok(at >= T0 + 2500 && at < T0 + 2500 + 2 * FRAME, `it goes after 2.5s: ${at - T0}ms`);
    assert.ok(x > bx && x < bx + bw && y > by && y < by + bh, 'still in the window as it fades');
    assert.ok(glow < 0.05, `faded out: ${glow}`);
  }
});

for (const [name, kx, ky] of [['square', 1, 1], ['wide', 3, 1], ['tall', 1, 3]]) {
  test(`a firefly flying off a ${name} window goes only once it and its bloom are wholly outside`, () => {
    for (let i = 0; i < 12; i++) {
      const home = [340 + Math.cos(i * Math.PI / 6) * 160, 320 + Math.sin(i * Math.PI / 6) * 160];
      for (const then of [merged, closed]) {
        const win = window(kx, ky), [bx, by, bw, bh] = win.box, { fly, at } = play(win, home, then), { x, y, size } = fly;
        assert.ok(at, `${then.need} from ${home}: it goes in the end`);
        assert.ok(x < bx - size || x > bx + bw + size || y < by - size || y > by + bh + size,
          `${then.need} from ${home.map(Math.round)}: removed at ${x.toFixed(0)},${y.toFixed(0)} with its ${size.toFixed(0)}-unit bloom still reaching ${bx},${by} ${bw}x${bh}`);
      }
    }
  });
}

test('a merged firefly takes the same path in every window, timed from when the server saw it', () => {
  // two windows that have had the firefly for different lengths of time (so it's at different points on its circle),
  // one hearing of the merge half a second late: from then on, the two move exactly in step
  const a = play(window(), [150, 320], merged, { from: 5000 }), b = play(window(), [150, 320], merged, { from: 1000, late: 500 });
  const skip = Math.ceil(500 / FRAME), n = Math.min(a.lights.length, b.lights.length) - skip;
  assert.ok(n > 60, `both fly for a while: ${n} frames`);
  const [dx, dy] = [a.lights[skip][0] - b.lights[skip][0], a.lights[skip][1] - b.lights[skip][1]];
  for (let i = skip; i < skip + n; i++) {
    assert.ok(Math.abs(a.lights[i][0] - b.lights[i][0] - dx) < 1e-3 && Math.abs(a.lights[i][1] - b.lights[i][1] - dy) < 1e-3, `frame ${i}: out of step`); // the lights are 32-bit
    assert.ok(Math.abs(a.lights[i][3] - b.lights[i][3]) < 1e-5, `frame ${i}: brightness`);
  }
});
