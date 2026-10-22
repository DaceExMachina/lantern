// What the stats panel (src/components/StatsPanel.vue) and the recap share: the ribbons, headline and badge tips. The panel
// itself is Vue and imports these. Hygiene over volume: the headline is how much of the moths' time was warm.

import { live } from './live';
import { $ } from './scene';
import { COOL, MOTH_CALL, MOTH_IDLE, MOTH_RESTING, WARM, mix } from './lanterns';
import { ago, tipSpot } from './card';
import type { Day, Gauge, Span } from '../types';

/** A slice of a day's ribbon: its span (ms), and the share of it the app ran, was violet or quiet, and moths were
 * alive, waiting, snoozed or sleeping; the share of moth time flying, and the working gauge (null where unknown). */
interface Slice {
  a: number; b: number; ran: number; violet: number; quiet: number; alive: number; waiting: number; snoozed: number; sleeping: number;
  flying: number | null; working: number | null;
}
/** A day's ribbon: from and to (ms), its slices, and when sessions started. */
export interface Ribbon { from: number; to: number; slices: Slice[]; starts: number[] }
const MOTH_STATES = ['working', 'waiting', 'snoozed', 'idle'] as const;
type MothState = typeof MOTH_STATES[number];

export const MIN = 60 * 1000;
// The middle and bottom strips use the moths' own colours (lanterns.ts, as frame.ts's mothColour blends them): working
// in flight, waiting on the lantern, and snoozed (a landed moth only half way to the calling colour; snoozed for good,
// sleeping, counts as snoozed here, since the two can't be told apart on the graph).
export const MOTHS: Record<MothState, string> = { working: MOTH_IDLE, waiting: MOTH_CALL, snoozed: mix(MOTH_IDLE, MOTH_CALL, 0.5), idle: MOTH_RESTING };
export const RIBBON = { warm: WARM.outer, violet: COOL.outer, quiet: '#3A3050' };

