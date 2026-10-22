// How a PR's firefly leaves (page/fireflies.js swarm): merged, closed and just gone each take their own way out, one
// flying off goes only once it and its bloom are wholly outside the window, and the path is the same in every window,
// timed from when the server saw the change, in the same spot. Plain classic scripts run in a vm context.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const T0 = 1.8e12, FRAME = 1000 / 60, URL = 'https://github.com/o/r/pull/7';
// a window `kx` times as wide and `ky` times as tall as the 600-unit square, laid out as fitView does
function window(kx = 1, ky = 1) {
  const page = vm.createContext({ URLSearchParams, location: { search: '' }, performance });
  for (const f of ['scene', 'dev', 'lanterns', 'state', 'fireflies', 'stale', 'frame']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'page', f + '.js'), 'utf8'), page, { filename: f + '.js' });
  const run = code => vm.runInContext(code, page);
  run(`Object.assign(VIEW, { kx: ${kx}, ky: ${ky}, box: [${340 - 300 * kx}, ${320 - 300 * ky}, ${600 * kx}, ${600 * ky}] })`);
  // one frame at wall clock `now`: the firefly's light [x, y, radius, brightness], or null once it's gone
  run(`var step = (flies, want, home, now) => { flyLightN = 0; swarm(flies, want, home, [34, 55], 1 / 60, now); return flyLightN ? [...flyLights.slice(0, 4)] : null; }`);
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
    assert.ok(at && at - T0 < 4000, `it flies off promptly: ${at && at - T0}ms`);
    assert.ok(Math.max(...lights.map(l => l[3])) > 1.1, 'it flares brighter than a firefly ever swells (1 at most)');
    assert.ok(Math.min(...lights.map(l => l[1])) < lights[0][1] - 50, 'it loops up');
    const last = lights.at(-1);
    assert.ok(last[0] > bx + bw, `it leaves through the right edge: ${last}`);
    assert.ok(last[3] > 1, `and is still bright as it goes: ${last[3]}`);
  }
  { // closed: dimmer, out the nearest (left) edge
    const win = window(), [bx] = win.box, { lights, at } = play(win, left, closed);
    assert.ok(at && at - T0 < 4000, `it flies off promptly: ${at && at - T0}ms`);
    assert.ok(Math.max(...lights.map(l => l[3])) <= 1, 'no flare');
    assert.ok(lights.at(-1)[3] < 0.6, 'it dims');
    assert.ok(lights.at(-1)[0] < bx, `it leaves through the left edge: ${lights.at(-1)}`);
  }
  { // gone: it drifts a little way out from its circle and fades, over 2.5s
    const win = window(), { lights, at } = play(win, left, null), [x, y, , glow] = lights.at(-1);
    assert.ok(at >= T0 + 2500 && at < T0 + 2500 + 2 * FRAME, `it goes after 2.5s: ${at - T0}ms`);
    assert.ok(Math.hypot(x - left[0], y - left[1]) < 55 + 70 * 2.5 + 25, `only drifting, not flying off: ${x},${y}`); // its circle, the drift, the wobble
    assert.ok(glow < 0.05, `faded out: ${glow}`);
  }
});

for (const [name, kx, ky] of [['square', 1, 1], ['wide', 3, 1], ['tall', 1, 3]]) {
  test(`a firefly flying off a ${name} window goes only once it and its bloom are wholly outside`, () => {
    for (let i = 0; i < 12; i++) {
      const home = [340 + Math.cos(i * Math.PI / 6) * 160, 320 + Math.sin(i * Math.PI / 6) * 160];
      for (const then of [merged, closed]) {
        const win = window(kx, ky), [bx, by, bw, bh] = win.box, { fly, at } = play(win, home, then), { x, y, size } = fly;
        assert.ok(at && at - T0 < 4000, `${then.need} from ${home}: it goes once it's off screen, promptly: ${at && at - T0}ms`);
        assert.ok(x < bx - size || x > bx + bw + size || y < by - size || y > by + bh + size,
          `${then.need} from ${home.map(Math.round)}: removed at ${x.toFixed(0)},${y.toFixed(0)} with its ${size.toFixed(0)}-unit bloom still reaching ${bx},${by} ${bw}x${bh}`);
      }
    }
  });
}

