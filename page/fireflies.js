// Fireflies: one per PR, swarming around their moth's home.

// ---- fireflies -----------------------------------------------------------------
// One per PR, keyed by its URL. The colour says what it needs (swarm says how they come and go). Failing checks swell
// faster. Drafts are amber, and one waiting on review is sky blue.
const FLY = { ready: '#C8F48A', failing: '#FF9E8C', changes: '#FFAA6E', draft: '#FFD27A', review: '#E8F48A', mention: '#E8F48A', quiet: '#8CCBFF' };
// A firefly is light, drawn by the background shader (background.js) under the SVG scene: a white-hot core in a bloom
// of its colour, fading into a deeper, more saturated haze, adding up where glows cross. Each frame the fireflies and
// the stale wisps (stale.js) leave theirs in flyLights (x, y, radius, brightness, r, g, b apiece) for it to draw.
const FIREFLY_BLOOM = 50; // the bloom's radius, in scene units, at a swell's midpoint
const FLY_LIGHTS_MAX = 128, flyLights = new Float32Array(FLY_LIGHTS_MAX * 7);
let flyLightN = 0;
const addFlyLight = (x, y, r, glow, col) => { if (flyLightN < FLY_LIGHTS_MAX) flyLights.set([x, y, r, glow, ...hex(col).map(v => v / 255)], 7 * flyLightN++); };
// Always lit, easing a bit brighter over a second or two and back, on each firefly's own slow, uneven rhythm (two waves
// that never line up the same way twice); failing checks swell faster. 0 to 1, at `s` seconds.
const fireflySwell = (s, ph, rate = 1.1) => Math.max(0, 0.6 * Math.sin(s * rate * 0.9 + ph) + 0.4 * Math.sin(s * rate * 0.37 + ph * 2.3)) ** 2;
// The same light as a picture, for the badge flash's canvas (flash.js), which sits above everything and adds these on
// ('lighter'): the shader's falloff in background.js worked out once per colour, `size` px across. Keep the two in step.
function bloomSprite(col, size) {
  const c = document.createElement('canvas'), g = c.getContext('2d');
  c.width = c.height = size;
  const img = g.createImageData(size, size), v = hex(col).map(x => x / 255), m = Math.max(...v), deep = v.map(x => Math.min(1, Math.max(0, m - (m - x) * 1.8)));
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const d = Math.hypot((i + 0.5) / size - 0.5, (j + 0.5) / size - 0.5) * 2, edge = Math.max(0, 1 - d);
    const core = Math.exp(-d * d * 1500), peak = Math.exp(-d * d * 400), inner = Math.exp(-d * d * 60), wide = Math.exp(-d * d * 10), tail = edge * edge / (1 + d * d * 150);
    const white = Math.min(1, peak * 1.5);
    const light = v.map((x, k) => (x + (1 - x) * 0.85) * 1.6 * core + (x + (1 - x) * white) * (1.2 * peak + 0.7 * inner) + x * 0.5 * wide + deep[k] * 0.6 * tail);
    const a = Math.min(1, Math.max(...light)), o = 4 * (j * size + i);
    light.forEach((x, k) => img.data[o + k] = a ? Math.min(255, x / a * 255) : 0); img.data[o + 3] = a * 255; // the picture holds the light premultiplied
  }
  g.putImageData(img, 0, 0);
  return c;
}
const lanternFlies = new Map(); // reviews requested from me hang around the lantern itself
// How a firefly comes and goes. Everything runs off the wall clock from when the server saw the change (a PR's `seen`
// and `since`, in ms), along a path seeded by its URL, so every window plays it at the same moment the same way:
// - a new PR's flies in from the window's edge nearest its swarm (an entrance you can follow; sparking out of its moth
//   would mostly read as a pop, since the moth usually sits right there);
// - a new need crossfades from the colour it `was`, with a quick flash on turning ready;
// - merged: a bright flare and a shake, a loop-de-loop, then off across the window, out the side away from its moth,
//   bright all the way;
// - closed: dimmer, straight off the nearest edge;
// - gone from the list for any other reason (a review done, its moth leaving): it drifts outward and fades over 2.5s,
//   from when this window noticed, since the server has no time for that.
// One flying off is removed only once it and its bloom are wholly outside the window.
const ARRIVE = 2; // seconds to fly in
const MERGE = { flare: 1.6, shake: 7, loop: 40, speed: 1 }; // the merge's tuning, on the dev panel (Temporary)
for (const [key, label, min, max, step, title] of [
  ['flare', 'merge flare', 0, 4, 0.1, 'How much brighter a merged firefly flares, and stays until it is off the window'],
  ['shake', 'merge shake', 0, 20, 0.5, 'How far it shakes in place as it flares'],
  ['loop', 'merge loop', 0, 100, 2, 'The loop-de-loop\'s radius'],
  ['speed', 'merge speed', 0.2, 3, 0.1, 'How fast the whole merge plays'],
]) MERGE[key] = devSlider('Temporary', 'merge' + key, label, min, max, step, MERGE[key], title, v => { MERGE[key] = v; });
const LEAVING = new Set(['merged', 'closed']);
const viewBox = () => VIEW.box || [40, 20, 600, 600];
const offScreen = (x, y, r) => { const [bx, by, bw, bh] = viewBox(); return x < bx - r || x > bx + bw + r || y < by - r || y > by + bh + r; };
// the way out of the window nearest to x, y: a unit step and how far the edge is
function nearestEdge(x, y) {
  const [bx, by, bw, bh] = viewBox();
  return [[-1, 0, x - bx], [1, 0, bx + bw - x], [0, -1, y - by], [0, 1, by + bh - y]].reduce((a, b) => b[2] < a[2] ? b : a);
}
// Where a merged or closed firefly is `t` seconds after it went, from the spot on its circle it left, heading `d` (a unit
// step): [dx, dy, a factor on its brightness, one on its bloom's size]
function leaveStep(kind, t, [dx, dy]) {
  if (kind === 'closed') { const go = 30 * t + 250 * t * t; return [dx * go, dy * go, 1 - 0.45 * Math.min(1, t / 0.4), 1]; }
  const { flare, shake, loop, speed } = MERGE, u = t * speed, SHAKE = 0.6, FAST = 1.3, LOOP = 1 / FAST; // the loop runs 30% faster than it first did
  const lit = Math.min(1, u / 0.12) * (0.6 + 0.4 * Math.exp(-3 * u)), glow = 1 + flare * lit, size = 1 + 0.35 * flare * lit; // flares at once, then holds bright
  // one motion, smooth the whole way (no stop or jump at either hand-off): the shake dies away as its last swing draws back
  // along the heading and shoots into the loop at the loop's own entry speed, and the loop's exit speed is the exit's
  const enter = loop * Math.PI / LOOP, exit = 3 * enter;
  if (u < SHAKE) {
    const a = shake * Math.sin(Math.PI * u / SHAKE) ** 2, q = Math.max(0, 1 - (SHAKE - u) / 0.12), kick = -enter * 0.12 * q * q * (1 - q);
    return [a * Math.sin(u * 55) + dx * kick, a * 0.6 * Math.sin(u * 43 + 1) + dy * kick, glow, size];
  }
  const [nx, ny] = dx > 0 ? [dy, -dx] : [-dy, dx]; // up the screen, across its heading
  if (u < SHAKE + LOOP) { // forward, up and over, round and back to where it started, speeding up as it goes
    const x = (u - SHAKE) / LOOP, th = Math.PI * (x + x * x), along = loop * Math.sin(th), up = loop * (1 - Math.cos(th));
    return [dx * along + nx * up, dy * along + ny * up, glow, size];
  }
  const v = u - SHAKE - LOOP, go = exit * v + 450 * FAST * FAST * v * v; // carrying on at the loop's last speed, and faster
  return [dx * go, dy * go, glow, size];
}
// `want` maps each PR's URL to what the server says of it ({ need, seen, since, was }); `now` is the wall clock, in ms.
// Its circling, wobble, wind and swell run off the wall clock too, so every window has each firefly in the same spot.
function swarm(flies, want, [cx, cy], [rMin, rMax], dt, now = Date.now()) {
  const s = now / 1000;
  if (flyTry.size) { want = new Map(want); for (const [url, t] of flyTry) if (t.flies === flies) want.set(url, { ...want.get(url), ...t }); }
  for (const [url, p] of want) if (!flies.has(url) && !LEAVING.has(p.need)) {
    const rand = seeded(hash(url)); // the same firefly path in every window
    const f = { a: rand() * 6.28, r: rMin + rand() * (rMax - rMin), w: (0.3 + rand() * 0.3) * (rand() < 0.5 ? -1 : 1), ph: rand() * 10,
      bend: (rand() - 0.5) * 140, tilt: (rand() - 0.5) * 0.7, side: rand() < 0.5 ? -1 : 1, p, leave: null };
    flies.set(url, f);
  }
  for (const [url, f] of flies) {
    const p = want.get(url), kind = !p ? 'gone' : LEAVING.has(p.need) ? p.need : null;
    if (!kind) { f.p = p; f.leave = null; }
    else if (f.leave?.kind !== kind) {
      // merged goes out the side away from its moth (a swarm in the middle, the lantern's, picks a side by its URL)
      const side = cx < CX - 20 ? 1 : cx > CX + 20 ? -1 : f.side, h = Math.hypot(1, f.tilt);
      f.leave = { kind, at: kind === 'gone' ? now : p.since || now, d: kind === 'merged' ? [side / h, f.tilt / h] : nearestEdge(cx, cy) };
    }
    const t = f.leave ? (now - f.leave.at) / 1000 : 0, gone = f.leave?.kind === 'gone';
    if (gone && t >= 2.5 || t > 15) { flies.delete(url); continue; }
    const a = f.a + f.w * Math.min(s, f.leave ? f.leave.at / 1000 : s); // a leaving one stops circling where it was
    // the one a landed moth's thread is tied to (f.near) eases in to a small orbit near the cluster's middle, still moving
    f.k = (f.k ?? 1) + ((f.near ? 0.2 : 1) - (f.k ?? 1)) * Math.min(1, dt * 1.5);
    const r = (f.r + (gone ? 70 * t : 0)) * f.k;
    // the wind carries it about half as far as the dust, each a moment ahead of the next (frame.js's GUST)
    let x = cx + Math.cos(a) * r + Math.sin(s * 0.9 + f.ph) * 6 + GUST(s - 0.03 * f.ph) * 7, y = cy + Math.sin(a) * r * 0.7 + Math.cos(s * 1.3 + f.ph) * 5;
    const swell = fireflySwell(s, f.ph, f.p.need === 'failing' ? 2.6 : 1.1); // and the bloom widens as it swells
    let size = FIREFLY_BLOOM * (0.75 + 0.45 * swell), glow = 0.6 + 0.4 * swell;
    if (!f.leave) {
      const { need, was, seen = 0, since = 0 } = f.p, k = was ? Math.min(1, (now - since) / 800) : 1, to = FLY[need] || FLY.quiet;
      f.col = k < 1 ? mix(FLY[was] || FLY.quiet, to, k) : to;
      const flash = need === 'ready' && was && was !== 'ready' ? Math.max(0, 1 - (now - since) / 700) ** 2 : 0;
      glow *= 1 + 1.6 * flash; size *= 1 + 0.5 * flash;
      const u = (now - seen) / 1000 / ARRIVE;
      if (u < 1) { // flying in from just past the nearest edge, on a swooping curve, slowing into its circle
        const [ex, ey, gap] = nearestEdge(cx, cy), sx = cx + ex * (gap + size + 20), sy = cy + ey * (gap + size + 20), e = 1 - (1 - u) ** 3;
        const lx = x - sx, ly = y - sy, len = Math.hypot(lx, ly) || 1, bow = f.bend * Math.sin(Math.PI * u) / len;
        x = sx + lx * e - ly * bow; y = sy + ly * e + lx * bow;
      }
    } else if (gone) glow *= 1 - t / 2.5;
    else {
      const [ox, oy, g, z] = leaveStep(f.leave.kind, t, f.leave.d);
      x += ox; y += oy; glow *= g; size *= z;
    }
    f.x = x; f.y = y; f.size = size;
    if (f.leave && !gone && offScreen(x, y, size)) { flies.delete(url); continue; }
    addFlyLight(x, y, size, glow, f.col);
  }
}

