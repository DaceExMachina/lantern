<script setup lang="ts">
// The usage dropdown's body, in four neutral layouts to choose between (?popup=a|b|c|d): the same rows (this Mac, Lantern, the
// busiest sessions) each time, with which column is CPU and which is RAM told by position and icon, never colour or words.
import { computed, ref } from 'vue';
import UsageIcon from './UsageIcon.vue';
import UsageRing from './UsageRing.vue';

export interface UsageRow { id: string; name: string; cpu: string; mem: string; cpuPct: number; memPct: number; cpuTip: string; memTip: string; cpuRaw: number; memRaw: number }
const props = defineProps<{ variant: string; mac: UsageRow; pressure: string; rows: UsageRow[] }>();
const by = ref<'cpu' | 'mem'>('cpu'); // variant c's sort
const sorted = computed(() => props.variant === 'c' ? [...props.rows].sort((a, b) => b[`${by.value}Raw`] - a[`${by.value}Raw`]) : props.rows);
const w = (n: number) => ({ width: `${Math.min(100, Math.max(0, n)).toFixed(1)}%` });
</script>

<template>
  <!-- a: two aligned columns, a thin bar and a number in each cell -->
  <div v-if="variant === 'a'" class="pa">
    <div class="r head"><span></span><UsageIcon kind="cpu" /><UsageIcon kind="mem" /></div>
    <div v-for="r in [mac, ...sorted]" :key="r.id" :class="['r', r.id === 'mac' && pressure]">
      <span class="n">{{ r.name }}</span>
      <span class="cell" :title="r.cpuTip"><b>{{ r.cpu }}</b><i><u :style="w(r.cpuPct)"></u></i></span>
      <span class="cell mem" :title="r.memTip"><b>{{ r.mem }}</b><i><u :style="w(r.memPct)"></u></i></span>
    </div>
  </div>
  <!-- b: each row's name, then a small ring and number for each metric -->
  <div v-else-if="variant === 'b'" class="pb">
    <div class="r head"><span></span><UsageIcon kind="cpu" /><UsageIcon kind="mem" /></div>
    <div v-for="r in [mac, ...sorted]" :key="r.id" :class="['r', r.id === 'mac' && pressure]">
      <span class="n">{{ r.name }}</span>
      <span class="cell" :title="r.cpuTip"><UsageRing :pct="r.cpuPct" /><b>{{ r.cpu }}</b></span>
      <span class="cell mem" :title="r.memTip"><UsageRing :pct="r.memPct" /><b>{{ r.mem }}</b></span>
    </div>
  </div>
  <!-- c: the Mac as two big rings, then sessions ranked by CPU or RAM (the icon buttons), one number line and one bar each -->
  <div v-else-if="variant === 'c'" class="pc">
    <div :class="['big', pressure]">
      <span :title="mac.cpuTip"><UsageRing :pct="mac.cpuPct" kind="cpu" /><b>{{ mac.cpu }}</b></span>
      <span class="mem" :title="mac.memTip"><UsageRing :pct="mac.memPct" kind="mem" /><b>{{ mac.mem }}</b></span>
    </div>
    <div class="sort"><button v-for="k in (['cpu', 'mem'] as const)" :key="k" :aria-pressed="by === k" :title="k === 'cpu' ? 'Busiest by CPU' : 'Biggest by RAM'" @click="by = k"><UsageIcon :kind="k" /></button></div>
    <div v-for="r in sorted" :key="r.id" class="item" :title="`${r.cpuTip}, ${r.memTip}`">
      <span class="n">{{ r.name }}</span><b>{{ `${r.cpu} · ${r.mem}` }}</b><i><u :style="w(by === 'cpu' ? r.cpuPct : r.memPct)"></u></i>
    </div>
  </div>
  <!-- d: a butterfly, CPU growing left of a centre line and RAM growing right, the name above each pair -->
  <div v-else class="pd">
    <div class="head"><UsageIcon kind="cpu" /><UsageIcon kind="mem" /></div>
    <div v-for="r in [mac, ...sorted]" :key="r.id" :class="['pair', r.id === 'mac' && pressure]">
      <span class="n">{{ r.name }}</span>
      <span class="l" :title="r.cpuTip"><b>{{ r.cpu }}</b><i><u :style="w(r.cpuPct)"></u></i></span>
      <span class="rt mem" :title="r.memTip"><i><u :style="w(r.memPct)"></u></i><b>{{ r.mem }}</b></span>
    </div>
  </div>
</template>
