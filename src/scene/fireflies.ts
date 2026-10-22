// Fireflies: one per PR, swarming around their moth's home.

import { live } from './live';
import { CX, VIEW, nth } from './scene';
import type { Box } from './scene';
import { devButton } from '../dev';
import { GUST, hash, hex, mix, seeded } from './lanterns';
import type { Firefly, FlyState, Point, Vec3 } from '../types';

// ---- fireflies -----------------------------------------------------------------
// One per PR, keyed by its URL. The colour says what it needs (swarm says how they come and go). Failing checks swell
// faster. Drafts are amber, and one waiting on review is sky blue.
export const FLY = { ready: '#C8F48A', failing: '#FF9E8C', changes: '#FFAA6E', feedback: '#7FE3D0', draft: '#FFD27A', review: '#E8F48A', mention: '#E8F48A', quiet: '#8CCBFF', closed: '#A9A9C0' }; // closed: a reopened PR's firefly fades up from this grey
const FLY_BY_NEED = new Map(Object.entries(FLY));
/** A need's firefly colour (sky blue for any other). */
export const flyColour = (need: string) => FLY_BY_NEED.get(need) ?? FLY.quiet;
// A firefly is light, drawn by the background shader (background.ts) under the SVG scene: a white-hot core in a bloom
// of its colour, fading into a deeper, more saturated haze, adding up where glows cross. Each frame the fireflies and
// the stale wisps (stale.ts) leave theirs in flyLights (x, y, radius, brightness, r, g, b apiece) for it to draw.
export const FIREFLY_BLOOM = 50; // the bloom's radius, in scene units, at a swell's midpoint
export const FLY_LIGHTS_MAX = 128, flyLights = new Float32Array(FLY_LIGHTS_MAX * 7);
export const addFlyLight = (x: number, y: number, r: number, glow: number, col: string) => { if (live.flyLightN < FLY_LIGHTS_MAX) flyLights.set([x, y, r, glow, ...hex(col).map(v => v / 255)], 7 * live.flyLightN++); };
// Always lit, easing a bit brighter over a second or two and back, on each firefly's own slow, uneven rhythm (two waves
// that never line up the same way twice); failing checks swell faster. 0 to 1, at `s` seconds.
export const fireflySwell = (s: number, ph: number, rate = 1.1) => Math.max(0, 0.6 * Math.sin(s * rate * 0.9 + ph) + 0.4 * Math.sin(s * rate * 0.37 + ph * 2.3)) ** 2;
// The same light as a picture, for the badge flash's canvas (flash.ts), which sits above everything and adds these on
// ('lighter'): the shader's falloff in background.ts worked out once per colour, `size` px across. Keep the two in step.
export function bloomSprite(col: string, size: number) {
  const c = document.createElement('canvas'), g = c.getContext('2d');
  c.width = c.height = size;
  if (!g) return c;
  const img = g.createImageData(size, size), v = hex(col).map(x => x / 255), m = Math.max(...v), deep = v.map(x => Math.min(1, Math.max(0, m - (m - x) * 1.8)));
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const d = Math.hypot((i + 0.5) / size - 0.5, (j + 0.5) / size - 0.5) * 2, edge = Math.max(0, 1 - d);
    const core = Math.exp(-d * d * 1500), peak = Math.exp(-d * d * 400), inner = Math.exp(-d * d * 60), wide = Math.exp(-d * d * 10), tail = edge * edge / (1 + d * d * 150);
    const white = Math.min(1, peak * 1.5);
    const light = v.map((x, k) => (x + (1 - x) * 0.85) * 1.6 * core + (x + (1 - x) * white) * (1.2 * peak + 0.7 * inner) + x * 0.5 * wide + nth(deep, k) * 0.6 * tail);
    const a = Math.min(1, Math.max(...light)), o = 4 * (j * size + i);
    light.forEach((x, k) => img.data[o + k] = a ? Math.min(255, x / a * 255) : 0); img.data[o + 3] = a * 255; // the picture holds the light premultiplied
  }
  g.putImageData(img, 0, 0);
  return c;
}
export const lanternFlies = new Map<string, Firefly>(); // reviews requested from me hang around the lantern itself
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
const LEAVING = new Set(['merged', 'closed']);
// A moth's PRs in the order its fireflies are kept (it shows at most 10): ones flying off first so a merge isn't cut, then
// the ones that need me, then the rest. A merged or closed PR with no firefly of its own yet (`flies` has none) is dropped:
// swarm never makes one for it, so it would only take a place from a firefly that's showing.
export const byUrgency = <P extends FlyState & { url: string }>(prs: P[], flies: Map<string, Firefly> | undefined) => {
  const rank = (p: P) => LEAVING.has(p.need) ? 0 : ['ready', 'failing', 'changes', 'feedback'].includes(p.need) ? 1 : 2;
  return prs.filter(p => !LEAVING.has(p.need) || flies?.has(p.url)).sort((a, b) => rank(a) - rank(b));
};
// A merge's three motions overlap, each fading out as the next fades in, both already moving: the shake, the loop (30%
// faster than it first was) and the exit. Seconds: the loop starts at `start` (picked per heading, below), the shake gone
// BLEND later; the exit starts BLEND/2 before the loop's end, and the loop is gone BLEND after it starts.
export const LOOP = 1 / 1.3, BLEND = 0.2, exitAt = (start: number) => start + LOOP - BLEND / 2;
const viewBox = (): Box => VIEW.box || [40, 20, 600, 600];
const offScreen = (x: number, y: number, r: number) => { const [bx, by, bw, bh] = viewBox(); return x < bx - r || x > bx + bw + r || y < by - r || y > by + bh + r; };
// the way out of the window nearest to x, y: a unit step and how far the edge is
function nearestEdge(x: number, y: number) {
  const [bx, by, bw, bh] = viewBox();
  return ([[-1, 0, x - bx], [1, 0, bx + bw - x], [0, -1, y - by], [0, 1, by + bh - y]] satisfies Vec3[]).reduce((a, b) => b[2] < a[2] ? b : a);
}
// Where a merged or closed firefly is `t` seconds after it went, from the spot on its circle it left, heading `d` (a unit
// step): [dx, dy, a factor on its brightness, one on its bloom's size]
export function leaveStep(kind: string, t: number, [dx, dy]: Point, start = 0.45): [dx: number, dy: number, glow: number, size: number] {
  if (kind === 'closed') { const go = 30 * t + 250 * t * t; return [dx * go, dy * go, 1 - 0.45 * Math.min(1, t / 0.4), 1]; }
  const flare = 1.6, shake = 7, loop = 40;
  const lit = Math.min(1, t / 0.12) * (0.6 + 0.4 * Math.exp(-3 * t)), glow = 1 + flare * lit, size = 1 + 0.35 * flare * lit; // flares at once, then holds bright
  const enter = loop * Math.PI / LOOP, exit = 3 * enter, ease = (x: number) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); }, EXIT_AT = exitAt(start);
  // the shake at full strength, the loop from its start (first heading along `d` at its own entry speed, then speeding up)
  // and the exit (from where the loop is as it starts, at the loop's last speed, then faster: about double by the edge)
  const shaken: Point = [shake * Math.sin(Math.min(Math.PI * t / 0.6, Math.PI / 2)) * Math.sin(55 * t), shake * 0.6 * Math.sin(Math.min(Math.PI * t / 0.6, Math.PI / 2)) * Math.sin(43 * t + 1)];
  const [nx, ny] = dx > 0 ? [dy, -dx] : [-dy, dx]; // up the screen, across its heading
  const circle = (at: number): Point => { const x = (at - start) / LOOP, th = Math.PI * (x + x * x), along = loop * Math.sin(th), up = loop * (1 - Math.cos(th)); return [dx * along + nx * up, dy * along + ny * up]; };
  const [cx, cy] = circle(EXIT_AT), v = Math.max(0, t - EXIT_AT), go = exit * v + 400 * v * v;
  const looped = t < start ? shaken : circle(t), out: Point = [cx + dx * go, cy + dy * go];
  const into = ease((t - start) / BLEND), off = ease((t - EXIT_AT) / BLEND);
  const [lx, ly] = [(1 - into) * shaken[0] + into * looped[0], (1 - into) * shaken[1] + into * looped[1]];
  return [(1 - off) * lx + off * out[0], (1 - off) * ly + off * out[1], glow, size];
}
// When a merge's loop starts for a firefly heading `d`: the shake's wiggle is two waves that now and then both slow, so
// the start (between 0.3s and 0.5s) is the one where the shake and the loop, blending, never come close to a stop.
export function loopStart(d: Point) {
  let best = -1, at = 0.45;
  for (let start = 0.3; start <= 0.5; start += 0.005) {
    let slowest = Infinity;
    for (let t = start; t <= start + BLEND; t += 0.004) {
      const [ax, ay] = leaveStep('merged', t + 1e-4, d, start), [bx, by] = leaveStep('merged', t - 1e-4, d, start);
      slowest = Math.min(slowest, Math.hypot(ax - bx, ay - by));
    }
    if (slowest > best) { best = slowest; at = start; }
  }
  return at;
}
// `want` maps each PR's URL to what the server says of it ({ need, seen, since, was }); `now` is the wall clock, in ms.
// Its circling, wobble, wind and swell run off the wall clock too, so every window has each firefly in the same spot.
export function swarm(flies: Map<string, Firefly>, want: Map<string, FlyState>, [cx, cy]: Point, [rMin, rMax]: Point, dt: number, now = Date.now()) {
  const s = now / 1000;
  if (flyTry.size) { want = new Map(want); for (const [url, t] of flyTry) if (t.flies === flies) want.set(url, { ...want.get(url), ...t }); }
  for (const [url, p] of want) if (!flies.has(url) && !LEAVING.has(p.need)) {
    const rand = seeded(hash(url)); // the same firefly path in every window
    const f: Firefly = { a: rand() * 6.28, r: rMin + rand() * (rMax - rMin), w: (0.3 + rand() * 0.3) * (rand() < 0.5 ? -1 : 1), ph: rand() * 10,
      bend: (rand() - 0.5) * 140, tilt: (rand() - 0.5) * 0.7, side: rand() < 0.5 ? -1 : 1, p, leave: null, k: 1, col: FLY.quiet, x: 0, y: 0, size: 0 };
    flies.set(url, f);
  }
  for (const [url, f] of flies) {
    const p = want.get(url), kind = !p ? 'gone' : LEAVING.has(p.need) ? p.need : null;
    if (p && !kind) { f.p = p; f.leave = null; }
    else if (kind && f.leave?.kind !== kind && !(kind === 'gone' && f.leave)) { // a merge or close in progress isn't cut short by its moth leaving
      // merged goes out the side away from its moth (a swarm in the middle, the lantern's, picks a side by its URL)
      const side = cx < CX - 20 ? 1 : cx > CX + 20 ? -1 : f.side, h = Math.hypot(1, f.tilt);
      const [ex, ey] = nearestEdge(cx, cy), d: Point = kind === 'merged' ? [side / h, f.tilt / h] : [ex, ey];
      f.leave = { kind, at: kind === 'gone' ? now : p?.since || now, d, start: kind === 'merged' ? loopStart(d) : 0 };
    }
    const t = f.leave ? (now - f.leave.at) / 1000 : 0, gone = f.leave?.kind === 'gone';
    if (gone && t >= 2.5) { flies.delete(url); continue; }
    const a = f.a + f.w * Math.min(s, f.leave ? f.leave.at / 1000 : s); // a leaving one stops circling where it was
    // the one a landed moth's thread is tied to (f.near) eases in to a small orbit near the cluster's middle, still moving
    f.k += ((f.near ? 0.2 : 1) - f.k) * Math.min(1, dt * 1.5);
    const r = (f.r + (gone ? 70 * t : 0)) * f.k;
    // the wind carries it about half as far as the dust, each a moment ahead of the next (lanterns.ts's GUST)
    let x = cx + Math.cos(a) * r + Math.sin(s * 0.9 + f.ph) * 6 + GUST(s - 0.03 * f.ph) * 7, y = cy + Math.sin(a) * r * 0.7 + Math.cos(s * 1.3 + f.ph) * 5;
    const swell = fireflySwell(s, f.ph, f.p.need === 'failing' ? 2.6 : 1.1); // and the bloom widens as it swells
    let size = FIREFLY_BLOOM * (0.75 + 0.45 * swell), glow = 0.6 + 0.4 * swell;
    if (!f.leave) {
      const { need, was, seen, since } = f.p, k = was ? Math.min(1, (now - (since ?? 0)) / 800) : 1, to = flyColour(need);
      f.col = was && k < 1 ? mix(flyColour(was), to, k) : to;
      const flash = need === 'ready' && was && was !== 'ready' ? Math.max(0, 1 - (now - (since ?? 0)) / 700) ** 2 : 0;
      glow *= 1 + 1.6 * flash; size *= 1 + 0.5 * flash;
      const u = (now - (seen ?? 0)) / 1000 / ARRIVE;
      if (u < 1) { // flying in from just past the nearest edge, on a swooping curve, slowing into its circle
        const [ex, ey, gap] = nearestEdge(cx, cy), sx = cx + ex * (gap + size + 20), sy = cy + ey * (gap + size + 20), e = 1 - (1 - u) ** 3;
        const lx = x - sx, ly = y - sy, len = Math.hypot(lx, ly) || 1, bow = f.bend * Math.sin(Math.PI * u) / len;
        x = sx + lx * e - ly * bow; y = sy + ly * e + lx * bow;
      }
    } else if (gone) glow *= 1 - t / 2.5;
    else {
      const [ox, oy, g, z] = leaveStep(f.leave.kind, t, f.leave.d, f.leave.start);
      x += ox; y += oy; glow *= g; size *= z;
    }
    f.x = x; f.y = y; f.size = size;
    if (f.leave && !gone && t > (f.leave.kind === 'merged' ? exitAt(f.leave.start) : 0) && offScreen(x, y, size)) { flies.delete(url); continue; } // only on its way out: a loop near the top edge dips off screen and back
    addFlyLight(x, y, size, glow, f.col);
  }
}

// The dev panel's "play merge": a random firefly of a moth's (never the one it last played on when there are others) plays
// a merge now, from wherever it is in the window. A try stands in for that PR's data until the next press puts it back as
// it really is.
const flyTry = new Map<string, FlyState & { flies: Map<string, Firefly> }>();
let tryUrl = '';
devButton('Fireflies', 'play merge', 'A random firefly plays a merge: flare, shake, loop-de-loop, off the far side', () => {
  const all = [...live.moths.values()].flatMap(({ flies }) => flies ? [...flies].filter(([, f]) => !f.leave).map(([url, f]) => ({ flies, url, need: f.p.need })) : []);
  const pool = all.filter(c => c.url !== tryUrl), pick = (pool.length ? pool : all)[Math.floor(Math.random() * (pool.length || all.length))];
  if (!pick) return;
  flyTry.clear();
  tryUrl = pick.url;
  flyTry.set(pick.url, { flies: pick.flies, seen: 0, need: 'merged', was: pick.need, since: Date.now() });
});
