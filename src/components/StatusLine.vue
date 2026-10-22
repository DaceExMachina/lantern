<script setup lang="ts">
// The footer's status line: how many sessions there are and what they're doing, with a count for each kind that wants me
// (it opens those sessions one at a time, longest waiting first) and, once the lantern has been warm a while, for how long.
// Reads the store; relative times count from store.now. Each count's button keeps its element through a re-render, since
// WebKit drops a click whose pressed button is replaced.
// It keeps to one line: once it has slid all the way left and still doesn't fit, it shrinks to fit, down to 9px, and only
// wraps past that. Text scales with its font size, so one measurement gives the size that fits.
import { computed, onMounted, onUnmounted, onUpdated, ref, useTemplateRef, watchEffect } from 'vue';
import { QUIET_FOREVER, restOf } from '../scene/state';
import { post } from '../scene/scene';
import { useLanternStore } from '../stores/lantern';
import { timeLabel } from '../types';

const store = useLanternStore();
const sessions = computed(() => store.sessions);
const working = computed(() => sessions.value.filter(s => s.state === 'working' || s.state === 'paused' && !s.reported).length); // a session waiting on its own agents counts as working: the footer is short on room in the iTerm panel
// each count's sessions, longest waiting first (sleeping ones that aren't waiting after, in a fixed order)
const of = (rest: string) => sessions.value.filter(s => restOf(s) === rest).sort((a, b) => (a.waitingSince || Infinity) - (b.waitingSince || Infinity) || (a.id < b.id ? -1 : 1));
const waiting = computed(() => of('need').length), snoozed = computed(() => of('snoozed').length), sleeping = computed(() => of('sleeping').length);
// a count that opens its sessions one at a time: each click moves on to the next one
const nextUp: Record<string, number> = {};
const cycle = (rest: string) => { const q = of(rest), s = q[nextUp[rest] = ((nextUp[rest] ?? -1) + 1) % q.length]; if (s) post('/focus', { id: s.id }); };
const quiet = computed(() => (store.settings.quietUntil ?? 0) > store.now);
const until = computed(() => quiet.value && (store.settings.quietUntil ?? 0) < QUIET_FOREVER ? ` until ${timeLabel(store.settings.quietEnd ?? '08:00')}` : '');
// When the lantern was last violet. Each window keeps its own, from when it last saw violet (or opened), since the server
// doesn't say yet; windows opened at different times can differ.
const violetAt = ref(store.now);
watchEffect(() => { if (waiting.value) violetAt.value = store.now; });
const warm = computed(() => {
  if (waiting.value || quiet.value || store.now - violetAt.value < 60000) return '';
  const m = Math.floor((store.now - violetAt.value) / 60000);
  return `warm for ${m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`}`;
});
const klass = computed(() => store.link !== 'up' ? 'offline' : waiting.value ? 'waiting' : '');

const el = useTemplateRef('status');
function fit() {
  const st = el.value;
  if (!st) return;
  const cs = getComputedStyle(st), pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  st.style.fontSize = st.style.whiteSpace = '';
  const ratio = (st.clientWidth - pad) / (st.scrollWidth - pad), size = Math.floor(10 * parseFloat(cs.fontSize) * ratio) / 10;
  if (ratio >= 1) return;
  st.style.fontSize = `${Math.max(9, size)}px`;
  if (size < 9) st.style.whiteSpace = 'normal';
}
onMounted(() => { fit(); addEventListener('resize', fit); });
onUpdated(fit);
onUnmounted(() => removeEventListener('resize', fit));
</script>

<template>
  <!-- no whitespace between the pieces: every space in the line is spelled out -->
  <span id="status" ref="status" :class="klass"><template v-if="store.link === 'connecting'">connecting…</template><template v-else-if="store.link === 'offline'">server offline, retrying…</template><template v-else-if="!sessions.length">quiet night, no sessions</template><template v-else>{{ `${sessions.length} session${sessions.length > 1 ? 's' : ''} · ${working} working` }}<template v-if="waiting">{{ ' · ' }}<button class="next" title="Open the session that has waited longest" @click="cycle('need')">{{ `${waiting} need${waiting > 1 ? '' : 's'} you` }}</button></template><template v-if="snoozed">{{ ' · ' }}<button class="next" title="Open the snoozed sessions one at a time" @click="cycle('snoozed')">{{ `${snoozed} snoozed` }}</button>{{ until }}</template><template v-else-if="quiet">{{ ` · snoozed${until}` }}</template><template v-if="sleeping">{{ ' · ' }}<button class="next" title="Open the sleeping sessions one at a time" @click="cycle('sleeping')">{{ `${sleeping} sleeping` }}</button></template><template v-if="warm">{{ ' · ' }}<span class="warm">{{ warm }}</span></template><template v-if="store.reviews.length">{{ ' · ' }}<a class="next" href="https://github.com/pulls/review-requested" target="_blank" rel="noopener" :title="store.reviews.map(r => `${r.label} ${r.title}`).join('\n')">{{ `${store.reviews.length} review${store.reviews.length > 1 ? 's' : ''}` }}</a></template></template></span>
</template>
