<script setup lang="ts">
// CPU and memory, a small readout in the scene's top left (below the app window's drag strip, which takes every click on it):
// this Mac's CPU and memory, and Lantern's own. Clicking it opens a dropdown (a native popover, like the reviews menu) with the
// Mac's numbers in full, Lantern's processes and the busiest sessions. The numbers come from the usage event every few seconds
// (app/Usage.swift) and are gone with settings.systemStats off. Not in the iTerm panel or the screensavers, which have no room.
import { computed } from 'vue';
import { memText, project, usageText } from '../scene/card';
import { useLanternStore } from '../stores/lantern';

const TOP = 8;
const store = useLanternStore();
const roomy = !document.body.matches('.panel, .screensaver, .ambient'); // fixed by the time the chrome mounts
const u = computed(() => roomy && store.settings.systemStats !== false ? store.usage : null);
// the sessions with processes left, busiest CPU first (whole percents, so a hair of noise doesn't reorder), then memory
const top = computed(() => Object.entries(u.value?.sessions ?? {}).filter(([, g]) => g.n)
  .sort(([, a], [, b]) => Math.round(b.cpu) - Math.round(a.cpu) || b.mem - a.mem).slice(0, TOP)
  .map(([id, g]) => { const s = store.sessions.find(o => o.id === id); return { id, name: s ? s.title || project(s) : id.slice(0, 8), text: usageText(g) }; }));
</script>

<template>
  <template v-if="u">
    <button id="usageButton" popovertarget="usage" :class="u.mac.pressure" title="CPU and memory"
      :aria-label="`CPU and memory: this Mac ${Math.round(u.mac.cpu)}% CPU, ${memText(u.mac.used)} used`">
      <span class="face">{{ `Mac ${Math.round(u.mac.cpu)}% · ${memText(u.mac.used)}` }}<span class="lan">{{ ` · Lantern ${memText(u.lantern.mem)}` }}</span></span>
    </button>
    <div id="usage" class="flyup" popover aria-label="CPU and memory">
      <h4>This Mac</h4>
      <div :class="['row', u.mac.pressure]"><span>{{ `${Math.round(u.mac.cpu)}% CPU` }}</span><span :title="`Memory pressure: ${u.mac.pressure}`">{{ `${memText(u.mac.used)} of ${memText(u.mac.total)}` }}</span></div>
      <h4>Lantern</h4>
      <div class="row"><span>{{ `${u.lantern.n} process${u.lantern.n === 1 ? '' : 'es'}` }}</span><span>{{ usageText(u.lantern) }}</span></div>
      <template v-if="top.length">
        <h4>Busiest sessions</h4>
        <div v-for="t in top" :key="t.id" class="row"><span>{{ t.name }}</span><span>{{ t.text }}</span></div>
      </template>
    </div>
  </template>
</template>
