// The hover card for a moth: its session, what it needs from you, its PRs and agents.

import { chrome, live } from './live';
import { $, post } from './scene';
import { sessionMoth, sessions } from './state';
import { flyColour } from './fireflies';
import type { Agent, CardAt, Hovered, Link, PR, Pin, Session, Zone } from '../types';

// ---- hover card ------------------------------------------------------------------
export const ago = (ms: number) => ms < 60e3 ? `${Math.max(0, Math.round(ms / 1e3))}s` : ms < 3600e3 ? `${Math.round(ms / 60e3)} min` : `${Math.floor(ms / 3600e3)}h ${Math.round(ms % 3600e3 / 60e3)}m`;
export const project = (s: Session) => (s.cwd ?? '').split('/').filter(Boolean).pop() || '(unknown)';
// Where a floating tip goes beside `el`, in window px: centred above it, or below when there's no room, and kept 8px
// inside the window. A badge's tip and an overflow PR's both use it.
export function tipSpot(tip: HTMLElement, el: Element) {
  const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
  return { left: Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)), top: r.top - h - 8 >= 8 ? r.top - h - 8 : r.bottom + 8 };
}
// an element with a class and its children (text or nodes)
export function make<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', ...kids: (Node | string)[]) { const e = document.createElement(tag); if (cls) e.className = cls; e.append(...kids); return e; }
// `el` with a key, so a redraw (morph) gives each row back its own element: agents by id, PRs by url, sessions by id
const keyed = <E extends HTMLElement>(key: string, el: E) => { el.dataset['key'] = key; return el; };
// Redraws build fresh nodes, then morph patches the live ones to match instead of swapping them in, so whatever the browser
// holds on an element survives: hover, keyboard focus, scroll, and a press between mousedown and click. Children are
// matched by tag and key (unkeyed ones in order), patched in place (attributes, the handlers below, text), and new ones go
// in where they belong; whatever's left over goes. Elements only move when the order changes, and a move drops focus,
// so the focused element gets it back afterwards.
export const HANDLERS = ['onclick', 'onpointerenter', 'onpointerleave', 'onfocus', 'onblur'] as const; // ponytail: the ones the sidebar sets; add any new one here
const copyHandler = <K extends typeof HANDLERS[number]>(to: HTMLElement, from: HTMLElement, h: K) => { to[h] = from[h]; };
const keyOf = (n: Node) => n instanceof HTMLElement ? n.dataset['key'] : undefined;
export function morph(el: Element, kids: Node[]) {
  const old: (ChildNode | null)[] = [...el.childNodes], f = document.activeElement;
  const next = kids.map(n => {
    const i = old.findIndex(o => o && o.nodeName === n.nodeName && keyOf(o) === keyOf(n));
    const o = old[i];
    if (!o) return n;
    old[i] = null;
    if (!(o instanceof Element && n instanceof Element)) { if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue; return o; }
    for (const { name } of [...o.attributes]) if (!n.hasAttribute(name)) o.removeAttribute(name);
    for (const { name, value } of n.attributes) if (o.getAttribute(name) !== value) o.setAttribute(name, value);
    if (o instanceof HTMLElement && n instanceof HTMLElement) for (const h of HANDLERS) copyHandler(o, n, h);
    morph(o, [...n.childNodes]);
    return o;
  });
  for (const o of old) o?.remove();
  next.forEach((n, i) => { if (el.childNodes[i] !== n) el.insertBefore(n, el.childNodes[i] ?? null); });
  if (f !== document.activeElement && f instanceof HTMLElement && f.isConnected) f.focus({ preventScroll: true });
}
function link({ label, url }: Link, text = label) {
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener'; if (text) a.textContent = text;
  return a;
}
export const short = (ms: number) => ms < 60e3 ? `${Math.max(0, Math.round(ms / 1e3))}s` : ms < 3600e3 ? `${Math.round(ms / 60e3)}m` : ms < 48 * 3600e3 ? `${Math.floor(ms / 3600e3)}h` : `${Math.floor(ms / 86400e3)}d`;

