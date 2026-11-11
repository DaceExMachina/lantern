<script setup lang="ts">
// The review requests: a button at the footer's bottom left with their count, shown only while there are any, opening a dropdown
// (a native popover, which closes on a click elsewhere or Escape) that lists each PR asking for my review: its repo#number, its
// title as a link, and what it needs, the way a PR chip's dot and words show it elsewhere. A title cut short shows in #prTip
// while its row is hovered or focused. The fireflies circling the lantern are these same PRs, so one already flying as a moth's
// firefly (offBoard) is left out, unless the review desk has something on it.
// The review desk (a Claude session, /review-desk: it audits the PRs asked of me and notes the mentions of me) leaves a record
// per PR. A request's row carries its record below it: who asked, where the audit stands and its findings by severity, a click
// opening the summary and findings in place. A record with no request in the list (a mention, or a request since handled)
// is a row of its own. The cross dismisses a record (by its PR's head, so a new audit shows again; the desk's file stays).
import { computed, ref, watch } from 'vue';
import { NEED, cutShort, hidePrTip, showPrTip, worstFirst } from '../scene/card';
import { flyColour, offBoard } from '../scene/fireflies';
import { useLanternStore } from '../stores/lantern';
import type { DeskRecord, Opt } from '../types';

// a row: a request (with its need, shown as a dot and words) or a record with no request in the list (with just a word for what it is)
interface Item { key: string; url: string; title: Opt<string>; label: string; word: string; need?: string; rec?: DeskRecord | undefined }
const SEVERITIES = ['blocker', 'major', 'minor', 'nit'];
const store = useLanternStore();
const deskUrl = (d: DeskRecord) => d.url ?? `https://github.com/${d.repo}/pull/${d.pr}`;
const name = (d: DeskRecord) => `${d.repo.split('/').pop()}#${d.pr}`;
const items = computed<Item[]>(() => {
  if (store.settings.reviews === false) return [];
  const recs = store.deskShown, byUrl = new Map(recs.map(d => [deskUrl(d), d]));
  const off = new Set(offBoard(store.reviews, store.sessions));
  // one leaving (merged, closed or reviewed) is no longer asking
  const asked = worstFirst(store.reviews.filter(r => (off.has(r) || byUrl.has(r.url)) && r.need !== 'merged' && r.need !== 'closed'));
  const listed = new Set(asked.map(r => r.url));
  return [...asked.map(r => ({ key: r.url, url: r.url, title: r.title, label: r.label, word: NEED[r.need] || r.need, need: r.need, rec: byUrl.get(r.url) })),
    ...recs.filter(d => !listed.has(deskUrl(d))).map(d => ({ key: d.id, url: deskUrl(d), title: d.title, label: name(d), word: kind(d), rec: d }))];
});
// the dropdown's open state is the popover's own (toggle fires on any close: outside click, Escape, a link); it goes with the list
watch(() => items.value.length, n => { if (!n) store.reviewsOpen = false; });
const tip = (e: Event, x: Item) => { const el = e.currentTarget; if (el instanceof HTMLElement && cutShort(el)) showPrTip(el, x.title ?? ''); };
const open = ref(new Set<string>());
const toggle = (id: string) => { open.value.has(id) ? open.value.delete(id) : open.value.add(id); open.value = new Set(open.value); };
const counts = (d: DeskRecord) => SEVERITIES.map(s => [s, d.findings?.filter(f => f.severity === s).length ?? 0] as const).filter(([, n]) => n);
// what the row says when its PR isn't an open request: a mention, or a review since handled
const kind = (d: DeskRecord) => d.kind === 'mention' ? 'mention' : 'handled';
const by = (d: DeskRecord) => `${d.kind === 'mention' ? 'mentioned' : 'asked'} by ${d.requestedBy ?? d.author ?? 'someone'}`;
</script>

<template>
  <template v-if="items.length">
    <button id="reviewsButton" popovertarget="reviews" :aria-label="`${items.length} review${items.length > 1 ? 's' : ''}`" title="Reviews asked of you, and mentions">
      <span class="face"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="4" cy="3.5" r="1.5"/><circle cx="4" cy="12.5" r="1.5"/><circle cx="12" cy="12.5" r="1.5"/><path d="M4 5v6M12 11V7.5a2 2 0 0 0-2-2H8.5M10 3.5l-1.5 2 1.5 2"/></svg><span class="n">{{ items.length }}</span></span>
    </button>
    <div id="reviews" class="flyup" popover aria-label="Review requests" @toggle="store.reviewsOpen = $event.newState === 'open'">
      <template v-for="x in items" :key="x.key">
        <a :href="x.url" target="_blank" rel="noopener" @pointerenter="tip($event, x)" @focus="tip($event, x)" @pointerleave="hidePrTip" @blur="hidePrTip">
          <span class="face"><span class="ti">{{ x.title ?? '' }}</span><span class="me"><i v-if="x.need" :style="{ background: flyColour(x.need) }"></i><b>{{ x.label }}</b>{{ x.word }}</span></span>
        </a>
        <div v-if="x.rec" :class="['desk', x.rec.status]">
          <button class="tg" :aria-expanded="open.has(x.rec.id)" @click="toggle(x.rec.id)">
            <svg class="car" viewBox="0 0 16 16" width="10" height="10" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5l4.5 4.5L6 12.5"/></svg>
            <span>{{ by(x.rec) }} · <template v-if="x.rec.status !== 'ready'"><b :class="x.rec.status">{{ x.rec.status }}</b></template><template v-else-if="x.rec.kind === 'mention'"><b>ready</b></template><template v-else-if="counts(x.rec).length"><template v-for="([s, n], i) in counts(x.rec)" :key="s"><template v-if="i">, </template><span :class="['sev', s]">{{ n }} {{ s }}</span></template></template><b v-else>no findings</b></span>
          </button>
          <button class="rm" :aria-label="`Dismiss the desk's notes on ${x.label}`" title="Dismiss" @click="store.dismissReview(x.rec.id)">
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>
          </button>
          <div v-if="open.has(x.rec.id)" class="more">
            <p v-if="x.rec.summary">{{ x.rec.summary }}</p>
            <p v-if="x.rec.fullPanel" class="big">Big PR: consider the full review panel.</p>
            <template v-if="x.rec.kind === 'mention'">
              <p v-if="x.rec.ask"><b>Asked:</b> {{ x.rec.ask }}</p>
              <p v-if="x.rec.draft" class="draft"><b>Draft reply:</b> {{ x.rec.draft }}</p>
            </template>
            <div v-for="(f, i) in x.rec.findings ?? []" :key="i" class="finding">
              <span :class="['sev', f.severity]">{{ f.severity }}</span> <span class="where">{{ f.file }}{{ f.line ? `:${f.line}` : '' }}</span>
              <span class="what">{{ f.title }}</span>
              <span v-if="f.detail" class="detail">{{ f.detail }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </template>
</template>
