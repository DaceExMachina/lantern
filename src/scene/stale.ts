// Stale PRs: my open PRs that no session owns and nobody has touched for a week drift around the lantern as wisps,
// pale ghost fireflies in a washed-out shade of their PR colour, wandering slowly. The longer stale, the fainter and
// dimmer. Now and then one slowly brightens and fades again. Up to 30; the
// oldest beyond that gather into a faint cloud with a count. A new one fades in; one that comes back to life (touched
// again, or picked up by a session) rises and fades. There's no ground: the lantern floats in the dark and its light
// carries onto other displays, so they drift instead of lying anywhere. Shown unless turned off in the settings
// menu (quiet hours leave them be).

import { live } from './live';
import { $, CX, CY, VIEW, WING_SIDE, WING_UP, flapWing, nth, post, roof, stretch } from './scene';
import { GUST, hash, mix, seeded, style } from './lanterns';
import { addFlyLight, flyColour } from './fireflies';
import { put } from './frame';
import { hoverZone, zones } from './card';
import { sessionMoth } from './state';
import type { Drifter, Ghost, GhostTarget, Owner, Point, StalePR, StaleTarget, Wisp } from '../types';

const STALE_MAX = 30;
export const wisps = new Map<string, Wisp>(); // url -> wisp
let staleSeeded = false; // the first list is simply there; later arrivals fade in
export const WISP_TINT = '#C9C0DC'; // what a stale PR's colour washes out toward

function makeWisp(p: StalePR): Wisp {
  const rand = seeded(hash(p.url));
  // hovering shows the PR's card, which is its session's (the live moth's or the ghost's) when Lantern knows that session: the
  // double click then does what a double click on that moth or ghost does. Otherwise it opens the PR.
  const card: StaleTarget = { stale: p, zone: hoverZone(() => card, () => { const id = p.owner?.id ?? '', z = sessionMoth(id)?.zone ?? ghosts.get(id)?.zone; if (z) z.onClick(); else open(p.url, '_blank', 'noopener'); }, 12) }, zone = card.zone;
  const d = { p, zone, pref: rand() * 6.283, dist: 180 + rand() * 100, wob: rand(), ph: rand() * 6.28, a: rand() * 6.28, w: (0.25 + rand() * 0.2) * (rand() < 0.5 ? -1 : 1),
    period: 30 + rand() * 30,
    born: staleSeeded ? 0 : 1, gone: undefined };
  return d;
}

// Ghost moths: an old session that made some of the stale PRs drifts faintly in the background, the same moth as the
// flying ones, flapping the same way, but pale and nearly see-through. Hovering shows the session and its stale PRs;
// a double click resumes it in a new iTerm tab. At most 8, the most recently active; older ones drift lower and fainter.
// Like the wisps' light, they're drawn by the background shader (background.ts drawGhosts), not the SVG: anything moving
// in the SVG makes WebKit repaint the scene under it every frame, the Moroccan's masked brass and lace included. Their
// hover areas are plain circles (card.ts), not SVG ones, for the same reason.
const GHOSTS_MAX = 8;
// A ghost whose session is being resumed (its owner's `resuming` stamp, set by the server when it's clicked, so every window
// has it) or has woken (its session is live) flies off like a moth leaving, its wisps in tow, FLY_S seconds to the far
// corner, and is gone once it's clear (its wisps with it). The moth that comes in is the live session's own, arriving the
// usual way. A resume the session never answers (RESUME_S) lets the ghost fly back. `out`, how far along its flight it is
// (0 to 1), comes from the wall clock, so every window has it in the same place.
const FLY_S = 3, RESUME_S = 45;
const fly = (secs: number) => Math.min(1, Math.max(0, secs / FLY_S));
export const ghosts = new Map<string, Ghost>(); // session id -> ghost moth
function makeGhost(o: Owner & { prs: StalePR[] }): Ghost {
  const rand = seeded(hash(o.id));
  const m: Ghost = { o, zone: hoverZone(() => card, () => post('/resume', { id: m.o.id }), 20), prs: [], pref: rand() * 6.283, dist: 190 + rand() * 90, ph: rand() * 6.28, beat: rand() * 6.28, back: 0, out: 0, x: 0, y: 0,
    rate: 0.88 + seeded(hash(o.id + ':wings'))() * 0.24 }; // a living moth's wingbeat, at its own speed
  const card: GhostTarget = { ghost: m, zone: m.zone };
  return m;
}
// Each frame the ghosts leave their wings in ghostWings for the shader, as triangles (x, y, opacity per corner): each
// wing's outline (pathOf's two curves from the root out and back) sampled into a fan from the root, which the wing
// shapes are star-shaped about. `at` takes a point on the moth to the scene.
export const WING_STEPS = 6, GHOST_TRIS = 2 * WING_STEPS - 1; // points along each curve, triangles per wing
export const ghostWings = new Float32Array(GHOSTS_MAX * 2 * GHOST_TRIS * 9);
function addGhostWing(pts: Point[], at: (p: Point) => Point, alpha: number) {
  const bez = (a: number, c: number, b: number, t: number) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;
  const q = (a: Point, c: Point, b: Point, t: number) => at([bez(a[0], c[0], b[0], t), bez(a[1], c[1], b[1], t)]);
  const rim: Point[] = [];
  for (const [a, c, b] of [pts.slice(0, 3), pts.slice(2, 5)]) if (a && c && b) for (let i = 1; i <= WING_STEPS; i++) rim.push(q(a, c, b, i / WING_STEPS));
  const root = at(nth(pts, 0));
  for (let i = 0; i < GHOST_TRIS && live.ghostWingN < ghostWings.length / 3; i++, live.ghostWingN += 3) ghostWings.set([...root, alpha, ...nth(rim, i), alpha, ...nth(rim, i + 1), alpha], 3 * live.ghostWingN);
}

