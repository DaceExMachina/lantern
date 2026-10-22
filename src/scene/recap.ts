// The daily recap: a card over the scene with one day's ribbon, numbers, badges, warm streak, and its sessions as a
// small constellation. It opens by itself when quiet hours start, or as yesterday's recap the first time the lantern
// is looked at the next day (whichever comes first; settings.recapSeen remembers the last day shown, for every
// window), and from the stats panel for any day of the past week.

import { live } from './live';
import { $, nth, post } from './scene';
import { WARM, mix } from './lanterns';
import { sessions } from './state';
import { ago, line, prRows } from './card';
import { box } from './notify';
import { MIN, MOTHS, badge, clock, dayKey, dayRibbon, followRibbon, headline, slices } from './stats';
import { fetchStats } from '../types';
import type { Day, Opt, PR, PrEvent, Span, Stats } from '../types';

/** A session's day, from the log (daySessions). */
interface Star {
  id: string; began: number; from: number; to: number; ms: number; waitMs: number; snoozedMs: number; sleepingMs: number; waits: number; longest: number;
  prs: Map<string, PR>; title?: Opt<string>; project?: Opt<string>; warm: number;
}

const esc = (s: unknown) => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

// Each session alive that day, from the log: when it ran, how long it waited on me (snoozed waits too, as in warm
// moths), how much of that was snoozed or sleeping, how many waits began that day and the longest, and what its PRs did.
function daySessions(day: Day, spans: Span[], prs: PrEvent[]): Star[] {
  const runs = new Map<string, Omit<Star, 'warm'>>(), clip = (b: number, e: number) => Math.max(0, Math.min(e, day.end) - Math.max(b, day.start));
  for (const [kind, b, e, , id, title, project] of spans) {
    if (!id || e <= day.start || b >= day.end) continue;
    let r = runs.get(id);
    if (!r) runs.set(id, r = { id, began: Infinity, from: Infinity, to: 0, ms: 0, waitMs: 0, snoozedMs: 0, sleepingMs: 0, waits: 0, longest: 0, prs: new Map() });
    const ms = clip(b, e);
    if (kind === 'alive') { r.began = Math.min(r.began, b); r.from = Math.min(r.from, Math.max(b, day.start)); r.to = Math.max(r.to, Math.min(e, day.end)); r.ms += ms; r.title ||= title; r.project ||= project; }
    if (kind === 'waiting') { r.waitMs += ms; r.longest = Math.max(r.longest, ms); if (b >= day.start) r.waits++; }
    if (kind === 'snoozed') r.snoozedMs += ms;
    if (kind === 'sleeping') r.sleepingMs += ms;
  }
  for (const [t, id, url, change, need, title] of prs) {
    const r = t >= day.start && t < day.end && url && id !== null ? runs.get(id) : undefined;
    if (r && url) r.prs.set(url, { url, label: `#${url.split('/')[6]}`, need: need ?? change ?? '', title: title || r.prs.get(url)?.title || '' });
  }
  return [...runs.values()].filter(r => r.ms > 0).map(r => ({ ...r, warm: 1 - Math.min(1, r.waitMs / r.ms) })).sort((a, b) => a.began - b.began);
}

// The constellation's own time axis, in its 600 wide units: `starts` (sorted) left to right after the gutter, at their
// times, except that crowded ones are pushed at least a gap apart, taking the room from the quiet stretches around
// them. Returns each start's x, and time -> x and x -> time (each monotonic) for the hover lines.
function starAxis(starts: number[], from: number, to: number, gutter: number, w = 600) {
  const span = w - gutter, gap = Math.min(12, span / (starts.length + 1)), lo = gutter + gap / 2, hi = w - gap / 2;
  const xs = starts.map(t => gutter + (t - from) / (to - from) * span);
  for (let i = 0; i < xs.length; i++) xs[i] = Math.max(nth(xs, i), i ? nth(xs, i - 1) + gap : lo);
  for (let i = xs.length - 1; i >= 0; i--) xs[i] = Math.min(nth(xs, i), i < xs.length - 1 ? nth(xs, i + 1) - gap : hi);
  const T = [from, ...starts, to], X = [gutter, ...xs, w];
  const lerp = (as: number[], bs: number[]) => (v: number) => {
    v = Math.min(nth(as, as.length - 1), Math.max(nth(as, 0), v));
    const k = Math.max(1, as.findIndex((a, i) => i && v <= a)), a0 = nth(as, k - 1), a1 = nth(as, k);
    return a1 > a0 ? nth(bs, k - 1) + (v - a0) / (a1 - a0) * (nth(bs, k) - nth(bs, k - 1)) : nth(bs, k);
  };
  return { xs, x: lerp(T, X), t: lerp(X, T) };
}

