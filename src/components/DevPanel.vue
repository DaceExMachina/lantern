<script setup lang="ts">
// The dev panel's rows (src/dev.ts is the registry they come from), top left, in the order their sections were first used.
// A control's value lives in the URL as ?key=value (left out at its default) and goes to its onChange; double-click resets it.
import { computed, reactive } from 'vue';
import { devRows, devShown, devValue, type Control, type Row, type Value } from '../dev';

const values = reactive<Record<string, Value>>(Object.fromEntries(devRows.flatMap(r => r.kind === 'button' ? [] : [[r.key, devValue(r.key, r.def)]])));
const sections = computed(() => {
  const m = new Map<string, Row[]>();
  for (const r of devRows) m.set(r.section, [...m.get(r.section) ?? [], r]);
  return m;
});

const set = (r: Control, v: Value) => {
  const q = new URLSearchParams(location.search);
  if (v === r.def) q.delete(r.key); else q.set(r.key, v === true ? '1' : String(v));
  history.replaceState(null, '', `${location.pathname}${q.size ? `?${q}`.replace(/=(?=&|$)/g, '') : ''}`); // ?dev stays ?dev
  values[r.key] = v;
  r.onChange(v);
};
const read = (r: Control, e: Event) => {
  const t = e.target;
  return t instanceof HTMLInputElement ? (r.kind === 'checkbox' ? t.checked : +t.value) : t instanceof HTMLSelectElement ? t.value : r.def;
};
</script>

<template>
  <div v-if="devShown !== null" v-show="devShown" class="dev">
    <details v-for="[name, rows] in sections" :key="name" open>
      <summary>{{ name }}</summary>
      <template v-for="(r, i) in rows" :key="i">
        <label v-if="r.kind === 'button'" :title="r.title"><button @click="r.onChange">{{ r.label }}</button></label>
        <label v-else-if="r.kind === 'checkbox'" :title="r.title" @dblclick="set(r, r.def)">
          <input type="checkbox" :checked="values[r.key] === true" @input="set(r, read(r, $event))">{{ r.label }}
        </label>
        <label v-else-if="r.kind === 'range'" :title="r.title" @dblclick="set(r, r.def)">
          {{ r.label }}<input type="range" :min="r.min" :max="r.max" :step="r.step" :value="values[r.key] ?? r.max" @input="set(r, read(r, $event))"><span class="shown">{{ values[r.key] ?? 'live' }}</span>
        </label>
        <label v-else :title="r.title" @dblclick="set(r, r.def)">
          {{ r.label }}<select :value="values[r.key]" @input="set(r, read(r, $event))"><option v-for="o in r.options" :key="o">{{ o }}</option></select>
        </label>
      </template>
    </details>
  </div>
</template>

<style scoped>
.dev { position: fixed; top: var(--space-3); left: var(--space-3); z-index: var(--z-overlay); width: 260px; max-height: calc(100vh - 24px); overflow-y: auto;
  box-sizing: border-box; padding: var(--space-1) 14px var(--space-2); background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg);
  color: var(--ink); font: var(--text-sm)/1.5 var(--font-serif); box-shadow: var(--shadow-lg); }
summary { padding: var(--space-1-5) 0 var(--space-0-5); cursor: pointer; color: var(--accent-violet); }
/* each row is one label: its click area the row's full width and height, meeting the next row's */
label { display: flex; align-items: center; gap: var(--space-2); padding: 5px 0; cursor: pointer; }
input[type=range], select { flex: 1; }
button { all: unset; flex: 1; color: var(--accent-violet); }
.shown { min-width: 2.4em; text-align: right; font-variant-numeric: tabular-nums; }
</style>
