<script setup lang="ts">
// A review desk record in full, inside the native #review popover, which a reviews row with a record opens over the list
// (ReviewsMenu.vue sets the store's `review`; the row is the popover's invoker, so the list stays open under it and Escape
// steps back to it). It shows the verdict, the findings worst first (each linked to its line in the PR's diff), the ask and a
// draft reply to copy, the follow-up posts, and the actions: open the PR, talk it over with the desk's session (when it is
// running), dismiss the record, and at the far right post the ticked findings as a review (no button while none is ticked; its result sits beside it).
// The ask links to the comment that makes it (askUrl). Under each finding with a file and line, the lines it cites at the record's head
// (POST /desk/code); without them, just the link. A finding's title (or its code) steps into that finding on its own, in place of the
// record: its severity, file and line linked into the diff, title, detail, more of its code and anything else the desk wrote on it; "All
// findings" or Escape steps back out to it in the list. A link into the reviews (store.reviewLink) opens its record here, at the finding
// it names (its own view), the summary or the ask, else the reviews list.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { NEED, ago } from '../scene/card';
import { post } from '../scene/scene';
import { useLanternStore } from '../stores/lantern';
import { SEVERITIES, isRecord, isString, parseCode } from '../types';
import type { Code, DeskRecord, Finding } from '../types';

const store = useLanternStore();
const rec = computed(() => store.desk.records.find(r => r.url === store.review)); // not just those listed: a link can open a dismissed one
const code = shallowRef<(Code | null)[]>([]); // per finding, in the record's order (below)
const request = computed(() => store.reviews.find(r => r.url === store.review));
// each finding with its place in the record (which is how the server knows which ones to post, and what a link's #finding-<i> means) and its code
const findings = computed(() => (rec.value?.findings ?? []).map((f, i) => { const c = code.value[i] ?? null; return { f, i, c, near: c && near(c) }; }).sort((a, b) => rank(a.f) - rank(b.f)));
// the server sends 15 lines either side for the finding's own view; the list shows 3
const near = (c: Code): Code => { const from = Math.max(0, c.mark[0] - 3 - c.start); return { ...c, start: c.start + from, lines: c.lines.slice(from, c.mark[1] + 4 - c.start) }; };
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
// The code each finding cites, fetched when a record opens (the server keeps what it has fetched). None at all leaves the links.
watch(() => `${rec.value?.url}|${rec.value?.head}`, async key => {
  code.value = [];
  const r = rec.value;
  if (!r?.head || !r.findings.some(f => f.file)) return;
  try {
    const answer = await post('/desk/code', { url: r.url });
    const got = answer.ok ? parseCode(await answer.json()) : [];
    if (key === `${rec.value?.url}|${rec.value?.head}`) code.value = got; // still the record that asked
  } catch { /* no code: the links to the diff stay */ }
}, { immediate: true });
const marked = (c: Code, n: number) => c.start + n >= c.mark[0] && c.start + n <= c.mark[1];

// The finding stepped into (its place in the record), shown in place of the record until Back or Escape.
const opened = ref<number | null>(null);
const one = computed(() => findings.value.find(x => x.i === opened.value) ?? null);
const panel = () => document.getElementById('review');
async function step(i: number, focus = true) { // a link opens it without moving focus (so no focus ring); a click on the title takes it along
  opened.value = i;
  await nextTick();
  panel()?.scrollTo(0, 0);
  if (focus) panel()?.querySelector<HTMLElement>('.back')?.focus();
}
async function back() {
  const i = opened.value;
  opened.value = null;
  await nextTick();
  const li = document.getElementById(`finding-${i}`);
  li?.scrollIntoView({ block: 'center' });
  li?.querySelector<HTMLElement>('.what')?.focus();
}
// Escape steps out of a finding before it closes the panel
const escape = (e: KeyboardEvent) => { if (e.key === 'Escape' && opened.value !== null) { e.preventDefault(); e.stopPropagation(); void back(); } };

// A link into the reviews: its record, at the finding it names or scrolled to the part it names and outlined there, else the reviews list (when it has rows).
const at = ref('');
const reveal = () => { if (at.value) document.getElementById(at.value)?.scrollIntoView({ block: 'center' }); };
const show = (el: HTMLElement | null) => { if (el && !el.matches(':popover-open')) el.showPopover(); };
watch(() => store.reviewLink, async l => {
  const r = l && store.desk.records.find(d => d.repo.toLowerCase() === l.repo.toLowerCase() && d.pr === l.pr);
  if (!l) return;
  if (!r) return show(document.getElementById('reviews'));
  store.openReview(r);
  const n = Number(/^finding-(\d+)$/.exec(l.anchor)?.[1] ?? -1);
  at.value = n < 0 ? l.anchor : '';
  show(panel());
  if (r.findings[n]) return step(n, false); // one past the last: the record, at its top
  opened.value = null;
  await nextTick();
  reveal();
});
watch(code, () => nextTick(reveal)); // the code above it moved it down