// One dot per session that day, sized by how long it ran, left to right by when it started on `axis` (sessions that
// began before the ribbon's day spaced evenly, in order, in a gutter left of a faint line), top to bottom by how warm
// it ran (the share of its time not waiting on me), and tinted from the working moth's colour to the waiting one's by
// the same share. Faint lines join them in order.
const gutterFor = (early: number) => early ? Math.min(90, 8 + 14 * early) : 0; // at most 15% of the width; the step shrinks to fit
function constellation(stars: Star[], early: number, gutter: number, axis: ReturnType<typeof starAxis>) {
  if (!stars.length) return '';
  const w = 600, h = 90;
  const at = stars.map((s, k): [number, number, number, string] => [k < early ? (k + .5) * (gutter - 4) / early : nth(axis.xs, k - early), 14 + (1 - s.warm) * (h - 28),
    Math.min(9, 1.6 + Math.sqrt(s.ms / MIN) / 2.2), mix(MOTHS.waiting, MOTHS.working, s.warm)]);
  const lines = at.slice(1).map(([x, y], i) => `<path d="M${nth(at, i)[0]} ${nth(at, i)[1]}L${x} ${y}"/>`).join('');
  const dots = at.map(([x, y, r, fill], i) => `<g class="star" data-i="${i}" tabindex="0" aria-label="${esc(nth(stars, i).title || 'a session')}">
    <circle cx="${x}" cy="${y}" r="${Math.max(r * 2.6, 9)}" fill="${fill}" opacity=".12"/><circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/></g>`).join('');
  const edge = gutter ? `<path d="M${gutter} 0V${h}" stroke="var(--ink)" stroke-width=".6" opacity=".35"/>` : '';
  return `<div class="starsBox"><svg class="stars" viewBox="0 0 ${w} ${h}" role="img" aria-label="${stars.length} sessions">${edge}<g stroke="${WARM.thread}" stroke-width=".6" opacity=".35" fill="none">${lines}</g>${dots}</svg><i class="cursor" hidden></i></div>`;
}