test('a firefly is in the same spot in every window, and a merged one takes the same path, timed from when the server saw it', () => {
  // two windows that have had the firefly for different lengths of time, one hearing of the merge half a second late:
  // both draw it in the same place, circling and then flying off
  const a = play(window(), [150, 320], merged, { from: 5000 }), b = play(window(), [150, 320], merged, { from: 1000, late: 500 });
  assert.ok(a.lights.length > 60 && b.lights.length === a.lights.length, `both fly for a while and go together: ${a.lights.length}, ${b.lights.length} frames`);
  const circling = window(), live = new Map([[URL, { need: 'draft', seen: 0, since: 0 }]]), other = window();
  for (let i = 0; i < 300; i++) circling.run('step')(circling.flies, live, [150, 320], T0 + i * FRAME); // one window's had it 5s
  const here = circling.run('step')(circling.flies, live, [150, 320], T0 + 300 * FRAME), there = other.run('step')(other.flies, live, [150, 320], T0 + 300 * FRAME);
  assert.ok(Math.hypot(here[0] - there[0], here[1] - there[1]) < 1e-3, `circling in the same spot: ${here} vs ${there}`);
  const skip = Math.ceil(500 / FRAME);
  for (let i = skip; i < a.lights.length; i++) {
    assert.ok(Math.hypot(a.lights[i][0] - b.lights[i][0], a.lights[i][1] - b.lights[i][1]) < 1e-3, `frame ${i}: ${a.lights[i]} vs ${b.lights[i]}`); // the lights are 32-bit
    assert.ok(Math.abs(a.lights[i][3] - b.lights[i][3]) < 1e-5, `frame ${i}: brightness`);
  }
});

test('a merged firefly near the top edge plays its whole loop before it can be removed', () => {
  // its loop dips off the top of the window and back; only the exit takes it away for good
  const win = window(), { at, fly } = play(win, [340, 10], merged);
  const exit = win.run(`exitAt(${fly.leave.start})`) * 1000;
  assert.ok(at - T0 >= exit, `removed at ${at - T0}ms, before the exit starts at ${exit.toFixed(0)}ms`);
});

test('a moth leaving mid-merge does not cut the merge short or make its firefly jump', () => {
  const win = window(), home = [150, 320], live = new Map([[URL, { need: 'draft', seen: 0, since: 0 }]]);
  for (let i = -180; i < 0; i++) win.run('step')(win.flies, live, home, T0 + i * FRAME);
  const fly = win.flies.get(URL);
  let prev, step, worst = 0, last;
  for (let i = 0; i < 1200; i++) {
    const now = T0 + i * FRAME, light = win.run('step')(win.flies, now < T0 + 800 ? new Map([[URL, merged]]) : new Map(), home, now); // the moth goes at 0.8s
    if (!light) break;
    const next = prev && [light[0] - prev[0], light[1] - prev[1]]; // this frame's step
    if (step && i > 40) worst = Math.max(worst, Math.hypot(next[0] - step[0], next[1] - step[1])); // how much it changed from the last frame's
    prev = light; step = next; last = i;
  }
  assert.strictEqual(fly.leave.kind, 'merged', 'still a merge');
  assert.ok(last * FRAME > 1500, `it carried on to its exit: ${last * FRAME}ms`);
  assert.ok(worst < 4, `no jump: its step changed by ${worst.toFixed(1)} units in a frame`);
});

test('a reopened PR fades up from the closed colour, not the fallback blue', () => {
  const win = window(), home = [150, 320], hex = c => win.run(`hex(FLY.${c}).map(v => v / 255)`);
  for (let i = -60; i < 0; i++) win.run('step')(win.flies, new Map([[URL, { need: 'draft', seen: 0, since: 0 }]]), home, T0 + i * FRAME);
  for (let i = 0; i < 18; i++) win.run('step')(win.flies, new Map([[URL, closed]]), home, T0 + i * FRAME); // flying off, 0.3s in
  const back = T0 + 18 * FRAME;
  win.run('step')(win.flies, new Map([[URL, { need: 'draft', was: 'closed', seen: 0, since: back }]]), home, back);
  const col = win.run('[...flyLights.slice(4, 7)]');
  assert.notDeepStrictEqual(hex('closed').map(v => v.toFixed(3)), hex('quiet').map(v => v.toFixed(3)), 'closed has a colour of its own');
  assert.deepStrictEqual(col.map(v => v.toFixed(3)), hex('closed').map(v => v.toFixed(3)), 'it starts from the closed colour');
});

