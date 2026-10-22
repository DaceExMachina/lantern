// Where session moths live (src/scene/state.js sync, src/scene/scene.js ringHome): spread evenly round the lantern, worked out from
// the server's session list alone so every window agrees, and gliding (src/scene/frame.js glideHome) when sessions come or go.
// sync() runs for real, on the page's own markup.
import assert from 'node:assert';
import { afterEach, test, vi } from 'vitest';
import { layOut } from './page.js';

afterEach(() => vi.restoreAllMocks());

// a window on the lantern, `kx` times as wide as it is tall, with the page's modules afresh (so its sessions are its own)
async function open(kx = 1) {
  layOut(); vi.resetModules();
  const [{ live }, scene, state, frame, lanterns] = await Promise.all(['live', 'scene', 'state', 'frame', 'lanterns'].map(f => import(`../src/scene/${f}.js`)));
  scene.VIEW.kx = kx;
  const { moths } = live;
  const sync = raw => { live.raw = raw; state.sync(); }; // the server sends these sessions
  // what each session moth has under `what`, as a copy (the moths go on moving)
  const homes = what => structuredClone(Object.fromEntries([...moths].filter(([, m]) => !m.leaving && !m.satellite).map(([k, m]) => [k, m[what]])));
  return {
    live, moths, scene, frame, lanterns,
    /** the server sends these sessions ('side' is one 'api' started); the spot each one on its own was given */
    show: (ids, idle = [], extra = {}) => { sync(ids.map(id => ({ id, state: idle.includes(id) ? 'idle' : 'working', subagents: [], parent: id === 'side' ? 'api' : undefined, ...extra }))); return homes('spot'); },
    sync,
    homes: () => homes('home'),
    glide: dt => { for (const m of moths.values()) if (m.spot && !m.satellite) frame.glideHome(m, dt); },
    /** settled at home */
    settled: () => { for (const m of moths.values()) m.home = m.spot; },
    /** the lantern swung out to `deg` (frame.js swingLantern, which a standing lantern holds at 0) */
    sway: (deg, s) => { frame.swing.a = deg; frame.swingLantern(0, s); },
    /** a frame of every session moth's aim at frame clock `s` */
    fly: s => { for (const [k, m] of moths) if (!m.parentId && !m.satellite) { const aim = frame.mothTarget(k, m, 1 / 60, s); if (aim) frame.mothMove(m, aim, 1 / 60, s); } },
  };
}
// the two sweeps over every lantern, window shape and crowd take a while: thousands of frames, a page afresh for each
const SLOW = { timeout: 120000 };
const KEYS = ['blog', 'api', 'docs', 'infra', 'site', 'lantern', 'admin', 'extension', 'gitops', 'notes', 'scratch', 'web', 'ios', 'data', 'ops', 'side', 'music'];
const closest = homes => {
  const h = Object.values(homes);
  let min = Infinity;
  for (let i = 0; i < h.length; i++) for (let j = i + 1; j < h.length; j++) min = Math.min(min, Math.hypot(h[i][0] - h[j][0], h[i][1] - h[j][1]));
  return min;
};

test('two windows agree on every home, whatever order sessions reached them in and whatever their size', async () => {
  const a = await open(1), b = await open(1.8);
  let one, two;
  for (let i = 1; i <= KEYS.length; i++) one = a.show(KEYS.slice(0, i)); // one by one
  const late = [...KEYS].reverse(); // the other way round, 'side' before the 'api' that started it, and missing 'docs' a while
  for (let i = 1; i <= late.length; i++) b.show(late.slice(0, i).filter(k => k !== 'docs'));
  two = b.show(late);
  assert.strictEqual(Object.keys(one).length, 16, 'sixteen on their own; side orbits api');
  assert.strictEqual(a.moths.get('side').spot ?? null, null, 'side, which orbits api, holds no spot of its own');
  assert.deepStrictEqual(two, one, 'the same spot for every session in both windows');
});

