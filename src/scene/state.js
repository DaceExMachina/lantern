// Sessions from the server, turned into moths (session moths and their agents), with their hover areas.

import { live } from './live.js';
import { $, AMBIENT, CX, CY, EDGES, NS, SIZE, WING_SIDE, WING_UP, pathOf, post, ringHome, stretch } from './scene.js';
import { hash, seeded } from './lanterns.js';
import { hoverZone } from './card.js';
import { alertMe } from './notify.js';

export let sessions = [];
let seenWaiting = new Set(), nextUp = {}; // nextUp: where each status bar count's clicks have got to
// what the server sends, and the settings, are in live.js
export const quietEndLabel = () => { const [h, m] = live.quietEnd.split(':').map(Number); return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''}${h < 12 ? 'am' : 'pm'}`; };
// When the lantern was last violet. Each window keeps its own, from when it last saw violet (or opened), since the
// server doesn't say yet; windows opened at different times can differ.
let violetAt = Date.now();
// quiet hours: until quietEnd (8am unless settings.json says otherwise) every waiting session counts as snoozed, so nothing turns violet, notifies or badges
export const quiet = () => live.quietUntil > Date.now();
export const QUIET_FOREVER = 8.64e15; // quietUntil for quiet hours with no end (quiet until switched off), as the server sets it
// Which of the status bar's counts a session is in: sleeping (snoozed for good, whatever it's doing), or, while it
// waits, snoozed (until it does something new, or for quiet hours) or needing me.
export const restOf = s => s.forGood ? 'sleeping' : s.state !== 'waiting' ? '' : s.snoozed ? 'snoozed' : 'need';

export function sync() {
  // A side session whose parent is still alive reports back to that session, not to me: when its turn ends it keeps
  // orbiting (like agents do) and doesn't count as needing me.
  const alive = new Set(live.raw.map(s => s.id));
  const base = live.raw.map(s => s.state === 'waiting' && s.parent && alive.has(s.parent) ? { ...s, state: 'paused', reported: true } : s);
  sessions = quiet() ? base.map(s => s.state === 'waiting' ? { ...s, snoozed: true, quiet: true } : s) : base;
  $('quiet').classList.toggle('on', quiet());
  const kept = new Set(), shown = AMBIENT ? [] : sessions; // the ambient view only needs the sessions for the glow's colour
  for (const s of shown) {
    kept.add(s.id);
    if (!live.moths.has(s.id)) live.moths.set(s.id, Object.assign(makeSessionMoth(s.id), { key: s.id }));
    // whatever an earlier snapshot said, the server sends it now, so it isn't leaving: every window shows the latest snapshot
    Object.assign(live.moths.get(s.id), { session: s, leaving: false });
    // A session another session started (the Claude app's side sessions) is a satellite: it orbits its parent's moth,
    // smaller, with its thread to the parent; it still lands on the lantern on its own when it needs you.
    const m = live.moths.get(s.id);
    m.satellite = s.parent && alive.has(s.parent) ? s.parent : null;
    m.size = m.satellite ? SIZE.supervisor : SIZE.session; // like a supervisor agent
    // a fresh snooze (not quiet hours, not waking) puffs a "zz" off the moth; the first sync only records where it stands
    const snooze = s.forGood ? 'always' : s.snoozed && !s.quiet ? 'once' : '';
    if (m.snooze !== undefined && snooze && snooze !== m.snooze) m.puff = { at: performance.now() / 1000, kind: snooze };
    m.snooze = snooze;
    for (const a of s.subagents) {
      const k = s.id + '/' + a.id;
      kept.add(k);
      if (!live.moths.has(k)) live.moths.set(k, Object.assign(makeSubMoth(k, s.id, live.supervisor.test(a.type) ? SIZE.supervisor : SIZE.subagent), { key: k }));
      Object.assign(live.moths.get(k), { session: s, type: a.type, leaving: false });
    }
  }
  for (const [k, m] of live.moths) if (!kept.has(k)) m.leaving = true;
  // Homes depend only on the sessions the server sent, so every window agrees however they arrived. There are as many
  // spots as sessions on their own, 3 to 16, evenly round the lantern. Each session wants the one at its own seeded angle;
  // active ones choose first and resting ones (snoozed for good, or idle: both change rarely, unlike working and waiting)
  // after, so a resting moth takes a free spot rather than push an active one out. Past 16, they double up where it's
  // least crowded. A join or leave can move the others; frame.js glides them there.
  const want = id => seeded(hash(id))(), resting = s => s.forGood || s.state === 'idle';
  const own = shown.filter(s => !live.moths.get(s.id).satellite)
    .sort((a, b) => resting(a) - resting(b) || want(a.id) - want(b.id) || (a.id < b.id ? -1 : 1));
  const n = Math.min(16, Math.max(3, own.length)), held = Array(n).fill(0), off = (i, id) => Math.abs(i + 0.5 - want(id) * n);
  for (const { id } of own) {
    const i = held.reduce((best, c, i) => c < held[best] || c === held[best] && off(i, id) < off(best, id) ? i : best, 0);
    live.moths.get(id).spot = ringHome(i, n, held[i]++);
  }
  for (const s of shown) { const m = live.moths.get(s.id); m.home ??= m.spot ?? [CX, CY]; } // a satellite's then circles its parent's (frame.js)

  // a session waiting on its own agents counts as working: the footer is short on room in the iTerm panel
  const working = sessions.filter(s => s.state === 'working' || s.state === 'paused' && !s.reported).length;
  // each count's sessions, longest waiting first (sleeping ones that aren't waiting after, in a fixed order)
  const of = rest => sessions.filter(s => restOf(s) === rest).sort((a, b) => (a.waitingSince || Infinity) - (b.waitingSince || Infinity) || (a.id < b.id ? -1 : 1));
  const waiting = of('need'), snoozed = of('snoozed').length, sleeping = of('sleeping').length;
  // a count that opens its sessions one at a time: each click moves on to the next one
  const cycler = (rest, text, title) => {
    const b = document.createElement('button');
    b.className = 'next'; b.textContent = text; b.title = title;
    b.onclick = () => { const q = of(rest), s = q[nextUp[rest] = ((nextUp[rest] ?? -1) + 1) % q.length]; if (s) post('/focus', { id: s.id }); };
    return b;
  };
  const st = $('status');
  st.className = waiting.length ? 'waiting' : '';
  if (!sessions.length) st.textContent = 'quiet night, no sessions';
  else {
    st.replaceChildren(`${sessions.length} session${sessions.length > 1 ? 's' : ''} · ${working} working`);
    if (waiting.length) st.append(' · ', cycler('need', `${waiting.length} need${waiting.length > 1 ? '' : 's'} you`, 'Open the session that has waited longest'));
    const until = quiet() && live.quietUntil < QUIET_FOREVER ? ` until ${quietEndLabel()}` : '';
    if (snoozed) st.append(' · ', cycler('snoozed', `${snoozed} snoozed`, 'Open the snoozed sessions one at a time'), until);
    else if (quiet()) st.append(` · snoozed${until}`);
    if (sleeping) st.append(' · ', cycler('sleeping', `${sleeping} sleeping`, 'Open the sleeping sessions one at a time'));
    if (waiting.length) violetAt = Date.now();
    else if (!quiet() && Date.now() - violetAt >= 60000) {
      const m = Math.floor((Date.now() - violetAt) / 60000), warm = document.createElement('span');
      warm.className = 'warm'; warm.textContent = `warm for ${m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`}`;
      st.append(' · ', warm);
    }
    if (live.reviews.length) {
      const a = document.createElement('a');
      a.href = 'https://github.com/pulls/review-requested'; a.target = '_blank'; a.rel = 'noopener'; a.className = 'next';
      a.textContent = `${live.reviews.length} review${live.reviews.length > 1 ? 's' : ''}`; a.title = live.reviews.map(r => `${r.label} ${r.title}`).join('\n');
      st.append(' · ', a);
    }
  }
  // the Dock app's icon shows how many sessions need me (Safari may want notification permission for this)
  try { const p = waiting.length ? navigator.setAppBadge?.(waiting.length) : navigator.clearAppBadge?.(); p?.catch?.(() => {}); } catch {}

  for (const s of waiting) if (!seenWaiting.has(s.id)) alertMe(s);
  seenWaiting = new Set(waiting.map(s => s.id));
}

