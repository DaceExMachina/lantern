// The CPU and memory readout (src/components/UsageMenu.vue): two meters and a sparkline at the top left and a dropdown of the Mac, Lantern and the
// busiest sessions with their CPU and memory breakdowns, fed by the store's usage (the usage event), and gone when settings.systemStats is off.
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { expect, test } from 'vitest';
import { tintFor } from '../src/scene/lanterns';
import UsageMenu from '../src/components/UsageMenu.vue';
import { useLanternStore } from '../src/stores/lantern';

const usage = { mac: { cpu: 41.6, used: 12288, total: 32768, pressure: 'warning' }, lantern: { cpu: 1.2, mem: 300, n: 4 },
  sessions: { a: { cpu: 0.4, mem: 900, n: 2 }, b: { cpu: 55.5, mem: 2048, n: 5 }, gone: { cpu: 0, mem: 0, n: 0 } } };

Object.defineProperty(navigator, 'hardwareConcurrency', { value: 2, configurable: true }); // a session's CPU is of one core, the dropdown's percents of the Mac's two

const mounted = async () => {
  const pinia = createPinia(), store = useLanternStore(pinia);
  store.sessions = [{ id: 'a', title: 'quiet one', cwd: '/w/a' }, { id: 'b', title: '', cwd: '/w/busy' }];
  const w = mount(UsageMenu, { global: { plugins: [pinia] } });
  store.usage = usage;
  await w.vm.$nextTick();
  return { w, store };
};
const widths = el => [...el.querySelectorAll('i')].map(i => parseFloat(i.style.width));

test('it shows nothing until a sample comes, then the Mac meters (no Lantern) and the key by name; the setting turns it off', async () => {
  const pinia = createPinia(), store = useLanternStore(pinia);
  store.sessions = [{ id: 'a', title: 'quiet one', cwd: '/w/a' }, { id: 'b', title: '', cwd: '/w/busy' }];
  const w = mount(UsageMenu, { global: { plugins: [pinia] } });
  expect(w.find('#usageButton').exists()).toBe(false);
  store.usage = usage;
  await w.vm.$nextTick();
  expect(w.find('#usageButton').text()).toBe('42%12.0 GB'); // icons and numbers, no words, nothing of Lantern's own
  expect(w.find('#usageButton').classes()).toContain('warning'); // memory pressure
  expect(w.findAll('#usage .big').map(b => b.text())).toEqual(['42%of the Mac', '12.0of 32 GB']);
  expect(w.findAll('#usage .kh span').map(s => s.text())).toEqual(['Session', 'CPU', 'MEM']);
  expect(w.findAll('#usage .krow').map(r => r.text())).toEqual(['busy28%2.0 GB', 'Lantern1%300 MB', 'quiet one0%900 MB', 'everything else13%8.8 GB']); // busiest first, Lantern among them, a session with no processes left out, then the rest of the Mac
  store.settings = { ...store.settings, systemStats: false };
  await w.vm.$nextTick();
  expect(w.find('#usageButton').exists()).toBe(false);
  w.unmount();
});

test('the rings fill to the Mac\'s CPU and RAM, and say so when hovered', async () => {
  const { w } = await mounted();
  expect(w.findAll('#usageButton .arc').map(a => a.attributes('stroke-dasharray'))).toEqual(['41.6 100', '37.5 100']); // 41.6% CPU, 12288 of 32768 MB
  expect(w.findAll('#usageButton .meter').map(m => m.attributes('title'))).toEqual(['CPU 42%', 'RAM 12.0 GB of 32.0 GB, pressure warning']);
  w.unmount();
});

test('each metric has its own sparkline, which grows with each sample and stops at two minutes', async () => {
  const { w, store } = await mounted();
  const pts = k => w.find(`#usageButton .${k} .spark polyline`).attributes('points').split(' ').length;
  expect([pts('cpu'), pts('mem')]).toEqual([1, 1]);
  for (let i = 0; i < 40; i++) { store.usage = { ...usage, mac: { ...usage.mac, cpu: i } }; await w.vm.$nextTick(); }
  expect([pts('cpu'), pts('mem')]).toEqual([24, 24]);
  w.unmount();
});

test('the split bars give each listed row its share of the Mac and the rest to everything else, and the key\'s bars use the same scale', async () => {
  const { w, store } = await mounted();
  const [cpu, mem] = w.findAll('#usage section .bar').map(b => widths(b.element));
  expect(cpu.map(n => +n.toFixed(2))).toEqual([27.75, 0.6, 0.2, 13.05]); // busy, Lantern, quiet one (percent of the Mac's two cores), everything else
  expect(cpu.reduce((a, b) => a + b, 0)).toBeCloseTo(41.6, 1); // together they are the Mac's own CPU
  expect(mem.map(n => +n.toFixed(2))).toEqual([6.25, 0.92, 2.75, 27.59]); // of 32768 MB; the last is 12288 - 300 - 2048 - 900
  expect(mem.reduce((a, b) => a + b, 0)).toBeCloseTo(37.5, 1);
  expect(w.findAll('#usage .krow').map(r => parseFloat(r.find('.track i').element.style.width))).toEqual(cpu); // a row's bar is its CPU segment
  expect(w.findAll('#usage .bar')[0].findAll('i').map(i => i.attributes('title'))).toEqual(['busy · 28% CPU', 'Lantern · 1% CPU', 'quiet one · 0% CPU', 'everything else · 13% CPU']);
  expect(w.findAll('#usage .bar')[1].findAll('i')[0].attributes('title')).toBe('busy · 2.0 GB RAM');
  // a session's swatch is its moth's tint, which is also the colour of its segment and its row bar, and stays put when the ranking changes
  const tint = s => { const el = document.createElement('div'); el.style.background = tintFor(s); return el.style.background; }; // as the browser spells it
  const colours = () => Object.fromEntries(w.findAll('#usage .krow').map(r => [r.find('.n').text(), r.find('.sw').element.style.background]));
  const before = colours();
  expect(before.busy).toBe(tint({ id: 'b', cwd: '/w/busy' }));
  expect(before['quiet one']).toBe(tint({ id: 'a', cwd: '/w/a' }));
  expect(w.findAll('#usage .bar')[0].findAll('i')[0].element.style.background, 'its segment too').toBe(before.busy);
  expect(w.findAll('#usage .krow')[0].find('.track i').element.style.background, 'and its row bar').toBe(before.busy);
  store.usage = { ...usage, sessions: { ...usage.sessions, a: { cpu: 90, mem: 900, n: 2 } } }; // quiet one now leads
  await w.vm.$nextTick();
  expect(w.findAll('#usage .krow .n')[0].text()).toBe('quiet one');
  expect(colours()).toEqual(before);
  w.unmount();
});
