// The CPU and memory readout (src/components/UsageMenu.vue): two meters and a sparkline at the top left and a dropdown of the Mac, Lantern and the
// busiest sessions with their CPU and memory breakdowns, fed by the store's usage (the usage event), and gone when settings.systemStats is off.
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { expect, test } from 'vitest';
import UsageMenu from '../src/components/UsageMenu.vue';
import { useLanternStore } from '../src/stores/lantern';

const usage = { mac: { cpu: 41.6, used: 12288, total: 32768, pressure: 'warning' }, lantern: { cpu: 1.2, mem: 300, n: 4 },
  sessions: { a: { cpu: 0.4, mem: 900, n: 2 }, b: { cpu: 55.5, mem: 2048, n: 5 }, gone: { cpu: 0, mem: 0, n: 0 } } };

const mounted = async () => {
  const pinia = createPinia(), store = useLanternStore(pinia);
  store.sessions = [{ id: 'a', title: 'quiet one', cwd: '/w/a' }, { id: 'b', title: '', cwd: '/w/busy' }];
  const w = mount(UsageMenu, { global: { plugins: [pinia] } });
  store.usage = usage;
  await w.vm.$nextTick();
  return { w, store };
};

test('it shows nothing until a sample comes, then the Mac meters (no Lantern) and the busiest sessions by name; the setting turns it off', async () => {
  const pinia = createPinia(), store = useLanternStore(pinia);
  store.sessions = [{ id: 'a', title: 'quiet one', cwd: '/w/a' }, { id: 'b', title: '', cwd: '/w/busy' }];
  const w = mount(UsageMenu, { global: { plugins: [pinia] } });
  expect(w.find('#usageButton').exists()).toBe(false);
  store.usage = usage;
  await w.vm.$nextTick();
  expect(w.find('#usageButton').text()).toBe('42%CPU12.0 GBMemory'); // icons first, with a small label under each number, and nothing of Lantern's own
  expect(w.find('#usageButton').classes()).toContain('warning'); // memory pressure
  expect(w.findAll('#usage .row').map(r => r.text())).toEqual(['42%12.0 GB of 32.0 GB', '4 processes1%300 MB', 'busy56%2.0 GB', 'quiet one0%900 MB']); // busiest first, a session with no processes left out
  store.settings = { ...store.settings, systemStats: false };
  await w.vm.$nextTick();
  expect(w.find('#usageButton').exists()).toBe(false);
  w.unmount();
});

test('the rings fill to the Mac\'s CPU and memory, and the dropdown splits each across Lantern and the sessions', async () => {
  const { w } = await mounted();
  expect(w.findAll('#usageButton .arc').map(a => a.attributes('stroke-dasharray'))).toEqual(['41.6 100', '37.5 100']); // 41.6% CPU, 12288 of 32768 MB
  const [cpu, mem] = w.findAll('#usage .stack').map(s => s.findAll('span i').map(i => parseFloat(i.element.style.flex)));
  expect(cpu).toHaveLength(4); // Lantern, two sessions, the rest
  expect(cpu[0]).toBeCloseTo(1.2 / 57.1 * 100, 0); // Lantern's share of the CPU in use
  expect(cpu[1]).toBeCloseTo(55.5 / 57.1 * 100, 0); // busy leads the sessions
  expect(mem.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0); // memory fills the bar: the last piece is whatever the Mac uses beyond them
  expect(mem[3]).toBeCloseTo((12288 - 300 - 2048 - 900) / 12288 * 100, 0);
  expect(w.findAll('#usage .row')[2].findAll('.cell i').map(i => i.element.style.width)).toEqual(['97.2%', '16.7%']); // busy's CPU and memory bars
  expect(w.findAll('#usage .row')[2].findAll('.cell i').map(i => i.attributes('title'))).toEqual(['busy · 56% CPU', 'busy · 2.0 GB']); // each bar and segment says whose it is
  expect(w.findAll('#usage .stack')[1].findAll('span i')[1].attributes('title')).toBe('busy · 2.0 GB');
  w.unmount();
});

test('the sparkline grows with each sample and stops at two minutes', async () => {
  const { w, store } = await mounted();
  const pts = () => w.find('#usageButton .spark .c').attributes('points').split(' ').length;
  expect(pts()).toBe(1);
  for (let i = 0; i < 40; i++) { store.usage = { ...usage, mac: { ...usage.mac, cpu: i } }; await w.vm.$nextTick(); }
  expect(pts()).toBe(24);
  w.unmount();
});
