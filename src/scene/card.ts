// The hover card for a moth: its session, what it needs from you, its PRs and agents.

import { heatOf, heatTip } from './heat';
import { chrome, live } from './live';
import { $, titlebar } from './scene';
import { sessionMoth } from './state';
import type { Agent, CardAt, Hovered, PR, ProcGroup, Session, Usage, UsageGroup, Zone } from '../types';

// ---- hover card ------------------------------------------------------------------
export const ago = (ms: number) => ms < 60e3 ? `${Math.max(0, Math.round(ms / 1e3))}s` : ms < 3600e3 ? `${Math.round(ms / 60e3)} min` : `${Math.floor(ms / 3600e3)}h ${Math.round(ms % 3600e3 / 60e3)}m`;
export const project = (s: Session) => (s.cwd ?? '').split('/').filter(Boolean).pop() || '(unknown)';
// Where a floating tip goes beside `el`, in window px: centred above it, or below when there's no room, and kept 8px
// inside the window. A badge's tip and a PR chip's or cut-short row's both use it.
export function tipSpot(tip: HTMLElement, el: Element) {
  const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
  const min = Math.max(8, titlebar());
  return { left: Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)), top: r.top - h - 8 >= min ? r.top - h - 8 : r.bottom + 8 };
}
export const short = (ms: number) => ms < 60e3 ? `${Math.max(0, Math.round(ms / 1e3))}s` : ms < 3600e3 ? `${Math.round(ms / 60e3)}m` : ms < 48 * 3600e3 ? `${Math.floor(ms / 3600e3)}h` : `${Math.floor(ms / 86400e3)}d`;

// The session's PRs as GitHub sees them: "PRs: #6776 ready to merge, #6801 checks failing"
/** Memory in MB as a person reads it: always GB, so the digits don't jump between MB and GB, and under a tenth of one "<0.1 GB". */
export const memText = (mb: number) => mb < 102.4 ? '<0.1 GB' : `${(mb / 1024).toFixed(1)} GB`;
/** This Mac's core count: a group of processes' CPU is percent of one core, the usage readout's percents are of all of them. */
export const cores = () => navigator.hardwareConcurrency || 1;
/** A group of processes' numbers for a card: CPU as a percent of the Mac, RAM in GB (memText), each with how hot it runs (heat.ts, by `key`). */
function useText(key: string, g: UsageGroup) {
  const h = heatOf(key, g), tip = heatTip(h, g);
  return { cpu: `${Math.round(g.cpu / cores())}%`, mem: memText(g.mem), cpuHot: h.cpu, memHot: h.mem, cpuTip: tip.cpu, memTip: tip.mem };
}
/** A session's processes for its card: the totals and each group by name (its Processes); null with no sample or no processes. The groups
 * sort by CPU as shown (whole percents of the Mac, where the server's order is by tenths of a core), then RAM, then name, "other" last; `by` 'mem' puts RAM first. */
