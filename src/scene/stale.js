// Stale PRs: my open PRs that no session owns and nobody has touched for a week drift around the lantern as wisps,
// pale ghost fireflies in a washed-out shade of their PR colour, wandering slowly. The longer stale, the fainter and
// dimmer. Now and then one slowly brightens and fades again. Up to 30; the
// oldest beyond that gather into a faint cloud with a count. A new one fades in; one that comes back to life (touched
// again, or picked up by a session) rises and fades. There's no ground: the lantern floats in the dark and its light
// carries onto other displays, so they drift instead of lying anywhere. Shown unless turned off in the settings
// menu (quiet hours leave them be).

import { live } from './live.js';
import { $, VIEW, WING_SIDE, WING_UP, flapWing, post, stretch } from './scene.js';
import { GUST, hash, mix, seeded, style } from './lanterns.js';
import { FLY, addFlyLight } from './fireflies.js';
import { put } from './frame.js';
import { NEED, hoverZone, line, make, morph, prRows, zones } from './card.js';

const STALE_MAX = 30;
const wisps = new Map(); // url -> wisp
let staleSeeded = false; // the first list is simply there; later arrivals fade in
export const WISP_TINT = '#C9C0DC'; // what a stale PR's colour washes out toward

function makeWisp(p) {
  const rand = seeded(hash(p.url));
  // hovering shows the PR's card; clicking (or clicking the card) opens it
  const card = { stale: p, zone: null }, zone = card.zone = hoverZone(card, () => open(p.url, '_blank', 'noopener'), 12);
  const d = { p, zone, pref: rand() * 6.283, dist: 180 + rand() * 100, wob: rand(), ph: rand() * 6.28, a: rand() * 6.28, w: (0.25 + rand() * 0.2) * (rand() < 0.5 ? -1 : 1),
    period: 30 + rand() * 30,
    born: staleSeeded ? 0 : 1, gone: undefined };
  return d;
}

// Ghost moths: an old session that made some of the stale PRs drifts faintly in the background, the same moth as the
// flying ones, flapping the same way, but pale and nearly see-through. Hovering shows the session and its stale PRs;
// clicking resumes it in a new iTerm tab. At most 8, the most recently active; older ones drift lower and fainter.
// Like the wisps' light, they're drawn by the background shader (background.js drawGhosts), not the SVG: anything moving
// in the SVG makes WebKit repaint the scene under it every frame, the Moroccan's masked brass and lace included. Their
// hover areas are plain circles (card.js), not SVG ones, for the same reason.
const GHOSTS_MAX = 8;
const ghosts = new Map(); // session id -> ghost moth
function makeGhost(o) {
  const rand = seeded(hash(o.id));
  const m = { o, zone: null, prs: [], pref: rand() * 6.283, dist: 190 + rand() * 90, ph: rand() * 6.28, beat: rand() * 6.28, back: 0, x: 0, y: 0,
    rate: 0.88 + seeded(hash(o.id + ':wings'))() * 0.24 }; // a living moth's wingbeat, at its own speed
  const card = { ghost: m, zone: null };
  m.zone = card.zone = hoverZone(card, () => post('/resume', { id: m.o.id }), 20);
  return m;
}
// Each frame the ghosts leave their wings in ghostWings for the shader, as triangles (x, y, opacity per corner): each
// wing's outline (pathOf's two curves from the root out and back) sampled into a fan from the root, which the wing
// shapes are star-shaped about. `at` takes a point on the moth to the scene.
const WING_STEPS = 6, GHOST_TRIS = 2 * WING_STEPS - 1; // points along each curve, triangles per wing
export const ghostWings = new Float32Array(GHOSTS_MAX * 2 * GHOST_TRIS * 9);
function addGhostWing(pts, at, alpha) {
  const q = (a, c, b, t) => at([0, 1].map(k => (1 - t) * (1 - t) * a[k] + 2 * (1 - t) * t * c[k] + t * t * b[k]));
  const rim = [];
  for (const [a, c, b] of [pts.slice(0, 3), pts.slice(2, 5)]) for (let i = 1; i <= WING_STEPS; i++) rim.push(q(a, c, b, i / WING_STEPS));
  const root = at(pts[0]);
  for (let i = 0; i < GHOST_TRIS && live.ghostWingN < ghostWings.length / 3; i++, live.ghostWingN += 3) ghostWings.set([...root, alpha, ...rim[i], alpha, ...rim[i + 1], alpha], 3 * live.ghostWingN);
}

