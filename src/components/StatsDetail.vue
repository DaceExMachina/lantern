<script setup lang="ts">
// A session's processes by name (busiest first, as app/Usage.swift sends them), each with how many, its CPU and RAM, then
// buttons to go to the session and, outside its own card (the usage dropdown's open row), to open its card in full. For a
// card's info line (StatsFoot) and a usage dropdown row (UsageMenu); `done` says a button acted, so the dropdown can close.
import { openSession, pinSession, sessionUse } from '../scene/card';

const props = defineProps<{ id: string; use: NonNullable<ReturnType<typeof sessionUse>>; card?: boolean }>();
const emit = defineEmits<{ done: [] }>();
const act = (f: () => void) => { f(); emit('done'); };
</script>

<template>
  <div class="sd">
    <div class="head">Processes<span class="r">{{ use.n }}</span></div>
    <div class="procs"><div v-for="p in use.procs" :key="p.name" class="proc"><span class="pn" :title="p.name">{{ p.name }}</span><span class="x">{{ p.n > 1 ? `×${p.n}` : '' }}</span><span :class="`hot${p.cpuHot}`" :title="p.cpuTip || `CPU ${p.cpu} of the Mac`">{{ p.cpu }}</span><span :class="`hot${p.memHot}`" :title="p.memTip || `${p.mem} RAM`">{{ p.mem }}</span></div></div>
    <div class="acts"><button v-if="!card" @click="act(() => pinSession(props.id))"><span class="face">Open card</span></button><button @click="act(() => openSession(props.id, false))"><span class="face">Go to session</span></button></div>
  </div>
</template>
