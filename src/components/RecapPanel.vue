<script setup lang="ts">
// The daily recap, inside the native #recap popover: one day's ribbon, numbers, badges and warm streak, and its sessions
// as a small constellation. It draws the day in the store's `recap`, which openRecap (src/scene/recap.ts) sets, along with
// when to open it. The ribbon, headline and badge tips are the scene's (src/scene/stats.ts), shared with the stats panel.
//
// A star's session shows as a card docked just below the popover (or above it when a short window has no room below), so it
// never covers the ribbon or the constellation. Its facts sit on the left and its PRs on the right. Hovering a star shows its
// card, and moving to another switches it; a click or tap pins it (the star is ringed) so the pointer can go down to its
// links, until the same star, empty space or Escape unpins it.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue';
import { NEED, ago } from '../scene/card';
import { flyColour } from '../scene/fireflies';
import { WARM, mix } from '../scene/lanterns';
import { gutterFor, daySessions, starAxis } from '../scene/recap';
import type { Star } from '../scene/recap';
import { nth, post } from '../scene/scene';
import { sessions } from '../scene/state';
import { ACHIEVEMENTS, MIN, MOTHS, clock, dayKey, dayRibbon, followRibbon, headline, slices } from '../scene/stats';
import { useLanternStore } from '../stores/lantern';

const store = useLanternStore();
const heading = useTemplateRef('heading'), ribbonBox = useTemplateRef('ribbonBox'), starsBox = useTemplateRef('starsBox'), card = useTemplateRef('card');
const W = 600, H = 90; // the constellation's units

const view = computed(() => {
  const rec = store.recap, d = rec?.stats.days[rec.i];
  if (!rec || !d) return null;
  const { stats: j, i } = rec, isToday = i === j.days.length - 1, key = dayKey(d.start);
  const r = slices(d, j.spans, j.gauges, 160), stars = daySessions(d, j.spans, j.prs);
  const early = r ? stars.filter(s => s.began < r.from).length : 0, gutter = gutterFor(early);
  const axis = r ? starAxis(stars.slice(early).map(s => s.from), r.from, r.to, gutter) : null;
  const change = d.staleChange == null ? '' : d.staleChange === 0 ? ', no change' : ` (${d.staleChange > 0 ? '+' : ''}${d.staleChange})`;
  // One dot per session, sized by how long it ran, left to right by when it started on `axis` (sessions that began before
  // the ribbon's day spaced evenly, in order, in a gutter left of a faint line), top to bottom by how warm it ran (the share
  // of its time not waiting on me), and tinted from the working moth's colour to the waiting one's by the same share.
  const dots = axis ? stars.map((s, k) => ({
    i: k, x: k < early ? (k + .5) * (gutter - 4) / early : nth(axis.xs, k - early), y: 14 + (1 - s.warm) * (H - 28),
    r: Math.min(9, 1.6 + Math.sqrt(s.ms / MIN) / 2.2), fill: mix(MOTHS.waiting, MOTHS.working, s.warm), label: s.title || 'a session',
  })) : [];
  return {
    d, r, stars, early, gutter, axis, dots,
    title: isToday ? 'Today’s recap' : i === j.days.length - 2 ? 'Yesterday’s recap' : new Date(d.start).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }),
    headline: d.warmMoths == null ? '' : headline(d),
    ribbon: r ? dayRibbon(r, isToday ? 'now' : clock(r.to)) : '',
    nums: [
      ['answer time', d.medianWait == null ? '–' : ago(d.medianWait)],
      ['fireflies', `${d.merged} merged${d.open == null ? '' : `, ${d.open} open`}`],
      ['stale PRs', d.stale == null ? '–' : d.stale + change],
    ],
    // lines joining the dots in order, and the faint line at the gutter's edge
    lines: dots.slice(1).map((o, k) => `M${nth(dots, k).x} ${nth(dots, k).y}L${o.x} ${o.y}`),
    badges: j.achievements.filter(a => a[1] === key).map(([id]) => ({ id, name: ACHIEVEMENTS[id]?.[0] ?? id, how: ACHIEVEMENTS[id]?.[1] ?? '' })),
    streak: j.streak, warmGoal: j.warmGoal,
  };
});