test('sessions spread evenly round the lantern, clear of the stand and the string', async () => {
  // Sixteen evenly round the oval are 60.8 apart, fewer further; the old overflow put a moth 39 from another.
  const own = KEYS.filter(k => k !== 'side'), w = await open();
  for (let n = 2; n <= own.length; n++) {
    const spots = (await open()).show(own.slice(0, n));
    assert.ok(closest(spots) > 55, `${n} sessions: the closest two are ${closest(spots).toFixed(1)} apart`);
    // up to eight, each has a spot of its own as far apart as the ring allows: nobody bunches on one side
    const ring = Array.from({ length: Math.max(n, 3) }, (_, i) => w.scene.ringHome(i, Math.max(n, 3)));
    if (n <= 8) assert.ok(closest(spots) >= closest(ring) - 0.01, `${n} sessions are as spread as ${ring.length} spots: ${closest(spots).toFixed(1)} of ${closest(ring).toFixed(1)}`);
  }
  for (let n = 1; n <= 20; n++) for (let i = 0; i < n; i++) for (const layer of [0, 1]) {
    const [x, y] = w.scene.ringHome(i, n, layer);
    assert.ok(Math.abs(x - 340) >= 60 - 1e-9 || y > 240, `spot ${i} of ${n} keeps 60 off the string: ${x.toFixed(1)}, ${y.toFixed(1)}`);
    assert.ok(Math.abs(x - 340) >= 150 - 1e-9 || y < 420, `spot ${i} of ${n} keeps off the candle's stand: ${x.toFixed(1)}, ${y.toFixed(1)}`);
  }
  // past sixteen they double up, the second a little further in, never on top of another
  const many = (await open()).show([...own, 'a', 'b', 'c', 'd']);
  assert.strictEqual(Object.keys(many).length, 20);
  assert.ok(closest(many) > 35, `twenty sessions: the closest two are ${closest(many).toFixed(1)} apart`);
});

test('a resting session takes a free spot rather than push out an active one that wants the same', async () => {
  // six active and one resting session share seven spots; each wants the spot at its seeded angle
  const w = await open(), active = KEYS.slice(0, 6), pref = id => { const f = w.lanterns.seeded(w.lanterns.hash(id))(); return [Math.floor(f * 7), f]; };
  const wants = active.map(pref), mine = wants.filter(([i], _, all) => all.filter(([j]) => j === i).length === 1);
  // one that wants a spot only one active session wants, and would get it first if it chose in plain seeded order
  let rest, victim;
  for (let r = 0; r < 500 && !rest; r++) {
    const [i, f] = pref('rest' + r), hit = mine.find(([j, g]) => j === i && f < g);
    if (hit) { rest = 'rest' + r; victim = active[wants.indexOf(hit)]; }
  }
  assert.ok(rest, 'found a resting session that clashes with an active one');
  const both = w.show([...active, rest], [rest]), ring = Array.from({ length: 7 }, (_, i) => w.scene.ringHome(i, 7));
  assert.deepStrictEqual(both[victim], ring[pref(victim)[0]], `${victim} keeps the spot it wants when ${rest} wants it too`);
  assert.ok(closest(both) >= closest(Object.fromEntries(ring.entries())) - 0.01, `${rest} found a spot of its own: ${closest(both).toFixed(1)}`);
});

