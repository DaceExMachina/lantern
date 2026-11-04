<script setup lang="ts">
// The settings menu's one on/off control: the words, then an "off | on" pair of buttons (the quiet hours' look), and
// whatever the slot holds after it (quiet from's time). The words and each half run the row's full height and touch, so
// there's no dead spot. The pair is a group of two buttons, aria-pressed on the one that's current; `label` names it for
// screen readers and `describedby` is its tip's id. The row's class falls through to it.
// Use: <ToggleSwitch label="x" :checked="on" describedby="tip-x" @change="on => post('/settings', { x: on })">words</ToggleSwitch>
defineProps<{ label: string; checked: boolean; disabled?: boolean; describedby?: string }>();
const emit = defineEmits<{ change: [on: boolean] }>();
</script>

<template>
  <div class="time switch"><span><slot /></span><span class="pill" role="group" :aria-label="label" :aria-describedby="describedby"><button :aria-pressed="!checked" :disabled="disabled" @click="emit('change', false)"><span>off</span></button><button :aria-pressed="checked" :disabled="disabled" @click="emit('change', true)"><span>on</span></button></span><slot name="after" /></div>
</template>
