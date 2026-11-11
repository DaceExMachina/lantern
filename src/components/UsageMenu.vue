<script lang="ts">
import { ref } from 'vue';
import { devSlider } from '../dev';

// registered when the module loads, not when the readout first mounts, so the dev panel (which lists its rows once) has it
const size = ref(devSlider('HUD', 'hudsize', 'ring size', 10, 48, 1, 32, 'Ring size in px (the number and the sparklines scale with it)', v => { size.value = v; }));
</script>

<script setup lang="ts">
// CPU and RAM, a small readout in the scene's top left (below the app window's drag strip, which takes every click on it):
// this Mac's CPU and RAM as two ring gauges with a number each. Clicking it opens a
// dropdown (a native popover, like the reviews menu): the Mac's CPU and RAM each with a bar split by who uses it and a line of the last two minutes (a fixed scale: CPU 0 to 100%, RAM 0 to the Mac's total), and a key of
// the busiest sessions, everything else and Lantern in the colours of those splits. The numbers come from the usage event every few seconds
// (app/Usage.swift) and are gone with settings.systemStats off. Not in the iTerm panel or the screensavers, which have no room.
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue';
import type { UsageGroup as Group } from '../types';
import { cores, groupUse, memText, peekSession, pinSession, project, sessionUse, unpeekSession, type UsageSort } from '../scene/card';
import { heatOf, heatTip } from '../scene/heat';
import { tintFor } from '../scene/lanterns';
import { useLanternStore } from '../stores/lantern';
import UsageIcon from './UsageIcon.vue';
import UsageRing from './UsageRing.vue';
import StatsDetail from './StatsDetail.vue';

const TOP = 8, HISTORY = 24, W = 48, H = 14; // the busiest sessions listed, samples kept (24 x 5 s = 2 minutes), the sparkline's viewBox (stretched to fit)
const LANTERN = 'var(--ink-dim)', ELSE = 'var(--ink-faint)';

const store = useLanternStore();
const roomy = !document.body.matches('.panel, .screensaver, .ambient'); // fixed by the time the chrome mounts
const u = computed(() => roomy && store.settings.systemStats !== false ? store.usage : null);
const memPct = computed(() => u.value ? Math.min(100, u.value.mac.used / u.value.mac.total * 100) : 0);
const cpuPct = computed(() => Math.min(100, u.value?.mac.cpu ?? 0));
const meters = computed(() => u.value ? [
  { kind: 'cpu' as const, pct: cpuPct.value, text: `${Math.round(u.value.mac.cpu)}%`, tip: `CPU ${Math.round(u.value.mac.cpu)}%` },
  { kind: 'mem' as const, pct: memPct.value, text: memText(u.value.mac.used), tip: `RAM ${memText(u.value.mac.used)} of ${memText(u.value.mac.total)}, pressure ${u.value.mac.pressure}` }] : []);

const history = shallowRef<{ cpu: number; mem: number }[]>([]); // bounded, one sample per usage event
watch(u, v => { if (v) history.value = [...history.value, { cpu: cpuPct.value, mem: memPct.value }].slice(-HISTORY); }, { immediate: true });
const line = (k: 'cpu' | 'mem') => history.value.map((s, i) => `${(i * W / (HISTORY - 1)).toFixed(1)},${(H - s[k] / 100 * H).toFixed(1)}`).join(' ');

