<script setup lang="ts">
// The review requests: a button at the footer's bottom left with their count, shown only while there are any, opening a
// dropdown (a native popover, which closes on a click elsewhere or Escape) that lists each PR asking for my review: its
// repo#number as a link, its title, and what it needs, the way a PR chip's dot and words show it elsewhere. A title cut
// short shows in #prTip while its row is hovered or focused. The fireflies circling the lantern are these same PRs.
import { computed, watch } from 'vue';
import { NEED, cutShort, hidePrTip, showPrTip, worstFirst } from '../scene/card';
import { flyColour } from '../scene/fireflies';
import { useLanternStore } from '../stores/lantern';
import type { Review } from '../types';

const store = useLanternStore();
const rows = computed(() => worstFirst(store.reviews.filter(r => r.need !== 'merged' && r.need !== 'closed'))); // one leaving (merged, closed or reviewed) is no longer asking
// the dropdown's open state is the popover's own (toggle fires on any close: outside click, Escape, a link); it goes with the list
watch(() => rows.value.length, n => { if (!n) store.reviewsOpen = false; });
const tip = (e: Event, r: Review) => { const el = e.currentTarget; if (el instanceof HTMLElement && cutShort(el)) showPrTip(el, r.title); };
</script>

<template>
  <template v-if="rows.length">
    <button id="reviewsButton" popovertarget="reviews" :aria-label="`${rows.length} review request${rows.length > 1 ? 's' : ''}`" title="Reviews asked of you">
      <span class="face"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="4" cy="3.5" r="1.5"/><circle cx="4" cy="12.5" r="1.5"/><circle cx="12" cy="12.5" r="1.5"/><path d="M4 5v6M12 11V7.5a2 2 0 0 0-2-2H8.5M10 3.5l-1.5 2 1.5 2"/></svg><span class="n">{{ rows.length }}</span></span>
    </button>
    <div id="reviews" class="flyup" popover aria-label="Review requests" @toggle="store.reviewsOpen = $event.newState === 'open'">
      <a v-for="r in rows" :key="r.url" :href="r.url" target="_blank" rel="noopener" @pointerenter="tip($event, r)" @focus="tip($event, r)" @pointerleave="hidePrTip" @blur="hidePrTip">
        <span class="face"><span class="ti">{{ r.title ?? '' }}</span><span class="me"><i :style="{ background: flyColour(r.need) }"></i><b>{{ r.label }}</b>{{ NEED[r.need] || r.need }}</span></span>
      </a>
    </div>
  </template>
</template>
