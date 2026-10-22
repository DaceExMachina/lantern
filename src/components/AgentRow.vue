<script setup lang="ts">
// An agent, a shell command left running or a side session on the card. With a task tag (from a step that starts "[tag]")
// or a model to show, three lines: the live dot (dim once it's been quiet 10 s), the tag as a chip, the model and how long
// it's run; then its job; then its current step. With neither, two: the dot, the job and the time; then the step. The job
// and step are cut to a line each; a click opens the row to show them in full. A button, so the keyboard gets it too.
// In the sidebar (plain) it's already open, a plain row that does nothing.
import { computed } from 'vue';
import { short, stepOf, tagOf } from '../scene/card';
import type { Row } from '../scene/card';

const props = defineProps<{ row: Row; now: number; open: boolean; plain?: boolean }>();
defineEmits<{ toggle: [] }>();
const tag = computed(() => tagOf(props.row.activity || '')), step = computed(() => stepOf(props.row.activity || ''));
const about = computed(() => !!tag.value || !!props.row.model);
const quiet = computed(() => props.now - (props.row.last || 0) > 10e3);
const time = computed(() => props.row.started ? short(props.now - props.row.started) : '');
</script>

<template>
  <component :is="plain ? 'div' : 'button'" :class="['agent', { open }]" :aria-expanded="plain ? undefined : open" @click="plain || $emit('toggle')"><span class="face"><template v-if="about"><span class="arow"><span :class="['live', { quiet }]"></span><span v-if="tag" class="tag">{{ tag }}</span><span v-if="row.model" class="model">{{ row.model }}</span><span v-if="time" class="t">{{ time }}</span></span><span class="job">{{ row.job }}</span></template><span v-else class="arow"><span :class="['live', { quiet }]"></span><span class="job">{{ row.job }}</span><span v-if="time" class="t">{{ time }}</span></span><span v-if="step" class="astep">{{ step }}</span></span></component>
</template>
