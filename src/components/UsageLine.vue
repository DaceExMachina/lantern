<script setup lang="ts">
// A session's CPU and RAM as quiet inline text for the end of a card's dim info line: "[chip] 1% · [RAM] 1.2 GB" (src/scene/card.ts sessionUse).
// A number that runs hot (heat.ts) takes a warning colour, with the icon beside it, and says why in its tooltip.
import UsageIcon from './UsageIcon.vue';

defineProps<{ use: { cpu: string; mem: string; cpuHot: number; memHot: number; cpuTip: string; memTip: string } }>();
</script>

<template>
  <span class="use"><span :class="`hot${use.cpuHot}`" :title="use.cpuTip || `${use.cpu} of all cores`"><UsageIcon kind="cpu" />{{ use.cpu }}</span> · <span :class="`hot${use.memHot}`" :title="use.memTip || `${use.mem} RAM`"><UsageIcon kind="mem" />{{ use.mem }}</span></span>
</template>
