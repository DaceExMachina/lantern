<script setup lang="ts">
// An iOS-style switch row for the settings menu: the words (the slot) and a switch on the right, in one label, so the
// whole row is the click area. Native underneath: a checkbox with role="switch", so it keeps its keyboard (Space) and screen
// reader behaviour. The label's class and style fall through to the row; `describedby` is its tip's id.
// To add one: <ToggleSwitch :checked="on" describedby="tip-x" @change="on => post('/settings', { x: on })">words</ToggleSwitch>
defineProps<{ checked: boolean; disabled?: boolean; describedby?: string }>();
const emit = defineEmits<{ change: [on: boolean] }>();
const onChange = (e: Event) => emit('change', e.target instanceof HTMLInputElement && e.target.checked);
</script>

<template>
  <label class="toggle"><slot /><input type="checkbox" role="switch" :checked="checked" :disabled="disabled" :aria-describedby="describedby" @change="onChange"></label>
</template>