// The session's PRs as GitHub sees them: "PRs: #6776 ready to merge, #6801 checks failing"
export const NEED: Record<string, string | undefined> = { ready: 'ready to merge', failing: 'checks failing', changes: 'changes requested', waiting: 'in review', draft: 'draft', merged: 'merged', closed: 'closed' };

// Hover areas show their card on entering, hide it a moment after leaving (so it doesn't flicker as things drift), and on a
// click run `onClick` (or on a right-click, `menu`) and hide it. `target` is what `hovered` becomes; `cardAt` says which of
// its areas the card sits beside. They're plain circles in scene units (x, y, r; `off` while they can't be hovered), hit-tested
// in JS by one set of pointer handlers on the scene (wiring.ts), never SVG elements: moving one of those every frame makes
// WebKit repaint the scene under it.
// `target` hands back what the area shows, which can be one still being made.
export const zones = new Set<Zone>();
export function hoverZone(target: () => Hovered, onClick: () => void, r: number, cardAt?: CardAt): Zone {
  const zone: Zone = { x: 0, y: 0, r, off: false, get target() { return target(); }, onClick, cardAt };
  zones.add(zone);
  return zone;
}
// Areas can overlap, so a point belongs to the nearest area that contains it: two neighbours split their overlap down the
// middle, in whatever order they come. Plain distance, not weighted by radius: weighting would let a flying moth's wide
// area swallow a landed neighbour's own body.
export function zoneAt(zones: Iterable<Zone>, x: number, y: number) {
  let best: Zone | null = null, near = Infinity;
  for (const z of zones) {
    const d = Math.hypot(x - z.x, y - z.y);
    if (!z.off && d < z.r && d < near) [best, near] = [z, d];
  }
  return best;
}
// The card's contents are src/components/SessionCard.vue's, from the store that chrome.update fills; the scene only says
// what it's for, shows and hides it, and places it every frame (placeCard).
export function enterZone(a: Zone) {
  clearTimeout(live.hideTimer);
  const t = a.target, cardAt = 'session' in t ? t.cardAt : undefined;
  if (live.hovered === t && (!a.cardAt || cardAt === a.cardAt)) return; // already showing it
  live.hovered = t; if (a.cardAt && 'session' in t) t.cardAt = a.cardAt;
  chrome.update();
  $('card').classList.add('show');
}
// shift+click does what right-click does (the area's `menu`, where it has one), since right-click isn't obvious
export function clickZone(a: Zone, shift: boolean) { (shift && a.menu || a.onClick).call(a); clearTimeout(live.hideTimer); hideCard(); }
// A tap shows the area's card; tapping the same moth again puts it away. (Tapping the card's header runs the action.)
export function tapZone(zone: Zone) { if (live.hovered === zone.target) hideCard(); else enterZone(zone); }
export function hideCard() { live.hovered = held = shown = null; prOver = ''; chrome.update(); $('card').classList.remove('show'); hidePrTip(); }
// The card's header opens its session (a click on its moth does the same; shift-click snoozes), and its pill does what a
// right-click on the moth does (its `menu`, state.ts): snooze, then sleep, then wake.
export function openSession(id: string, shift: boolean) { const m = sessionMoth(id); if (m) clickZone(m.zone, shift); }
export function cycleSnooze(id: string) { sessionMoth(id)?.zone.menu?.(); }

