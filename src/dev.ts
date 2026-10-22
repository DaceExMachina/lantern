// The dev panel: preview and tuning controls, top left, opened with the backtick key (` ) or ?dev on load (wiring.ts wires
// both). Display overrides only: nothing here posts to the server or touches real sessions or settings.
// A feature adds a control with one line, wherever it lives, and gets back its value now (from the URL, else the default):
//   let smokeSpeed = devSlider('Temporary', 'smokespeed', 'smoke speed', 0, 3, 0.1, 1, 'How fast the smoke rises', v => { smokeSpeed = v; });
// Every value is kept in the URL as ?key=value (left out while it's the default) and applied live by its onChange.
// Sections show in the order they're first used; double-clicking a row puts it back to its default. This file is the
// registry and the open state; DevPanel.vue draws the rows.

import { ref } from 'vue';
import { Q } from './scene/scene';

// a control's value: a slider's number (null for a "live" default), a toggle's, or a select's option
export type Value = number | string | boolean | null;
export interface Control {
  kind: 'range' | 'checkbox' | 'select'; section: string; key: string; label: string; title: string; def: Value; onChange: (v: Value) => void;
  min?: number; max?: number; step?: number; options?: string[];
}
export type Row = Control | { kind: 'button'; section: string; label: string; title: string; onChange: () => void };
export const devRows: Row[] = [];
export const devValue = (key: string, def: Value): Value => {
  const v = Q.get(key);
  if (v === null) return def;
  return typeof def === 'boolean' ? v !== '0' && v !== 'false' : typeof def === 'string' ? v : v === '' ? def : +v;
};
const devControl = (row: Control) => { devRows.push(row); return devValue(row.key, row.def); };
// a slider with a null default reads null while it's left "live"
export const devSlider = <D extends number | null>(section: string, key: string, label: string, min: number, max: number, step: number, def: D, title: string, onChange: (v: number | D) => void) => {
  const v = devControl({ section, key, label, title, def, kind: 'range', min, max, step, onChange: v => onChange(typeof v === 'number' ? v : def) });
  return typeof v === 'number' ? v : def;
};
export const devToggle = (section: string, key: string, label: string, def: boolean, title: string, onChange: (v: boolean) => void) =>
  devControl({ section, key, label, title, def, kind: 'checkbox', onChange: v => onChange(v === true) }) === true;
export const devSelect = (section: string, key: string, label: string, options: string[], def: string, title: string, onChange: (v: string) => void) => {
  const v = devControl({ section, key, label, title, def, kind: 'select', options, onChange: v => onChange(String(v)) });
  return typeof v === 'string' ? v : def;
};
export const devButton = (section: string, label: string, title: string, action: () => void) => { devRows.push({ section, label, title, kind: 'button', onChange: action }); };

// the backtick opens and closes the panel, unless you're typing
export function devKey(e: KeyboardEvent) {
  const t = e.target, typing = t instanceof HTMLElement && (t.isContentEditable || t.matches('textarea, input:not([type=range], [type=checkbox])'));
  if (e.key === '`' && !e.metaKey && !e.ctrlKey && !e.altKey && !typing) toggleDevPanel();
}
// null until the first open: the panel (src/components/DevPanel.vue) isn't drawn before then, and stays drawn, hidden, after
export const devShown = ref<boolean | null>(null);
export const toggleDevPanel = () => { devShown.value = !devShown.value; };