// While a row's processes are open, the rows keep the order they had when it opened, their numbers still live: a new one joins at the end, one
// that's gone drops out. Closing it lets them sort again. (The open row's processes still sort as they come.)
// The sessions' order is by CPU (then RAM) or by RAM (then CPU), picked with the column headers and kept per viewer; Lantern and everything else stay at the foot.
let saved: string | null = null;
try { saved = localStorage.getItem('lantern-usage-sort'); } catch {}
const sort = ref<UsageSort>(saved === 'mem' ? 'mem' : 'cpu');
const byUse = (a: Group, b: Group) => sort.value === 'mem' ? b.mem - a.mem || Math.round(b.cpu) - Math.round(a.cpu) : Math.round(b.cpu) - Math.round(a.cpu) || b.mem - a.mem;
const open = ref<string | null>(null), held = shallowRef<string[] | null>(null);
const at = (order: string[], k: string) => order.includes(k) ? order.indexOf(k) : order.length;
// the dropdown: the busiest sessions (CPU first, in whole percents so a hair of noise doesn't reorder, then RAM), then everything else the Mac is doing, then,
// apart under a rule, Lantern's own use (the app, not a session: out of the sort and the held order, and marked with a ring, never a session's swatch).
// Percents are of the whole Mac, so the split bars add up to its own bar
const popup = computed(() => {
  const v = u.value;
  if (!v) return null;
  const used = v.mac.used, total = v.mac.total;
  const sessions = Object.entries(v.sessions).filter(([, g]) => g.n)
    .sort(([, a], [, b]) => byUse(a, b)).slice(0, TOP)
    .map(([id, g]) => { const s = store.sessions.find(o => o.id === id); return { id, name: s ? s.title || project(s) : id.slice(0, 8), g, c: tintFor(s ?? { id }) }; });
  const order = held.value;
  const row = (r: { id: string; name: string; g: Group; c: string }) => { const h = heatOf(r.id || 'lantern', r.g), tip = heatTip(h, r.g); return { id: r.id, name: r.name, c: r.c, cpu: r.g.cpu / cores(), mem: r.g.mem, memPct: r.g.mem / total * 100, cpuHot: h.cpu, memHot: h.mem, cpuTip: tip.cpu, memTip: tip.mem, app: false, rest: false }; };
  const rows = sessions.sort((a, b) => order ? at(order, a.id) - at(order, b.id) : byUse(a.g, b.g)).map(row);
  const app = { ...row({ id: '', name: 'Lantern', g: v.lantern, c: LANTERN }), app: true };
  // everything else is what's left of the Mac, but never less than its own process rows add up to; the "macOS" row is the gap between the two (kernel, GPU and compressed
  // memory, system processes Lantern can't read), so the rows always add up to the header
  const procs = v.else?.procs ?? [], procCpu = procs.reduce((a, p) => a + p.cpu, 0) / cores(), procMem = procs.reduce((a, p) => a + p.mem, 0);
  const cpuElse = Math.max(procCpu, v.mac.cpu - [...rows, app].reduce((a, r) => a + r.cpu, 0)), memElse = Math.max(procMem, used - [...rows, app].reduce((a, r) => a + r.mem, 0));
  const mac = { name: 'macOS', n: 1, cpu: (cpuElse - procCpu) * cores(), mem: memElse - procMem, help: "The kernel, the GPU and compressed memory, plus system processes Lantern can't read" };
  const elseUse = groupUse('else', v.else, sort.value, Math.round(cpuElse - procCpu) || mac.mem >= 102.4 ? mac : undefined); // an older server sends none: the row is then plain
  const all = [...rows, { id: '', name: 'everything else', c: ELSE, cpu: cpuElse, mem: memElse, memPct: memElse / total * 100, cpuHot: 0, memHot: 0, cpuTip: '', memTip: '', app: false, rest: !!elseUse }, app];
  const w = (n: number) => `${Math.max(0, n).toFixed(2)}%`;
  return {
    rows: all.map(r => ({ ...r, key: r.id || r.name, cpuText: `${Math.round(r.cpu)}%`, memText: gb(r.mem), cpuW: w(r.cpu), memW: w(r.memPct), btn: !!(r.id || r.app || r.rest), use: r.id ? sessionUse(v, r.id, sort.value) : r.app ? groupUse('lantern', v.lantern, sort.value) : r.rest ? elseUse : null })),
    blocks: [
      { kind: 'cpu' as const, num: `${Math.round(v.mac.cpu)}%`, of: 'of the Mac', segs: all.map(r => ({ key: r.id || r.name, id: r.id, btn: !!(r.id || r.app || r.rest), c: r.c, w: w(r.cpu), tip: `${r.name} · ${Math.round(r.cpu)}% CPU` })) },
      { kind: 'mem' as const, num: (used / 1024).toFixed(1), of: `of ${Math.round(total / 1024)} GB`, segs: all.map(r => ({ key: r.id || r.name, id: r.id, btn: !!(r.id || r.app || r.rest), c: r.c, w: w(r.memPct), tip: `${r.name} · ${gb(r.mem)} RAM` })) }],
  };
});

