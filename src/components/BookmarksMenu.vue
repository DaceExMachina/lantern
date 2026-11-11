<script setup lang="ts">
// The bookmarked sessions (a card's bookmark toggles one): a corner button in the footer beside stats, opening a dropdown that flies up
// from it (a native popover, like the reviews menu) listing them, the most recently active first, each with its folder, whether it's
// running and when it was last active. A click on a running one brings it to the front, as the card's header does; on one that has ended it
// resumes it in a new iTerm2 tab, as a double click on a ghost moth does (the server keeps its title, folder and last activity for that).
// The cross removes it. Hovering or focusing a row lights its moth or ghost moth in the scene, if it has one (scene/spot.ts).
// Not in the iTerm panel or the screensavers, whose footers have no room.
import { computed, useTemplateRef } from 'vue';
import { project, short } from '../scene/card';
import { live } from '../scene/live';
import { post } from '../scene/scene';
import { useLanternStore } from '../stores/lantern';
import type { Bookmark } from '../types';

const store = useLanternStore();
const roomy = !document.body.matches('.panel, .screensaver, .ambient'); // fixed by the time the chrome mounts
const menu = useTemplateRef<HTMLElement>('menu');
// a running session's own title and activity; an ended one's as the server kept them
const rows = computed(() => store.bookmarks.map(b => {
  const s = store.sessions.find(o => o.id === b.id), m: Bookmark = s ?? b;
  return { b, live: !!s, name: m.title || project(m), folder: project(m), last: m.last ?? 0 };
}).sort((x, y) => y.last - x.last));
function go(id: string, running: boolean) {
  post(running ? '/focus' : '/resume', { id });
  menu.value?.hidePopover?.();
}
// the row the pointer or focus is on points at its session; leaving it, or the menu closing, lets go
const point = (id: string | null) => { live.spot = id; };
</script>

<template>
  <template v-if="roomy">
    <button id="bookmarksButton" class="corner" popovertarget="bookmarks" :aria-label="`Bookmarks (${rows.length})`" title="Bookmarks"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"><path d="M4 1.5h8v13l-4-3.2-4 3.2z"/></svg></button>
    <div id="bookmarks" ref="menu" class="flyup" popover aria-label="Bookmarks" @toggle="point(null)">
      <div v-for="r in rows" :key="r.b.id" class="row" @pointerenter="point(r.b.id)" @pointerleave="point(null)" @focusin="point(r.b.id)" @focusout="point(null)">
        <button class="go" :title="r.live ? 'Go to this session' : 'Resume this session in iTerm2'" @click="go(r.b.id, r.live)">
          <span class="face"><span class="ti">{{ r.name }}</span><span class="me">{{ `${r.folder} · ` }}<b v-if="r.live">running</b><template v-else>ended</template>{{ ` · ${short(store.now - r.last)} ago` }}</span></span>
        </button>
        <button class="rm" :aria-label="`Remove the bookmark on ${r.name}`" title="Remove bookmark" @click="store.toggleBookmark(r.b.id)">
          <span class="face"><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></span>
        </button>
      </div>
      <p v-if="!rows.length" class="empty">No bookmarks yet. Bookmark a session from its card to come back to it here.</p>
    </div>
  </template>
</template>
