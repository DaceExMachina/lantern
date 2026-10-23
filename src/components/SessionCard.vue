<script setup lang="ts">
// The hover card, inside #card: a session's (SessionRows, also for a stale PR whose session is known), an orphan stale PR's
// or a ghost moth's. Each is compact on hover and full once a click expands it. The scene says what it's for
// (store.hovered, from src/scene/card.ts enterZone and hideCard), shows and hides #card, and places it every frame; this
// only fills it. Relative times count from store.now, which ticks every second. Once hidden, the card keeps showing what it
// last showed while it fades out; each time it opens it starts afresh (its agents closed, scrolled to the top).
import { computed, onBeforeUpdate, onUpdated, ref, shallowRef, watch } from 'vue';
import { NEED, dropTip } from '../scene/card';
import { flyColour } from '../scene/fireflies';
import { ghosts } from '../scene/stale';
import { useLanternStore } from '../stores/lantern';
import type { Ghost, Hovered, Session } from '../types';
import SessionRows from './SessionRows.vue';

const store = useLanternStore();
const shown = shallowRef<Hovered | null>(null), opened = ref(0), full = ref(false);
// sync, so a card hidden and opened again before Vue next patches still starts afresh. A card is compact on hover and full
// once a click expands it (store.expanded); fading out, it stays as it was.
watch([() => store.hovered, () => store.expanded], ([h, x], [was]) => { if (h) { shown.value = h; full.value = x; } if (h && !was) opened.value++; }, { immediate: true, flush: 'sync' });
// a session's card finds its session in the store, or while its moth leaves, the one the moth last had; a stale PR's wisp
// shows its owner's card when Lantern knows that session (live: the session card; gone quiet: its ghost's card), and only
// a PR with no known session gets the PR-only card
const session = computed<Session | undefined>(() => {
  const h = shown.value;
  if (!h) return undefined;
  if ('key' in h) return store.sessions.find(o => o.id === h.key) ?? h.session;
  return 'stale' in h ? store.sessions.find(o => o.id === h.stale.owner?.id) : undefined;
});
const ghost = computed<Ghost | undefined>(() => {
  const h = shown.value;
  return h && 'ghost' in h ? h.ghost : h && 'stale' in h && !session.value ? ghosts.get(h.stale.owner?.id ?? '') : undefined;
});
const days = (ms: number) => Math.round(ms / 864e5);
const stillFor = (p: { updatedAt: string }) => Math.max(7, days(store.now - Date.parse(p.updatedAt)));
const where = (cwd: string | null | undefined) => String(cwd || '').split('/').filter(Boolean).pop() || '';
// A re-render that moves an element (a PR that re-ranks) drops its focus in WebKit, so the focused element gets it back.
// And one that took away the link #prTip was showing for takes the tip too.
let focused: Element | null = null;
onBeforeUpdate(() => { focused = document.activeElement; });
onUpdated(() => {
  if (focused !== document.activeElement && focused instanceof HTMLElement && focused.isConnected) focused.focus({ preventScroll: true });
  dropTip();
});
</script>

<template>
  <template v-if="shown">
    <SessionRows v-if="session" :key="`${opened}:${session.id}`" :s="session" :now="store.now" :compact="!full" />
    <template v-else-if="!ghost && 'stale' in shown">
      <h3><span class="title"><span class="face">{{ shown.stale.label }}</span></span><span class="chip idle"><span class="face">stale</span></span></h3>
      <div :class="{ gist: !full }">{{ shown.stale.title || '' }}</div>
      <div :class="full ? 'dim' : 'foot counts'">{{ `${NEED[shown.stale.need] || shown.stale.need} · untouched for ${stillFor(shown.stale)} days` }}</div>
      <div v-if="full && shown.stale.owner" class="dim">{{ `Made by ${shown.stale.owner.title || 'an old session'}` }}</div>
      <div v-if="!full" class="hint">Click wisp for details, double click to open PR</div>
    </template>
    <template v-else-if="ghost">
      <h3><span class="title"><span class="face">{{ ghost.o.title || ghost.o.id.slice(0, 8) }}</span></span><span class="chip idle"><span class="face">gone quiet</span></span></h3>
      <div :class="full ? 'dim' : 'gist'">{{ `${where(ghost.o.cwd) ? where(ghost.o.cwd) + ' · ' : ''}last active ${days(store.now - ghost.o.last) ? `${days(store.now - ghost.o.last)} days ago` : 'today'}` }}</div>
      <template v-if="full">
        <div class="agents">{{ `PRs (${ghost.prs.length})` }}</div>
        <div v-for="p in ghost.prs" :key="p.url" class="pr"><i :style="{ background: flyColour(p.need) }"></i><a :href="p.url" target="_blank" rel="noopener">{{ p.label }}</a>{{ ` ${NEED[p.need] || p.need} · ` }}<span :title="p.title ?? ''">{{ p.title ?? '' }}</span></div>
      </template>
      <template v-else>
        <div class="foot counts">{{ `${ghost.prs.length} stale PR${ghost.prs.length > 1 ? 's' : ''}` }}</div>
        <div class="hint">Click moth for details, double click to resume session</div>
      </template>
    </template>
  </template>
</template>
