// Sessions from the server, turned into moths (session moths and their agents), with their hover areas.

import type { AgentMoth, CardAt, Moth, Session, SessionMoth, Zone } from '../types';
import { timeLabel } from '../types';
import { chrome, live } from './live';
import { $, AMBIENT, CX, CY, EDGES, NS, SIZE, WING_SIDE, WING_UP, pathOf, post, ringHome, stretch } from './scene';
import { hash, seeded } from './lanterns';
import { hoverZone } from './card';
import { alertMe } from './notify';

export let sessions: Session[] = [];
let seenWaiting = new Set<string>();
// what the server sends, and the settings, are in live.ts
export const quietEndLabel = () => timeLabel(live.quietEnd);
// quiet hours: until quietEnd (8am unless settings.json says otherwise) every waiting session counts as snoozed, so nothing turns violet, notifies or badges
export const quiet = () => live.quietUntil > Date.now();
export const QUIET_FOREVER = 8.64e15; // quietUntil for quiet hours with no end (quiet until switched off), as the server sets it
// Which of the status line's (StatusLine.vue) counts a session is in: sleeping (snoozed for good, whatever it's doing), or, while it
// waits, snoozed (until it does something new, or for quiet hours) or needing me.
export const restOf = (s: Session) => s.forGood ? 'sleeping' : s.state !== 'waiting' ? '' : s.snoozed ? 'snoozed' : 'need';

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
    let m = sessionMoth(s.id);
    if (!m) live.moths.set(s.id, m = makeSessionMoth(s.id));
    // whatever an earlier snapshot said, the server sends it now, so it isn't leaving: every window shows the latest snapshot
    m.session = s; m.leaving = false;
    // A session another session started (the Claude app's side sessions) is a satellite: it orbits its parent's moth,
    // smaller, with its thread to the parent; it still lands on the lantern on its own when it needs you.
    m.satellite = s.parent && alive.has(s.parent) ? s.parent : null;
    m.size = m.satellite ? SIZE.supervisor : SIZE.session; // like a supervisor agent
    // a fresh snooze (not quiet hours, not waking) puffs a "zz" off the moth; the first sync only records where it stands
    const snooze = s.forGood ? 'always' : s.snoozed && !s.quiet ? 'once' : '';
    if (m.snooze !== undefined && snooze && snooze !== m.snooze) m.puff = { at: performance.now() / 1000, kind: snooze };
    m.snooze = snooze;
    for (const a of s.subagents) {
      const k = s.id + '/' + a.id;
      kept.add(k);
      let am = live.moths.get(k);
      if (!am) live.moths.set(k, am = makeSubMoth(k, s.id, live.supervisor.test(a.type ?? '') ? SIZE.supervisor : SIZE.subagent));
      am.session = s; am.leaving = false;
    }
  }
  for (const [k, m] of live.moths) if (!kept.has(k)) m.leaving = true;
  // Homes depend only on the sessions the server sent, so every window agrees however they arrived. There are as many
  // spots as sessions on their own, 3 to 16, evenly round the lantern. Each session wants the one at its own seeded angle;
  // active ones choose first and resting ones (snoozed for good, or idle: both change rarely, unlike working and waiting)
  // after, so a resting moth takes a free spot rather than push an active one out. Past 16, they double up where it's
  // least crowded. A join or leave can move the others; frame.ts glides them there.
  const want = (id: string): number => seeded(hash(id))(), resting = (s: Session) => Number(s.forGood || s.state === 'idle');
  const own = shown.filter(s => !sessionMoth(s.id)?.satellite)
    .sort((a, b) => resting(a) - resting(b) || want(a.id) - want(b.id) || (a.id < b.id ? -1 : 1));
  const n = Math.min(16, Math.max(3, own.length)), held = new Array<number>(n).fill(0), off = (i: number, id: string) => Math.abs(i + 0.5 - want(id) * n);
  for (const { id } of own) {
    const i = held.reduce((best, c, i) => c < (held[best] ?? 0) || c === held[best] && off(i, id) < off(best, id) ? i : best, 0);
    const m = sessionMoth(id), layer = held[i] ?? 0;
    held[i] = layer + 1;
    if (m) m.spot = ringHome(i, n, layer);
  }
  for (const s of shown) { const m = sessionMoth(s.id); if (m) m.home ??= m.spot ?? [CX, CY]; } // a satellite's then circles its parent's (frame.ts)

  const waiting = sessions.filter(s => restOf(s) === 'need').sort((a, b) => (a.waitingSince || Infinity) - (b.waitingSince || Infinity) || (a.id < b.id ? -1 : 1)); // longest waiting first
  // the Dock app's icon shows how many sessions need me (Safari may want notification permission for this)
  try { const p = waiting.length ? navigator.setAppBadge?.(waiting.length) : navigator.clearAppBadge?.(); p?.catch?.(() => {}); } catch {}

  for (const s of waiting) if (!seenWaiting.has(s.id)) alertMe(s);
  seenWaiting = new Set(waiting.map(s => s.id));
  chrome.update();
}
export function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}
// the session moth with this id, if it has one (agents' moths share the map, keyed session/agent)
export function sessionMoth(id: string): SessionMoth | undefined {
  const m = live.moths.get(id);
  return m?.parentId === undefined ? m : undefined;
}