// ---- the stars
const lit = ref<number | null>(null), picked = ref<number | null>(null), cursor = ref<number | null>(null); // the star shown, the one pinned, the constellation's line (% across)
const shown = shallowRef<{ s: Star; alive: boolean } | null>(null); // the card's session, kept while the card fades
let onStar = false, starTimer: ReturnType<typeof setTimeout> | undefined, moment: ((t: number | null) => void) | undefined, popover: HTMLElement | null = null;

async function showStar(i: number | null) {
  clearTimeout(starTimer);
  lit.value = i;
  const s = i == null ? undefined : view.value?.stars[i];
  if (!s) return;
  shown.value = { s, alive: sessions.some(o => o.id === s.id) }; // still alive: its title goes to its terminal, like clicking its moth
  await nextTick();
  const el = card.value;
  if (!el || !popover) return;
  const r = popover.getBoundingClientRect(), below = r.bottom + 8;
  el.style.left = `${r.left}px`; el.style.width = `${r.width}px`;
  el.style.top = `${below + el.offsetHeight <= innerHeight - 8 || r.top - 8 - el.offsetHeight < 8 ? below : r.top - 8 - el.offsetHeight}px`;
}
const pick = (i: number) => { picked.value = picked.value === i ? null : i; showStar(i); };
const enter = (i: number) => { onStar = true; if (picked.value == null) showStar(i); };
// a moment's grace, so crossing from one star to the next doesn't flash the card away
const leave = (e: PointerEvent) => { onStar = false; if (e.pointerType === 'mouse' && picked.value == null) starTimer = setTimeout(() => showStar(null), 150); };
const unpin = () => { picked.value = null; showStar(null); };
const facts = (s: Star, ongoing: number) => [
  [`${clock(s.from)} to ${s.to >= ongoing - MIN ? 'now' : clock(s.to)}, ran ${ago(s.ms)}`, ''],
  [`${Math.round(100 * s.warm)}% warm: ${ago(s.ms - s.waitMs)} not waiting, ${ago(s.waitMs - s.snoozedMs - s.sleepingMs)} waiting, ${ago(s.snoozedMs)} snoozed${s.sleepingMs ? `, ${ago(s.sleepingMs)} sleeping` : ''}`, ''],
  [s.waits ? `Waited on you ${s.waits === 1 ? 'once' : `${s.waits} times`}, the longest ${ago(s.longest)}` : 'Never waited on you', 'dim'],
  // ponytail: the log keeps Claude's folder name for the project, so a dash in a real folder name reads as a slash
  ...(s.project ? [[String(s.project).replace(/-/g, '/').replace(/^\/Users\/[^/]+/, '~'), 'dim']] : []),
];

// After each draw: wire the new ribbon to the pointer. The two hover lines follow one moment: the constellation's sits at
// that time on its own axis, so it can stray a little from the ribbon's. A moment lights the star that started within 4
// ribbon pixels of it (tight, so a cluster of starts doesn't flicker between stars), unless one is pinned or the pointer is on a star.
watch(view, v => {
  picked.value = lit.value = cursor.value = null;
  const box = ribbonBox.value?.firstElementChild;
  moment = box && v?.r && v.axis ? followRibbon(box, v.r, v.d, t => {
    cursor.value = t == null || !v.axis ? null : v.axis.x(t) / 6;
    if (picked.value != null || onStar) return;
    const near = 4 * (v.r ? v.r.to - v.r.from : 0) / (box.querySelector('.ribbon')?.clientWidth ?? 0);
    const i = t == null ? -1 : v.stars.reduce((best, s, k) => k >= v.early && Math.abs(s.from - t) <= near
      && (best < 0 || Math.abs(s.from - t) < Math.abs(nth(v.stars, best).from - t)) ? k : best, -1);
    showStar(i < 0 ? null : i);
  }) : undefined;
}, { flush: 'post' });
// and hovering the constellation moves the ribbon's line to the time under the pointer (nothing in the gutter)
const hoverAt = (e: PointerEvent) => {
  const b = starsBox.value?.getBoundingClientRect(), v = view.value;
  if (!b || !v?.axis) return;
  const x = (e.clientX - b.left) / b.width * W;
  moment?.(x < v.gutter ? null : v.axis.t(x));
};