// Where the ghosts go: all around the lantern, in the gaps between the living moths. Each living moth (with its
// fireflies) takes a slice of directions around the lantern; a ghost or loose wisp starts in the free direction nearest
// its own seeded preference, at its own seeded distance. It keeps that spot while it stays clear, so the target doesn't
// flicker as the moths shift; only when a moth's slice takes it over does it move, to the nearest direction with room
// to spare. Planned twice a second, not every frame.
// A standing lantern's stand (style.stands) blocks the directions that would put one behind it.
export const angleGap = (a: number, b: number) => Math.abs(((a - b) % 6.283 + 9.425) % 6.283 - 3.1416);
export function nextAim(aim: number | undefined, pref: number, taken: Point[], blocked = (_: number) => false) {
  const clear = (a: number, pad: number) => taken.every(([t, w]) => angleGap(a, t) > w + pad) && !blocked(a);
  if (aim !== undefined && clear(aim, 0)) return aim;
  const from = aim ?? pref;
  // somewhere with room to spare, or if it's that crowded, at least not behind the stand
  for (const ok of [(a: number) => clear(a, 0.12), (a: number) => !blocked(a)]) for (let i = 0; i < 64; i++) for (const sign of [1, -1]) {
    const a = from + sign * i * 0.05;
    if (ok(a)) return a;
  }
  return from;
}
// whether a spot `dist` out in direction `a` (as driftTo places it) is within `pad` of the band a stand fills, its
// sideways offset measured unstretched, since a wider window only pushes it further out
function behindStand(a: number, dist: number, pad: number) {
  const st = style.stands;
  return !!st && Math.abs(Math.cos(a) * dist) < st.half + pad && 320 + Math.sin(a) * dist * 0.95 * VIEW.ky > st.top - pad;
}
let stalePlannedAt = -1;
export function planStale(s: number, loose: Drifter[]) {
  if (s - stalePlannedAt < 0.5) return;
  stalePlannedAt = s;
  const taken: Point[] = [];
  for (const m of live.moths.values()) if (m.parentId === undefined && m.home && !m.leaving) taken.push([Math.atan2(m.home[1] - 320, m.home[0] - 340), 0.42]);
  // pads: a ghost's drift, wings and the wisps circling it; a wisp's drift, the wind and its glow
  for (const m of ghosts.values()) { m.aim = nextAim(m.aim, m.pref, taken, a => behindStand(a, m.dist, 72)); taken.push([m.aim, 0.3]); }
  for (const d of loose) { d.aim = nextAim(d.aim, d.pref, taken, a => behindStand(a, d.dist, 36)); taken.push([d.aim, 0.1]); }
}
// One step of a critically damped spring, solved exactly so any frame length is stable: from rest it eases in, and it
// eases out into the target without overshooting. Peak speed is about 0.37 * k * the distance; 95% there after 4.7 / k s.
export function settle(x: number, v: number, target: number, k: number, dt: number): Point {
  const d = x - target, c = v + k * d, e = Math.exp(-k * dt);
  return [target + (d + c * dt) * e, (v - k * c * dt) * e];
}
// glide a ghost or wisp round the lantern toward its planned direction (in the scene's unstretched space), slowly: a
// typical move takes about ten seconds. A gentle drift goes on top.
function driftTo(o: Drifter, aim: number, dt: number, s: number, sway: number): Point {
  const ang = o.ang ?? aim;
  const goal = ang + ((aim - ang) % 6.283 + 9.425) % 6.283 - 3.1416; // the short way round
  [o.ang, o.spin] = settle(ang, o.spin ?? 0, goal, 0.5, dt);
  const px = o.px = 340 + Math.cos(o.ang) * o.dist, py = o.py = 320 + Math.sin(o.ang) * o.dist * 0.95;
  const [x0, y0, w, h] = VIEW.box || [40, 20, 600, 600];
  const [x, y] = stretch([px + Math.sin(s * 0.08 + o.ph) * sway, py + Math.sin(s * 0.12 + o.ph * 2) * sway * 0.4]);
  return [Math.max(x0 + 24, Math.min(x0 + w - 24, x)), Math.max(roof() + 24, Math.min(y0 + h - 30, y))];
}

