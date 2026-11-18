<script setup lang="ts">
// A review desk record in full, inside the native #review popover, which a reviews row with a record opens over the list
// (ReviewsMenu.vue sets the store's `review`; the row is the popover's invoker, so the list stays open under it and Escape
// steps back to it). It shows the verdict, the findings worst first (each linked to its line in the PR's diff), the ask and a
// draft reply to copy, the follow-up posts, and three actions: open the PR, talk it over with the desk's session (when it is
// running), and dismiss the record.
import { computed, ref, shallowRef, watch } from 'vue';
import { NEED, ago } from '../scene/card';
import { post } from '../scene/scene';
import { useLanternStore } from '../stores/lantern';
import type { Finding } from '../types';

const SEVERITIES = ['blocker', 'major', 'minor', 'nit'];
const store = useLanternStore();
const rec = computed(() => store.deskShown.find(r => r.url === store.review));
const request = computed(() => store.reviews.find(r => r.url === store.review));
const findings = computed(() => [...rec.value?.findings ?? []].sort((a, b) => rank(a) - rank(b)));
const rank = (f: Finding) => { const i = SEVERITIES.indexOf(f.severity); return i < 0 ? SEVERITIES.length : i; };
const activity = computed(() => [...rec.value?.activity ?? []].sort((a, b) => b.at.localeCompare(a.at)));
const when = (at: string) => `${ago(store.now - Date.parse(at))} ago`;
// the desk's session, if it is one of the running sessions
const desk = computed(() => store.sessions.some(s => s.id === store.desk.inbox) ? store.desk.inbox : null);

// GitHub anchors a file in a PR's diff by the SHA-256 of its path, and a line on the new side by R<line>
const hashes = shallowRef(new Map<string, string>());
const sha256 = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
watch(findings, async fs => { hashes.value = new Map(await Promise.all([...new Set(fs.flatMap(f => f.file ? [f.file] : []))].map(async f => [f, await sha256(f)] as const))); }, { immediate: true });
const lineUrl = (f: Finding) => { const h = f.file ? hashes.value.get(f.file) : undefined; return h && rec.value ? `${rec.value.url}/files#diff-${h}${f.line ? `R${f.line}` : ''}` : undefined; };

const copied = ref(false);
async function copy(text: string) {
  await navigator.clipboard.writeText(text);
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 1500);
}
const close = () => document.getElementById('review')?.hidePopover();
const dismiss = (id: string) => { store.dismissReview(id); close(); };
</script>

<template>
  <template v-if="rec">
    <h3><span class="ti">{{ rec.title || `${rec.repo}#${rec.pr}` }}</span> <button class="close" aria-label="Close" @click="close">×</button></h3>
    <p class="sub">
      {{ rec.repo }}#{{ rec.pr }}<template v-if="rec.author"> by {{ rec.author }}</template><template v-if="request">, {{ NEED[request.need] || request.need }}</template>.
      <template v-if="rec.kind === 'mention'">{{ rec.requestedBy ?? 'Someone' }} mentioned you.</template>
      <template v-else-if="rec.kind === 'followup'">New posts on a PR you joined.</template>
      <template v-else>{{ rec.requestedBy ? `${rec.requestedBy} asked for your review.` : '' }} <span :class="rec.status">Audit {{ rec.status }}</span>.</template>
    </p>
    <p v-if="rec.summary" class="summary">{{ rec.summary }}</p>
    <p v-if="rec.fullPanel" class="note">Big PR: consider the full review panel.</p>
    <p v-if="rec.posted" class="note"><a :href="rec.posted" target="_blank" rel="noopener">The desk posted the blockers on the PR</a></p>

    <template v-if="rec.ask || rec.draft">
      <h4>The ask</h4>
      <p v-if="rec.ask">{{ rec.ask }}</p>
      <div v-if="rec.draft" class="draft">
        <p>{{ rec.draft }}</p>
        <button class="link" :aria-label="copied ? 'Draft reply copied' : 'Copy the draft reply'" @click="copy(rec.draft)">{{ copied ? 'Copied' : 'Copy draft' }}</button>
      </div>
    </template>

    <template v-if="findings.length">
      <h4>Findings</h4>
      <ul class="findings">
        <li v-for="(f, i) in findings" :key="i">
          <span :class="['sev', f.severity]">{{ f.severity }}</span>
          <a v-if="f.file && lineUrl(f)" class="where" :href="lineUrl(f)" target="_blank" rel="noopener">{{ f.file }}{{ f.line ? `:${f.line}` : '' }}</a><span v-else-if="f.file" class="where">{{ f.file }}{{ f.line ? `:${f.line}` : '' }}</span>
          <span class="what">{{ f.title }}</span>
          <span v-if="f.detail" class="detail">{{ f.detail }}</span>
        </li>
      </ul>
    </template>
    <p v-else-if="rec.kind === 'review' && rec.status === 'ready'" class="dim">No findings.</p>

    <template v-if="activity.length">
      <h4>Recent activity</h4>
      <ul class="activity">
        <li v-for="(a, i) in activity" :key="i">
          <span class="who"><b>{{ a.author }}</b> <component :is="a.url ? 'a' : 'span'" :href="a.url ?? undefined" target="_blank" rel="noopener">{{ when(a.at) }}</component><template v-if="a.mine === true || a.mine === 'true'">, in your thread</template></span>
          <span v-if="a.excerpt" class="excerpt">{{ a.excerpt }}</span>
        </li>
      </ul>
    </template>

    <div class="actions">
      <a class="link" :href="rec.url" target="_blank" rel="noopener">Open on GitHub</a>
      <button v-if="desk" class="link" title="Bring up the review desk's session" @click="post('/focus', { id: desk })">Talk it over</button>
      <button class="link" :aria-label="`Dismiss the desk's notes on ${rec.repo}#${rec.pr}`" title="Hide this until there is something new" @click="dismiss(rec.id)">Dismiss</button>
    </div>
  </template>
</template>
