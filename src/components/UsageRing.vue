<script setup lang="ts">
// A ring gauge for the usage readout: a quiet track and an arc filled to pct, with the metric's icon in the middle when it has room.
import UsageIcon from './UsageIcon.vue';

defineProps<{ pct: number; kind?: 'cpu' | 'mem' }>();
</script>

<template>
  <svg class="uring" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" pathLength="100" />
    <circle class="arc" cx="12" cy="12" r="10" pathLength="100" :stroke-dasharray="`${Math.min(100, Math.max(0, pct)).toFixed(1)} 100`" transform="rotate(-90 12 12)" />
    <UsageIcon v-if="kind" :kind="kind" x="6" y="6" width="12" height="12" />
  </svg>
</template>
