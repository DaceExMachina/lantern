<script setup lang="ts">
// One compact row on a session's cards (hover, pinned and the sidebar): its swatch in the colour it has in the usage dropdown, then its
// processes' CPU and RAM, each with a thin bar on the dropdown's scales (CPU of the whole Mac, RAM of the Mac's total). From the usage
// event, so it updates with each sample, and it's not there with the setting off or when the session has no processes.
import { computed } from 'vue';
import { cores, memText } from '../scene/card';
import { tintFor } from '../scene/lanterns';
import { useLanternStore } from '../stores/lantern';
import UsageIcon from './UsageIcon.vue';

const props = defineProps<{ id: string }>();
const store = useLanternStore();
const use = computed(() => {
  const u = store.usage, g = u?.sessions[props.id];
  if (!u || !g || !g.n) return null;
  const cpu = g.cpu / cores(), mem = g.mem / u.mac.total * 100;
  return { colour: tintFor(store.sessions.find(o => o.id === props.id) ?? { id: props.id }), cpu: `${Math.round(cpu)}%`, mem: memText(g.mem), cpuW: `${Math.min(100, cpu).toFixed(2)}%`, memW: `${Math.min(100, mem).toFixed(2)}%` };
});
</script>

<template>
  <div v-if="use" class="foot use" :title="`CPU ${use.cpu} of the Mac, ${use.mem} RAM`">
    <i class="sw" :style="{ background: use.colour }"></i>
    <span class="cpu"><span class="v"><UsageIcon kind="cpu" />{{ use.cpu }}</span><b class="track"><i :style="{ width: use.cpuW, background: use.colour }"></i></b></span>
    <span class="mem"><span class="v"><UsageIcon kind="mem" />{{ use.mem }}</span><b class="track"><i :style="{ width: use.memW, background: use.colour }"></i></b></span>
  </div>
</template>