export const sessionUse = (usage: Usage | null, id: string, by?: UsageSort) => groupUse(id, usage?.sessions[id], by);
/** The same for any group of processes, by the key its heat is kept under (Lantern's own use, in the usage dropdown). */
const CALM = { cpuHot: 0, memHot: 0, cpuTip: '', memTip: '' }; // "other" is many small things, never a hog: no heat colours
export type UsageSort = 'cpu' | 'mem';
export function groupUse(id: string, g: UsageGroup | undefined, by: UsageSort = 'cpu') {
  if (!g || !g.n) return null;
  const shown = (p: ProcGroup) => Math.round(p.cpu / cores()), other = (p: ProcGroup) => p.name === 'other';
  const procs = [...g.procs ?? []].sort((a, b) => Number(other(a)) - Number(other(b)) || (by === 'cpu' ? shown(b) - shown(a) || b.mem - a.mem : b.mem - a.mem || shown(b) - shown(a)) || a.name.localeCompare(b.name));
  return { ...useText(id, g), n: g.n, procs: procs.map(p => ({ name: p.name, n: p.n, ...useText(`${id}/${p.name}`, p), ...other(p) && CALM })) };
}
export const NEED: Record<string, string | undefined> = { ready: 'ready to merge', failing: 'checks failing', changes: 'changes requested', feedback: 'feedback waiting', waiting: 'in review', draft: 'draft', merged: 'merged', closed: 'closed' };

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
// Hovering any area (a session's moth, a ghost, a wisp) shows its card compact, a tooltip the pointer passes through
// (`compact` on #card); a click expands it (live.expanded), and it stays until a click elsewhere or the pointer has been
// away from it and its area a while (wiring.ts). A double click runs the area's click action.
function paint() {
  chrome.update();
  const c = $('card');
  // while the usage dropdown (a popover, so in the top layer) is open the card goes in the top layer too, shown after it, which puts it above
  if (document.querySelector('#usage:popover-open')) { c.popover = 'manual'; if (c.matches(':popover-open')) c.hidePopover(); c.showPopover(); }
  c.classList.add('show');
  c.classList.toggle('compact', !live.expanded);
}
export function enterZone(a: Zone) {
  clearTimeout(live.hideTimer);
  const t = a.target, cardAt = 'session' in t ? t.cardAt : undefined;
  if (live.hovered === t && (!a.cardAt || cardAt === a.cardAt)) return; // already showing it
  if (live.hovered !== t) live.expanded = false;
  live.hovered = t; if (a.cardAt && 'session' in t) t.cardAt = a.cardAt;
  paint();
}
// A click on an area expands its card; another click on it puts the card away.
export function expandCard(zone: Zone) {
  if (live.expanded && live.hovered === zone.target) return hideCard();
  enterZone(zone);
  live.expanded = true;
  paint();
}
// shift+click does what right-click does (the area's `menu`, where it has one), since right-click isn't obvious
export function clickZone(a: Zone, shift: boolean) { (shift && a.menu || a.onClick).call(a); clearTimeout(live.hideTimer); hideCard(); }
export function hideCard() { live.hovered = held = shown = null; live.expanded = false; chrome.update(); $('card').classList.remove('show'); $('card').removeAttribute('popover'); hidePrTip(); }
// The card's header opens its session (shift-click snoozes, as shift-click on the moth does), and its pill does what a
// right-click on the moth does (its `menu`, state.ts): snooze, then sleep, then wake.
export function openSession(id: string, shift: boolean) { const m = sessionMoth(id); if (m) clickZone(m.zone, shift); }
// The usage dropdown's session rows stand in for the moth: hovering or focusing one shows the moth's card (compact, a tooltip), leaving puts it away unless
// it was clicked open. A click opens the session's processes in the dropdown itself (UsageMenu.vue); a double click, or the processes' Open card,
// expands the card (pinSession), which never puts it away, so a card already open stays open.
export function peekSession(id: string) { const m = sessionMoth(id); if (m) enterZone(m.zone); }
export function unpeekSession() { if (!live.expanded) hideCard(); }
export function pinSession(id: string) { const m = sessionMoth(id); if (m) { enterZone(m.zone); live.expanded = true; paint(); } }
export function cycleSnooze(id: string) { sessionMoth(id)?.zone.menu?.(); }

// What a session's rows show, for the card (SessionCard.vue) and the sidebar (PinnedDock.vue) alike.
const STATE_WORDS: Record<string, string | undefined> = { working: 'working', waiting: 'needs you', paused: 'waiting on agents', idle: 'idle' };
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
// how old the session is and how long since it was last active
export const footLine = (s: Session, now: number) => `${project(s)} · ${short(now - (s.started ?? now))} old · ${short(now - (s.last ?? now))} ago`;