// The dev panel's firefly tries (Temporary): each button plays one effect now on a random firefly (a moth's if one is out), else a made-up PR around the lantern. A try stands in for that PR's data until "back to live".
const flyTry = new Map();
let tryAt = null; // { flies, url, need }: the firefly the tries play on, and its need when picked
function tryFly(change) {
  // a random firefly each press (never the same twice running when there are others), so the effect plays from every side
  const all = [...moths.values()].flatMap(m => m.flies ? [...m.flies].filter(([, f]) => !f.leave).map(([url, f]) => ({ flies: m.flies, url, need: f.p.need })) : []);
  const others = all.filter(c => c.url !== tryAt?.url);
  const pool = others.length ? others : all;
  tryAt = pool.length ? pool[Math.floor(Math.random() * pool.length)] : { flies: lanternFlies, url: 'https://github.com/demo/lantern/pull/1', need: 'waiting' };
  flyTry.set(tryAt.url, { flies: tryAt.flies, seen: 0, need: tryAt.need, ...change(Date.now()) });
}
devButton('Temporary', 'firefly: merge', 'A firefly plays a merge: flare, shake, loop-de-loop, off the far side', () => tryFly(now => ({ need: 'merged', was: tryAt.need, since: now })));
devButton('Temporary', 'firefly: close', 'A firefly plays a close without merging: dim, off the nearest edge', () => tryFly(now => ({ need: 'closed', was: tryAt.need, since: now })));
devButton('Temporary', 'firefly: arrive', 'A firefly flies in as a new PR', () => tryFly(now => ({ seen: now })));
devButton('Temporary', 'firefly: turn green', 'A firefly turns ready to merge', () => tryFly(now => ({ need: 'ready', was: tryAt.need === 'ready' ? 'waiting' : tryAt.need, since: now })));
devButton('Temporary', 'firefly: back to live', 'Drop the tries; the firefly shows its PR as it really is', () => { flyTry.clear(); tryAt = null; });