// One highlighted session, by row key, shared by the split bars and the key: hovering or focusing either lights its segments and row and dims the rest.
// A session's row, and its segment in the bars, is also a button standing in for its moth: hover or focus shows the moth's card. A click opens the session's processes under
// its row (StatsDetail), one row at a time, and another click closes them; a double click opens the moth's card in full and puts the dropdown
// away, as the processes' Open card and Go to session do. (A double click's two clicks open and close the row on the way.)
const hot = ref<string | null>(null);
const gb = (mb: number) => `${(mb / 1024).toFixed(1)} GB`; // the column is always GB, as the cards' numbers are
const menu = useTemplateRef<HTMLElement>('menu');
// one row's processes open at a time, the rows' order held from now until it closes (or the dropdown does)
async function setSort(k: UsageSort) {
  if (k === sort.value) return;
  sort.value = k;
  try { localStorage.setItem('lantern-usage-sort', k); } catch {}
  if (open.value) { held.value = null; await nextTick(); held.value = (popup.value?.rows ?? []).map(r => r.key); } // an open row's order is held again, once sorted
}
function setOpen(key: string | null) { held.value = key ? (popup.value?.rows ?? []).map(r => r.key) : null; open.value = key; }
const close = () => menu.value?.hidePopover?.();
// The open row's processes count as its row for hovering, so the moth's card stays up over them (the dropdown, in the top layer, is never under it).
const hover = (key: string, id: string) => ({ pointerenter: () => { hot.value = key; if (id) peekSession(id); }, pointerleave: () => { hot.value = null; if (id) unpeekSession(); } });
const rowEvents = (key: string, id: string, btn: boolean) => {
  const { pointerenter: on, pointerleave: off } = hover(key, id);
  return btn ? {
    pointerenter: on, focus: on, pointerleave: off, blur: off,
    click: async () => { setOpen(open.value === key ? null : key); await nextTick(); menu.value?.querySelector('.sd')?.scrollIntoView({ block: 'nearest' }); },
    ...id && { dblclick: () => { close(); pinSession(id); } }, // Lantern's own row and everything else have processes to open but no card
  } : { pointerenter: on, pointerleave: off };
};
</script>

<template>
  <template v-if="u">
    <button id="usageButton" popovertarget="usage" :class="u.mac.pressure" title="CPU and RAM" :style="{ '--hud': `${size}px` }"
      :aria-label="`CPU and RAM: this Mac ${Math.round(u.mac.cpu)}% CPU, ${memText(u.mac.used)} used`">
      <span v-for="m in meters" :key="m.kind" :class="['meter', m.kind]" :title="m.tip">
        <span class="top"><UsageRing :pct="m.pct" :kind="m.kind" /><span class="v">{{ m.text }}</span></span>
      </span>
    </button>
    <div v-if="popup" id="usage" ref="menu" :class="['flyup', { hl: hot }]" popover @toggle="(e: Event) => 'newState' in e && e.newState === 'closed' && setOpen(null)" :style="{ '--hud': `${size}px` }" aria-label="CPU and RAM">
      <section v-for="b in popup.blocks" :key="b.kind">
        <div class="big"><UsageIcon :kind="b.kind" /><b>{{ b.num }}</b><span>{{ b.of }}</span></div>
        <div class="bar"><component :is="s.btn ? 'button' : 'i'" v-for="s in b.segs" :key="s.key" :class="{ hot: hot === s.key }" :title="s.tip" :style="{ width: s.w, background: s.c }" v-on="rowEvents(s.key, s.id, s.btn)"></component></div>
        <div class="chart" aria-hidden="true">
          <svg class="spark" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none"><polyline :points="line(b.kind)" /></svg>
        </div>
      </section>
      <hr>
      <div class="key">
        <div class="kh"><span>Session</span><button v-for="k in (['cpu', 'mem'] as const)" :key="k" :aria-pressed="sort === k" :title="`Sort by ${k === 'cpu' ? 'CPU' : 'RAM'}`" @click="setSort(k)"><svg v-if="sort === k" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 6.5 8 10l3.5-3.5"/></svg>{{ k === 'cpu' ? 'CPU' : 'MEM' }}</button></div>
        <template v-for="r in popup.rows" :key="r.name">
        <hr v-if="r.app">
        <component :is="r.btn ? 'button' : 'div'" :class="['krow', { session: r.id, hot: hot === r.key }]" :title="`${r.name} · ${r.cpuText} CPU · ${r.memText} RAM`"
          :aria-expanded="r.btn ? open === r.key : undefined" v-on="rowEvents(r.key, r.id, r.btn)">
          <i :class="['sw', { app: r.app }]" :style="{ [r.app ? 'borderColor' : 'background']: r.c }"></i><span class="n">{{ r.name }}</span><span :class="`hot${r.cpuHot}`" :title="r.cpuTip || undefined">{{ r.cpuText }}</span><span :class="`hot${r.memHot}`" :title="r.memTip || undefined">{{ r.memText }}</span>
          <b class="tracks"><b class="track" aria-hidden="true"><i :style="{ width: r.cpuW, background: r.c }"></i></b><b class="track" aria-hidden="true"><i :style="{ width: r.memW, background: r.c }"></i></b></b>
        </component>
        <StatsDetail v-if="r.use && open === r.key" :id="r.id" :use="r.use" :card="!r.id" v-on="hover(r.key, r.id)" @done="close" />
        </template>
      </div>
    </div>
  </template>
</template>
