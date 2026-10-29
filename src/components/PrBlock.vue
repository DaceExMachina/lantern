<script setup lang="ts">
// A session's PRs on the card, worst first, under a header that sums them up ("PRs · 1 ready · 2 in review · 8 drafts").
// Either chips coloured by state, each putting its title in the header while hovered, or two-line rows (title; dot, number,
// state, how long it's been open) capped at the worst few (cap, PR_CAP on the card) so the card still fits beside its moth, the rest as bare
// numbers. A title the card doesn't show in full (a number past the cap, a row cut short) shows in #prTip while hovered or
// focused. The toggle between chips and rows is the same button either way. One repo is named in the header after "PRs"; across
// several, a "PRs" heading with the total (and the toggle) sits over a section per repo, each headed by the repo and its own summary.
import { computed, ref } from 'vue';
import { NEED, cutShort, hidePrTip, prSummary, repoOf, short, showPrTip, worstFirst } from '../scene/card';
import { flyColour } from '../scene/fireflies';
import type { PR } from '../types';

const props = defineProps<{ prs: PR[]; listed: boolean; now: number; cap: number }>(); // how many to list: the card's PR_CAP, or all of them in the sidebar
defineEmits<{ toggle: [] }>();
const sorted = computed(() => worstFirst(props.prs));
const over = ref(''); // the url of the chip under the pointer, whose title the header shows
const named = computed(() => props.listed ? undefined : sorted.value.find(p => p.url === over.value));
const repos = computed(() => [...new Map(sorted.value.map(p => [repoOf(p.url).full, repoOf(p.url)])).values()]); // in worst-first order
const many = computed(() => repos.value.length > 1);
const shown = computed(() => props.listed ? sorted.value.slice(0, props.cap) : sorted.value); // the rows or chips drawn
const sections = computed(() => many.value ? repos.value.map(repo => ({ repo, prs: sorted.value.filter(p => repoOf(p.url).full === repo.full) }))
  : [{ repo: repos.value[0], prs: sorted.value }]);
const label = computed(() => props.listed ? 'Show PRs as chips' : 'List PRs with their titles');
// the handlers measure the element the event came to
const tip = (e: Event, p: PR, cut = false) => { const el = e.currentTarget; if (el instanceof HTMLElement && (!cut || cutShort(el))) showPrTip(el, p.title); };
</script>

<template>
  <div v-if="many" class="phead top"><span class="ph"><span class="sum"><b class="prs">PRs</b></span></span><button class="tog" :aria-expanded="listed" :aria-label="label" :title="label" @click="$emit('toggle')"><span class="n">{{ sorted.length }}</span><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg></button></div>
  <template v-for="sec in sections" :key="sec.repo?.full">
    <div class="phead"><span v-if="named && sec.prs.includes(named)" class="ph title">{{ named.title ?? '' }}</span><span v-else class="ph" :title="sec.repo?.full"><span class="sum"><b :class="{ prs: !many }">{{ many ? sec.repo?.name : 'PRs' }}</b>{{ ` · ${[many ? undefined : sec.repo?.name, prSummary(sec.prs)].filter(Boolean).join(' · ')}` }}</span></span><button v-if="!many" class="tog" :aria-expanded="listed" :aria-label="label" :title="label" @click="$emit('toggle')"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg></button></div>
    <div v-if="!listed" class="chips"><a v-for="p in sec.prs" :key="p.url" :href="p.url" target="_blank" rel="noopener" @pointerenter="over = p.url" @pointerleave="over = ''"><span class="face"><i :style="{ background: flyColour(p.need) }"></i>{{ p.label }}</span></a></div>
    <template v-else>
      <a v-for="p in sec.prs.filter(q => shown.includes(q))" :key="p.url" class="pr2" :href="p.url" target="_blank" rel="noopener" @pointerenter="tip($event, p, true)" @focus="tip($event, p, true)" @pointerleave="hidePrTip" @blur="hidePrTip"><span class="face"><span class="ti">{{ p.title ?? '' }}</span><span class="me"><i :style="{ background: flyColour(p.need) }"></i><b>{{ p.label }}</b>{{ NEED[p.need] || p.need }}<span v-if="p.createdAt" class="t">{{ short(now - Date.parse(p.createdAt)) }}</span></span></span></a>
    </template>
  </template>
  <div v-if="listed && sorted.length > cap" class="more">{{ `${sorted.length - cap} more: ` }}<a v-for="p in sorted.slice(cap)" :key="p.url" class="ov" :href="p.url" target="_blank" rel="noopener" @pointerenter="tip($event, p)" @focus="tip($event, p)" @pointerleave="hidePrTip" @blur="hidePrTip"><span class="face">{{ p.label }}</span></a></div>
</template>
