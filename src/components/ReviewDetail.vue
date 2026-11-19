<script setup lang="ts">
// A review desk record in full, inside the native #review popover, which a reviews row with a record opens over the list
// (ReviewsMenu.vue sets the store's `review`; the row is the popover's invoker, so the list stays open under it and Escape
// steps back to it). It shows the verdict, the findings worst first (each linked to its line in the PR's diff), the ask and a
// draft reply to copy, the follow-up posts, and the actions: open the PR, talk it over with the desk's session (when it is
// running), dismiss the record, and at the far right post the ticked findings as a review (no button while none is ticked; its result sits beside it).
// The ask links to the comment that makes it (askUrl).
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { NEED, ago } from '../scene/card';
import { post } from '../scene/scene';
import { useLanternStore } from '../stores/lantern';
import { SEVERITIES, isRecord, isString } from '../types';
import type { DeskRecord, Finding } from '../types';

const store = useLanternStore();
const rec = computed(() => store.deskShown.find(r => r.url === store.review));
const request = computed(() => store.reviews.find(r => r.url === store.review));
// each finding with its place in the record, which is how the server knows which ones to post
const findings = computed(() => (rec.value?.findings ?? []).map((f, i) => ({ f, i })).sort((a, b) => rank(a.f) - rank(b.f)));
const rank = (f: Finding) => { const i = SEVERITIES.indexOf(f.severity); return i < 0 ? SEVERITIES.length : i; };
const activity = computed(() => [...rec.value?.activity ?? []].sort((a, b) => b.at.localeCompare(a.at)));
const when = (at: string) => `${ago(store.now - Date.parse(at))} ago`;
// the desk's session, if it is one of the running sessions
const desk = computed(() => store.sessions.some(s => s.id === store.desk.inbox) ? store.desk.inbox : null);

// GitHub anchors a file in a PR's diff by the SHA-256 of its path, and a line on the new side by R<line>
const hashes = shallowRef(new Map<string, string>());
const sha256 = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
watch(findings, async fs => { hashes.value = new Map(await Promise.all([...new Set(fs.flatMap(({ f }) => f.file ? [f.file] : []))].map(async f => [f, await sha256(f)] as const))); }, { immediate: true });
const lineUrl = (f: Finding) => { const h = f.file ? hashes.value.get(f.file) : undefined; return h && rec.value ? `${rec.value.url}/files#diff-${h}${/^\d+$/.test(String(f.line ?? '')) ? `R${f.line}` : ''}` : undefined; }; // a range or other text line shows, unanchored

// Posting: the findings I tick go up as one review. Blockers and majors start ticked; ones already posted on this head are marked and not offered again.
const sent = computed(() => new Set(rec.value?.sent?.head === (rec.value?.head ?? '') ? rec.value?.sent?.findings : []));
const checked = ref(new Set<number>());
watch(() => `${rec.value?.url}|${rec.value?.head}|${[...sent.value]}`, () => {
  checked.value = new Set(findings.value.filter(({ f, i }) => !sent.value.has(i) && ['blocker', 'major'].includes(f.severity)).map(({ i }) => i));
}, { immediate: true });
const working = ref(false);
const result = ref<{ url: string } | { error: string } | null>(null);
watch(() => `${rec.value?.url}|${rec.value?.head}`, () => { result.value = null; });
async function send(r: DeskRecord) {
  working.value = true;
  result.value = null;
  try {
    const answer: unknown = await (await post('/desk/post', { url: r.url, head: r.head ?? '', findings: [...checked.value].sort((a, b) => a - b) })).json();
    result.value = isRecord(answer) && isString(answer['url']) ? { url: answer['url'] } : { error: isRecord(answer) && isString(answer['error']) ? answer['error'] : 'Lantern could not post the review.' };
  } catch { result.value = { error: 'Lantern could not reach its server.' }; }
  working.value = false;
}

