<script setup lang="ts">
// The review requests: a button at the footer's bottom left with their count, shown only while there are any, opening a
// dropdown (those not already flying as a moth's firefly, offBoard; a native popover, which closes on a click elsewhere or Escape) that lists each PR asking for my review, or assigned to me by someone else (marked): its
// repo#number as a link, its title, its author, and what it needs, the way a PR chip's dot and words show it elsewhere. A title cut
// short shows in #prTip while its row is hovered or focused. The fireflies circling the lantern are these same PRs. Each row's priority button (an icon: double caret up for highest, caret up for high, nothing for normal, the default, caret down for low; normal shows only while the row is hovered or focused) opens a small floating picker of the four, a column from highest down to low, with the current choice over the button and the rest above and below, like a pop-up menu (fixed to the window so the list's scrolling can't clip it, and nudged to stay inside it): one click sets it and closes it (Up and Down move between the four; Escape, a click elsewhere in the list, or scrolling it closes the picker unchanged, and focus returns to the button). The list sorts by priority, highest (0) first, and re-sorts only once one is chosen; the server keeps it in settings.
// The review desk (a Claude session, /review-desk) leaves a record per PR: an audit of a request, a mention of me, or a follow-up (someone posted
// on a PR I reviewed or commented on). A request with a record says where the audit stands at the end of its row (a pulsing "Queued" or "Reviewing…" pill while the desk is still at it, which also tints the row and dashes its outline so it reads as not ready yet, unlike a merged or closed row's grey; failed; or the
// findings counted by severity), stays listed even while its PR flies as a firefly, and its click opens the record's detail panel
// (ReviewDetail.vue) in place of GitHub. A record with no request in the list is a row of its own: a mention, a follow-up (a speech bubble
// with how many posts), or a review since handled. A PR the desk has marked merged or closed leaves the list altogether. A dot before the title marks news since I last opened the record.
import { computed, nextTick, ref, watch } from 'vue';
import { NEED, cutShort, hidePrTip, showPrTip, worstFirst } from '../scene/card';
import { flyColour, offBoard } from '../scene/fireflies';
import { useLanternStore } from '../stores/lantern';
import { SEVERITIES } from '../types';
import type { DeskRecord, Opt } from '../types';

// a row: a request (with its need) or a desk record with no request in the list
interface Row { url: string; label: string; title: Opt<string>; author?: Opt<string>; assigned?: Opt<boolean>; need?: string; rec?: DeskRecord | undefined }
const store = useLanternStore();
// priority first (0 is highest, like a P0 bug; the sort is stable), then the requests worst first, then the records of their own
const rows = computed((): Row[] => {
  if (store.settings.reviews === false) return [];
  const recs = new Map(store.deskShown.map(d => [d.url, d]));
  const ended = new Set(store.desk.records.filter(d => d.closed).map(d => d.url)); // the desk says its PR merged or closed: it's gone from the list, notes and all
  const asking = store.reviews.filter(r => r.need !== 'merged' && r.need !== 'closed' && !ended.has(r.url)); // one leaving (merged, closed or reviewed) is no longer asking
  const off = new Set(offBoard(asking, store.sessions, store.settings.stale === false ? [] : store.stale));
  const asked: Row[] = worstFirst(asking.filter(r => off.has(r) || recs.has(r.url))).map(r => ({ ...r, rec: recs.get(r.url) }));
  const listed = new Set(asked.map(r => r.url));
  // an audit whose request has gone (reviewed, merged) stays only while it has something unread (the desk keeps every record it wrote), or while its
  // detail is open: opening it marks it read, and its row is the panel's invoker, so it can't go until the panel closes
  const own = store.deskShown.filter(d => !listed.has(d.url) && (d.kind !== 'review' || store.unread(d) || d.url === store.review)).map((d): Row => ({ url: d.url, label: `${d.repo.split('/').pop()}#${d.pr}`, title: d.title, author: d.author, rec: d }));
  return [...asked, ...own].sort((a, b) => store.reviewPriority(a.url) - store.reviewPriority(b.url));
});
// where the desk stands, at the end of the row: its findings by severity once ready, or its status
const counts = (d: DeskRecord) => [...SEVERITIES, 'other'].map(s => [s, d.findings.filter(f => f.severity === s || s === 'other' && !SEVERITIES.includes(f.severity)).length] as const).filter(([, n]) => n);
// the desk hasn't finished an audit (queued or auditing) and its PR is still open: the row says so, loudly, and nothing in it is ready for me yet
const working = (d?: DeskRecord) => !!d && (d.status === 'queued' || d.status === 'auditing');
const word = (x: Row) => x.need ? NEED[x.need] || x.need : x.rec?.kind === 'mention' ? 'mention' : '';
// the dropdown's open state is the popover's own (toggle fires on any close: outside click, Escape, a link); it goes with the list
watch(() => rows.value.length && !store.narrow, shown => { if (!shown) store.reviewsOpen = false; });
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
const tip = (e: Event, x: Row) => { const el = e.currentTarget; if (el instanceof HTMLElement && cutShort(el)) showPrTip(el, x.title ?? ''); };
</script>

