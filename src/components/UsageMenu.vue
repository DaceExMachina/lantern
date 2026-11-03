<script setup lang="ts">
// CPU and memory, a small readout in the scene's top left (below the app window's drag strip, which takes every click on it):
// this Mac's CPU and memory as two meters (rings) with a sparkline of the last two minutes. Clicking it opens a
// dropdown (a native popover, like the reviews menu) with the Mac's numbers, how CPU and memory split across Lantern and the busiest
// sessions (a stacked bar each, the rows below keyed to its colours), and a bar per row. The numbers come from the usage event every few
// seconds (app/Usage.swift) and are gone with settings.systemStats off. Not in the iTerm panel or the screensavers, which have no room.
import { computed, ref, shallowRef, watch } from 'vue';
import { devSlider } from '../dev';
import { memText, project } from '../scene/card';
import { useLanternStore } from '../stores/lantern';
import UsageIcon from './UsageIcon.vue';

const TOP = 8, HISTORY = 24, W = 48, H = 14; // the sparkline's viewBox, stretched to its real size; // the busiest sessions listed, samples kept (24 x 5 s = 2 minutes)
// session colours, handed out in the order sessions first show up so a session keeps its colour as the ranking shifts; Lantern and everything else have their own
const SLOTS = ['--accent-violet', '--pr-feedback', '--pr-changes', '--pr-draft', '--state-snoozed', '--state-working', '--agents-ink', '--pr-mention']; // none of them CPU's blue or memory's green (index.html)
const LANTERN = '--lantern-warm', OTHER = '--lantern-quiet';
const slots = new Map<string, string>();
const colour = (id: string) => { let c = slots.get(id); if (!c) { c = SLOTS[slots.size % SLOTS.length] ?? OTHER; slots.set(id, c); } return `var(${c})`; };

const size = ref(devSlider('HUD', 'hudsize', 'meter size', 10, 48, 1, 32, 'Ring size in px (the number and the sparkline scale with it)', v => { size.value = v; }));
const spark = ref(devSlider('HUD', 'hudspark', 'sparkline', 0, 160, 4, 96, 'Sparkline width in px (0 hides it)', v => { spark.value = v; }));

const store = useLanternStore();
const roomy = !document.body.matches('.panel, .screensaver, .ambient'); // fixed by the time the chrome mounts
const u = computed(() => roomy && store.settings.systemStats !== false ? store.usage : null);
const memPct = computed(() => u.value ? Math.min(100, u.value.mac.used / u.value.mac.total * 100) : 0);
const cpuPct = computed(() => Math.min(100, u.value?.mac.cpu ?? 0));
const meters = computed(() => u.value ? [
  { kind: 'cpu' as const, label: 'CPU', pct: cpuPct.value, text: `${Math.round(u.value.mac.cpu)}%`, tip: `CPU ${Math.round(u.value.mac.cpu)}%` },
  { kind: 'mem' as const, label: 'Memory', pct: memPct.value, text: memText(u.value.mac.used), tip: `Memory ${memText(u.value.mac.used)} of ${memText(u.value.mac.total)}, pressure ${u.value.mac.pressure}` }] : []);

const history = shallowRef<{ cpu: number; mem: number }[]>([]); // bounded, one sample per usage event
watch(u, v => { if (v) history.value = [...history.value, { cpu: cpuPct.value, mem: memPct.value }].slice(-HISTORY); }, { immediate: true });
const line = (k: 'cpu' | 'mem') => history.value.map((s, i) => `${(i * W / (HISTORY - 1)).toFixed(1)},${(H - s[k] / 100 * H).toFixed(1)}`).join(' ');

// the sessions with processes left, busiest CPU first (whole percents, so a hair of noise doesn't reorder), then memory
const ranked = computed(() => Object.entries(u.value?.sessions ?? {}).filter(([, g]) => g.n)
  .sort(([, a], [, b]) => Math.round(b.cpu) - Math.round(a.cpu) || b.mem - a.mem));
const top = computed(() => ranked.value.slice(0, TOP)
  .map(([id, g]) => { const s = store.sessions.find(o => o.id === id); return { id, name: s ? s.title || project(s) : id.slice(0, 8), g, colour: colour(id) }; }));