// the day a time falls on (yyyy-MM-dd): a day starts at the day rollover (dayStart) and is named for the date it starts on
export const dayKey = (t: number) => { const d = new Date(t), [h = 0, m = 0] = live.dayStart.split(':').map(Number); if (d.getHours() * 60 + d.getMinutes() < h * 60 + m) d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// The ribbon's slices for one day: from the first session that day to `end` (now, or the last session's end).
// Each slice blends what overlapped it: how much the app ran, was violet or quiet, and how much moth time was waiting.
// The working band comes from the five-minute gauges (the latest one at the slice's middle), so it's coarser than the rest.
// So does the snoozed share of waiting before the log first wrote a snoozed span (it only counts snoozes by hand).
// Before the log wrote sleeping spans, sleeping waits count as snoozed.
export function slices(day: Pick<Day, 'start' | 'end'>, spans: Span[], gauges: Gauge[], count: number): Ribbon | null {
  const since = Math.min(Infinity, ...spans.filter(s => s[0] === 'snoozed').map(s => s[1]));
  const alive = spans.filter(s => s[0] === 'alive' && s[2] > day.start && s[1] < day.end);
  if (!alive.length) return null;
  const from = Math.max(day.start, Math.min(...alive.map(s => s[1])));
  const to = day.start + 86400000 > Date.now() ? day.end : Math.min(day.end, Math.max(...alive.map(s => s[2])));
  const width = Math.max(2 * MIN, (to - from) / count), out: Slice[] = [];
  const mine = spans.filter(s => s[2] > from && s[1] < to);
  for (let a = from; a < to; a += width) {
    const b = Math.min(to, a + width), mid = (a + b) / 2, covered = new Map<string, number>();
    for (const [kind, s, e] of mine) if (s < b && e > a) covered.set(kind, (covered.get(kind) || 0) + Math.min(e, b) - Math.max(s, a));
    const cover = (kind: string) => covered.get(kind) || 0;
    const g = gauges.filter(g => g[0] <= mid && g[0] > mid - 6 * MIN).pop();
    const snoozed = b <= since && g && g[3] > 0 ? cover('waiting') * Math.max(0, g[4]) / g[3] : cover('snoozed');
    out.push({ a, b, ran: cover('server') / (b - a), violet: cover('violet') / (b - a), quiet: cover('quiet') / (b - a),
      alive: cover('alive') / (b - a), waiting: cover('waiting') / (b - a), snoozed: Math.min(cover('waiting'), snoozed) / (b - a),
      sleeping: Math.min(cover('waiting') - Math.min(cover('waiting'), snoozed), cover('sleeping')) / (b - a),
      flying: cover('alive') ? 1 - cover('waiting') / cover('alive') : null, working: g ? g[2] : null });
  }
  return { from, to, slices: out, starts: alive.filter(s => !s[3] && s[1] >= from).map(s => s[1]) };
}

// What the lantern was in a slice (a RIBBON colour), or null while the app wasn't running.
const lampOf = (s: Slice) => s.ran < .5 ? null : s.quiet > .5 ? 'quiet' : s.violet > .5 ? 'violet' : 'warm';
// A slice's sessions alive by state. The working count is a gauge, so it only fills what the waits leave.
export function states(s: Slice): Record<MothState, number> {
  const working = Math.max(0, Math.min(s.working ?? 0, s.alive - s.waiting));
  return { working, waiting: s.waiting - s.snoozed - s.sleeping, snoozed: s.snoozed + s.sleeping, idle: Math.max(0, s.alive - s.waiting - working) };
}

// The colour of a slice's landed moths: waiting and snoozed blended by their shares.
const landed = (s: Slice) => mix(MOTHS.waiting, MOTHS.snoozed, s.waiting ? (s.snoozed + s.sleeping) / s.waiting : 0);

// Three strips a hair apart, top to bottom: the sessions alive stacked by state in the moths' colours (working, waiting,
// snoozed (sleeping too), then the idle rest, rising from the strip below), the share of moths flying vs landed (blending the same
// colours by share), and the lantern (warm or violet, quiet dim) as tall as the moths strip. Small ticks under the
// lantern strip mark sessions starting.
export function ribbonBody(r: Ribbon, w: number, h: number) {
  const band = Math.round(h * .24), gap = 2, low = h - 2 * band - 2 * gap - 3, x = (t: number) => (t - r.from) / (r.to - r.from) * w;
  const most = Math.max(1, ...r.slices.map(s => s.alive));
  let svg = '';
  for (const s of r.slices) {
    const x0 = x(s.a), sw = x(s.b) - x0 + .4, lamp = lampOf(s);
    let y = low;
    const st = states(s);
    for (const k of MOTH_STATES) {
      const bh = low * st[k] / most;
      if (bh > 0) { y -= bh; svg += `<rect x="${x0}" y="${y}" width="${sw}" height="${bh}" fill="${MOTHS[k]}"/>`; }
    }
    if (s.flying != null) svg += `<rect x="${x0}" y="${low + gap}" width="${sw}" height="${band}" fill="${mix(landed(s), MOTHS.working, s.flying)}"/>`;
    if (lamp) svg += `<rect x="${x0}" y="${low + 2 * gap + band}" width="${sw}" height="${band}" fill="${RIBBON[lamp]}"/>`;
  }
  for (const t of r.starts) svg += `<path d="M${x(t)} ${h - 3}V${h}" stroke="var(--ink)" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`;
  return svg;
}
const ribbon = (r: Ribbon, w: number, h: number) => `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" shape-rendering="crispEdges" aria-hidden="true">${ribbonBody(r, w, h)}</svg>`;

// A day's ribbon with its axis and a legend of the moth states (snoozed counts sleeping too) with their times, for the stats panel and the recap. `end` labels the right edge.
export const dayRibbon = (r: Ribbon, end: string) => `<div class="dayRibbon"><div class="ribbon">${ribbon(r, 600, 50)}<i class="cursor" hidden></i></div>
  <div class="axis"><span>${clock(r.from)}</span><b data-v="at"></b><span>${end}</span></div>
  <div class="legend">${['working', 'waiting', 'snoozed', 'idle'].map(k => `<span><i style="background: var(--state-${k})"></i>${k === 'snoozed' ? 'snoozed / sleeping' : k}<b data-v="${k}"></b></span>`).join('')}</div></div>`;

// The two headline stats, for the stats panel and the recap. They measure different things: the lantern's warm share
// is of the time the app ran outside quiet hours (it's violet while any session waits on you, snoozed and sleeping
// ones aside), moths flying is of all session time summed over the sessions (waiting, snoozed and sleeping count as landed).
// Hovering the ribbon swaps them for that moment's lantern state and share of moths flying (see followRibbon).
export const pct = (v: number | null | undefined) => v == null ? '–' : `${v}%`;
const LAMP_WORD: Record<string, string | undefined> = { warm: 'warm', violet: 'waiting', quiet: 'quiet' }; // the lantern's headline while hovering (no lamp at all reads "off")
export const headline = (d: Pick<Day, 'warmLantern' | 'warmMoths'>) => `<div class="headline">
  <div><b data-v="lamp">${pct(d.warmLantern)}</b><span>lantern warmth</span></div>
  <div><b data-v="flying">${pct(d.warmMoths)}</b><span>moths flying</span></div></div>`;

// Hovering (or touching) a dayRibbon: a line follows the pointer and the legend's values show that moment; leaving
// puts the day's totals back. Every value has a fixed-width slot, so nothing moves as they change. It returns
// `moment(t)`, which shows time t (or the totals, for null) as a hover would, and `onMoment` hears each one: the recap
// moves its constellation's line and lights the star that started then, and drives the ribbon from the constellation.
const ribbonTaps = new WeakMap<Element, AbortController>(); // each popover's tap-elsewhere listener, dropped when it draws a new ribbon
export function followRibbon(box: Element, r: Ribbon, day: Pick<Day, 'warmLantern' | 'warmMoths'>, onMoment = (_: number | null) => {}) {
  const el = box.querySelector('.ribbon'), root = el?.closest('[popover]'), line = el?.querySelector('.cursor');
  if (!(el instanceof HTMLElement) || !root || !(line instanceof HTMLElement)) return () => {};
  const show = (s: Slice | null | undefined) => {
    const b = s && states(s), out = s && b
      ? { at: clock(s.a), lamp: LAMP_WORD[lampOf(s) ?? ''] || 'off', flying: s.flying == null ? '–' : `${Math.round(100 * s.flying)}%`,
          ...Object.fromEntries(MOTH_STATES.map(k => [k, String(Math.round(b[k]))])) }
      : { at: '', lamp: pct(day.warmLantern), flying: pct(day.warmMoths),
          ...Object.fromEntries(MOTH_STATES.map(k => [k, ago(r.slices.reduce((ms, s) => ms + states(s)[k] * (s.b - s.a), 0))])) };
    for (const [k, v] of Object.entries(out)) for (const slot of root.querySelectorAll(`[data-v="${k}"]`)) slot.textContent = v;
  };
  const moment = (t: number | null) => {
    line.hidden = t == null;
    if (t != null) line.style.left = `${(t - r.from) / (r.to - r.from) * 100}%`;
    show(t == null ? null : r.slices.find(s => t < s.b) || r.slices[r.slices.length - 1]);
    onMoment(t);
  };
  const move = (e: PointerEvent) => { const b = el.getBoundingClientRect(); moment(r.from + Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)) * (r.to - r.from)); };
  const leave = () => moment(null);
  el.addEventListener('pointerdown', move);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', e => e.pointerType === 'mouse' && leave());
  // a touch keeps its moment until the next tap elsewhere (the panel redraws every minute: drop the last ribbon's listener)
  const tap = new AbortController();
  ribbonTaps.get(root)?.abort(); ribbonTaps.set(root, tap);
  root.addEventListener('pointerdown', e => !(e.target instanceof Node && el.contains(e.target)) && leave(), { signal: tap.signal });
  show(null);
  return moment;
}

