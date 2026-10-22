<script setup lang="ts">
// The pinned sidebar, inside #dock's scroller: sessions pinned from their cards show in full (SessionRows), stacked in the
// order they were pinned (the newest at the bottom, so nothing jumps), in one column docked right of the scene, which
// narrows to make room (fitView follows the scene's size). A pinned session that ends stays in its place, dimmed, as this
// window last saw it (store.docked), until it's unpinned; a window that never saw it leaves it out. No pinning where there's
// no room (store.pinnable). Each section keeps its elements through a re-render, since WebKit drops a click whose pressed
// button is replaced.
import { computed, onBeforeUpdate, onUpdated, shallowRef, watch } from 'vue';
import { dropTip } from '../scene/card';
import { $ } from '../scene/scene';
import { useLanternStore } from '../stores/lantern';
import type { Session } from '../types';
import SessionRows from './SessionRows.vue';

const store = useLanternStore();
const rows = computed(() => store.pinnable ? [...store.docked].map(([id, s]) => ({ s, ended: !store.sessions.some(o => o.id === id) })) : []);
const open = computed(() => rows.value.length > 0);
// when nothing can be shown the column keeps what it showed, so it slides out whole
const kept = shallowRef<{ s: Session; ended: boolean }[]>([]);
watch(rows, r => { if (r.length) kept.value = r; }, { immediate: true, flush: 'sync' });
// the column is open while it has something to show; closed, it's out of the tab order and the accessibility tree
watch(open, o => { document.body.classList.toggle('pinned', o); $('dock').inert = !o; }, { immediate: true, flush: 'sync' });
// A re-render that moves an element drops its focus in WebKit, so the focused element gets it back; and one that took away
// the link #prTip was showing for takes the tip too.
let focused: Element | null = null;
onBeforeUpdate(() => { focused = document.activeElement; });
onUpdated(() => {
  if (focused !== document.activeElement && focused instanceof HTMLElement && focused.isConnected) focused.focus({ preventScroll: true });
  dropTip();
});
</script>

<template>
  <section v-for="{ s, ended } in kept" :key="s.id" :class="{ ended }"><SessionRows :s :now="store.now" dock /></section>
</template>
