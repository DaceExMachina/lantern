// The daily recap: a card over the scene with one day's ribbon, numbers, badges, warm streak, and its sessions as a
// small constellation. It opens by itself when quiet hours start, or as yesterday's recap the first time the lantern
// is looked at the next day (whichever comes first; settings.recapSeen remembers the last day shown, for every
// window), and from the stats panel for any day of the past week. This is when to open it and the day's sessions as
// plain data; RecapPanel.vue (src/components) draws it from the store's `recap`.

import { nextTick } from 'vue';
import { live } from './live';
import { $, nth, post } from './scene';
import { notifying } from './notify';
import { dayKey } from './stats';
import { useLanternStore } from '../stores/lantern';
import { fetchStats } from '../types';
import type { Day, Opt, PR, PrEvent, Span } from '../types';

/** A session's day, from the log (daySessions). */
export interface Star {
  id: string; began: number; from: number; to: number; ms: number; waitMs: number; snoozedMs: number; sleepingMs: number; waits: number; longest: number;
  prs: Map<string, PR>; title?: Opt<string>; project?: Opt<string>; warm: number;
}

// Each session alive that day, from the log: when it ran, how long it waited on me (snoozed waits too, as in warm
// moths), how much of that was snoozed or sleeping, how many waits began that day and the longest, and what its PRs did.
export function daySessions(day: Day, spans: Span[], prs: PrEvent[]): Star[] {
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
export function starAxis(starts: number[], from: number, to: number, gutter: number, w = 600) {
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

// How wide the constellation's gutter is for the sessions that began before the ribbon's day (at most 15% of the width; the step shrinks to fit).
export const gutterFor = (early: number) => early ? Math.min(90, 8 + 14 * early) : 0;

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
  live.tally = j.tally;
  const store = useLanternStore();
  store.recap = null; // a fresh draw, so the panel wires its new ribbon (the same day opened twice would keep the old one)
  await nextTick();
  store.recap = { stats: j, i };
  await nextTick();
  $('stats').hidePopover();
  $('recap').showPopover();
  if (auto && notifying() && Notification.permission === 'granted') {
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