// The session's PRs, worst first, under a header that sums them up ("PRs · 1 ready · 2 in review · 8 drafts"). Either
// chips coloured by state (its title in #prTip while hovered), or in the sidebar two-line rows (title; dot, number, state).
const ORDER = ['failing', 'changes', 'feedback', 'ready', 'waiting', 'draft', 'merged', 'closed'];
const SHORT: Record<string, string | undefined> = { ...NEED, ready: 'ready', failing: 'failing' };
export const AGENT_CAP = 5; // the expanded card's agents, past which a "more" button lists the rest
const rank = (need: string) => (ORDER.indexOf(need) + 1) || ORDER.length + 1;
export const worstFirst = (prs: PR[]) => [...prs].sort((a, b) => rank(a.need) - rank(b.need));
export function prSummary(prs: PR[]) {
  const n = new Map<string, number>();
  for (const p of prs) n.set(p.need, (n.get(p.need) || 0) + 1);
  return [...n].sort(([a], [b]) => rank(a) - rank(b)).map(([k, c]) => `${c} ${k === 'changes' && c === 1 ? 'change requested' : SHORT[k] || k}${k === 'draft' && c > 1 ? 's' : ''}`).join(' · ');
}
// A PR's repo from its url (github.com/owner/name/pull/n): the short name to show, the full owner/name for a tooltip.
export function repoOf(url: string) {
  const full = new URL(url).pathname.split('/').slice(1, 3).join('/');
  return { full, name: full.split('/')[1] ?? full };
}
// A PR's title where a card doesn't already show it in full: a chip (a bare number), or a list row
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

// The card is pinned where it opened: it takes its anchor (the area's screen position and clearance) when it's first placed
// for an area and keeps it, whatever its moth does (flies, takes a new home, the lantern's sway) until it's hidden or another
// area's card replaces it. Only the viewport clamp below follows a resize.
let held: { zone: Zone, x: number, y: number, gap: number } | null = null, shown: { x: number, y: number } | null = null; // the anchor in screen px, and where the card last sat
export function pinAnchor(zone: Zone, x: number, y: number, gap: number) {
  if (held?.zone !== zone) held = { zone, x, y, gap };
  return held;
}
export function placeCard() {
  const h = live.hovered;
  if (!h) return; // before getScreenCTM, which lays out the page: every frame, with no card to place, that was a tenth of the frame's time
  const svg = document.querySelector('svg'), ctm = svg?.getScreenCTM();
  if (!svg || !ctm) return;
  const pt = svg.createSVGPoint();
  const zone = 'session' in h && h.cardAt === 'flies' && h.flyZone ? h.flyZone : h.zone; // beside whichever area was hovered
  pt.x = zone.x; pt.y = zone.y;
  const p = pt.matrixTransform(ctm), c = $('card');
  const a = pinAnchor(zone, p.x, p.y, zone.r * ctm.a * 0.7), gap = a.gap; // clear of the hover area, which covers the moth
  const x = Math.max(8, Math.min(a.x + gap, innerWidth - c.offsetWidth - 12));
  // it stays below the titlebar, and below the CPU and RAM rings (#usageButton) when it would sit beside them, and above the
  // footer (in the iTerm panel the footer takes a good share of a short window), as tall as fits between
  const hud = document.getElementById('usageButton')?.getBoundingClientRect();
  const top = Math.max(8, titlebar(), hud && x < hud.right && x + c.offsetWidth > hud.left ? hud.bottom + 8 : 0);
  const floor = document.querySelector('footer')?.getBoundingClientRect().top ?? innerHeight, most = `${Math.round(floor - top - 8)}px`;
  if (c.style.maxHeight !== most) c.style.maxHeight = most;
  const y = a.y + gap + c.offsetHeight > floor - 8 ? a.y - c.offsetHeight - gap : a.y + gap;
  // while the pointer is on it (opening an agent, say), it stays put rather than flipping above its moth, moving up only
  // as far as it must to stay on screen
  const to = { x, y: Math.max(top, Math.min(floor - 8 - c.offsetHeight, shown && c.matches(':hover') ? shown.y : y)) };
  shown = to;
  c.style.transform = `translate(${to.x}px, ${to.y}px)`;
}