// the breakdowns: Lantern, the listed sessions, and the rest (CPU is in cores, so the rest is the unlisted sessions; memory's rest is everything else the Mac uses)
const cpuText = (g: { cpu: number }) => `${Math.round(g.cpu)}% CPU`;
const split = computed(() => {
  const v = u.value;
  if (!v) return { cpu: [], mem: [] };
  const sum = (k: 'cpu' | 'mem', rows: { cpu: number; mem: number }[]) => rows.reduce((a, g) => a + g[k], 0);
  const listed = top.value.map(t => t.g), unlisted = ranked.value.slice(TOP).map(([, g]) => g);
  const parts = [{ name: 'Lantern', c: `var(${LANTERN})`, g: v.lantern }, ...top.value.map(t => ({ name: t.name, c: t.colour, g: t.g }))];
  const cpuTotal = sum('cpu', [v.lantern, ...listed, ...unlisted]), memTotal = Math.max(v.mac.used, sum('mem', [v.lantern, ...listed, ...unlisted]));
  const cpuRest = sum('cpu', unlisted), memRest = memTotal - sum('mem', [v.lantern, ...listed]);
  const rest = `var(${OTHER})`;
  return {
    cpu: [...parts.map(p => ({ c: p.c, v: p.g.cpu, tip: `${p.name} · ${cpuText(p.g)}` })), { c: rest, v: cpuRest, tip: `Other sessions · ${cpuText({ cpu: cpuRest })}` }].map(s => ({ ...s, pct: cpuTotal ? s.v / cpuTotal * 100 : 0 })),
    mem: [...parts.map(p => ({ c: p.c, v: p.g.mem, tip: `${p.name} · ${memText(p.g.mem)}` })), { c: rest, v: memRest, tip: `Everything else · ${memText(Math.max(0, memRest))}` }].map(s => ({ ...s, pct: memTotal ? s.v / memTotal * 100 : 0 })),
  };
});
// a row's bar in its breakdown (Lantern is segment 0, so sessions are i + 1): its width and its tooltip
const bar = (k: 'cpu' | 'mem', i: number, colour: string) => ({ style: { width: `${Math.max(0, split.value[k][i]?.pct ?? 0).toFixed(1)}%`, background: colour }, title: split.value[k][i]?.tip });
</script>

<template>
  <template v-if="u">
    <button id="usageButton" popovertarget="usage" :class="u.mac.pressure" title="CPU and memory" :style="{ '--hud': `${size}px` }"
      :aria-label="`CPU and memory: this Mac ${Math.round(u.mac.cpu)}% CPU, ${memText(u.mac.used)} used`">
      <span v-for="m in meters" :key="m.kind" :class="['meter', m.kind]" :title="m.tip">
        <svg class="ring" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10" pathLength="100" /><circle class="arc" cx="12" cy="12" r="10" pathLength="100" :stroke-dasharray="`${m.pct.toFixed(1)} 100`" transform="rotate(-90 12 12)" />
          <UsageIcon :kind="m.kind" x="6" y="6" width="12" height="12" />
        </svg>
        <span class="txt"><span class="v">{{ m.text }}</span><span class="lbl">{{ m.label }}</span></span>
      </span>
      <svg v-if="spark" class="spark" :width="spark" :height="size / 2" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" aria-hidden="true"><polyline class="c" :points="line('cpu')" /><polyline class="m" :points="line('mem')" /></svg>
    </button>
    <div id="usage" :class="['flyup', u.mac.pressure]" popover aria-label="CPU and memory">
      <h4>This Mac</h4>
      <div :class="['row', 'mac', u.mac.pressure]"><span><UsageIcon kind="cpu" class="ico" />{{ `${Math.round(u.mac.cpu)}%` }}</span><span :title="`Memory pressure: ${u.mac.pressure}`"><UsageIcon kind="mem" class="ico" />{{ `${memText(u.mac.used)} of ${memText(u.mac.total)}` }}</span></div>
      <div v-for="k in (([['cpu', 'CPU'], ['mem', 'Memory']]) as const)" :key="k[0]" :class="['stack', k[0]]"><UsageIcon :kind="k[0]" class="ico" /><b>{{ k[1] }}</b><span><i v-for="(s, i) in split[k[0]]" :key="i" :title="s.tip" :style="{ flex: s.pct, background: s.c }"></i></span></div>
      <h4 class="cols"><span>Lantern</span><span class="hd cpu"><UsageIcon kind="cpu" class="ico" />CPU</span><span class="hd mem"><UsageIcon kind="mem" class="ico" />Memory</span></h4>
      <div class="row"><i class="dot" :style="{ background: `var(${LANTERN})` }"></i><span>{{ `${u.lantern.n} process${u.lantern.n === 1 ? '' : 'es'}` }}</span>
        <span class="cell"><b>{{ `${Math.round(u.lantern.cpu)}%` }}</b><i v-bind="bar('cpu', 0, `var(${LANTERN})`)"></i></span><span class="cell"><b>{{ memText(u.lantern.mem) }}</b><i v-bind="bar('mem', 0, `var(${LANTERN})`)"></i></span></div>
      <template v-if="top.length">
        <h4 class="cols"><span>Busiest sessions</span><span class="hd cpu"><UsageIcon kind="cpu" class="ico" />CPU</span><span class="hd mem"><UsageIcon kind="mem" class="ico" />Memory</span></h4>
        <div v-for="(t, i) in top" :key="t.id" class="row"><i class="dot" :style="{ background: t.colour }"></i><span>{{ t.name }}</span>
          <span class="cell"><b>{{ `${Math.round(t.g.cpu)}%` }}</b><i v-bind="bar('cpu', i + 1, t.colour)"></i></span><span class="cell"><b>{{ memText(t.g.mem) }}</b><i v-bind="bar('mem', i + 1, t.colour)"></i></span></div>
      </template>
    </div>
  </template>
</template>
