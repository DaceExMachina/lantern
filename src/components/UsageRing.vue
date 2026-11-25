<script setup lang="ts">
// A ring gauge for the usage readout: a quiet track and an arc filled to pct, with the metric's icon in the middle when it has room.
import UsageIcon from './UsageIcon.vue';

// `dense` is the first stretch of the arc (RAM: what's compressed, then what isn't), drawn at full strength over the rest, which is faded.
defineProps<{ pct: number; dense?: number | undefined; kind?: 'cpu' | 'mem' }>();
const dash = (p: number) => `${Math.min(100, Math.max(0, p)).toFixed(1)} 100`;
</script>

<template>
  <svg class="uring" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" pathLength="100" />
    <circle :class="['arc', { faint: dense }]" cx="12" cy="12" r="10" pathLength="100" :stroke-dasharray="dash(pct)" transform="rotate(-90 12 12)" />
    <circle v-if="dense" class="arc" cx="12" cy="12" r="10" pathLength="100" :stroke-dasharray="dash(dense)" transform="rotate(-90 12 12)" />
    <UsageIcon v-if="kind" :kind="kind" x="6" y="6" width="12" height="12" />
  </svg>
</template>
