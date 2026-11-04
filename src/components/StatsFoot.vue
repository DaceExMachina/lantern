<script setup lang="ts">
// The info line at the foot of a session's card (SessionRows): how old it is and when it was active (on the hover card, its
// work counted), then its processes' CPU and RAM. On an expanded card with a sample it's a button that opens the session's
// processes in place below it (StatsDetail); each time the card opens they start closed. On the hover card (a tooltip)
// and in the sidebar (plain) it's only the line.
import { ref } from 'vue';
import type { sessionUse } from '../scene/card';
import StatsDetail from './StatsDetail.vue';
import UsageLine from './UsageLine.vue';

const props = defineProps<{ id: string; text: string; use: ReturnType<typeof sessionUse>; compact?: boolean; plain?: boolean }>();
const open = ref(false);
const tog = () => !!props.use && !props.compact && !props.plain;
</script>

<template>
  <component :is="tog() ? 'button' : 'div'" v-if="text || use" :class="['foot', { counts: compact, stat: tog() }]" :aria-expanded="tog() ? open : undefined"
    :title="tog() ? (open ? 'Hide processes' : 'Show processes') : undefined" @click="tog() && (open = !open)"><span class="sl">{{ text }}<template v-if="text && use"> · </template><UsageLine v-if="use" :use /></span><svg v-if="tog()" class="chev" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg></component>
  <StatsDetail v-if="tog() && open && use" :id :use card />
</template>
