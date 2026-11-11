<script setup lang="ts">
// A session's processes by name (busiest first, card.ts sessionUse), each with how many, its CPU and RAM; in the usage dropdown's
// open row, then buttons to open its card in full and to go to the session (on its own card, which has both already, none). For a
// card's info line (StatsFoot) and a usage dropdown row (UsageMenu); `done` says a button acted, so the dropdown can close.
import { openCard, openSession, sessionUse } from '../scene/card';
import { WING_SIDE, WING_UP, pathOf } from '../scene/scene';
import GoArrow from './GoArrow.vue';

const props = defineProps<{ id: string; use: NonNullable<ReturnType<typeof sessionUse>>; card?: boolean }>();
const emit = defineEmits<{ done: [] }>();
const act = (f: () => void) => { f(); emit('done'); };
const wings = [pathOf(WING_SIDE), pathOf(WING_UP)]; // Open card's icon: the moths' own two wings
</script>

<template>
  <div class="sd">
    <div class="head">Processes<span class="r">{{ use.n }}</span></div>
    <div class="procs"><div v-for="p in use.procs" :key="p.name" class="proc"><span class="pn" :title="p.help || p.name">{{ p.name }}</span><span class="x">{{ p.n > 1 ? `×${p.n}` : '' }}</span><span :class="`hot${p.cpuHot}`" :title="p.cpuTip || `${p.cpu} of all cores`">{{ p.cpu }}</span><span :class="`hot${p.memHot}`" :title="p.memTip || `${p.mem} RAM`">{{ p.mem }}</span></div></div>
    <div v-if="!card" class="acts"><button @click="act(() => openCard(props.id))"><span class="face"><svg class="moth" viewBox="-12 -18 30 24" aria-hidden="true" fill="currentColor"><path v-for="d in wings" :key="d" :d="d" /></svg>Open card</span></button><button @click="act(() => openSession(props.id, false))"><span class="face"><GoArrow />Go to session</span></button></div>
  </div>
</template>