test('when a session joins, the others glide to their new homes', async () => {
  const w = await open();
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

// Lines turn with the lantern as it sways, out to about 6 degrees (src/scene/frame.js swingLantern: 0.7 half the time, 3.7 at the
// 99th percentile, 5.9 at the most in an hour), around where it hangs.
const SWAY = 6;
// A frame of every session moth, the lantern swaying with the clock, SWAY degrees at most
const step = (w, s) => { w.sway(SWAY * Math.sin(s * 1.7), s); w.fly(s); };
const cross = ([a, b], [c, d]) => { // whether two segments properly intersect
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
};
// how close two segments that don't cross come
const apart = ([a, b], [c, d]) => {
  const to = (p, [q, r]) => { const dx = r[0] - q[0], dy = r[1] - q[1], t = Math.max(0, Math.min(1, ((p[0] - q[0]) * dx + (p[1] - q[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p[0] - q[0] - t * dx, p[1] - q[1] - t * dy); };
  return Math.min(to(a, [c, d]), to(b, [c, d]), to(c, [a, b]), to(d, [a, b]));
};
// Every line lies on one of a family that never cross (perchAt), so at rest no two lines cross, however many sessions,
// and whether they're settled or gliding. As the lantern sways, a spot on it moves with it and a home doesn't, so two
// lines can cross when the sway carries one's spot further than the gap between them at rest: two homes gliding through
// each other, or a home on the inner ring (past 16 sessions) just beyond a neighbour's line. This holds them to that.
test('no thread or dotted line crosses another at rest, flying or landed, as sessions come and go; swaying, only ones closer than the sway reaches', SLOW, async () => {
  const own = KEYS.filter(k => k !== 'side'), more = [...own, ...'abcdefgh'.split('').map(c => 'more-' + c)];
  // one by one up to sixteen, then a few leave from the middle and the ends, then some come back, then up to 24 (an
  // inner ring past 16) and back down
  const steps = [...own.map((_, i) => own.slice(0, i + 1)), own.filter(k => !['docs', 'site'].includes(k)),
    own.filter(k => !['docs', 'site', 'blog', 'ops'].includes(k)), own.slice(4, 9), own.slice(0, 12),
    ...[17, 20, 24].map(n => more.slice(0, n)), more.filter((_, i) => i % 5), more.slice(0, 18)];
  const resting = more.filter((_, i) => i % 3); // two in three idle, so they land; the rest are working and fly
  let landed = 0, flying = 0, swayed = 0;
  for (const key of ['chochin', 'moroccan', 'barrel', 'candle']) for (const kx of [1, 1.6]) {
    const w = await open(kx);
    w.lanterns.applyStyle(key);
    let s = 0;
    for (const ids of steps) {
      w.show(ids, resting);
      for (const [k, m] of w.moths) if (m.leaving) w.moths.delete(k); // the ones that left fly off (frame.js drops them)
      for (let f = 0; f < 180; f++, s += 1 / 60) { // three seconds: the others glide to their new homes, the new ones fly in
        step(w, s);
        if (f % 15) continue;
        // every moth's thread, and each landed moth's dotted line from its home to its spot, turned with the lantern;
        // each also as it'd be at rest, its spot not turned, and how far the sway has carried that spot
        const far = Math.abs(w.frame.swayAngle) * Math.PI / 180, { stretch, VIEW } = w.scene;
        const segs = [...w.moths].filter(([k]) => ids.includes(k)).flatMap(([k, m]) => {
          const [a, b] = w.frame.threadEnds(m), spot = m.perch.slice(0, 2), [hx, hy] = stretch(m.home), reach = far * Math.hypot(spot[0] - 340, spot[1] - VIEW.top);
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]), to = Math.hypot(hx - spot[0], hy - spot[1]) || 1; // a thread at rest: as long, toward home
          return [[k + ' thread', [a, b], [spot, [spot[0] + (hx - spot[0]) * len / to, spot[1] + (hy - spot[1]) * len / to]], reach],
            ...m.wasLanded ? [[k + ' dotted line', [[hx, hy], a], [[hx, hy], spot], reach]] : []];
        });
        for (const [name, [[ax, ay], [bx, by]]] of segs) if (name.endsWith('thread') && Math.hypot(bx - ax, by - ay) > 20) flying++;
        landed += segs.filter(([name]) => name.endsWith('line')).length;
        for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
          const [one, now, rest, reach] = segs[i], [two, then, still, reach2] = segs[j], where = `${key} ${kx}x, ${ids.length} sessions, ${f} frames in`;
          if (!cross(now, then)) continue;
          swayed++;
          assert.ok(!cross(rest, still), `${where}: ${one} crosses ${two}, at rest too`);
          const gap = apart(rest, still);
          assert.ok(gap <= Math.max(reach, reach2), `${where}: ${one} crosses ${two}, ${gap.toFixed(1)} apart at rest, though the sway carries their spots only ${Math.max(reach, reach2).toFixed(1)}`);
        }
      }
    }
  }
  assert.ok(landed > 5000 && flying > 5000, `checked ${landed} dotted lines and ${flying} flying moths' threads; ${swayed} crossed while swaying`);
});

// The threads bow (frame.js bowed), slowly and on their own phases, less as moths multiply (crowd). A brief crossing is
// fine; what mustn't happen is a pair staying crossed. At the default bow with 4, 8 and 12 flying moths, no pair stays
// crossed longer than 2 seconds. A bow of 2 does, so the check is live.
test('bowed threads never stay crossed for long at rest', async () => {
  const longest = async bow => {
    let max = 0;
    for (const key of ['chochin', 'moroccan']) for (const count of [4, 8, 12]) {
      const w = await open(1), amount = bow ?? w.frame.threadBow;
      w.lanterns.applyStyle(key);
      w.show(KEYS.slice(0, count));
      for (let f = 0; f < 400; f++) { for (const m of w.moths.values()) if (m.spot) w.frame.glideHome(m, 1 / 60); w.fly(f / 60); }
      const since = {};
      for (let s = 7; s < 67; s += 0.25) {
        w.fly(s);
        const curves = [...w.moths].filter(([, m]) => m.perch).map(([k, m]) => { const [[ax, ay], [bx, by]] = w.frame.threadEnds(m);
          const [p, q] = w.frame.bowed(ax, ay, bx, by, m, s, amount).match(/Q(\S+) (\S+)/).slice(1).map(Number);
          return [k, Array.from({ length: 21 }, (_, i) => { const t = i / 20; return [(1 - t) ** 2 * ax + 2 * t * (1 - t) * p + t * t * bx, (1 - t) ** 2 * ay + 2 * t * (1 - t) * q + t * t * by]; })]; });
        const now = new Set();
        for (let i = 0; i < curves.length; i++) for (let j = i + 1; j < curves.length; j++) {
          const [, A] = curves[i], [, B] = curves[j];
          if (!A.slice(1).some((p, a) => B.slice(1).some((q, b) => cross([A[a], p], [B[b], q])))) continue;
          const id = curves[i][0] + curves[j][0];
          now.add(id); since[id] = (since[id] ?? 0) + 0.25; max = Math.max(max, since[id]);
        }
        for (const id of Object.keys(since)) if (!now.has(id)) delete since[id];
      }
    }
    return max;
  };
  assert.ok(await longest() <= 2, 'a pair stayed crossed at the default bow');
  assert.ok(await longest(2) > 2, 'a bow of 2 should leave a pair crossed');
});

// a frame of every session moth's aim at wall-clock `t` (ms) and frame clock `s`: what each is doing, and where along its line it sits
const fidgets = (w, t, s) => {
  vi.spyOn(Date, 'now').mockReturnValue(t);
  for (const [k, m] of w.moths) if (!m.parentId && !m.satellite) m.wasLanded = w.frame.mothTarget(k, m, 1 / 30, s)?.needsMe;
  return Object.fromEntries([...w.moths].map(([k, m]) => [k, [m.fidget, m.along]]));
};
const HOP_IDS = KEYS.filter(k => k !== 'side').slice(0, 10);

test('two windows show the same breaths and hops at the same moments, and hop to the same spots', async () => {
  // ten sessions waiting 20 minutes, so they're restless and hop now and then; one window has been open a while, the
  // other opens 37 seconds later, each with its own frame clock and window shape
  const t0 = 1.8e12, waiting = { state: 'waiting', waitingSince: t0 - 20 * 60000 }, ids = HOP_IDS, frame = fidgets;
  const a = await open(), b = await open(1.8);
  a.show(ids, [], waiting);
  for (let i = 0; i < 37 * 30; i++) frame(a, t0 + i / 30 * 1000, i / 30);
  b.show(ids, [], waiting);
  let hops = 0, first = true;
  for (let i = 37 * 30; i < 157 * 30; i++) {
    const one = frame(a, t0 + i / 30 * 1000, i / 30), two = frame(b, t0 + i / 30 * 1000, 500 + i / 30);
    if (first) assert.ok([...b.moths.values()].some(m => m.hopSlot !== undefined), 'the later window opens on moths that have already hopped');
    first = false;
    assert.deepStrictEqual(two, one, `${(i / 30).toFixed(2)}s in, both windows show every moth doing the same thing in the same spot`);
    hops += Object.values(one).filter(([f]) => f === 'hop').length;
  }
  assert.ok(hops > 30, `moths hopped while both watched: ${hops} hop frames`);
});

// A snoozed moth doesn't fidget, but it still moves to each hop's spot (easing over, without the hop), so a window that
// has been open for ages and one opened now put it in the same place. Quiet hours snooze every waiting moth the same way.
test('two windows put snoozed moths in the same spots, however long each has been open', async () => {
  const t0 = 1.8e12, snoozed = { state: 'waiting', snoozed: true, waitingSince: t0 - 20 * 60000 };
  const a = await open(), b = await open(1.8);
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
test('two windows opened at different times show the same sessions and agents', async () => {
  const snap = (docs, ...agents) => JSON.stringify([{ id: 'api', state: 'paused', subagents: agents.map(id => ({ id, type: 'sonnet-implement' })) },
    ...docs ? [{ id: 'docs', state: 'waiting', subagents: [] }] : []]);
  const shows = w => [...w.moths].filter(([, m]) => !m.leaving).map(([k]) => k).sort();
  // a frame's hover areas follow each snapshot (frame.js mothZones), and a leaving moth's turns off
  const zones = w => { for (const m of w.moths.values()) if (m.zone) w.frame.mothZones(m, false); };
  const early = await open();
  for (const s of [snap(true, 'a1', 'a2'), snap(false, 'a1'), snap(true, 'a1', 'a2')]) { early.sync(JSON.parse(s)); zones(early); } // docs and a2 gone for one
  const late = await open();
  late.sync(JSON.parse(snap(true, 'a1', 'a2')));
  assert.deepStrictEqual(shows(late), ['api', 'api/a1', 'api/a2', 'docs']);
  assert.deepStrictEqual(shows(early), shows(late));
  // and the ones that came back can be hovered and clicked again (card.js zoneAt skips areas that are off)
  assert.deepStrictEqual([...early.moths].filter(([, m]) => m.zone?.off).map(([k]) => k), []);
});

// each landed moth's spot in the lantern's own frame, how far round its side of the lantern's middle that is (0 straight
// down, PI straight up), how far round the ring its home is (likewise), and its side
const spots = w => {
  const b = w.lanterns.style.body, mid = (b.top + b.bottom) / 2;
  return Object.fromEntries([...w.moths].filter(([, m]) => m.wasLanded).map(([k, m]) => [k, [m.perch[0], m.perch[1], Math.atan2(Math.abs(m.perch[0] - 340), m.perch[1] - mid), Math.atan2(Math.abs(m.home[0] - 340) / 225, (m.home[1] - 320) / 235), Math.sign(m.perch[0] - 340)]]));
};

// perchAt starts each line as high on the paper as its home is round the ring, so landed moths use most of the paper's
// height in their homes' order. On main, every line fanned out from one point at the paper's middle height, and most
// moths landed within a few units of a neighbour (2.5 to 7.4 apart at worst, on a fifth to a half of the height).
test('landed moths spread up and down the paper, in their homes\' order, never on top of each other', SLOW, async () => {
  const own = KEYS.filter(k => k !== 'side');
  for (const key of ['chochin', 'moroccan', 'barrel', 'candle']) for (const kx of [1, 1.6]) for (const n of [3, 5, 8]) for (const total of [n, 12, 16]) for (const skip of [1, 3, 7]) {
    const w = await open(kx), ids = own.slice(0, total), idle = ids.filter((_, i) => (i * skip) % total < n);
    w.lanterns.applyStyle(key);
    w.show(ids, idle);
    w.settled();
    for (let f = 0; f < 300; f++) step(w, f / 60);
    const at = spots(w), all = Object.values(at), where = `${key} ${kx}x, ${idle.length} of ${total} landed`;
    assert.strictEqual(all.length, idle.length, `${where}: every resting moth landed`);
    for (const [a, pa] of Object.entries(at)) for (const [b, pb] of Object.entries(at)) if (a < b) {
      const gap = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
      assert.ok(gap > 10, `${where}: ${a} and ${b} sit ${gap.toFixed(1)} apart`);
      // on one side, the one whose home is further round the ring sits further round the lantern
      if (pa[4] === pb[4]) assert.ok((pa[3] - pb[3]) * (pa[2] - pb[2]) > 0, `${where}: ${a} and ${b} sit in their homes' order`);
    }
    if (idle.length >= 5) { // with a few on the paper, they reach most of the way up and down it
      const b = w.lanterns.style.body, height = (b.bottom - b.top) * 2 * w.lanterns.PERCH_SPREAD, ys = all.map(p => p[1]);
      assert.ok(Math.max(...ys) - Math.min(...ys) > 0.55 * height, `${where}: they span ${(Math.max(...ys) - Math.min(...ys)).toFixed(0)} of ${height.toFixed(0)}`);
    }
  }
});

// A landed moth rides its spot exactly (mothMove), so its spot has to glide, never jump. Landing depends on nothing but
// the moth's own home, and a home glides round the ring (glideHome), so its spot glides with it. On main, a home gliding
// across the top took its spot over to the other side in a single frame, 87 units.
test('a moth landing, or a session joining, never makes a landed moth jump', async () => {
  const w = await open(), ids = KEYS.filter(k => k !== 'side').slice(0, 10), idle = ids.filter((_, i) => i % 2);
  w.show(ids, idle);
  w.settled();
  let s = 0;
  for (; s < 5; s += 1 / 60) step(w, s);
  const pos = () => Object.fromEntries([...w.moths].filter(([, m]) => m.wasLanded).map(([k, m]) => [k, w.frame.rot(m.x, m.y, -w.frame.swayAngle)])); // on the lantern
  assert.strictEqual(Object.keys(pos()).length, 5, 'five of the ten are landed');
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
  w.sync(w.live.raw.map(s => s.id === 'blog' ? { ...s, state: 'waiting' } : s)); // blog needs you and lands; no home moves
  const landing = worst('blog');
  assert.ok(landing < 0.05, `as blog lands, the others hold still on the lantern: ${landing.toFixed(2)} a frame at most`);
  const before = w.homes(), spot = w.show([...ids, 'web', 'ios'], [...idle, 'blog']); // two more join, and homes move round to make room
  const moved = Object.keys(before).filter(k => Math.hypot(spot[k][0] - before[k][0], spot[k][1] - before[k][1]) > 20);
  assert.ok(moved.some(k => w.moths.get(k).wasLanded), `the join moves landed moths' homes: ${moved}`);
  const joining = worst();
  assert.ok(joining < 8, `as homes glide round, a landed moth moves ${joining.toFixed(2)} a frame at most`);
});

// A landed moth's spot is worked out on the lantern at rest (perchAt), so it stays put on the paper however the lantern
// sways, and the moth rides it. It used to be worked out from the home turned into the swaying lantern's frame, so it
// slid over a 2.5 degree swing: 1.3 to 3 units on main, and 5.3 to 8.5 once the lines started up and down the paper.
test('a landed moth stays put on the paper as the lantern sways', async () => {
  for (const key of ['chochin', 'moroccan', 'barrel', 'candle']) {
    const w = await open(), ids = KEYS.filter(k => k !== 'side').slice(0, 12);
    w.lanterns.applyStyle(key);
    w.show(ids, ids.filter((_, i) => i % 2));
    w.settled();
    const frame = (a, s) => {
      w.sway(a, s); w.fly(s);
      return Object.fromEntries([...w.moths].filter(([, m]) => m.wasLanded).map(([k, m]) => [k, w.frame.rot(m.x - 2 * m.size, m.y - 6 * m.size, -w.frame.swayAngle)])); // its wing joint, on the paper, in the lantern's frame
    };
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

// Every slot's line has room on the paper (perchAt keeps starts off its top and bottom), so a moth lands somewhere along
// it and a hop takes it somewhere else. Before, the top home on each side started at the very top and its line had none.
test('every home\'s landing line has room on the paper', async () => {
  const w = await open(), { ringHome, VIEW } = w.scene, { perchAt } = w.lanterns;
  for (const key of ['chochin', 'moroccan', 'barrel', 'candle']) for (const kx of [1, 1.6]) {
    VIEW.kx = kx; w.lanterns.applyStyle(key);
    for (let n = 1; n <= 16; n++) for (let i = 0; i < n; i++) for (const layer of [0, 1]) {
      const h = ringHome(i, n, layer), [ax, ay] = perchAt(h, 0), [bx, by] = perchAt(h, 1), len = Math.hypot(bx - ax, by - ay);
      assert.ok(len > 9, `${key} ${kx}x, home ${i} of ${n}${layer ? ', further in' : ''}: its landing line is ${len.toFixed(1)} long`);
    }
  }
});

// A home glides round the ring the short way (glideHome), so it never cuts across the lantern, or round the long way.
test('a home glides the short way round, never across the lantern', async () => {
  const { frame } = await open();
  for (const [from, to] of [[[115, 300], [115, 340]], [[115, 340], [115, 300]], [[565, 300], [565, 340]]]) {
    const m = { home: from, spot: to }, path = [];
    for (let i = 0; i < 240; i++) { frame.glideHome(m, 1 / 60); path.push(m.home[0]); }
    const end = m.home, left = from[0] < 340;
    assert.ok(path.every(x => left ? x < 340 : x > 340), `from ${from} to ${to} it stays on its side, reaching x ${Math.round(left ? Math.max(...path) : Math.min(...path))}`);
    assert.ok(Math.hypot(end[0] - to[0], end[1] - to[1]) < 1, `from ${from} it reaches ${to}: ${end.map(Math.round)}`);
  }
});

// A restless landed moth now and then hops to a new spot along its own line (frame.js fidgetSlot, alongFor). Its spot
// is worked out on the lantern at rest, so as the lantern sways it hops along that line on the paper and lands where it
// aimed (58 hops in four minutes, 0.1 to 30.7 along, median 12.8; off the line by 5e-16 at worst, settling within 0.002).
test('a restless landed moth hops to new spots along its own line as the lantern sways', async () => {
  const w = await open(), t0 = 1.8e12;
  w.show(HOP_IDS, [], { state: 'waiting', waitingSince: t0 - 20 * 60000 }); // waiting 20 minutes, so restless
  w.settled();
  const look = () => Object.fromEntries([...w.moths].filter(([, m]) => m.wasLanded).map(([k, m]) => [k,
    [m.hopSlot ?? null, m.perch.slice(0, 2), w.scene.stretch(m.home), w.frame.rot(m.x - 2 * m.size, m.y - 6 * m.size, -w.frame.swayAngle)]])); // home and wing joint in the lantern's frame
  const hops = [];
  let before = {}, s = 0;
  for (let i = 0; i < 240 * 60; i++, s += 1 / 60) { // four minutes
    vi.spyOn(Date, 'now').mockReturnValue(t0 + s * 1000);
    step(w, s);
    if (i % 6) continue;
    const now = look();
    for (const [k, [slot, spot, home]] of Object.entries(now)) {
      const was = before[k];
      if (was && was[0] !== slot) {
        const [ax, ay] = [was[1][0] - home[0], was[1][1] - home[1]], [bx, by] = [spot[0] - home[0], spot[1] - home[1]];
        hops.push({ k, at: s, spot, moved: Math.hypot(spot[0] - was[1][0], spot[1] - was[1][1]), off: Math.abs(ax * by - ay * bx) / Math.hypot(ax, ay) / Math.hypot(bx, by) });
      }
      for (const h of hops) if (h.k === k && h.landed === undefined && s - h.at > 3 && slot === now[k][0]) h.landed = Math.hypot(now[k][3][0] - h.spot[0], now[k][3][1] - h.spot[1]);
    }
    before = now;
  }
  const done = hops.filter(h => h.landed !== undefined);
  assert.ok(hops.length >= 20 && done.length >= 15, `${hops.length} hops, ${done.length} of them settled`);
  for (const h of hops) {
    assert.ok(h.moved > 0.01, `${h.k} hopped to a new spot: ${h.moved.toFixed(2)} along`);
    assert.ok(h.off < 1e-6, `${h.k} hopped along its own line: ${h.off}`);
  }
  for (const h of done) assert.ok(h.landed < 0.05, `${h.k} settled on its new spot: ${h.landed.toFixed(3)} off it`);
  const moved = hops.map(h => h.moved).sort((a, b) => a - b);
  assert.ok(moved[moved.length >> 1] > 5, `half the hops go further than ${moved[moved.length >> 1].toFixed(1)}`); // a new spot is a fresh roll along the line
});
