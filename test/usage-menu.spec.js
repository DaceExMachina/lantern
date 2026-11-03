// The CPU and memory readout (src/components/UsageMenu.vue): two meters and a sparkline at the top left and a dropdown of the Mac, Lantern and the
// busiest sessions with their CPU and memory breakdowns, fed by the store's usage (the usage event), and gone when settings.systemStats is off.
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { expect, test } from 'vitest';
import { Q } from '../src/scene/scene';
import UsageMenu from '../src/components/UsageMenu.vue';
import { useLanternStore } from '../src/stores/lantern';

const usage = { mac: { cpu: 41.6, used: 12288, total: 32768, pressure: 'warning' }, lantern: { cpu: 1.2, mem: 300, n: 4 },
  sessions: { a: { cpu: 0.4, mem: 900, n: 2 }, b: { cpu: 55.5, mem: 2048, n: 5 }, gone: { cpu: 0, mem: 0, n: 0 } } };

const mounted = async (variant = 'a') => {
  Q.set('popup', variant);
  const pinia = createPinia(), store = useLanternStore(pinia);
  store.sessions = [{ id: 'a', title: 'quiet one', cwd: '/w/a' }, { id: 'b', title: '', cwd: '/w/busy' }];
  const w = mount(UsageMenu, { global: { plugins: [pinia] } });
  Q.delete('popup');
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
  expect(w.find('#usageButton').text()).toBe('42%12.0 GB'); // icons and numbers, no words, nothing of Lantern's own
  expect(w.find('#usageButton').classes()).toContain('warning'); // memory pressure
  expect(w.findAll('#usage .r:not(.head)').map(r => r.text())).toEqual(['This Mac42%12.0 GB', 'Lantern1%300 MB', 'busy56%2.0 GB', 'quiet one0%900 MB']); // the Mac, Lantern, then the busiest first; a session with no processes left out
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

test('every dropdown layout shows each row\'s CPU and RAM with bars sized by share and tooltips naming whose they are', async () => {
  for (const v of ['a', 'b', 'c', 'd']) {
    const { w } = await mounted(v);
    const text = w.find('#usage').text();
    for (const t of [...v === 'c' ? [] : ['This Mac'], 'Lantern', 'busy', 'quiet one', '56%', '2.0 GB', '900 MB']) expect(text, `${v}: ${t}`).toContain(t);
    expect(w.findAll('#usage [title]').map(e => e.attributes('title')).join('|'), v).toContain('busy · 56% CPU');
    w.unmount();
  }
  const { w } = await mounted('a');
  const widths = r => w.findAll('#usage .r')[r].findAll('u').map(u => u.element.style.width);
  expect(widths(3)).toEqual(['55.5%', '6.3%']); // busy: 55.5% of a core, 2048 of 32768 MB of RAM
  expect(widths(1)).toEqual(['41.6%', '37.5%']); // the Mac
  w.unmount();
});

test('the CPU and RAM switch re-ranks the sessions in layout c', async () => {
  const { w, store } = await mounted('c');
  store.usage = { ...usage, sessions: { ...usage.sessions, a: { cpu: 0.4, mem: 5000, n: 2 } } };
  await w.vm.$nextTick();
  const names = () => w.findAll('#usage .item .n').map(n => n.text());
  expect(names()).toEqual(['busy', 'Lantern', 'quiet one']); // by CPU
  await w.findAll('#usage .sort button')[1].trigger('click');
  expect(names()).toEqual(['quiet one', 'busy', 'Lantern']); // by RAM
  w.unmount();
});
