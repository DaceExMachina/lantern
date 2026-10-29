<script setup lang="ts">
// A session's PRs, worst first, under a header that sums them up ("PRs · 1 ready · 2 in review · 8 drafts"). Chips coloured by
// state, or (sidebar only, where `listed` says which; the card passes none and has no toggle) two-line rows: title; dot,
// number, state, how long it's been open. A title shows in #prTip while its chip is hovered or focused, and for a row only when
// the row cuts it short. One repo is named in the header after "PRs"; across several, a "PRs" heading with the total (and the
// toggle) sits over a section per repo, each headed by the repo and its own summary.
import { computed } from 'vue';
import { NEED, cutShort, hidePrTip, prSummary, repoOf, short, showPrTip, worstFirst } from '../scene/card';
import { flyColour } from '../scene/fireflies';
import type { PR } from '../types';

const props = defineProps<{ prs: PR[]; listed?: boolean | undefined; now: number }>();
defineEmits<{ toggle: [] }>();
const sorted = computed(() => worstFirst(props.prs));
const repos = computed(() => [...new Map(sorted.value.map(p => [repoOf(p.url).full, repoOf(p.url)])).values()]); // in worst-first order
const many = computed(() => repos.value.length > 1);
const sections = computed(() => many.value ? repos.value.map(repo => ({ repo, prs: sorted.value.filter(p => repoOf(p.url).full === repo.full) }))
  : [{ repo: repos.value[0], prs: sorted.value }]);
const label = computed(() => props.listed ? 'Show PRs as chips' : 'List PRs with their titles');
// the handlers measure the element the event came to
const tip = (e: Event, p: PR, cut = false) => { const el = e.currentTarget; if (el instanceof HTMLElement && (!cut || cutShort(el))) showPrTip(el, p.title); };
</script>

<template>
  <div v-if="many" class="phead top"><span class="ph"><span class="sum"><b class="prs">PRs</b></span></span><button v-if="listed !== undefined" class="tog" :aria-expanded="listed" :aria-label="label" :title="label" @click="$emit('toggle')"><span class="n">{{ sorted.length }}</span><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg></button><span v-else class="n">{{ sorted.length }}</span></div>
  <template v-for="sec in sections" :key="sec.repo?.full">
    <div class="phead"><span class="ph" :title="sec.repo?.full"><span class="sum"><b :class="{ prs: !many }">{{ many ? sec.repo?.name : 'PRs' }}</b>{{ ` · ${[many ? undefined : sec.repo?.name, prSummary(sec.prs)].filter(Boolean).join(' · ')}` }}</span></span><button v-if="!many && listed !== undefined" class="tog" :aria-expanded="listed" :aria-label="label" :title="label" @click="$emit('toggle')"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg></button></div>
    <div v-if="!listed" class="chips"><a v-for="p in sec.prs" :key="p.url" :href="p.url" target="_blank" rel="noopener" @pointerenter="tip($event, p)" @focus="tip($event, p)" @pointerleave="hidePrTip" @blur="hidePrTip"><span class="face"><i :style="{ background: flyColour(p.need) }"></i>{{ p.label }}</span></a></div>
    <template v-else>
      <a v-for="p in sec.prs" :key="p.url" class="pr2" :href="p.url" target="_blank" rel="noopener" @pointerenter="tip($event, p, true)" @focus="tip($event, p, true)" @pointerleave="hidePrTip" @blur="hidePrTip"><span class="face"><span class="ti">{{ p.title ?? '' }}</span><span class="me"><i :style="{ background: flyColour(p.need) }"></i><b>{{ p.label }}</b>{{ NEED[p.need] || p.need }}<span v-if="p.createdAt" class="t">{{ short(now - Date.parse(p.createdAt)) }}</span></span></span></a>
    </template>
  </template>
</template>
