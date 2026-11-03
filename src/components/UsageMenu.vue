<script setup lang="ts">
// CPU and RAM, a small readout in the scene's top left (below the app window's drag strip, which takes every click on it):
// this Mac's CPU and RAM as two ring gauges with a number and a sparkline of the last two minutes under each. Clicking it opens a
// dropdown (a native popover, like the reviews menu) with the Mac, Lantern and the busiest sessions (UsagePopup.vue, in layouts to
// choose between with ?popup=). The numbers come from the usage event every few seconds (app/Usage.swift) and are gone with
// settings.systemStats off. Not in the iTerm panel or the screensavers, which have no room.
import { computed, ref, shallowRef, watch } from 'vue';
import { devSelect, devSlider } from '../dev';
import { memText, project } from '../scene/card';
import { useLanternStore } from '../stores/lantern';
import UsagePopup, { type UsageRow } from './UsagePopup.vue';
import UsageRing from './UsageRing.vue';

const TOP = 8, HISTORY = 24, W = 48, H = 14; // the busiest sessions listed, samples kept (24 x 5 s = 2 minutes), the sparkline's viewBox (stretched to fit)

const size = ref(devSlider('HUD', 'hudsize', 'ring size', 10, 48, 1, 32, 'Ring size in px (the number and the sparklines scale with it)', v => { size.value = v; }));
const popup = ref(devSelect('HUD', 'popup', 'dropdown', ['a', 'b', 'c', 'd'], 'a', 'The dropdown layout: a two columns, b rings, c big rings and a ranked list, d butterfly', v => { popup.value = v; }));

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

// the dropdown's rows. Bars are a share of something real: RAM of the Mac's total; CPU of one core per hundred (or of the busiest, when one passes that)
const row = (id: string, name: string, cpu: number, mem: number, cpuPct: number, memPct: number, total = 0): UsageRow => ({
  id, name, cpu: `${Math.round(cpu)}%`, mem: memText(mem), cpuPct, memPct, cpuRaw: cpu, memRaw: mem,
  cpuTip: `${name} · ${Math.round(cpu)}% CPU`, memTip: `${name} · ${memText(mem)} RAM${total ? ` of ${memText(total)}` : ''}` });
const mac = computed(() => { const m = u.value?.mac; return row('mac', 'This Mac', m?.cpu ?? 0, m?.used ?? 0, cpuPct.value, memPct.value, m?.total); });
const rows = computed(() => {
  const v = u.value;
  if (!v) return [];
  // the sessions with processes left, busiest CPU first (whole percents, so a hair of noise doesn't reorder), then RAM
  const sessions = Object.entries(v.sessions).filter(([, g]) => g.n)
    .sort(([, a], [, b]) => Math.round(b.cpu) - Math.round(a.cpu) || b.mem - a.mem).slice(0, TOP)
    .map(([id, g]) => { const s = store.sessions.find(o => o.id === id); return { id, name: s ? s.title || project(s) : id.slice(0, 8), g }; });
  const all = [{ id: 'lantern', name: 'Lantern', g: v.lantern }, ...sessions];
  const full = Math.max(100, ...all.map(r => r.g.cpu)), total = v.mac.total;
  return all.map(r => row(r.id, r.name, r.g.cpu, r.g.mem, r.g.cpu / full * 100, r.g.mem / total * 100, total));
});
</script>

<template>
  <template v-if="u">
    <button id="usageButton" popovertarget="usage" :class="u.mac.pressure" title="CPU and RAM" :style="{ '--hud': `${size}px` }"
      :aria-label="`CPU and RAM: this Mac ${Math.round(u.mac.cpu)}% CPU, ${memText(u.mac.used)} used`">
      <span v-for="m in meters" :key="m.kind" :class="['meter', m.kind]" :title="m.tip">
        <span class="top"><UsageRing :pct="m.pct" :kind="m.kind" /><span class="v">{{ m.text }}</span></span>
        <svg class="spark" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" aria-hidden="true"><polyline :points="line(m.kind)" /></svg>
      </span>
    </button>
    <div id="usage" class="flyup" popover :style="{ '--hud': `${size}px` }" aria-label="CPU and RAM">
      <UsagePopup :variant="popup" :mac="mac" :pressure="u.mac.pressure" :rows="rows" />
    </div>
  </template>
</template>