// Where the ghosts go: all around the lantern, in the gaps between the living moths. Each living moth (with its
// fireflies) takes a slice of directions around the lantern; a ghost or loose wisp starts in the free direction nearest
// its own seeded preference, at its own seeded distance. It keeps that spot while it stays clear, so the target doesn't
// flicker as the moths shift; only when a moth's slice takes it over does it move, to the nearest direction with room
// to spare. Planned twice a second, not every frame.
// A standing lantern's stand (style.stands) blocks the directions that would put one behind it.
const angleGap = (a, b) => Math.abs(((a - b) % 6.283 + 9.425) % 6.283 - 3.1416);
function nextAim(aim, pref, taken, blocked = a => false) {
  const clear = (a, pad) => taken.every(([t, w]) => angleGap(a, t) > w + pad) && !blocked(a);
  if (aim !== undefined && clear(aim, 0)) return aim;
  const from = aim ?? pref;
  // somewhere with room to spare, or if it's that crowded, at least not behind the stand
  for (const ok of [a => clear(a, 0.12), a => !blocked(a)]) for (let i = 0; i < 64; i++) for (const sign of [1, -1]) {
    const a = from + sign * i * 0.05;
    if (ok(a)) return a;
  }
  return from;
}
// whether a spot `dist` out in direction `a` (as driftTo places it) is within `pad` of the band a stand fills, its
// sideways offset measured unstretched, since a wider window only pushes it further out
function behindStand(a, dist, pad) {
  const st = style.stands;
  return !!st && Math.abs(Math.cos(a) * dist) < st.half + pad && 320 + Math.sin(a) * dist * 0.95 * VIEW.ky > st.top - pad;
}
let stalePlannedAt = -1;
function planStale(s, loose) {
  if (s - stalePlannedAt < 0.5) return;
  stalePlannedAt = s;
  const taken = [];
  for (const m of live.moths.values()) if (m.home && !m.parentId && !m.leaving) taken.push([Math.atan2(m.home[1] - 320, m.home[0] - 340), 0.42]);
  // pads: a ghost's drift, wings and the wisps circling it; a wisp's drift, the wind and its glow
  for (const m of ghosts.values()) { m.aim = nextAim(m.aim, m.pref, taken, a => behindStand(a, m.dist, 72)); taken.push([m.aim, 0.3]); }
  for (const d of loose) { d.aim = nextAim(d.aim, d.pref, taken, a => behindStand(a, d.dist, 36)); taken.push([d.aim, 0.1]); }
}
// One step of a critically damped spring, solved exactly so any frame length is stable: from rest it eases in, and it
// eases out into the target without overshooting. Peak speed is about 0.37 * k * the distance; 95% there after 4.7 / k s.
export function settle(x, v, target, k, dt) {
  const d = x - target, c = v + k * d, e = Math.exp(-k * dt);
  return [target + (d + c * dt) * e, (v - k * c * dt) * e];
}
// glide a ghost or wisp round the lantern toward its planned direction (in the scene's unstretched space), slowly: a
// typical move takes about ten seconds. A gentle drift goes on top.
function driftTo(o, dt, s, sway) {
  o.ang ??= o.aim; o.spin ??= 0;
  const goal = o.ang + ((o.aim - o.ang) % 6.283 + 9.425) % 6.283 - 3.1416; // the short way round
  [o.ang, o.spin] = settle(o.ang, o.spin, goal, 0.5, dt);
  o.px = 340 + Math.cos(o.ang) * o.dist; o.py = 320 + Math.sin(o.ang) * o.dist * 0.95;
  const [x0, y0, w, h] = VIEW.box || [40, 20, 600, 600];
  const [x, y] = stretch([o.px + Math.sin(s * 0.08 + o.ph) * sway, o.py + Math.sin(s * 0.12 + o.ph * 2) * sway * 0.4]);
  return [Math.max(x0 + 24, Math.min(x0 + w - 24, x)), Math.max(y0 + 24, Math.min(y0 + h - 30, y))];
}