function mothNode() {
  const g = el('g', { class: 'moth' });
  const up = el('path', { d: pathOf(WING_UP), class: 'wing' }), side = el('path', { d: pathOf(WING_SIDE), class: 'wing' });
  const wings = el('g', { transform: 'translate(-2 -6)' }); // same offset as the original artwork, so it pivots the same way
  wings.append(side, up);
  g.append(wings);
  $('moths', SVGGElement).append(g);
  return { g, up, side };
}

// A hover area for a moth: shows its card (beside the area it came from), a click expands the card (wiring.ts) and its
// header runs the area's click action, opening the session; right-click snoozes.
// A session moth has two once it lands: one on the moth, and one over the fireflies it left back home.
// `moth` hands back the moth, which can be the one still being made.
export function hoverArea(moth: () => SessionMoth, at: CardAt): Zone {
  // its click action, which the card's header runs, brings the session's terminal tab (or Claude app session) to the front
  const zone = hoverZone(moth, () => post('/focus', { id: moth().key }), 48, at);
  // Right-click cycles a session's snooze: a waiting one snoozes until it does something new, then for good (new activity
  // never wakes it, say for a chat you only drop into now and then), then wakes. One that isn't waiting goes straight
  // to for good. A snoozed moth rests on the lantern without turning it violet.
  zone.menu = () => {
    const s = moth().session;
    if (!s) return;
    const next = s.forGood ? false : s.state === 'waiting' && !s.snoozed ? true : 'always';
    post('/snooze', { id: s.id, snoozed: next });
  };
  return zone;
}

function makeSessionMoth(key: string): SessionMoth {
  const [x, y] = stretch(EDGES[Math.floor(Math.random() * EDGES.length)] ?? [CX, CY]);
  const thread = el('path');
  $('threads', SVGGElement).append(thread);
  const m: SessionMoth = { ...mothNode(), key, size: SIZE.session, thread, zone: hoverArea(() => m, 'moth'),
    x, y, phase: seeded(hash(key))() * 10, cool: 0, leaving: false };
  return m;
}

function makeSubMoth(key: string, parentId: string, size: number): AgentMoth {
  const p: Moth | undefined = live.moths.get(parentId), rand = seeded(hash(key));
  return ({ ...mothNode(), key, size, parentId, x: p?.x ?? CX, y: p?.y ?? CY, a: rand() * 6.28,
    r: (size === SIZE.supervisor ? 54 : 38) + rand() * 14,
    speed: (1.1 + rand()) * (rand() < 0.5 ? -1 : 1) / size ** 0.5,
    phase: rand() * 10, cool: 0, leaving: false });
}
