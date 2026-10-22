<script setup lang="ts">
// A session on the hover card, or (dock) in the pinned sidebar. Hovered (compact), just the header, one line of what it's
// doing or wants, and a count of its work. Otherwise in full: the whole prompt, agents open, every PR listed until
// that pin's own toggle (kept with the pin) turns them into chips. The header opens the session (a click on its moth does the same; shift-click snoozes), its
// pill cycles the snooze as a right-click on the moth does, and its pin pins it to the sidebar; the header stays put and the
// body below scrolls when the card would be taller than the window. The top of the body is what it wants from me (a state
// line only where it says more than the pill, its questions, its "You:" message as a quote), then the work in its tray:
// agents (the first AGENT_CAP, until "more" lists the rest; all of them in the sidebar), side sessions, PRs.
// Every control is an outer button or link that fills its zone (the padding around it, up to its neighbours and the card's
// edges) and an inner .face that's the visible pill or hover, the size it always was (index.html). Each keeps its element
// through a re-render (stable keys, no swapping a control out), since WebKit drops a click whose pressed button is replaced.
import { computed, reactive, ref } from 'vue';
import { AGENT_CAP, PR_CAP, cycleSnooze, footLine, openSession, pillClass, pillNext, pillWord, project, running, sideRow, stateLine } from '../scene/card';
import { post } from '../scene/scene';
import { useLanternStore } from '../stores/lantern';
import type { Session } from '../types';
import AgentRow from './AgentRow.vue';
import PrBlock from './PrBlock.vue';

const props = defineProps<{ s: Session; now: number; dock?: boolean; compact?: boolean }>();
const store = useLanternStore();
const waiting = computed(() => props.s.state === 'waiting');
const name = computed(() => props.s.title || project(props.s));
const next = computed(() => pillNext(props.s));
const pin = computed(() => store.pinned.find(p => p.id === props.s.id));
const run = computed(() => running(props.s));
const side = computed(() => store.sessions.filter(o => o.parent === props.s.id));
const prompt = computed(() => { const p = props.s.prompt ?? ''; return `“${props.dock || p.length <= 110 ? p : p.slice(0, 110) + '…'}”`; });
// a click opens an agent to show its job and step in full, and it stays open, by id, until the card closes
const openAgents = reactive(new Set<string>());
const allAgents = ref(false);
const agents = computed(() => props.dock || allAgents.value ? run.value.rows : run.value.rows.slice(0, AGENT_CAP));
// the compact card: its question or "You:" message when it waits, else what it's doing or was asked, and its work counted
const gist = computed(() => {
  const s = props.s, you = s.forYou?.you?.map(p => typeof p === 'string' ? p : p.label).join('');
  return waiting.value && (s.forYou?.questions?.[0] || you) || stateLine(s) || s.prompt || '';
});
const counts = computed(() => {
  const n = (k: number, one: string) => k ? `${k} ${one}${k > 1 ? 's' : ''}` : '';
  return [run.value.count, n(side.value.length, 'side session'), n(props.s.github?.length ?? 0, 'PR')].filter(Boolean).join(' · ');
});
const toggleAgent = (id: string) => { if (!openAgents.delete(id)) openAgents.add(id); };
// The PRs are listed or chips, per session, kept in the server's settings (prList) so every window agrees; until it's used,
// three PRs or fewer are listed. A toggle shows at once, then the settings event confirms it.
const listed = computed(() => props.dock ? !pin.value?.chips : store.settings.prList?.[props.s.id] ?? (props.s.github?.length ?? 0) <= 3);
function toggleList() {
  if (props.dock) { store.setPins(store.pinned.map(p => p.id === props.s.id ? { ...p, chips: listed.value } : p)); return; }
  const prList = { ...store.settings.prList, [props.s.id]: !listed.value };
  store.settings = { ...store.settings, prList };
  post('/settings', { prList: { [props.s.id]: prList[props.s.id] } });
}
</script>

<template>
  <h3><button class="open" title="Open this session" @click="openSession(s.id, $event.shiftKey)"><span class="face name">{{ name }}<span class="go"><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h6.5V10M12.5 3.5l-8 8"/></svg></span></span></button><button :class="['chip', pillClass(s)]" :title="next" :aria-label="`${pillWord(s)}: ${next.toLowerCase()}`" @click="cycleSnooze(s.id)"><span class="face">{{ pillWord(s) }}</span></button><button v-if="dock || store.pinnable" :class="['pin', { on: pin }]" :aria-label="pin ? `Unpin ${name}` : `Pin ${name} to the sidebar`" :title="pin ? 'Unpin' : 'Pin to the sidebar'" @click="store.togglePin(s.id)"><span class="face"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M10 1l5 5-2 1-3 3 .5 3.5L9 15l-3-3-4 4-1-1 4-4-3-3 1.5-1.5L7 7l3-3z"/></svg></span></button></h3>
  <template v-if="compact">
    <div v-if="gist" class="gist">{{ gist }}</div>
    <div v-if="counts" class="foot">{{ counts }}</div>
  </template>
  <div v-else class="cardBody">
    <div v-if="stateLine(s)" :class="['state', { error: s.state !== 'working' && s.error }]">{{ stateLine(s) }}</div>
    <template v-if="waiting">
      <div v-for="(q, i) in s.forYou?.questions ?? []" :key="i" class="ask">{{ q }}</div>
      <div v-if="s.forYou?.you?.length" class="msg"><template v-for="(piece, i) in s.forYou.you" :key="i"><template v-if="typeof piece === 'string'">{{ piece }}</template><a v-else :href="piece.url" target="_blank" rel="noopener">{{ piece.label }}</a></template></div>
    </template>
    <div v-else-if="s.prompt" class="prompt">{{ prompt }}</div>
    <div v-if="run.rows.length || side.length || s.github?.length" class="tray">
      <div v-if="run.rows.length" class="agentZone"><div class="head">Running<span class="r">{{ run.count }}</span></div><AgentRow v-for="r in agents" :key="r.id" :row="r" :now :open="dock || openAgents.has(r.id)" :plain="dock" @toggle="toggleAgent(r.id)" /><button v-if="agents.length < run.rows.length" class="more" @click="allAgents = true"><span class="face">{{ `${run.rows.length - agents.length} more` }}</span></button></div>
      <template v-if="side.length"><div class="head">Side sessions<span class="r">{{ side.length }}</span></div><AgentRow v-for="o in side" :key="o.id" :row="sideRow(o)" :now :open="dock || openAgents.has(o.id)" :plain="dock" @toggle="toggleAgent(o.id)" /></template>
      <PrBlock v-if="s.github?.length" :prs="s.github" :listed :now :cap="dock ? Infinity : PR_CAP" @toggle="toggleList" />
      <div class="foot">{{ footLine(s, now) }}</div>
    </div>
    <div v-else class="foot">{{ footLine(s, now) }}</div>
  </div>
</template>