export function drawStale(dt, s) {
  const show = live.staleOn, list = live.stalePRs; // turning it off just hides them
  const now = Date.now() / 1000; // they move on the wall clock, so every window (app, panel, screensaver) has them in the same places
  const drifting = list.slice(-STALE_MAX), clouded = list.length - drifting.length; // newest 30 drift, the oldest cloud up
  const want = new Map(drifting.map((p, i) => [p.url, [p, i]]));
  for (const [url, [p]] of want) if (!wisps.has(url)) wisps.set(url, makeWisp(p));
  staleSeeded ||= list.length > 0;
  const [x0, y0, w, h] = VIEW.box || [40, 20, 600, 600], floor = y0 + h - 24;
  // the sessions that made them, most recently active first
  const owners = new Map();
  for (const p of drifting) if (p.owner?.id) { const o = owners.get(p.owner.id) || { ...p.owner, prs: [] }; o.prs.push(p); owners.set(p.owner.id, o); }
  const kept = [...owners.values()].sort((a, b) => b.last - a.last).slice(0, GHOSTS_MAX);
  for (const o of kept) if (!ghosts.has(o.id)) ghosts.set(o.id, makeGhost(o));
  planStale(s, [...wisps.values()].filter(d => !ghosts.has(d.p.owner?.id)));
  for (const [id, m] of ghosts) {
    const i = kept.findIndex(o => o.id === id);
    if (i < 0) { zones.delete(m.zone); ghosts.delete(id); continue; }
    m.o = kept[i]; m.prs = kept[i].prs;
    m.back = kept.length > 1 ? i / (kept.length - 1) : 0.3;
    m.aim ??= m.pref;
    [m.x, m.y] = driftTo(m, dt, now, 22);
    const beat = m.beat + now * 22.4 * m.rate;
    const liftAt = lag => 80 * Math.PI / 180 * (0.7 * Math.sin(beat - lag) + 0.3), sweep = 0.4 * Math.cos(beat);
    const roll = 0.7 * Math.sin(now * 0.17 + m.ph); // drifting between seen from above and side-on, like the live ones
    // both wings are the same flat colour, so the order they're drawn in doesn't show
    const k = 1 - m.back * 0.3, at = ([x, y]) => [m.x + (x - 2) * k, m.y + (y - 6) * k]; // the wings sit 2 left of and 6 above the moth's position
    const alpha = 0.14 * (1 - m.back * 0.5);
    if (show) { addGhostWing(flapWing(WING_SIDE, liftAt(0.18), sweep, roll), at, alpha); addGhostWing(flapWing(WING_UP, liftAt(0), sweep, roll), at, alpha); }
    Object.assign(m.zone, { x: m.x, y: m.y, off: !show });
  }
  for (const [url, d] of wisps) {
    const entry = want.get(url);
    if (entry) { d.p = entry[0]; d.gone = undefined; } else d.gone ??= 0;
    if (d.gone !== undefined) { // back to life: it lifts away and fades
      d.gone += dt / 2;
      if (d.gone >= 1) { zones.delete(d.zone); wisps.delete(url); continue; }
    }
    d.born = Math.min(1, d.born + dt / 2);
    const back = drifting.length > 1 && entry ? 1 - entry[1] / (drifting.length - 1) : 0.5; // older: fainter
    d.aim ??= d.pref;
    let [x, y] = driftTo(d, dt, now, 16);
    const moth = ghosts.get(d.p.owner?.id);
    if (moth) { // circling the ghost of the session that made it, the way fireflies circle a living moth
      const r = 22 + d.wob * 16, a = d.a + d.w * now;
      x = moth.x + Math.cos(a) * r; y = moth.y + Math.sin(a) * r * 0.7;
    }
    x += GUST(now - 0.03 * d.ph) * 7; // drifting in the wind like the fireflies
    y -= (d.gone || 0) * 70;
    const fade = (1 - back * 0.5) * d.born * (1 - (d.gone || 0));
    const pale = mix(FLY[d.p.need] || FLY.quiet, WISP_TINT, 0.55);
    // a faint steady glow, and now and then a slow brightening
    const spark = Math.max(0, Math.sin(now * 6.283 / d.period + d.ph)) ** 8;
    const lit = 0.18 + 0.32 * Math.min(1, spark + (d.gone !== undefined ? 1 - d.gone : 0));
    if (show) addFlyLight(x, y, 40, lit * fade, pale); // drawn as light by the background shader, like the fireflies
    Object.assign(d.zone, { x, y, off: !show || d.gone !== undefined });
  }
  // the overflow: everything past 30 as a faint cloud low on the right, with a count
  $('staleCloud').style.display = show && clouded > 0 ? '' : 'none';
  if (clouded > 0) {
    put($('staleCloud'), 'transform', `translate(${(x0 + w - 50).toFixed(1)} ${(floor - 10).toFixed(1)})`);
    $('staleCloudCount').textContent = `+${clouded}`;
  }
}

// a ghost moth's card: the old session, when it was last active, and the stale PRs it made
export function renderGhostCard(m) {
  const h = make('h3', '', m.o.title || m.o.id.slice(0, 8), make('span', 'chip idle', make('span', 'face', 'gone quiet'))); // the pill is its face, as on a session's card
  const days = Math.round((Date.now() - m.o.last) / 864e5), where = String(m.o.cwd || '').split('/').filter(Boolean).pop() || '';
  morph($('card'), [h, line(`${where ? where + ' · ' : ''}last active ${days ? `${days} days ago` : 'today'}`, 'dim'), ...prRows(m.prs)]);
  $('card').classList.add('show');
}

// a stale PR's card: what it is, how long since anyone touched it, and what it needs
export function renderStaleCard(p) {
  const h = make('h3', '', p.label, make('span', 'chip idle', make('span', 'face', 'stale')));
  const days = Math.max(7, Math.round((Date.now() - Date.parse(p.updatedAt)) / 864e5));
  const made = p.owner ? [line(`Made by ${p.owner.title || 'an old session'}`, 'dim')] : [];
  morph($('card'), [h, line(p.title || ''), line(`${NEED[p.need] || p.need} · untouched for ${days} days`, 'dim'), ...made]);
  $('card').classList.add('show');
}
