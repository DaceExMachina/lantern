<script setup lang="ts">
// The hover card, inside #card: a session's (SessionRows), a stale PR's or a ghost moth's. The scene says what it's for
// (store.hovered, from src/scene/card.ts enterZone and hideCard), shows and hides #card, and places it every frame; this
// only fills it. Relative times count from store.now, which ticks every second. Once hidden, the card keeps showing what it
// last showed while it fades out; each time it opens it starts afresh (its agents closed, scrolled to the top).
import { computed, onUpdated, ref, shallowRef, watch } from 'vue';
import { NEED, dropTip } from '../scene/card';
import { flyColour } from '../scene/fireflies';
import { useLanternStore } from '../stores/lantern';
import type { Hovered, Session } from '../types';
import SessionRows from './SessionRows.vue';

const store = useLanternStore();
const shown = shallowRef<Hovered | null>(null), opened = ref(0);
watch(() => store.hovered, (h, was) => { if (h) shown.value = h; if (h && !was) opened.value++; }, { immediate: true });
// a session's card finds its session in the store, or while its moth leaves, the one the moth last had
const session = computed<Session | undefined>(() => { const h = shown.value; return h && 'key' in h ? store.sessions.find(o => o.id === h.key) ?? h.session : undefined; });
const days = (ms: number) => Math.round(ms / 864e5);
const where = (cwd: string | null | undefined) => String(cwd || '').split('/').filter(Boolean).pop() || '';
// a redraw that took away the link #prTip was showing for takes the tip too
onUpdated(dropTip);
</script>

<template>
  <template v-if="shown">
    <template v-if="'stale' in shown">
      <h3>{{ shown.stale.label }}<span class="chip idle"><span class="face">stale</span></span></h3>
      <div>{{ shown.stale.title || '' }}</div>
      <div class="dim">{{ `${NEED[shown.stale.need] || shown.stale.need} · untouched for ${Math.max(7, days(store.now - Date.parse(shown.stale.updatedAt)))} days` }}</div>
      <div v-if="shown.stale.owner" class="dim">{{ `Made by ${shown.stale.owner.title || 'an old session'}` }}</div>
    </template>
    <template v-else-if="'ghost' in shown">
      <h3>{{ shown.ghost.o.title || shown.ghost.o.id.slice(0, 8) }}<span class="chip idle"><span class="face">gone quiet</span></span></h3>
      <div class="dim">{{ `${where(shown.ghost.o.cwd) ? where(shown.ghost.o.cwd) + ' · ' : ''}last active ${days(store.now - shown.ghost.o.last) ? `${days(store.now - shown.ghost.o.last)} days ago` : 'today'}` }}</div>
      <div class="agents">{{ `PRs (${shown.ghost.prs.length})` }}</div>
      <div v-for="p in shown.ghost.prs" :key="p.url" class="pr"><i :style="{ background: flyColour(p.need) }"></i><a :href="p.url" target="_blank" rel="noopener">{{ p.label }}</a>{{ ` ${NEED[p.need] || p.need} · ` }}<span :title="p.title ?? ''">{{ p.title ?? '' }}</span></div>
    </template>
    <SessionRows v-else-if="session" :key="`${opened}:${session.id}`" :s="session" :now="store.now" />
  </template>
</template>
