<script setup lang="ts">
// CPU and memory, a small readout in the scene's top left (below the app window's drag strip, which takes every click on it):
// this Mac's CPU and memory as two meters (a ring or a bar, ?hud=ring|bar) with a sparkline of the last two minutes. Clicking it opens a
// dropdown (a native popover, like the reviews menu) with the Mac's numbers, how CPU and memory split across Lantern and the busiest
// sessions (a stacked bar each, the rows below keyed to its colours), and a bar per row. The numbers come from the usage event every few
// seconds (app/Usage.swift) and are gone with settings.systemStats off. Not in the iTerm panel or the screensavers, which have no room.
import { computed, ref, shallowRef, watch } from 'vue';
import { devSelect, devSlider } from '../dev';
import { memText, project } from '../scene/card';
import { useLanternStore } from '../stores/lantern';
import UsageIcon from './UsageIcon.vue';

const TOP = 8, HISTORY = 24, W = 48, H = 14; // the busiest sessions listed, samples kept (24 x 5 s = 2 minutes), the sparkline's box
// session colours, handed out in the order sessions first show up so a session keeps its colour as the ranking shifts; Lantern and everything else have their own
const SLOTS = ['--accent-violet', '--pr-in-review', '--pr-ready', '--pr-feedback', '--pr-changes', '--agents-ink', '--state-snoozed', '--pr-draft'];
const LANTERN = '--lantern-warm', OTHER = '--lantern-quiet';
const slots = new Map<string, string>();
const colour = (id: string) => { let c = slots.get(id); if (!c) { c = SLOTS[slots.size % SLOTS.length] ?? OTHER; slots.set(id, c); } return `var(${c})`; };

const hud = ref(devSelect('HUD', 'hud', 'meters', ['ring', 'bar'], 'ring', 'Ring gauges or thin bars beside the numbers', v => { hud.value = v; }));
const size = ref(devSlider('HUD', 'hudsize', 'meter size', 10, 28, 1, 16, 'Icon and ring size in px', v => { size.value = v; }));
const spark = ref(devSlider('HUD', 'hudspark', 'sparkline', 0, 96, 4, W, 'Sparkline width in px (0 hides it)', v => { spark.value = v; }));

const store = useLanternStore();
const roomy = !document.body.matches('.panel, .screensaver, .ambient'); // fixed by the time the chrome mounts
const u = computed(() => roomy && store.settings.systemStats !== false ? store.usage : null);
const memPct = computed(() => u.value ? Math.min(100, u.value.mac.used / u.value.mac.total * 100) : 0);
const cpuPct = computed(() => Math.min(100, u.value?.mac.cpu ?? 0));
const meters = computed(() => u.value ? [
  { kind: 'cpu' as const, pct: cpuPct.value, text: `${Math.round(u.value.mac.cpu)}%` },
  { kind: 'mem' as const, pct: memPct.value, text: memText(u.value.mac.used) }] : []);

const history = shallowRef<{ cpu: number; mem: number }[]>([]); // bounded, one sample per usage event
watch(u, v => { if (v) history.value = [...history.value, { cpu: cpuPct.value, mem: memPct.value }].slice(-HISTORY); }, { immediate: true });
const line = (k: 'cpu' | 'mem') => history.value.map((s, i) => `${(i * W / (HISTORY - 1)).toFixed(1)},${(H - s[k] / 100 * H).toFixed(1)}`).join(' ');

// the sessions with processes left, busiest CPU first (whole percents, so a hair of noise doesn't reorder), then memory
const ranked = computed(() => Object.entries(u.value?.sessions ?? {}).filter(([, g]) => g.n)
  .sort(([, a], [, b]) => Math.round(b.cpu) - Math.round(a.cpu) || b.mem - a.mem));
const top = computed(() => ranked.value.slice(0, TOP)
  .map(([id, g]) => { const s = store.sessions.find(o => o.id === id); return { id, name: s ? s.title || project(s) : id.slice(0, 8), g, colour: colour(id) }; }));
