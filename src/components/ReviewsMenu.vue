<script setup lang="ts">
// The review requests: a button at the footer's bottom left with their count, shown only while there are any, opening a
// dropdown (those not already flying as a moth's firefly, offBoard; a native popover, which closes on a click elsewhere or Escape) that lists each PR asking for my review, or assigned to me by someone else (marked): its
// repo#number as a link, its title, its author, and what it needs, the way a PR chip's dot and words show it elsewhere. A title cut
// short shows in #prTip while its row is hovered or focused. The fireflies circling the lantern are these same PRs. Each row's priority button (an icon: double caret up for highest, caret up for high, nothing for normal, the default, caret down for low; normal shows only while the row is hovered or focused) opens a small floating picker of the four, a column from highest down to low, with the current choice over the button and the rest above and below, like a pop-up menu (fixed to the window so the list's scrolling can't clip it, and nudged to stay inside it): one click sets it and closes it (Up and Down move between the four; Escape, a click elsewhere in the list, or scrolling it closes the picker unchanged, and focus returns to the button). The list sorts by priority, highest (0) first, and re-sorts only once one is chosen; the server keeps it in settings.
import { computed, nextTick, ref, watch } from 'vue';
import { NEED, cutShort, hidePrTip, showPrTip, worstFirst } from '../scene/card';
import { flyColour, offBoard } from '../scene/fireflies';
import { useLanternStore } from '../stores/lantern';
import type { Review } from '../types';

const store = useLanternStore();
// priority first (0 is highest, like a P0 bug; the sort is stable), then worst first
const rows = computed(() => store.settings.reviews === false ? [] : worstFirst(offBoard(store.reviews, store.sessions, store.settings.stale === false ? [] : store.stale).filter(r => r.need !== 'merged' && r.need !== 'closed')).sort((a, b) => store.reviewPriority(a.url) - store.reviewPriority(b.url))); // one leaving (merged, closed or reviewed) is no longer asking
// the dropdown's open state is the popover's own (toggle fires on any close: outside click, Escape, a link); it goes with the list
watch(() => rows.value.length, n => { if (!n) store.reviewsOpen = false; });
// the four priorities, highest first: what each is called and its caret's path (normal is a dash, quiet on the row)
const LEVELS = [[0, 'Highest', 'M4.5 7.5 8 4l3.5 3.5M4.5 12 8 8.5l3.5 3.5'], [1, 'High', 'M4.5 9.5 8 6l3.5 3.5'], [2, 'Normal', 'M5 8h6'], [3, 'Low', 'M4.5 6.5 8 10l3.5-3.5']] as const;
const level = (n: number) => LEVELS.find(l => l[0] === n) ?? LEVELS[2];
const picking = ref<string | null>(null); // the row whose picker is open
const rowOf = (url: string) => [...document.querySelectorAll<HTMLElement>('#reviews .row')].find(el => el.dataset.url === url);
const at = ref({ top: 0, right: 0 }); // where the open picker sits, in window coordinates
const open = (url: string) => {
  const r = rowOf(url)?.querySelector('.pri .face')?.getBoundingClientRect(); // the button: the picker opens over it
  if (r) at.value = { top: r.top, right: innerWidth - r.right };
  picking.value = url;
  void nextTick(() => {
    const pick = rowOf(url)?.querySelector<HTMLElement>('.pick'), now = pick?.querySelector<HTMLElement>('[aria-pressed=true]');
    if (r && pick && now) { // like a macOS pop-up menu: the current choice sits over the button, the rest above and below; kept inside the window
      const mid = (b: DOMRect) => b.top + b.height / 2, top = at.value.top + mid(r) - mid(now.getBoundingClientRect());
      at.value.top = Math.max(4, Math.min(top, innerHeight - 4 - pick.offsetHeight));
    }
    now?.focus();
  });
};
// Up and Down move between the four (wrapping)
const step = (e: KeyboardEvent, d: number) => { if (!(e.currentTarget instanceof HTMLElement)) return; const bs = [...e.currentTarget.querySelectorAll('button')]; bs.at((bs.findIndex(b => b === document.activeElement) + d) % bs.length)?.focus(); };
const close = () => { const url = picking.value; picking.value = null; void nextTick(() => rowOf(url ?? '')?.querySelector<HTMLElement>('.pri')?.focus()); };
const pick = (url: string, n: number) => { store.setReviewPriority(url, n); close(); };
// a click on anything but the open picker closes it (the .pri button toggles it itself)
const away = (e: MouseEvent) => { if (picking.value && e.target instanceof Element && !e.target.closest('.pick, .pri')) picking.value = null; };
const tip = (e: Event, r: Review) => { const el = e.currentTarget; if (el instanceof HTMLElement && cutShort(el)) showPrTip(el, r.title); };
</script>

<template>
  <template v-if="rows.length">
    <button id="reviewsButton" popovertarget="reviews" :aria-label="`${rows.length} review request${rows.length > 1 ? 's' : ''}`" title="Reviews asked of you">
      <span class="face"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="4" cy="3.5" r="1.5"/><circle cx="4" cy="12.5" r="1.5"/><circle cx="12" cy="12.5" r="1.5"/><path d="M4 5v6M12 11V7.5a2 2 0 0 0-2-2H8.5M10 3.5l-1.5 2 1.5 2"/></svg><span class="n">{{ rows.length }}</span></span>
    </button>
    <div id="reviews" class="flyup" popover aria-label="Review requests" @click="away" @scroll="picking = null" @toggle="picking = null; store.reviewsOpen = $event.newState === 'open'">
      <div v-for="r in rows" :key="r.url" class="row" :data-url="r.url">
        <a :href="r.url" target="_blank" rel="noopener" @pointerenter="tip($event, r)" @focus="tip($event, r)" @pointerleave="hidePrTip" @blur="hidePrTip">
          <span class="face"><span class="ti">{{ r.title ?? '' }}</span><span class="me"><i :style="{ background: flyColour(r.need) }"></i><b>{{ r.label }}</b><span v-if="r.author" class="by">{{ r.author }}</span><span v-if="r.assigned" class="asg">assigned</span>{{ NEED[r.need] || r.need }}</span></span>
        </a>
        <div v-if="picking === r.url" class="pick" role="group" aria-label="Priority" :style="{ top: `${at.top}px`, right: `${at.right}px` }" @keydown.esc.stop.prevent="close" @keydown.up.prevent="step($event, -1)" @keydown.down.prevent="step($event, 1)">
          <button v-for="[n, name, d] in LEVELS" :key="n" :aria-pressed="n === store.reviewPriority(r.url)" :aria-label="name" :title="name" @click="pick(r.url, n)">
            <span class="face"><svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><path :d="d"/></svg></span>
          </button>
        </div>
        <button class="pri" :class="{ set: store.reviewPriority(r.url) !== 2 }" :aria-label="`Priority ${level(store.reviewPriority(r.url))[1]}, change`" title="Priority. Click to change" @click="open(r.url)">
          <span class="face"><svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><path :d="level(store.reviewPriority(r.url))[2]"/></svg></span>
        </button>
      </div>
    </div>
  </template>
</template>
