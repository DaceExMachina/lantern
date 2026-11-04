<script setup lang="ts">
// The info line at the foot of a session's card (SessionRows): how old it is and when it was active (on the hover card, its
// work counted), then its processes' CPU and RAM. With a sample it's a button that opens the stats detail in place
// (card.ts toggleDetail): the session's processes by name, each with how many, its CPU and RAM, then buttons to open the
// card in full (on a compact card) and to go to the session. In the sidebar (plain) it's only the line.
import { computed } from 'vue';
import { openSession, pinSession, sessionUse, toggleDetail } from '../scene/card';
import UsageLine from './UsageLine.vue';

const props = defineProps<{ id: string; text: string; use: ReturnType<typeof sessionUse>; open: boolean; compact?: boolean; plain?: boolean }>();
const tog = computed(() => !!props.use && !props.plain);
</script>

<template>
  <component :is="tog ? 'button' : 'div'" v-if="text || use" :class="['foot', { counts: compact, stat: tog }]" :aria-expanded="tog ? open : undefined"
    :title="tog ? (open ? 'Hide processes' : 'Show processes') : undefined" @click="tog && toggleDetail()"><span class="sl">{{ text }}<template v-if="text && use"> · </template><UsageLine v-if="use" :use /></span><svg v-if="tog" class="chev" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg></component>
  <template v-if="tog && open && use">
    <div class="head">Processes<span class="r">{{ use.n }}</span></div>
    <div class="procs"><div v-for="p in use.procs" :key="p.name" class="proc"><span class="pn" :title="p.name">{{ p.name }}</span><span class="x">{{ p.n > 1 ? `×${p.n}` : '' }}</span><span :class="`hot${p.cpuHot}`" :title="p.cpuTip || `CPU ${p.cpu} of the Mac`">{{ p.cpu }}</span><span :class="`hot${p.memHot}`" :title="p.memTip || `${p.mem} RAM`">{{ p.mem }}</span></div></div>
    <div class="acts"><button v-if="compact" class="more" @click="pinSession(id)"><span class="face">Open card</span></button><button class="more" @click="openSession(id, false)"><span class="face">Go to session</span></button></div>
  </template>
</template>