// the breakdowns: Lantern, the listed sessions, and the rest (CPU is in cores, so the rest is the unlisted sessions; memory's rest is everything else the Mac uses)
const split = computed(() => {
  const v = u.value;
  if (!v) return { cpu: [], mem: [] };
  const sum = (k: 'cpu' | 'mem', rows: { cpu: number; mem: number }[]) => rows.reduce((a, g) => a + g[k], 0);
  const listed = top.value.map(t => t.g), unlisted = ranked.value.slice(TOP).map(([, g]) => g);
  const parts = [{ c: `var(${LANTERN})`, g: v.lantern }, ...top.value.map(t => ({ c: t.colour, g: t.g }))];
  const cpuTotal = sum('cpu', [v.lantern, ...listed, ...unlisted]), memTotal = Math.max(v.mac.used, sum('mem', [v.lantern, ...listed, ...unlisted]));
  return {
    cpu: [...parts.map(p => ({ c: p.c, v: p.g.cpu })), { c: `var(${OTHER})`, v: sum('cpu', unlisted) }].map(s => ({ ...s, pct: cpuTotal ? s.v / cpuTotal * 100 : 0 })),
    mem: [...parts.map(p => ({ c: p.c, v: p.g.mem })), { c: `var(${OTHER})`, v: memTotal - sum('mem', [v.lantern, ...listed]) }].map(s => ({ ...s, pct: memTotal ? s.v / memTotal * 100 : 0 })),
  };
});
const share = (k: 'cpu' | 'mem', i: number) => `${Math.max(0, split.value[k][i]?.pct ?? 0).toFixed(1)}%`; // a row's width in its breakdown (Lantern is segment 0, so sessions are i + 1)
</script>

<template>
  <template v-if="u">
    <button id="usageButton" popovertarget="usage" :class="[u.mac.pressure, hud]" title="CPU and memory" :style="{ '--hud': `${size}px` }"
      :aria-label="`CPU and memory: this Mac ${Math.round(u.mac.cpu)}% CPU, ${memText(u.mac.used)} used`">
      <span v-for="m in meters" :key="m.kind" :class="['meter', m.kind]">
        <svg v-if="hud === 'ring'" class="ring" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10" pathLength="100" /><circle class="arc" cx="12" cy="12" r="10" pathLength="100" :stroke-dasharray="`${m.pct.toFixed(1)} 100`" transform="rotate(-90 12 12)" />
          <UsageIcon :kind="m.kind" x="6" y="6" width="12" height="12" />
        </svg>
        <template v-else><UsageIcon :kind="m.kind" class="ico" /><span class="bar"><i :style="{ width: `${m.pct.toFixed(1)}%` }"></i></span></template>
        <span class="v">{{ m.text }}</span>
      </span>
      <svg v-if="spark" class="spark" :width="spark" :height="H" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" aria-hidden="true"><polyline class="c" :points="line('cpu')" /><polyline class="m" :points="line('mem')" /></svg>
    </button>
    <div id="usage" class="flyup" popover aria-label="CPU and memory">
      <h4>This Mac</h4>
      <div :class="['row', u.mac.pressure]"><span><UsageIcon kind="cpu" class="ico" />{{ `${Math.round(u.mac.cpu)}%` }}</span><span :title="`Memory pressure: ${u.mac.pressure}`"><UsageIcon kind="mem" class="ico" />{{ `${memText(u.mac.used)} of ${memText(u.mac.total)}` }}</span></div>
      <div v-for="k in (['cpu', 'mem'] as const)" :key="k" class="stack"><UsageIcon :kind="k" class="ico" /><span><i v-for="(s, i) in split[k]" :key="i" :style="{ flex: s.pct, background: s.c }"></i></span></div>
      <h4>Lantern</h4>
      <div class="row"><i class="dot" :style="{ background: `var(${LANTERN})` }"></i><span>{{ `${u.lantern.n} process${u.lantern.n === 1 ? '' : 'es'}` }}</span><span><UsageIcon kind="cpu" class="ico" />{{ `${Math.round(u.lantern.cpu)}%` }}<UsageIcon kind="mem" class="ico" />{{ memText(u.lantern.mem) }}</span></div>
      <template v-if="top.length">
        <h4>Busiest sessions</h4>
        <div v-for="(t, i) in top" :key="t.id" class="row"><i class="dot" :style="{ background: t.colour }"></i><span>{{ t.name }}</span><span><UsageIcon kind="cpu" class="ico" />{{ `${Math.round(t.g.cpu)}%` }}<UsageIcon kind="mem" class="ico" />{{ memText(t.g.mem) }}</span>
          <b class="bars"><i :style="{ width: share('cpu', i + 1), background: t.colour }"></i><i :style="{ width: share('mem', i + 1), background: t.colour }"></i></b></div>
      </template>
    </div>
  </template>
</template>