const close = () => document.getElementById('review')?.hidePopover();
// the record shown is the one whose panel is open: closing the panel (Escape, a click away, the button) lets its row leave the list
const closed = (e: Event) => { if ('newState' in e && e.newState === 'closed') { store.review = null; at.value = ''; opened.value = null; } };
onMounted(() => { panel()?.addEventListener('toggle', closed); panel()?.addEventListener('keydown', escape, true); });
onBeforeUnmount(() => { panel()?.removeEventListener('toggle', closed); panel()?.removeEventListener('keydown', escape, true); });
const dismiss = (r: DeskRecord) => { store.dismissReview(r); close(); };
</script>

<template>
  <template v-if="rec && one">
    <h3><button class="link back" @click="back">‹ All findings</button> <button class="close" aria-label="Close" @click="close">×</button></h3>
    <p class="sub">{{ rec.repo }}#{{ rec.pr }}<template v-if="rec.title">, {{ rec.title }}</template></p>
    <div class="finding">
      <p>
        <span :class="['sev', one.f.severity]">{{ one.f.severity }}</span>
        <a v-if="one.f.file && lineUrl(one.f)" class="where" :href="lineUrl(one.f)" target="_blank" rel="noopener">{{ one.f.file }}{{ one.f.line ? `:${one.f.line}` : '' }}</a><span v-else-if="one.f.file" class="where">{{ one.f.file }}{{ one.f.line ? `:${one.f.line}` : '' }}</span>
      </p>
      <p class="what title">{{ one.f.title }}</p>
      <p v-if="one.f.detail" class="detail">{{ one.f.detail }}</p>
      <pre v-if="one.c" class="code tall" :aria-label="`${one.f.file}, lines ${one.c.start} to ${one.c.start + one.c.lines.length - 1}`"><span v-for="(t, n) in one.c.lines" :key="n" :class="{ mark: marked(one.c, n) }"><b>{{ one.c.start + n }}</b>{{ t }}</span></pre>
      <dl v-if="one.f.extra.length" class="extra"><template v-for="[k, v] in one.f.extra" :key="k"><dt>{{ k }}</dt><dd>{{ v }}</dd></template></dl>
      <p v-if="sent.has(one.i)" class="dim">Posted with your review.</p>
    </div>
  </template>
  <template v-else-if="rec">
    <h3><span class="ti">{{ rec.title || `${rec.repo}#${rec.pr}` }}</span> <button class="close" aria-label="Close" @click="close">×</button></h3>
    <p class="sub">
      {{ rec.repo }}#{{ rec.pr }}<template v-if="rec.author"> by {{ rec.author }}</template><template v-if="request">, {{ NEED[request.need] || request.need }}</template>.
      <template v-if="rec.kind === 'mention'">{{ rec.requestedBy ?? 'Someone' }} mentioned you.</template>
      <template v-else-if="rec.kind === 'followup'">New posts on a PR you joined.</template>
      <template v-else>{{ rec.requestedBy ? `${rec.requestedBy} asked for your review.` : '' }} <span :class="rec.status">Audit {{ rec.status }}</span>.</template>
    </p>
    <p v-if="rec.summary" id="summary" :class="['summary', { here: at === 'summary' }]">{{ rec.summary }}</p>
    <p v-if="rec.fullPanel" class="note">Big PR: consider the full review panel.</p>
    <p v-if="rec.posted" class="note"><a :href="rec.posted" target="_blank" rel="noopener">Posted on the PR</a></p>

    <template v-if="rec.ask || rec.draft">
      <h4 id="ask" :class="{ here: at === 'ask' }">The ask</h4>
      <p v-if="rec.ask">{{ rec.ask }} <a v-if="rec.askUrl" :href="rec.askUrl" target="_blank" rel="noopener">See the comment</a></p>
      <div v-if="rec.draft" class="draft">
        <p>{{ rec.draft }}</p>
        <button class="link" :aria-label="copied ? 'Draft reply copied' : 'Copy the draft reply'" @click="copy(rec.draft)">{{ copied ? 'Copied' : 'Copy draft' }}</button>
      </div>
    </template>

    <template v-if="findings.length">
      <h4>Findings</h4>
      <ul class="findings">
        <li v-for="{ f, i, near: c } in findings" :id="`finding-${i}`" :key="i" :class="{ done: sent.has(i) }">
          <label>
            <input v-if="sent.has(i)" type="checkbox" checked disabled aria-label="Already posted">
            <input v-else v-model="checked" type="checkbox" :value="i" :aria-label="`Post: ${f.title}`">
            <span class="body">
              <span :class="['sev', f.severity]">{{ f.severity }}</span>
              <a v-if="f.file && lineUrl(f)" class="where" :href="lineUrl(f)" target="_blank" rel="noopener">{{ f.file }}{{ f.line ? `:${f.line}` : '' }}</a><span v-else-if="f.file" class="where">{{ f.file }}{{ f.line ? `:${f.line}` : '' }}</span>
              <button class="what" :aria-label="`${f.title}: open this finding`" @click.prevent="step(i)">{{ f.title }}</button>
              <span v-if="f.detail" class="detail">{{ f.detail }}</span>
            </span>
          </label>
          <pre v-if="c" class="code" title="Open this finding" @click="step(i)" :aria-label="`${f.file}, lines ${c.start} to ${c.start + c.lines.length - 1}`"><span v-for="(t, n) in c.lines" :key="n" :class="{ mark: marked(c, n) }"><b>{{ c.start + n }}</b>{{ t }}</span></pre>
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