// The merge is one continuous motion: the shake, the loop and the exit overlap, each fading out as the next fades in, both
// already moving. Over each overlap it never comes near a stop, and nowhere does its velocity jump.
test('the merge is one motion: no jump, and no rest point where the shake becomes the loop or the loop the exit', () => {
  const win = window(), h = 1e-4;
  for (const d of [[1, 0], [-1, 0], [0.92, -0.38], [-0.94, 0.34], [0.6, 0.8]]) {
    const start = win.run(`loopStart([${d}])`), exitAt = win.run(`exitAt(${start})`), blend = win.run('BLEND');
    const pos = t => win.run(`leaveStep('merged', ${t}, [${d}], ${start})`).slice(0, 2);
    const vel = t => [pos(t + h), pos(t - h)].reduce((a, b) => a.map((v, i) => (v - b[i]) / (2 * h))), speed = t => Math.hypot(...vel(t));
    let worst = 0;
    for (let t = 0.3; t < exitAt + blend + 0.2; t += 0.001) worst = Math.max(worst, Math.hypot(...vel(t + 0.001).map((v, i) => v - vel(t)[i])));
    assert.ok(worst < 40, `heading ${d}: its velocity jumps by ${worst.toFixed(0)} units/s in a millisecond`);
    for (const [from, whole] of [[start, speed(start + blend)], [exitAt, speed(exitAt + blend)]]) { // each overlap against the speed of the motion taking over
      let slowest = Infinity, at;
      for (let t = from; t <= from + blend; t += 0.001) if (speed(t) < slowest) { slowest = speed(t); at = t; }
      assert.ok(slowest > whole * 0.5, `heading ${d}: over the overlap from ${from.toFixed(2)}s it slows to ${slowest.toFixed(0)} units/s at ${at.toFixed(3)}s, with ${whole.toFixed(0)} once the next motion has taken over`);
    }
  }
});

test('the dev panel\'s play merge button plays a merge on a firefly of a moth', () => {
  const win = window(), lights = [], flies = win.run('new Map()'), live = new Map([[URL, { need: 'draft', seen: 0, since: 0 }]]), now = Date.now();
  win.run('step')(flies, live, [150, 320], now); // a moth's firefly, circling
  win.run('moths').set('m', { flies });
  win.run("devRows.find(r => r.label === 'play merge').onChange()");
  for (let i = 1; i < 1200; i++) {
    const light = win.run('step')(flies, live, [150, 320], now + i * FRAME); // the moth's PR is still a draft, as far as the server says
    if (!light) break;
    lights.push(light);
  }
  assert.ok(lights.length > 60 && lights.length < 240, `it plays and goes: ${lights.length} frames`);
  assert.ok(Math.max(...lights.map(l => l[3])) > 1.1, 'a merge flares');
});

test('a session with more than 10 PRs: a merge nobody saw does not push a showing firefly out, but a showing one is kept', () => {
  const win = window(), pr = (i, need) => ({ url: `${URL}/${i}`, need });
  const ten = [...Array(10)].map((_, i) => pr(i, 'waiting'));
  win.run(`var mm = { session: { github: ${JSON.stringify(ten)} }, home: [150, 320], flyLine: { getAttribute() {}, setAttribute() {} } }`);
  win.run('mothFireflies(mm, 1 / 60, 0)');
  assert.strictEqual(win.run('mm.flies.size'), 10, 'ten fireflies');
  // two new open PRs arrive, one PR nobody saw merges, and one of the ten merges (the server keeps merged ones at the end)
  win.run(`mm.session.github = ${JSON.stringify([...ten.slice(0, 9), pr(10, 'waiting'), pr(11, 'waiting'), pr(12, 'merged'), pr(9, 'merged')])}`);
  win.run('mothFireflies(mm, 1 / 60, 0)');
  assert.strictEqual(win.run('[...mm.flies.values()].filter(f => f.leave?.kind === "gone").length'), 0, 'none is pushed out');
  assert.strictEqual(win.run('mm.flies.get("' + `${URL}/9` + '").leave.kind'), 'merged', 'the one that was showing merges');
  assert.strictEqual(win.run('mm.flies.has("' + `${URL}/12` + '")'), false, 'and the one nobody saw gets none');
});
