// The dev panel: preview and tuning controls, top left, opened with the backtick key (` ) or ?dev on load (wiring.js wires
// both). Display overrides only: nothing here posts to the server or touches real sessions or settings.
// A feature adds a control with one line, wherever it lives, and gets back its value now (from the URL, else the default):
//   let smokeSpeed = devSlider('Temporary', 'smokespeed', 'smoke speed', 0, 3, 0.1, 1, 'How fast the smoke rises', v => { smokeSpeed = v; });
// Every value is kept in the URL as ?key=value (left out while it's the default) and applied live by its onChange.
// Sections show in the order they're first used; double-clicking a row puts it back to its default.

import { Q } from './scene/scene.js';

const devRows = [];
let devPanel = null;
const devValue = (key, def) => {
  if (!Q.has(key)) return def;
  const v = Q.get(key);
  return typeof def === 'boolean' ? v !== '0' && v !== 'false' : typeof def === 'string' ? v : v === '' ? def : +v;
};
const devControl = (row, onChange) => { devRows.push({ ...row, onChange }); return devValue(row.key, row.def); };
/** @returns {any} */
export const devSlider = (section, key, label, min, max, step, def, title, onChange) => devControl({ section, key, label, title, def, kind: 'range', min, max, step }, onChange);
/** @returns {any} */
export const devToggle = (section, key, label, def, title, onChange) => devControl({ section, key, label, title, def, kind: 'checkbox' }, onChange);
/** @returns {any} */
export const devSelect = (section, key, label, options, def, title, onChange) => devControl({ section, key, label, title, def, kind: 'select', options }, onChange);
export const devButton = (section, label, title, action) => { devRows.push({ section, label, title, kind: 'button', onChange: action }); };

// the backtick opens and closes the panel, unless you're typing
export function devKey(/** @type {KeyboardEvent} */ e) {
  const t = /** @type {HTMLElement} */ (e.target);
  if (e.key === '`' && !e.metaKey && !e.ctrlKey && !e.altKey && !t.isContentEditable && !t.matches?.('textarea, input:not([type=range], [type=checkbox])')) toggleDevPanel();
}
export function toggleDevPanel() {
  if (devPanel) { devPanel.hidden = !devPanel.hidden; return; }
  devPanel = document.createElement('div');
  devPanel.style.cssText = 'position: fixed; top: var(--space-3); left: var(--space-3); z-index: var(--z-overlay); width: 260px; max-height: calc(100vh - 24px); overflow-y: auto;'
    + 'box-sizing: border-box; padding: var(--space-1) 14px var(--space-2); background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg);'
    + 'color: var(--ink); font: var(--text-sm)/1.5 var(--font-serif); box-shadow: var(--shadow-lg)';
  const sections = new Map();
  for (const r of devRows) {
    if (!sections.has(r.section)) {
      const d = document.createElement('details'), s = document.createElement('summary');
      d.open = true; s.textContent = r.section; s.style.cssText = 'padding: var(--space-1-5) 0 var(--space-0-5); cursor: pointer; color: var(--accent-violet)';
      d.append(s); devPanel.append(d); sections.set(r.section, d);
    }
    // each row is one label: its click area the row's full width and height, meeting the next row's
    const row = document.createElement('label');
    row.style.cssText = 'display: flex; align-items: center; gap: var(--space-2); padding: 5px 0; cursor: pointer';
    row.title = r.title;
    sections.get(r.section).append(row);
    if (r.kind === 'button') {
      const b = document.createElement('button');
      b.textContent = r.label; b.style.cssText = 'all: unset; flex: 1; color: var(--accent-violet)'; b.onclick = r.onChange;
      row.append(b); continue;
    }
    const input = /** @type {HTMLInputElement} */ (document.createElement(r.kind === 'select' ? 'select' : 'input')); // a select's value works the same
    if (r.kind !== 'select') input.type = r.kind;
    const shown = document.createElement('span'); // a slider's value, after it ("live" while it's a null default)
    const read = () => r.kind === 'checkbox' ? input.checked : r.kind === 'range' ? +input.value : input.value;
    const show = v => {
      if (r.kind === 'checkbox') input.checked = v; else input.value = v ?? r.max;
      shown.textContent = v ?? 'live';
    };
    const set = v => {
      const q = new URLSearchParams(location.search);
      if (v === r.def) q.delete(r.key); else q.set(r.key, v === true ? '1' : String(v));
      history.replaceState(null, '', `${location.pathname}${q.size ? `?${q}`.replace(/=(?=&|$)/g, '') : ''}`); // ?dev stays ?dev
      show(v); r.onChange?.(v);
    };
    if (r.kind === 'select') for (const o of r.options) input.append(new Option(o));
    input.oninput = () => set(read());
    row.ondblclick = () => set(r.def);
    if (r.kind === 'range') {
      Object.assign(input, { min: r.min, max: r.max, step: r.step }); input.style.flex = '1';
      shown.style.cssText = 'min-width: 2.4em; text-align: right; font-variant-numeric: tabular-nums';
      row.append(r.label, input, shown);
    } else if (r.kind === 'select') { input.style.flex = '1'; row.append(r.label, input); } else row.append(input, r.label);
    show(devValue(r.key, r.def));
  }
  document.body.append(devPanel);
}
