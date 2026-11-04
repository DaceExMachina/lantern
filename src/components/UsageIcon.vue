<script setup lang="ts">
// The little CPU chip and memory stick that stand in for the words "CPU" and "memory" in the usage readout (same 16px stroke style as the other icons).
defineProps<{ kind: 'cpu' | 'mem' }>();
</script>

<template>
  <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">
    <path v-if="kind === 'cpu'" d="M5 4.5h6a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5ZM6.5 2v2.5M9.5 2v2.5M6.5 11.5V14M9.5 11.5V14M2 6.5h2.5M2 9.5h2.5M11.5 6.5H14M11.5 9.5H14"/>
    <path v-else d="M2 4.5h12a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-.5.5H9V9.5H7v1H2a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5ZM3.5 10.5V13M5.5 10.5V13M10.5 10.5V13M12.5 10.5V13"/>
  </svg>
</template>
