<script setup lang="ts">
// A session's CPU and RAM as quiet inline text for the end of a card's dim info line: "[chip] 1% · [RAM] 1.2 GB" (src/scene/card.ts sessionUse).
import UsageIcon from './UsageIcon.vue';

defineProps<{ use: { cpu: string; mem: string } }>();
</script>

<template>
  <span class="use" :title="`CPU ${use.cpu} of the Mac, ${use.mem} RAM`"><UsageIcon kind="cpu" />{{ use.cpu }} · <UsageIcon kind="mem" />{{ use.mem }}</span>
</template>