// What a session's rows show, for the card (SessionCard.vue) and the sidebar alike.
export const STATE_WORDS: Record<string, string | undefined> = { working: 'working', waiting: 'needs you', paused: 'waiting on agents', idle: 'idle' };
export const pillWord = (s: Session) => { const waiting = s.state === 'waiting'; return s.reported ? 'reported back' : s.error && waiting ? 'error' : s.snoozed && waiting ? (s.forGood ? 'sleeping' : 'snoozed') : STATE_WORDS[s.state] || s.state; };
export const pillClass = (s: Session) => { const waiting = s.state === 'waiting'; return s.error && waiting ? 'error' : s.snoozed && waiting ? 'idle' : s.state; };
export const pillNext = (s: Session) => s.forGood ? 'Wake' : s.state === 'waiting' && !s.snoozed ? 'Snooze' : 'Sleep until you wake it';
// a state line only where it says more than the pill (a permission, an error; not "Finished its turn", "Waiting on…", or
// "Asks:" with the question boxed below)
export const stateLine = (s: Session) => s.state === 'working' ? s.activity || '' : s.note && !/^(Finished its turn|Waiting on|Asks:)/.test(s.note) ? s.note : '';
// Agents (each once; background tasks only when they aren't one), oldest first, by start then id, so the order never shifts
// while they run: a new agent joins at the bottom and a finished one just drops out, whatever order the server's list comes in.
// A shell command left running has "shell" where an agent's model goes, keyed by place, as two can share a description (and
// so a start: taskStarted is by description).
export type Row = Omit<Agent, 'id'> & { id: string, job: string }; // an agent, a background shell or a side session, as a row
export function running(s: Session): { rows: Row[], count: string } {
  const loose = (s.tasks || []).filter(t => !s.subagents.some(a => a.description === t));
  const agents = [...s.subagents].sort((a, b) => (a.started ?? Infinity) - (b.started ?? Infinity) || String(a.id).localeCompare(String(b.id)));
  // "Running": agents and the shell commands it left running, counted apart ("2 agents · 1 shell")
  const count = ([[s.subagents.length, 'agent', 'agents'], [loose.length, 'shell', 'shells']] satisfies [number, string, string][]).filter(([n]) => n).map(([n, one, many]) => `${n} ${n > 1 ? many : one}`).join(' · ');
  return { count, rows: [...agents.map(a => ({ ...a, job: a.description || a.type || 'subagent' })),
    ...loose.map((t, i) => ({ id: `shell ${i}`, job: t, last: 0, model: 'shell', started: s.taskStarted?.[t] ?? null }))] };
}
export const sideRow = (o: Session): Row => ({ id: o.id, job: o.title || project(o), activity: o.state === 'working' ? o.activity : o.reported ? 'Reported back' : '', started: o.started, last: o.state === 'working' ? o.last : 0 });
// An agent's step can start with a task tag ("[tag]", which some setups put on every step), shown as a chip
const TAG = /^\[([^\]]+)\]\s*/;
export const tagOf = (activity: string) => activity.match(TAG)?.[1];
export const stepOf = (activity: string) => activity.replace(TAG, '');
// how old the session is and when it was last active
export const footLine = (s: Session, now: number) => `${project(s)} · ${short(now - (s.started ?? now))} old · active ${short(now - (s.last ?? now))} ago`;

// The session's PRs, worst first, under a header that sums them up ("PRs · 1 ready · 2 in review · 8 drafts"). Either
// chips coloured by state, each putting its title in the header while hovered, or two-line rows (title; dot, number,
// state) capped at the worst PR_CAP so the card still fits beside its moth.
const ORDER = ['failing', 'changes', 'ready', 'waiting', 'draft', 'merged', 'closed'];
const SHORT: Record<string, string | undefined> = { ...NEED, ready: 'ready', failing: 'failing' };
export const PR_CAP = 4;
let prOver = ''; // the url of the sidebar's PR chip under the pointer, whose title its header shows
const rank = (need: string) => (ORDER.indexOf(need) + 1) || ORDER.length + 1;
export const worstFirst = (prs: PR[]) => [...prs].sort((a, b) => rank(a.need) - rank(b.need));
export function prSummary(prs: PR[]) {
  const n = new Map<string, number>();
  for (const p of prs) n.set(p.need, (n.get(p.need) || 0) + 1);
  return [...n].sort(([a], [b]) => rank(a) - rank(b)).map(([k, c]) => `${c} ${k === 'changes' && c === 1 ? 'change requested' : SHORT[k] || k}${k === 'draft' && c > 1 ? 's' : ''}`).join(' · ');
}
// A PR's title where a card doesn't already show it in full: an overflow link past the cap (a bare number), or a list row
// whose title is cut short. It's the badges' tooltip (#prTip, outside the redrawn rows so a redraw leaves it be), shown
// while hovered or focused and placed as a badge's is (tipSpot).
let tipFor: Element | null = null; // the link #prTip was shown for
export function showPrTip(el: Element, title: string | null) {
  const tip = $('prTip');
  tipFor = el;
  tip.textContent = title;
  const at = tipSpot(tip, el);
  tip.style.left = `${at.left}px`; tip.style.top = `${at.top}px`;
  tip.classList.add('show');
}
export function hidePrTip() { $('prTip').classList.remove('show'); }
// a redraw that took away the link the tip was showing for takes the tip too
export function dropTip() { if (!tipFor?.isConnected) hidePrTip(); }
// whether a list row's title is cut short
export const cutShort = (el: Element) => { const t = el.querySelector('.ti'); return !!t && t.scrollWidth > t.clientWidth; };