// A session's day, as a card like a moth's, docked just below the recap (or above it when a short window has no room
// below), so it never covers the ribbon or the constellation. Its facts sit on the left and its PRs on the right, and it's as
// tall as they are. Hovering a star shows its card, and
// moving to another switches it; a click or tap pins it (the star is ringed) so the pointer can go down to its links,
// until the same star, empty space or Escape unpins it. `ongoing` is today's last moment, so a session still running
// ends "now".
let recapStars: Star[] = [], recapOngoing = 0, pickedStar: number | null = null, onStar = false, starTimer: ReturnType<typeof setTimeout> | undefined;
function showStar(i: number | null) {
  clearTimeout(starTimer);
  const root = $('recap');
  for (const g of starsIn(root)) { g.classList.toggle('picked', starIndex(g) === pickedStar); g.classList.toggle('lit', starIndex(g) === i); }
  const found = root.querySelector('.starCard'), s = i == null ? undefined : recapStars[i];
  if (!s) return found?.classList.remove('show');
  const card = found instanceof HTMLElement ? found : document.createElement('div');
  if (card !== found) { card.className = 'starCard'; card.setAttribute('role', 'status'); root.append(card); }
  const h = document.createElement('h3'), facts = document.createElement('div'), prs = document.createElement('div');
  const name = s.title || s.project || 'A session';
  if (sessions.some(o => o.id === s.id)) { // still alive: its title goes to its terminal, like clicking its moth
    const go = document.createElement('button');
    go.className = 'link'; go.textContent = name; go.title = 'Go to this session';
    go.onclick = () => post('/focus', { id: s.id });
    h.append(go);
  } else h.textContent = name;
  facts.append(
    line(`${clock(s.from)} to ${s.to >= recapOngoing - MIN ? 'now' : clock(s.to)}, ran ${ago(s.ms)}`),
    line(`${Math.round(100 * s.warm)}% warm: ${ago(s.ms - s.waitMs)} not waiting, ${ago(s.waitMs - s.snoozedMs - s.sleepingMs)} waiting, ${ago(s.snoozedMs)} snoozed${s.sleepingMs ? `, ${ago(s.sleepingMs)} sleeping` : ''}`),
    line(s.waits ? `Waited on you ${s.waits === 1 ? 'once' : `${s.waits} times`}, the longest ${ago(s.longest)}` : 'Never waited on you', 'dim'),
    // ponytail: the log keeps Claude's folder name for the project, so a dash in a real folder name reads as a slash
    ...(s.project ? [line(String(s.project).replace(/-/g, '/').replace(/^\/Users\/[^/]+/, '~'), 'dim')] : []));
  prs.append(...(s.prs.size ? prRows([...s.prs.values()]).slice(0, 7) : [line('No PRs that day', 'dim')]), // the heading and six
    ...(s.prs.size > 6 ? [line(`and ${s.prs.size - 6} more`, 'dim')] : []));
  card.replaceChildren(h, facts, prs);
  const r = root.getBoundingClientRect(), below = r.bottom + 8;
  card.style.left = `${r.left}px`; card.style.width = `${r.width}px`;
  card.style.top = `${below + card.offsetHeight <= innerHeight - 8 || r.top - 8 - card.offsetHeight < 8 ? below : r.top - 8 - card.offsetHeight}px`;
  card.classList.add('show');
}
// the constellation's stars, each a <g class="star" data-i>
const starsIn = (root: Element) => [...root.querySelectorAll('.stars .star')].filter(g => g instanceof SVGElement);
const starIndex = (g: SVGElement) => +(g.dataset['i'] ?? NaN);
function followStars(stars: Star[], ongoing: number) {
  recapStars = stars; recapOngoing = ongoing; pickedStar = null;
  for (const g of starsIn($('recap'))) {
    const i = starIndex(g), pick = () => { pickedStar = pickedStar === i ? null : i; showStar(i); };
    g.addEventListener('pointerenter', () => { onStar = true; if (pickedStar == null) showStar(i); });
    g.addEventListener('focus', () => { if (pickedStar == null) showStar(i); });
    g.addEventListener('click', pick);
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    // a moment's grace, so crossing from one star to the next doesn't flash the card away
    g.addEventListener('pointerleave', e => { onStar = false; if (e.pointerType === 'mouse' && pickedStar == null) starTimer = setTimeout(() => showStar(null), 150); });
    g.addEventListener('blur', () => { if (pickedStar == null) showStar(null); });
  }
}
// empty space or Escape unpins (Escape then leaves the recap open)
const unpinStar = () => { pickedStar = null; showStar(null); };
$('recap').addEventListener('pointerdown', e => { if (!(e.target instanceof Element && e.target.closest('.star, .starCard'))) unpinStar(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && pickedStar != null && $('recap').matches(':popover-open')) { e.preventDefault(); e.stopPropagation(); unpinStar(); }
}, true);

