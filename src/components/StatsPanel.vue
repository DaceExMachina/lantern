<script setup lang="ts">
// The stats panel, inside the native #stats popover: today's numbers from the event log, the day ribbon and the week
// before. It reads the log when it opens and again every minute while it stays open. The ribbons, headline and badge tips
// are the scene's, shared with the recap (scene-bridge.ts).
import { computed, nextTick, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue';
import { loadStats } from '../events';
import { scene } from '../scene-bridge';
import { useLanternStore } from '../stores/lantern';

const MIN = 60 * 1000, DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const store = useLanternStore();
const ribbonBox = useTemplateRef('ribbonBox'), week = useTemplateRef('week'), anchor = useTemplateRef('anchor');

const view = computed(() => {
  const j = store.stats;
  const today = j?.days.at(-1);
  if (!j || !today) return null;
  const { slices, ribbonBody, headline, dayRibbon, clock, dayKey, pct, ago, ACHIEVEMENTS } = scene();
  const days = j.days, r = slices(today, j.spans, j.gauges, 160);
  const stale = today.stale == null ? '–' : today.stale + (today.staleChange ? ` (${today.staleChange > 0 ? '+' : ''}${today.staleChange})` : '');
  const badge = (id: string, extra = '', unearned = false) => {
    const [name, how] = ACHIEVEMENTS[id] || [id, ''];
    return { id, name, how, extra, unearned };
  };
  const todayKey = dayKey(Date.now());
  const nums: [string, string | number, string][] = [
    ['answer time', today.medianWait == null ? '–' : ago(today.medianWait), 'median time a moth waited before you answered'],
    ['slowest answers', today.slowWait == null ? '–' : ago(today.slowWait), 'one in ten waits lasted at least this long'],
    ['waits', today.waits, 'times a moth landed on the lantern for you'],
    ['merged', today.merged, 'fireflies that flew home (merged PRs)'],
    ['in flight', today.open ?? '–', 'open PRs your sessions own'],
    ['stale PRs', stale, 'open PRs no session owns and nobody touched for a week, and the change since this morning'],
  ];
  return {
    today, r, tally: j.tally, nums,
    headline: today.warmMoths == null ? '' : headline(today),
    dayRibbon: r ? dayRibbon(r, today.end >= Date.now() - MIN ? 'now' : clock(r.to)) : '',
    week: days.slice(0, -1).map((d, i) => {
      const mini = slices(d, j.spans, j.gauges, 48);
      return { i, name: DAY_NAMES[new Date(d.start).getDay()] ?? '', pct: pct(d.warmMoths), title: mini ? `${clock(mini.from)} to ${clock(mini.to)}: open the recap` : '', ribbon: mini && ribbonBody(mini, 120, 26) };
    }),
    logIsNew: !days.slice(0, -1).some(d => d.mothMs),
    earned: j.achievements.slice().reverse().map(([id, day]) =>
      badge(id, day === todayKey ? 'today' : DAY_NAMES[new Date(day + 'T12:00').getDay()] ?? '')),
    streak: j.streak, warmGoal: j.warmGoal,
    shelf: Object.keys(ACHIEVEMENTS).map(id => badge(id, (j.tally[id]?.[0] ?? 0) > 1 ? `×${j.tally[id]?.[0]}` : '', !j.tally[id])),
  };
});

// After each draw: hand the scene the tally for its badge tips, bring back the pinned badge's tip, and wire a new ribbon
// to the pointer (a redraw that left the ribbon's markup alone keeps its element, and its listeners).
let wired: Element | null = null;
watch(view, async v => {
  if (!v) return;
  await nextTick();
  const { setTally, restoreBadge, followRibbon } = scene();
  setTally(v.tally);
  const box = ribbonBox.value?.firstElementChild ?? null;
  if (box && box !== wired && v.r) followRibbon(box, v.r, v.today);
  wired = box;
  if (week.value) restoreBadge(week.value);
});

let timer: ReturnType<typeof setInterval> | undefined;
const onToggle = (e: Event) => {
  clearInterval(timer);
  if ('newState' in e && e.newState === 'open') { loadStats(store); timer = setInterval(() => loadStats(store), MIN); }
};
// the toggle event fires on the popover, which is the heading's parent
let popover: HTMLElement | null = null;
onMounted(() => { popover = anchor.value?.parentElement ?? null; popover?.addEventListener('toggle', onToggle); });
onBeforeUnmount(() => { clearInterval(timer); popover?.removeEventListener('toggle', onToggle); });
</script>

<template>
  <h3 ref="anchor">Today <button id="todayRecap" class="link">recap</button></h3>
  <div id="statsBody">
    <p v-if="store.statsFailed" class="dim">Couldn’t read the stats. Is the Lantern app running?</p>
    <p v-else-if="!view" class="dim">Reading the log…</p>
    <template v-else>
      <p v-if="view.today.warmMoths == null" class="dim">No moths yet today. Your first session starts the day.</p>
      <div v-else v-html="view.headline"></div>
      <div v-if="view.dayRibbon" ref="ribbonBox" v-html="view.dayRibbon"></div>
      <dl>
        <div v-for="[k, v, why] in view.nums" :key="k" :title="why"><dt>{{ k }}</dt><dd>{{ v }}</dd></div>
      </dl>
    </template>
  </div>
  <div id="statsWeek" ref="week">
    <template v-if="view">
      <h4>The week before</h4>
      <div class="week">
        <template v-for="d in view.week" :key="d.i">
          <button v-if="d.ribbon" class="day" :data-day="d.i" :title="d.title"><span>{{ d.name }}</span>
            <svg viewBox="0 0 120 26" preserveAspectRatio="none" shape-rendering="crispEdges" aria-hidden="true" v-html="d.ribbon"></svg><b>{{ d.pct }}</b></button>
          <div v-else class="day" title="nothing recorded"><span>{{ d.name }}</span><i class="none"></i><b>–</b></div>
        </template>
      </div>
      <p v-if="view.logIsNew" class="dim">The lantern started keeping a log recently, so the week fills in as the days go by.</p>
      <h4>Badges this week</h4>
      <div v-if="view.earned.length" class="badges">
        <button v-for="b in view.earned" :key="b.id" class="badge" :data-id="b.id" :aria-label="`${b.name}: ${b.how}`">{{ b.name }} <small v-if="b.extra">{{ b.extra }}</small></button>
      </div>
      <p v-else class="dim">None yet this week. They come from the log as the days go by.</p>
      <p v-if="view.streak" class="dim">Warm streak: {{ view.streak }} day{{ view.streak === 1 ? '' : 's' }} at or over {{ view.warmGoal }}% warm moths.</p>
      <details class="shelf"><summary>All badges</summary><div class="badges">
        <button v-for="b in view.shelf" :key="b.id" class="badge" :class="{ unearned: b.unearned }" :data-id="b.id" :aria-label="`${b.name}: ${b.how}`">{{ b.name }} <small v-if="b.extra">{{ b.extra }}</small></button>
      </div></details>
    </template>
  </div>
</template>
