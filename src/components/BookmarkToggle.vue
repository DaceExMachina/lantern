<script setup lang="ts">
// A card's bookmark, in its header (SessionRows for a session, SessionCard for a ghost moth): it lists the session in the
// bookmarks dropdown (BookmarksMenu), or takes it off.
import { computed } from 'vue';
import { useLanternStore } from '../stores/lantern';

const props = defineProps<{ id: string; name: string }>();
const store = useLanternStore();
const marked = computed(() => store.bookmarks.some(b => b.id === props.id));
</script>

<template>
  <button :class="['mark', { on: marked }]" :aria-label="marked ? `Remove the bookmark on ${name}` : `Bookmark ${name}`" :title="marked ? 'Remove bookmark' : 'Bookmark'" @click="store.toggleBookmark(id)"><span class="face"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" :fill="marked ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M4 1.5h8v13l-4-3.2-4 3.2z"/></svg></span></button>
</template>
