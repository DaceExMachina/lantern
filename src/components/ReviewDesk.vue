<script setup lang="ts">
// The review desk (a Claude session, /review-desk, which audits the PRs asked of me and notes the mentions of me; see its skill) leaves one
// record per PR. A corner button in the footer before the bookmarks, with the count of the ready ones, opens a dropdown that flies up
// from it (a native popover) listing them newest first: each PR with its title (a link), who asked and where the audit stands. A click on
// the line under the title opens the summary and findings, or for a mention what's asked and a draft reply. The cross dismisses a record
// (remembered by the PR's head, so a new audit shows again); the desk's own file stays. Not in the iTerm panel or the screensavers.
import { computed, ref } from 'vue';
import { useLanternStore } from '../stores/lantern';
import GoArrow from './GoArrow.vue';
import type { DeskRecord } from '../types';

const SEVERITIES = ['blocker', 'major', 'minor', 'nit'];
const store = useLanternStore();
const roomy = !document.body.matches('.panel, .screensaver, .ambient'); // fixed by the time the chrome mounts
const open = ref(new Set<string>());
const toggle = (id: string) => { open.value.has(id) ? open.value.delete(id) : open.value.add(id); open.value = new Set(open.value); };
const ready = computed(() => store.deskShown.filter(r => r.status === 'ready').length);
const pending = computed(() => store.deskShown.some(r => r.status === 'queued' || r.status === 'auditing'));
const counts = (r: DeskRecord) => SEVERITIES.map(s => [s, r.findings?.filter(f => f.severity === s).length ?? 0] as const).filter(([, n]) => n);
const name = (r: DeskRecord) => `${r.repo.split('/').pop()}#${r.pr}`;
const by = (r: DeskRecord) => r.kind === 'mention' ? `mentioned by ${r.requestedBy ?? r.author ?? 'someone'}` : `asked by ${r.requestedBy ?? 'someone'}`;
</script>

<template>
  <template v-if="roomy">
    <button id="deskButton" class="corner" popovertarget="desk" :aria-label="ready ? `Reviews (${ready} ready)` : 'Reviews'" title="Reviews prepared by the review desk">
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2.5h12v8H8.5L5 13.5v-3H2z"/><path d="M5 5.5h6M5 7.5h4"/></svg>
      <span v-if="ready" class="n">{{ ready }}</span><i v-else-if="pending" class="busy" aria-hidden="true"></i>
    </button>
    <div id="desk" class="flyup" popover aria-label="Reviews">
      <div v-for="r in store.deskShown" :key="r.id" :class="['row', r.status]">
        <a v-if="r.url" class="ti" :href="r.url" target="_blank" rel="noopener">{{ r.title ?? name(r) }}<GoArrow /></a>
        <span v-else class="ti">{{ r.title ?? name(r) }}</span>
        <button class="tg" :aria-expanded="open.has(r.id)" @click="toggle(r.id)">
          <span class="face"><svg class="car" viewBox="0 0 16 16" width="10" height="10" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5l4.5 4.5L6 12.5"/></svg>
            <span class="me">{{ name(r) }} · {{ by(r) }} · <b v-if="r.status === 'ready' && r.kind === 'review' && counts(r).length"><template v-for="([s, n], i) in counts(r)" :key="s"><template v-if="i">, </template><span :class="['sev', s]">{{ n }} {{ s }}</span></template></b><b v-else-if="r.status === 'ready' && r.kind === 'review'">no findings</b><b v-else :class="r.status">{{ r.status === 'ready' ? 'mention' : r.status }}</b></span></span>
        </button>
        <button class="rm" :aria-label="`Dismiss ${name(r)}`" title="Dismiss" @click="store.dismissReview(r.id)">
          <span class="face"><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></span>
        </button>
        <div v-if="open.has(r.id)" class="more">
          <p v-if="r.summary">{{ r.summary }}</p>
          <p v-if="r.fullPanel" class="big">Big PR: consider the full review panel.</p>
          <template v-if="r.kind === 'mention'">
            <p v-if="r.ask"><b>Asked:</b> {{ r.ask }}</p>
            <p v-if="r.draft" class="draft"><b>Draft reply:</b> {{ r.draft }}</p>
          </template>
          <div v-for="(f, i) in r.findings ?? []" :key="i" class="finding">
            <span :class="['sev', f.severity]">{{ f.severity }}</span> <span class="where">{{ f.file }}{{ f.line ? `:${f.line}` : '' }}</span>
            <span class="what">{{ f.title }}</span>
            <span v-if="f.detail" class="detail">{{ f.detail }}</span>
          </div>
        </div>
      </div>
      <p v-if="!store.deskShown.length" class="empty">Nothing to review. Start the desk with /review-desk in a Claude session and it audits the PRs asked of you.</p>
    </div>
  </template>
</template>