export function el(tag, attrs = {}) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

function mothNode() {
  const g = el('g', { class: 'moth' });
  const up = el('path', { d: pathOf(WING_UP), class: 'wing' }), side = el('path', { d: pathOf(WING_SIDE), class: 'wing' });
  const wings = el('g', { transform: 'translate(-2 -6)' }); // same offset as the original artwork, so it pivots the same way
  wings.append(side, up);
  g.append(wings);
  $('moths').append(g);
  return { g, up, side };
}

// A hover area for a moth: shows its card (beside the area it came from), click opens the session, right-click snoozes.
// A session moth has two once it lands: one on the moth, and one over the fireflies it left back home.
export function hoverArea(m, at) {
  // clicking brings the session's terminal tab (or Claude app session) to the front (a subagent focuses its parent session)
  const zone = hoverZone(m, () => post('/focus', { id: m.key }), 48, at);
  // Right-click cycles a session's snooze: a waiting one snoozes until it does something new, then for good (new activity
  // never wakes it, say for a chat you only drop into now and then), then wakes. One that isn't waiting goes straight
  // to for good. A snoozed moth rests on the lantern without turning it violet.
  zone.menu = () => {
    const s = m.session;
    if (!s) return;
    const next = s.forGood ? false : s.state === 'waiting' && !s.snoozed ? true : 'always';
    post('/snooze', { id: s.id, snoozed: next });
  };
  return zone;
}
function hoverable(m) {
  m.zone = hoverArea(m, 'moth');
  return m;
}

function makeSessionMoth(key) {
  const [x, y] = stretch(EDGES[Math.floor(Math.random() * EDGES.length)]);
  const thread = el('path');
  $('threads').append(thread);
  return hoverable({ ...mothNode(), size: SIZE.session, thread,
    x, y, phase: seeded(hash(key))() * 10, cool: 0, leaving: false });
}

function makeSubMoth(key, parentId, size) {
  const p = live.moths.get(parentId), rand = seeded(hash(key));
  return ({ ...mothNode(), size, parentId, x: p?.x ?? CX, y: p?.y ?? CY, a: rand() * 6.28,
    r: (size === SIZE.supervisor ? 54 : 38) + rand() * 14,
    speed: (1.1 + rand()) * (rand() < 0.5 ? -1 : 1) / size ** 0.5,
    phase: rand() * 10, cool: 0, leaving: false });
}