export function drawStale(dt: number, s: number) {
  const show = live.staleOn; // turning it off just hides them
  // a PR whose session is live again isn't stale, however long ago GitHub last said so: the server rebuilds the list only when it asks GitHub
  const alive = new Set(live.raw.map(s => s.id)), list = live.stalePRs.filter(p => !alive.has(p.owner?.id ?? ''));
  const now = Date.now() / 1000; // they move on the wall clock, so every window (app, panel, screensaver) has them in the same places
  const drifting = list.slice(-STALE_MAX), clouded = list.length - drifting.length; // newest 30 drift, the oldest cloud up
  const want = new Map(drifting.map((p, i) => [p.url, [p, i] as const]));
  for (const [url, [p]] of want) if (!wisps.has(url)) wisps.set(url, makeWisp(p));
  staleSeeded ||= list.length > 0;
  const [x0, y0, w, h] = VIEW.box || [40, 20, 600, 600], floor = y0 + h - 24;
  // the sessions that made them, most recently active first
  const owners = new Map<string, Owner & { prs: StalePR[] }>();
  for (const p of drifting) if (p.owner?.id) { const o = owners.get(p.owner.id) || { ...p.owner, prs: [] }; o.prs.push(p); owners.set(p.owner.id, o); }
  const kept = [...owners.values()].sort((a, b) => b.last - a.last).slice(0, GHOSTS_MAX);
  for (const o of kept) if (!ghosts.has(o.id)) ghosts.set(o.id, makeGhost(o));
  planStale(s, [...wisps.values()].filter(d => !ghosts.has(d.p.owner?.id ?? '')));
  for (const [id, m] of ghosts) {
    const i = kept.findIndex(o => o.id === id), o = kept[i];
    const woke = alive.has(id);
    if (!o && !woke) { zones.delete(m.zone); ghosts.delete(id); continue; }
    if (woke) m.woke ??= now; // a session opened some other way has no click to start from
    const stamp = (o ?? m.o).resuming, since = stamp != null ? now - stamp / 1000 : woke ? now - (m.woke ?? now) : -1;
    m.out = since < 0 ? 0 : woke || since < RESUME_S ? fly(since) : fly(RESUME_S + FLY_S - since);
    if (woke && m.out >= 1) { // clear of the window: it and the wisps that circled it are done
      for (const [url, d] of wisps) if (d.p.owner?.id === id) { zones.delete(d.zone); wisps.delete(url); }
      zones.delete(m.zone); ghosts.delete(id); continue;
    }
    if (o) { m.o = o; m.prs = o.prs; m.back = kept.length > 1 ? i / (kept.length - 1) : 0.3; }
    [m.x, m.y] = driftTo(m, m.aim ??= m.pref, dt, now, 22);
    if (m.out > 0) { // straight out from the lantern to past the window's far corner, speeding up
      const ang = Math.atan2(m.y - CY, m.x - CX), far = Math.hypot(w, h) / 2 + 100, e = m.out * m.out;
      m.x += (CX + Math.cos(ang) * far - m.x) * e; m.y += (CY + Math.sin(ang) * far - m.y) * e;
    }
    const beat = m.beat + now * 22.4 * m.rate;
    const liftAt = (lag: number) => 80 * Math.PI / 180 * (0.7 * Math.sin(beat - lag) + 0.3), sweep = 0.4 * Math.cos(beat);
    const roll = 0.7 * Math.sin(now * 0.17 + m.ph); // drifting between seen from above and side-on, like the live ones
    // both wings are the same flat colour, so the order they're drawn in doesn't show
    const k = 1 - m.back * 0.3, at = ([x, y]: Point): Point => [m.x + (x - 2) * k, m.y + (y - 6) * k]; // the wings sit 2 left of and 6 above the moth's position
    const alpha = 0.14 * (1 - m.back * 0.5);
    if (show && m.out < 1) { addGhostWing(flapWing(WING_SIDE, liftAt(0.18), sweep, roll), at, alpha); addGhostWing(flapWing(WING_UP, liftAt(0), sweep, roll), at, alpha); }
    Object.assign(m.zone, { x: m.x, y: m.y, off: !show || m.out > 0 });
  }
  for (const [url, d] of wisps) {
    const entry = want.get(url);
    if (entry) { d.p = entry[0]; d.gone = undefined; } else d.gone ??= 0;
    if (d.gone !== undefined) { // back to life: it lifts away and fades
      d.gone += dt / (ghosts.has(d.p.owner?.id ?? '') ? FLY_S : 2); // following its ghost off, it fades as slowly as the ghost flies
      if (d.gone >= 1) { zones.delete(d.zone); wisps.delete(url); continue; }
    }
    d.born = Math.min(1, d.born + dt / 2);
    const back = drifting.length > 1 && entry ? 1 - entry[1] / (drifting.length - 1) : 0.5; // older: fainter
    let [x, y] = driftTo(d, d.aim ??= d.pref, dt, now, 16);
    const moth = ghosts.get(d.p.owner?.id ?? '');
    if (moth) { // circling the ghost of the session that made it, the way fireflies circle a living moth
      const r = 22 + d.wob * 16, a = d.a + d.w * now;
      x = moth.x + Math.cos(a) * r; y = moth.y + Math.sin(a) * r * 0.7;
    }
    x += GUST(now - 0.03 * d.ph) * 7; // drifting in the wind like the fireflies
    y -= (d.gone || 0) * 70;
    const fade = (1 - back * 0.5) * d.born * (1 - (d.gone || 0));
    const pale = mix(flyColour(d.p.need), WISP_TINT, 0.55);
    // a faint steady glow, and now and then a slow brightening
    const spark = Math.max(0, Math.sin(now * 6.283 / d.period + d.ph)) ** 8;
    const lit = 0.18 + 0.32 * Math.min(1, spark + (d.gone !== undefined ? 1 - d.gone : 0));
    if (show) addFlyLight(x, y, 40, lit * fade, pale); // drawn as light by the background shader, like the fireflies
    Object.assign(d.zone, { x, y, off: !show || d.gone !== undefined || !!moth?.out });
  }
  // the overflow: everything past 30 as a faint cloud low on the right, with a count
  $('staleCloud', SVGGElement).style.display = show && clouded > 0 ? '' : 'none';
  if (clouded > 0) {
    put($('staleCloud', SVGGElement), 'transform', `translate(${(x0 + w - 50).toFixed(1)} ${(floor - 10).toFixed(1)})`);
    $('staleCloudCount', SVGTextElement).textContent = `+${clouded}`;
  }
}