// empty space or Escape unpins (Escape then leaves the recap open)
const onPointerDown = (e: PointerEvent) => { if (!(e.target instanceof Element && e.target.closest('.star, .starCard'))) unpin(); };
const onEscape = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && picked.value != null && popover?.matches(':popover-open')) { e.preventDefault(); e.stopPropagation(); unpin(); }
};
onMounted(() => {
  popover = heading.value?.parentElement ?? null;
  popover?.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('keydown', onEscape, true);
});
onBeforeUnmount(() => {
  clearTimeout(starTimer);
  popover?.removeEventListener('pointerdown', onPointerDown);
  document.removeEventListener('keydown', onEscape, true);
});
</script>

<template>
  <h3 ref="heading">{{ view?.title }} <button class="close" aria-label="Close" @click="popover?.hidePopover()">×</button></h3>
  <template v-if="view">
    <p v-if="view.d.warmMoths == null" class="dim">No moths that day. A quiet one.</p>
    <template v-else>
      <div v-html="view.headline"></div>
      <div v-if="view.ribbon" ref="ribbonBox" v-html="view.ribbon"></div>
      <dl>
        <div v-for="[k, v] in view.nums" :key="k"><dt>{{ k }}</dt><dd>{{ v }}</dd></div>
      </dl>
      <div v-if="view.dots.length" ref="starsBox" class="starsBox" @pointermove="hoverAt" @pointerup="hoverAt"
        @pointerleave="e => e.pointerType === 'mouse' && moment?.(null)">
        <svg class="stars" :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="`${view.stars.length} sessions`">
          <path v-if="view.gutter" :d="`M${view.gutter} 0V${H}`" stroke="var(--ink)" stroke-width=".6" opacity=".35" />
          <g :stroke="WARM.thread" stroke-width=".6" opacity=".35" fill="none"><path v-for="d in view.lines" :key="d" :d="d" /></g>
          <g v-for="o in view.dots" :key="o.i" class="star" :class="{ picked: picked === o.i, lit: lit === o.i }" :data-i="o.i" tabindex="0" :aria-label="o.label"
            @pointerenter="enter(o.i)" @focus="picked == null && showStar(o.i)" @click="pick(o.i)" @keydown.enter.space.prevent="pick(o.i)"
            @pointerleave="leave" @blur="picked == null && showStar(null)">
            <circle :cx="o.x" :cy="o.y" :r="Math.max(o.r * 2.6, 9)" :fill="o.fill" opacity=".12" /><circle :cx="o.x" :cy="o.y" :r="o.r" :fill="o.fill" />
          </g>
        </svg>
        <i class="cursor" :hidden="cursor == null" :style="{ left: cursor == null ? undefined : `${cursor}%` }"></i>
      </div>
    </template>
    <div v-if="view.badges.length" class="badges">
      <button v-for="b in view.badges" :key="b.id" class="badge" :data-id="b.id" :aria-label="`${b.name}: ${b.how}`">{{ b.name }}</button>
    </div>
    <p v-if="view.streak" class="dim">Warm streak: {{ view.streak }} day{{ view.streak === 1 ? '' : 's' }} at or over {{ view.warmGoal }}% warm moths.</p>
    <div ref="card" class="starCard" :class="{ show: lit != null }" role="status">
      <template v-if="shown">
        <h3><button v-if="shown.alive" class="link" title="Go to this session" @click="post('/focus', { id: shown.s.id })">{{ shown.s.title || shown.s.project || 'A session' }}</button><template v-else>{{ shown.s.title || shown.s.project || 'A session' }}</template></h3>
        <div><div v-for="[text, cls] in facts(shown.s, view.d.end)" :key="text" :class="cls || undefined">{{ text }}</div></div>
        <div>
          <template v-if="shown.s.prs.size">
            <div class="agents">PRs ({{ shown.s.prs.size }})</div>
            <div v-for="p in [...shown.s.prs.values()].slice(0, 6)" :key="p.url" class="pr"><i :style="{ background: flyColour(p.need) }"></i><a :href="p.url" target="_blank" rel="noopener">{{ p.label }}</a> {{ NEED[p.need] || p.need }} · <span :title="p.title ?? ''">{{ p.title }}</span></div>
          </template>
          <div v-else class="dim">No PRs that day</div>
          <div v-if="shown.s.prs.size > 6" class="dim">and {{ shown.s.prs.size - 6 }} more</div>
        </div>
      </template>
    </div>
  </template>
</template>