function renderRecap(j: Stats, d: Day, i: number) {
  const key = dayKey(d.start), isToday = i === j.days.length - 1;
  const title = isToday ? 'Today’s recap' : i === j.days.length - 2 ? 'Yesterday’s recap' : new Date(d.start).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  live.tally = j.tally;
  const r = slices(d, j.spans, j.gauges, 160), earned = j.achievements.filter(a => a[1] === key), stars = daySessions(d, j.spans, j.prs);
  const early = r ? stars.filter(s => s.began < r.from).length : 0, gutter = gutterFor(early);
  const axis = r && starAxis(stars.slice(early).map(s => s.from), r.from, r.to, gutter);
  const change = d.staleChange == null ? '' : d.staleChange === 0 ? ', no change' : ` (${d.staleChange > 0 ? '+' : ''}${d.staleChange})`;
  const nums = [
    ['answer time', d.medianWait == null ? '–' : ago(d.medianWait)],
    ['fireflies', `${d.merged} merged${d.open == null ? '' : `, ${d.open} open`}`],
    ['stale PRs', d.stale == null ? '–' : d.stale + change],
  ];
  $('recap').innerHTML = `<h3>${title} <button class="close" aria-label="Close">×</button></h3>
    ${d.warmMoths == null ? '<p class="dim">No moths that day. A quiet one.</p>' : `
      ${headline(d)}
      ${r ? dayRibbon(r, isToday ? 'now' : clock(r.to)) : ''}
      <dl>${nums.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      ${r && axis ? constellation(stars, early, gutter, axis) : ''}`}
    ${earned.length ? `<div class="badges">${earned.map(([id]) => badge(id)).join('')}</div>` : ''}
    ${j.streak ? `<p class="dim">Warm streak: ${j.streak} day${j.streak === 1 ? '' : 's'} at or over ${j.warmGoal}% warm moths.</p>` : ''}`;
  const box = $('recap').querySelector('.dayRibbon');
  // The two hover lines follow one moment: the constellation's sits at that time on its own axis, so it can stray a
  // little from the ribbon's. A moment lights the star that started within 4 ribbon pixels of it (tight, so a cluster of
  // starts doesn't flicker between stars), unless one is pinned or the pointer is on a star.
  const starLine = $('recap').querySelector('.starsBox .cursor'), ribbonEl = box?.querySelector('.ribbon');
  const moment = box && r && axis && followRibbon(box, r, d, t => {
    if (starLine instanceof HTMLElement) { starLine.hidden = t == null; if (t != null) starLine.style.left = `${axis.x(t) / 6}%`; }
    if (pickedStar != null || onStar) return;
    const near = 4 * (r.to - r.from) / (ribbonEl?.clientWidth ?? 0);
    const i = t == null ? -1 : stars.reduce((best, s, i) => i >= early && Math.abs(s.from - t) <= near
      && (best < 0 || Math.abs(s.from - t) < Math.abs(nth(stars, best).from - t)) ? i : best, -1);
    showStar(i < 0 ? null : i);
  });
  // and hovering the constellation moves the ribbon's line to the time under the pointer (nothing in the gutter)
  const starsBox = $('recap').querySelector('.starsBox');
  if (moment && axis && starsBox instanceof HTMLElement) {
    const at = (e: PointerEvent) => { const b = starsBox.getBoundingClientRect(), x = (e.clientX - b.left) / b.width * 600; moment(x < gutter ? null : axis.t(x)); };
    starsBox.addEventListener('pointermove', at);
    starsBox.addEventListener('pointerup', at); // a tap: on pointerup, after the tap-elsewhere reset on pointerdown
    starsBox.addEventListener('pointerleave', e => e instanceof PointerEvent && e.pointerType === 'mouse' && moment(null));
  }
  followStars(stars, d.end);
  const close = $('recap').querySelector('.close');
  if (close instanceof HTMLElement) close.onclick = () => $('recap').hidePopover();
}

// Shows day `i` of /stats (the last one is today). `auto` is the lantern opening it by itself: it marks the day as
// seen for every window, and says so in a notification when "notify me" is on.
export async function openRecap(i: number, auto = false) {
  const j = await fetchStats(), d = j.days[i];
  if (!d) return false;
  const isToday = i === j.days.length - 1;
  if (auto) {
    if (d.warmMoths == null && isToday) return false; // quiet hours on a day with no moths yet: yesterday's can still come
    post('/settings', { recapSeen: dayKey(d.start) });
    if (d.warmMoths == null) return false; // nothing to recap: just remember it was considered
  }
  renderRecap(j, d, i);
  $('stats').hidePopover();
  $('recap').showPopover();
  if (auto && box.checked && Notification.permission === 'granted') {
    const badges = j.achievements.filter(a => a[1] === dayKey(d.start)).length;
    new Notification(`Lantern: ${isToday ? 'today' : 'yesterday'}`, { body: `${d.warmMoths}% warm moths${badges ? `, ${badges} badge${badges === 1 ? '' : 's'}` : ''}`, silent: true });
  }
  return true;
}

// Yesterday's recap, the first time this window is looked at on a new day, unless a recap since then was shown; today's
// when quiet hours start. Only the full window does this (not the iTerm panel or a screensaver), and only once settings
// have said what was seen.
export function maybeRecap(quietStarted = false) {
  if (document.body.matches('.panel, .screensaver, .ambient') || document.hidden || live.recapSeen === null) return;
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const was = live.recapSeen, today = dayKey(Date.now()), [i, day] = quietStarted && was < today ? [7, today] : [6, dayKey(yesterday.getTime())];
  if (was >= day) return;
  live.recapSeen = day; // before the fetch, so a second check meanwhile doesn't open it again
  openRecap(i, true).then(shown => { if (!shown && i === 7) live.recapSeen = was; }, () => { live.recapSeen = was; });
}