const copied = ref(false);
async function copy(text: string) {
  await navigator.clipboard.writeText(text);
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 1500);
}
const close = () => document.getElementById('review')?.hidePopover();
// the record shown is the one whose panel is open: closing the panel (Escape, a click away, the button) lets its row leave the list
const closed = (e: Event) => { if ('newState' in e && e.newState === 'closed') store.review = null; };
onMounted(() => document.getElementById('review')?.addEventListener('toggle', closed));
onBeforeUnmount(() => document.getElementById('review')?.removeEventListener('toggle', closed));
const dismiss = (r: DeskRecord) => { store.dismissReview(r); close(); };
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
    <p v-if="rec.posted" class="note"><a :href="rec.posted" target="_blank" rel="noopener">Posted on the PR</a></p>

    <template v-if="rec.ask || rec.draft">
      <h4>The ask</h4>
      <p v-if="rec.ask">{{ rec.ask }} <a v-if="rec.askUrl" :href="rec.askUrl" target="_blank" rel="noopener">See the comment</a></p>
      <div v-if="rec.draft" class="draft">
        <p>{{ rec.draft }}</p>
        <button class="link" :aria-label="copied ? 'Draft reply copied' : 'Copy the draft reply'" @click="copy(rec.draft)">{{ copied ? 'Copied' : 'Copy draft' }}</button>
      </div>
    </template>

    <template v-if="findings.length">
      <h4>Findings</h4>
      <ul class="findings">
        <li v-for="{ f, i } in findings" :key="i" :class="{ done: sent.has(i) }">
          <label>
            <input v-if="sent.has(i)" type="checkbox" checked disabled aria-label="Already posted">
            <input v-else v-model="checked" type="checkbox" :value="i" :aria-label="`Post: ${f.title}`">
            <span class="body">
              <span :class="['sev', f.severity]">{{ f.severity }}</span>
              <a v-if="f.file && lineUrl(f)" class="where" :href="lineUrl(f)" target="_blank" rel="noopener">{{ f.file }}{{ f.line ? `:${f.line}` : '' }}</a><span v-else-if="f.file" class="where">{{ f.file }}{{ f.line ? `:${f.line}` : '' }}</span>
              <span class="what">{{ f.title }}</span>
              <span v-if="f.detail" class="detail">{{ f.detail }}</span>
            </span>
          </label>
        </li>
      </ul>
    </template>
    <p v-else-if="rec.kind === 'review' && rec.status === 'ready'" class="dim">No findings.</p>

    <template v-if="activity.length">
      <h4>Recent activity</h4>
      <ul class="activity">
        <li v-for="(a, i) in activity" :key="i">
          <span class="who"><b>{{ a.author }}</b> <component :is="a.url ? 'a' : 'span'" :href="a.url ?? undefined" target="_blank" rel="noopener">{{ when(a.at) }}</component><template v-if="a.mine">, in your thread</template></span>
          <span v-if="a.excerpt" class="excerpt">{{ a.excerpt }}</span>
        </li>
      </ul>
    </template>

    <div class="actions">
      <a class="link" :href="rec.url" target="_blank" rel="noopener">Open on GitHub</a>
      <button v-if="desk" class="link" title="Bring up the review desk's session" @click="post('/focus', { id: desk })">Talk it over</button>
      <button class="link" :aria-label="`Dismiss the desk's notes on ${rec.repo}#${rec.pr}`" title="Hide this until there is something new" @click="dismiss(rec)">Dismiss</button>
      <span v-if="checked.size || result" class="send">
        <span v-if="result && 'url' in result" role="status">Posted. <a :href="result.url" target="_blank" rel="noopener">See the review</a></span>
        <span v-else-if="result" class="error" role="alert">{{ result.error }}</span>
        <button v-if="checked.size" class="primary" :disabled="working" @click="send(rec)">{{ working ? 'Posting' : `Post ${checked.size} as your review` }}</button>
      </span>
    </div>
  </template>
</template>