// Badges the server gives from the event log (Stats.swift decides when). They're not sorted into good or bad: what
// each one means is up to whoever earns it. [name, how it's earned]
export const ACHIEVEMENTS: Record<string, [name: string, how: string] | undefined> = {
  warm_all_day: ['Warm all day', 'The lantern stayed warm nine tenths of a day with sessions running'],
  clear_night: ['Clear night', 'No stale PRs for a whole week'],
  small_batches: ['Small batches', 'Never more than 3 fireflies in flight for a week'],
  revived: ['Revived', 'Brought a stale PR back and merged it'],
  ghostbuster: ['Ghostbuster', 'Merged or closed 5 stale PRs in one day'],
  seance: ['Séance', 'Revived 5 stale PRs in a week'],
  lights_out: ['Lights Out', 'Took a real break: two hours with nothing running between sessions'],
  streak_3: ['Warm streak: 3 days', 'Three days in a row at or over the warm moths mark'],
  streak_7: ['Warm streak: a week', 'Seven days in a row at or over the warm moths mark'],
  streak_14: ['Warm streak: two weeks', 'Fourteen days in a row at or over the warm moths mark'],
  streak_30: ['Warm streak: a month', 'Thirty days in a row at or over the warm moths mark'],
  haunted: ['Haunted', 'Stale PRs past 30, so the faint cloud shows'],
  restless_spirits: ['Restless spirits', 'One old session (a ghost moth) behind 5 or more stale PRs'],
  light_pollution: ['Light Pollution', '20 or more fireflies in flight'],
  swarm_season: ['Swarm Season', 'One session owned 10 open PRs'],
  hive_mind: ['Hive Mind', 'One session ran 10 agents at once'],
  purple_rain: ['Purple Rain', 'The lantern stayed violet for a whole hour'],
  ghosted: ['Ghosted', 'A moth waited 3 hours or more'],
  snooze_champion: ['Snooze Button Champion', 'Snoozed 10 waits in one day'],
};