// The sidebar's version of a session: nothing cut short, every PR there to list, its agents shown in full.
function sessionRows(s: Session) {
  const now = Date.now(), waiting = s.state === 'waiting', questions = waiting && s.forYou?.questions || [], you = waiting && s.forYou?.you || [];
  // Every control is an outer button or link that fills its zone (the padding around it, up to its neighbours and the
  // edges) and an inner .face that's the visible pill or hover, the size it always was (index.html).
  const chip = make('button', 'chip ' + pillClass(s), make('span', 'face', pillWord(s)));
  const go = make('span', 'go');
  go.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h6.5V10M12.5 3.5l-8 8"/></svg>';
  const open = make('button', 'open', make('span', 'face name', s.title || project(s), go));
  open.title = 'Open this session';
  open.onclick = e => openSession(s.id, e.shiftKey);
  const next = pillNext(s);
  chip.title = next; chip.setAttribute('aria-label', `${chip.textContent}: ${next.toLowerCase()}`);
  chip.onclick = () => cycleSnooze(s.id);
  const rows: [HTMLElement, ...HTMLElement[]] = [make('h3', '', open, chip, pinButton(s))];
  const st = stateLine(s);
  if (st) rows.push(make('div', 'state' + (s.state !== 'working' && s.error ? ' error' : ''), st));
  for (const q of questions) rows.push(make('div', 'ask', q));
  if (you.length) rows.push(make('div', 'msg', ...you.map(piece => typeof piece === 'string' ? piece : link(piece))));
  if (s.prompt && !waiting) rows.push(make('div', 'prompt', `“${s.prompt}”`));
  const tray: HTMLElement[] = [], side = sessions.filter(o => o.parent === s.id), run = running(s);
  if (run.rows.length) { // in a tinted band of their own, set apart from the rest of the work
    tray.push(make('div', 'agentZone', make('div', 'head', 'Running', make('span', 'r', run.count)), ...run.rows.map(r => agentRow(r, now))));
  }
  if (side.length) {
    tray.push(make('div', 'head', 'Side sessions', make('span', 'r', String(side.length))));
    for (const o of side) tray.push(agentRow(sideRow(o), now));
  }
  if (s.github?.length) tray.push(...prBlock(s, s.github));
  const foot = make('div', 'foot', footLine(s, now));
  rows.push(tray.length ? make('div', 'tray', ...tray, foot) : foot);
  return rows;
}
// An agent in the sidebar, in full (AgentRow.vue is the card's): the live dot, the tag chip, the model and how long it's run;
// then its job; then its current step. Keyed by id, so a redraw keeps each row's element with its agent.
function agentRow({ id, job, activity, started, last, model }: Row, now: number) {
  activity ||= ''; last ||= 0;
  const tag = tagOf(activity), step = stepOf(activity);
  const dot = make('span', 'live' + (now - last > 10e3 ? ' quiet' : '')), time = started ? [make('span', 't', short(now - started))] : [];
  const about = [...(tag ? [make('span', 'tag', tag)] : []), ...(model ? [make('span', 'model', model)] : [])], name = make('span', 'job', job);
  const lines = about.length ? [make('span', 'arow', dot, ...about, ...time), name]
    : [make('span', 'arow', dot, name, ...time)]; // nothing to say on a line of its own
  return keyed(id, make('div', 'agent open', make('span', 'face', ...lines, ...(step ? [make('span', 'astep', step)] : []))));
}
// The sidebar's PRs: listed in full until that pin's own toggle (kept with the pin) turns them into chips.
function prBlock(s: Session, gh: PR[]) {
  const pin = live.pinned.find(p => p.id === s.id);
  const prs = worstFirst(gh), open = !pin?.chips, over = open ? undefined : prs.find(p => p.url === prOver);
  const ph = over ? make('span', 'ph title', over.title ?? '') : make('span', 'ph', make('span', 'sum', make('b', '', 'PRs'), ` · ${prSummary(prs)}`));
  const tog = make('button', 'tog'), label = open ? 'Show PRs as chips' : 'List PRs with their titles';
  tog.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>';
  tog.setAttribute('aria-expanded', String(open)); tog.setAttribute('aria-label', label); tog.title = label;
  tog.onclick = () => setPins(live.pinned.map(p => p.id === s.id ? { ...p, chips: open } : p));
  const dot = (need: string) => { const i = make('i'); i.style.background = flyColour(need); return i; };
  const head = make('div', 'phead', ph, tog);
  if (!open) return [head, make('div', 'chips', ...prs.map(p => {
    const a = keyed(p.url, link(p, ''));
    a.append(make('span', 'face', dot(p.need), p.label));
    a.onpointerenter = () => { prOver = p.url; renderSidebar(); };
    a.onpointerleave = () => { prOver = ''; renderSidebar(); };
    return a;
  }))];
  // the handlers measure the element the event came to: after a redraw that's the live one, not the one built here
  return [head, ...prs.map(p => {
    const a = keyed(p.url, link(p, '')), ti = make('span', 'ti', p.title ?? '');
    a.className = 'pr2';
    a.append(make('span', 'face', ti, make('span', 'me', dot(p.need), make('b', '', p.label), NEED[p.need] || p.need,
      ...(p.createdAt ? [make('span', 't', short(Date.now() - Date.parse(p.createdAt)))] : [])))); // how long it's been open
    a.onpointerenter = a.onfocus = e => { const el = e.currentTarget; if (el instanceof HTMLElement && cutShort(el)) showPrTip(el, p.title); };
    a.onpointerleave = a.onblur = hidePrTip;
    return a;
  })];
}
// ---- the pinned sidebar ------------------------------------------------------------
// Sessions pinned from their cards show in full, stacked in the order they were pinned (the newest at the bottom, so
// nothing jumps), in one column docked right of the scene, which narrows to make room (fitView follows the scene's size).
// The pins are a setting, so every window agrees and they survive a restart. A pinned session that ends stays in its
// place, dimmed, as this window last saw it, until it's unpinned; a window that never saw it leaves it out. No pinning
// where there's no room: windows under PIN_MIN wide, the iTerm panel and the screensavers.
const PIN_MIN = 800;
const isPinned = (id: string) => live.pinned.some(p => p.id === id);
const pinnedLast = new Map<string, Session>(); // id → the session as this window last saw it
export const pinnable = () => innerWidth >= PIN_MIN && !document.body.matches('.panel, .screensaver, .ambient');
function pinButton(s: Session) {
  const on = isPinned(s.id), face = make('span', 'face'), b = make('button', 'pin' + (on ? ' on' : ''), face), name = s.title || project(s);
  face.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M10 1l5 5-2 1-3 3 .5 3.5L9 15l-3-3-4 4-1-1 4-4-3-3 1.5-1.5L7 7l3-3z"/></svg>';
  b.setAttribute('aria-label', on ? `Unpin ${name}` : `Pin ${name} to the sidebar`);
  b.title = on ? 'Unpin' : 'Pin to the sidebar';
  b.onclick = () => togglePin(s.id);
  return b;
}
// the card's pin and the sidebar's: pins or unpins a session, newest at the bottom
export const togglePin = (id: string) => setPins(isPinned(id) ? live.pinned.filter(p => p.id !== id) : [...live.pinned, { id }]);
// Only the pins this window can show go to the server (the one just pinned is live), so one nobody can see any more
// doesn't linger.
function setPins(pins: Pin[]) {
  live.pinned = pins.filter(p => pinnedLast.has(p.id) || sessions.some(o => o.id === p.id));
  post('/settings', { pinned: live.pinned });
  renderSidebar();
  chrome.update(); // the card's pin shows the change
}
export function renderSidebar() {
  dropTip();
  for (const id of pinnedLast.keys()) if (!isPinned(id)) pinnedLast.delete(id);
  for (const o of sessions) if (isPinned(o.id)) pinnedLast.set(o.id, o);
  const ids = pinnable() ? live.pinned.map(p => p.id).filter(id => pinnedLast.has(id)) : [];
  document.body.classList.toggle('pinned', ids.length > 0);
  $('dock').inert = !ids.length; // out of the tab order and the accessibility tree while closed
  if (!ids.length) return; // ponytail: what it showed stays, so it slides out whole
  const alive = new Set(sessions.map(o => o.id));
  // one section per session in the column's scroller (index.html)
  const column = $('dock').children[0];
  if (column) morph(column, ids.flatMap(id => { const o = pinnedLast.get(id); return o ? [keyed(id, make('section', alive.has(id) ? '' : 'ended', ...sessionRows(o)))] : []; }));
}
// The card holds where it opened while its moth shimmies about (hops, resettling, the lantern's sway): it keeps the
// anchor it first took and only takes a new one when the area has moved CARD_HOLD or more away, or is a different area.
// Then it eases over to the new spot instead of snapping, so it reads as following rather than shaking.
const CARD_HOLD = 40;
let held: { zone: Zone, x: number, y: number } | null = null, shown: { x: number, y: number } | null = null; // the anchor in screen px, and where the card is now on its way there
export function holdAnchor(zone: Zone, x: number, y: number) {
  if (!held || held.zone !== zone || Math.hypot(x - held.x, y - held.y) >= CARD_HOLD) held = { zone, x, y };
  return held;
}
export function placeCard() {
  const h = live.hovered, svg = document.querySelector('svg'), ctm = svg?.getScreenCTM();
  if (!h || !svg || !ctm) return;
  const pt = svg.createSVGPoint();
  const zone = 'session' in h && h.cardAt === 'flies' && h.flyZone ? h.flyZone : h.zone; // beside whichever area was hovered
  pt.x = zone.x; pt.y = zone.y;
  const p = pt.matrixTransform(ctm), c = $('card');
  const gap = zone.r * ctm.a * 0.7; // clear of the hover area, which covers the moth
  // it stays above the footer (in the iTerm panel the footer takes a good share of a short window), as tall as fits there
  const floor = document.querySelector('footer')?.getBoundingClientRect().top ?? innerHeight, most = `${Math.round(floor - 16)}px`;
  if (c.style.maxHeight !== most) c.style.maxHeight = most;
  const a = holdAnchor(zone, p.x, p.y);
  const x = Math.min(a.x + gap, innerWidth - c.offsetWidth - 12), y = a.y + gap + c.offsetHeight > floor - 8 ? a.y - c.offsetHeight - gap : a.y + gap;
  // while the pointer is on it (opening an agent, say), it stays put rather than flipping above its moth, moving up only
  // as far as it must to stay on screen
  const to = { x: Math.max(8, x), y: Math.max(8, Math.min(floor - 8 - c.offsetHeight, shown && c.matches(':hover') ? shown.y : y)) };
  shown = shown ? { x: shown.x + (to.x - shown.x) * 0.2, y: shown.y + (to.y - shown.y) * 0.2 } : to; // a new card starts in place
  c.style.transform = `translate(${shown.x}px, ${shown.y}px)`;
}