<template>
  <template v-if="rows.length && !store.narrow">
    <button id="reviewsButton" popovertarget="reviews" :aria-label="`${rows.length} review${rows.length > 1 ? 's' : ''}`" title="Reviews asked of you, and the review desk's notes">
      <span class="face"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="4" cy="3.5" r="1.5"/><circle cx="4" cy="12.5" r="1.5"/><circle cx="12" cy="12.5" r="1.5"/><path d="M4 5v6M12 11V7.5a2 2 0 0 0-2-2H8.5M10 3.5l-1.5 2 1.5 2"/></svg><span class="n">{{ rows.length }}</span></span>
    </button>
    <div id="reviews" class="flyup" popover aria-label="Review requests" @click="away" @scroll="picking = null" @toggle="picking = null; store.reviewsOpen = $event.newState === 'open'">
      <div v-for="r in rows" :key="r.url" :class="['row', { working: working(r.rec) }]" :data-url="r.url">
        <!-- a row with a desk record opens its detail panel over the list; one without goes to GitHub -->
        <component :is="r.rec ? 'button' : 'a'" class="go" v-bind="r.rec ? { popovertarget: 'review', popovertargetaction: 'show' } : { href: r.url, target: '_blank', rel: 'noopener' }"
          @click="r.rec && store.openReview(r.rec)" @pointerenter="tip($event, r)" @focus="tip($event, r)" @pointerleave="hidePrTip" @blur="hidePrTip">
          <i v-if="r.rec && store.unread(r.rec)" class="new" role="img" aria-label="New since you last looked"></i>
          <span class="face">
            <span class="top">
              <span class="ti">{{ r.title ?? '' }}</span>
              <!-- where the audit stands: its status, or once ready its findings counted by severity -->
              <span v-if="r.rec && r.rec.kind === 'review'" class="desk">
                <span v-if="working(r.rec)" class="working"><i></i>{{ r.rec.status === 'queued' ? 'Queued' : 'Reviewing…' }}</span>
                <span v-else-if="r.rec.status !== 'ready'" :class="r.rec.status">{{ r.rec.status }}</span>
                <template v-else-if="r.rec.findings.length"><span v-for="[s, n] in counts(r.rec)" :key="s" :class="['sev', s]" :title="`${n} ${s}${n > 1 ? 's' : ''}`"><i></i>{{ n }}<span class="sr">{{ ` ${s}` }}</span></span></template>
                <span v-else class="clean">clean</span>
              </span>
            </span>
            <span class="me">
              <i v-if="r.need" :style="{ background: flyColour(r.need) }"></i><b>{{ r.label }}</b>
              <span v-if="r.rec?.kind === 'followup'" class="bubble" :title="`Follow-up: ${r.rec.activity.length ?? 0} post${r.rec.activity.length === 1 ? '' : 's'} on a PR you joined`"><svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7A1.5 1.5 0 0 1 13 4.5v5a1.5 1.5 0 0 1-1.5 1.5H7l-3 2.5V11h.5A1.5 1.5 0 0 1 3 9.5z"/></svg><span class="sr">Follow-up, </span>{{ r.rec.activity.length || '' }}</span>
              <span v-if="r.author" class="by">{{ r.author }}</span><span v-if="r.assigned" class="asg">assigned</span>{{ word(r) }}</span>
          </span>
        </component>
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