// What a badge is: a small card floating over it while the pointer is on it (or it has focus), like a moth's card,
// out of the panel's layout so nothing moves; a click or tap keeps it until clicked again. One tip per panel, inside
// it (the panel sits in the top layer). `live.tally` is every badge ever earned, as id -> [times, last day].
let badgeTimer: ReturnType<typeof setTimeout> | undefined;
const longDay = (day: string) => new Date(day + 'T12:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
function showBadge(el: HTMLElement) {
  clearTimeout(badgeTimer);
  const id = el.dataset['id'] ?? '', root = el.closest('[popover]'), [name, how] = ACHIEVEMENTS[id] || [id, ''];
  const [times, last] = live.tally[id] || [0, ''];
  if (!root) return;
  const found = root.querySelector('.badgeTip'), tip = found instanceof HTMLElement ? found : document.createElement('div');
  if (tip !== found) { tip.className = 'badgeTip'; tip.setAttribute('role', 'tooltip'); root.append(tip); }
  tip.innerHTML = `<b>${name}</b><div>${how}.</div>
    <div class="dim">${times ? `Earned ${times === 1 ? 'once' : `${times} times`}, last on ${longDay(last)}.` : 'Not earned yet.'}</div>`;
  const at = tipSpot(tip, el); // above the badge, or below when there's no room
  tip.style.left = `${at.left}px`; tip.style.top = `${at.top}px`;
  tip.classList.add('show');
}
// back to the pinned badge's tip, or none
export function restoreBadge(root: Element) {
  const el = live.pinnedBadge && root.querySelector(`.badge[data-id="${live.pinnedBadge}"]`);
  if (el instanceof HTMLElement) { const shelf = el.closest('details'); if (shelf) shelf.open = true; showBadge(el); } // only on the shelf: open it to show the badge
  else root.querySelector('.badgeTip')?.classList.remove('show');
}
// the badge an event came from
const badgeAt = (target: EventTarget | null) => { const el = target instanceof Element ? target.closest('.badge') : null; return el instanceof HTMLElement ? el : null; };
for (const root of [$('stats'), $('recap')]) {
  root.addEventListener('pointerover', e => { const el = badgeAt(e.target); if (el) showBadge(el); });
  root.addEventListener('focusin', e => { const el = badgeAt(e.target); if (el) showBadge(el); });
  root.addEventListener('pointerout', e => {
    const el = badgeAt(e.target);
    if (el && !(e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) badgeTimer = setTimeout(() => restoreBadge(root), 150); // a moment, so crossing to the next badge doesn't flash
  });
  root.addEventListener('scroll', () => restoreBadge(root), true); // a tip stays over its badge, so it can't ride a scroll
  root.addEventListener('click', e => {
    const el = badgeAt(e.target); if (!el) return;
    const id = el.dataset['id'] ?? null;
    live.pinnedBadge = live.pinnedBadge === id ? null : id;
    restoreBadge(root);
  });
}
