// How hard a session is working the Mac (src/scene/heat.ts): yellow, orange, red from cores of CPU averaged over 30 s and GB of RAM now,
// and where it shows: the end of a card's info line and a row of the usage dropdown (src/components/UsageMenu.vue).
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { expect, test } from 'vitest';
import { heatOf, heatTip, recordUsage } from '../src/scene/heat';
import UsageMenu from '../src/components/UsageMenu.vue';
import { useLanternStore } from '../src/stores/lantern';

const mac = { cpu: 10, used: 1000, total: 65536, pressure: 'normal' };
const usage = (cpu, mem, id = 's') => ({ mac, lantern: { cpu: 0, mem: 1, n: 1 }, sessions: { [id]: { cpu, mem, n: 2 } } });
const feed = (cpu, mem, times = 6, id = 's') => { for (let i = 0; i < times; i++) recordUsage(usage(cpu, mem, id)); return heatOf(id, usage(cpu, mem, id).sessions[id]); };

test('CPU turns yellow at 1 core, orange at 2 and red at 4, averaged over the last 30 s', () => {
  expect([feed(99, 0).cpu, feed(100, 0).cpu, feed(199, 0).cpu, feed(200, 0).cpu, feed(399, 0).cpu, feed(400, 0).cpu]).toEqual([0, 1, 1, 2, 2, 3]);
});

test('RAM turns yellow at 4 GB, orange at 8 and red at 16', () => {
  const gb = n => feed(0, n * 1024).mem;
  expect([gb(3.9), gb(4), gb(7.9), gb(8), gb(15.9), gb(16)]).toEqual([0, 1, 1, 2, 2, 3]);
});

test('a brief spike does not flash a colour, a sustained load does, and it cools off again', () => {
  feed(0, 0, 5);
  expect(feed(500, 0, 1).cpu, 'one 5-core sample among six: 0.8 cores on average').toBe(0);
  expect(feed(500, 0, 3).cpu, 'three of the last six: 2.5 cores').toBe(2);
  expect(feed(0, 0, 6).cpu, 'six quiet samples later').toBe(0);
  expect(heatOf('unseen', { cpu: 300, mem: 0, n: 1 }).cpu, 'a session with no history uses its one reading').toBe(2);
});

test('a session that is gone is forgotten, and the tooltip says why', () => {
  feed(300, 0, 6, 'gone');
  recordUsage(usage(0, 0, 'other'));
  expect(heatOf('gone', { cpu: 0, mem: 0, n: 1 }).cores, 'its history went with it').toBe(0);
  const h = feed(230, 12 * 1024);
  expect(heatTip(h, { cpu: 230, mem: 12 * 1024, n: 1 })).toEqual({ cpu: 'high CPU: about 2.3 cores for the last 30 s', mem: 'high RAM: 12.0 GB' });
  expect(heatTip(feed(0, 0), { cpu: 0, mem: 0, n: 1 })).toEqual({ cpu: '', mem: '' });
});

test('the dropdown colours a hot session\'s numbers, and Lantern\'s row follows the same rule', async () => {
  const pinia = createPinia(), store = useLanternStore(pinia);
  store.sessions = [{ id: 's', title: 'hot one', cwd: '/w/hot' }];
  const w = mount(UsageMenu, { global: { plugins: [pinia] } });
  const u = { mac, lantern: { cpu: 600, mem: 20 * 1024, n: 1 }, sessions: { s: { cpu: 210, mem: 5 * 1024, n: 2 } } };
  for (let i = 0; i < 3; i++) recordUsage({ ...u, lantern: { ...u.lantern, cpu: 0 } });
  for (let i = 0; i < 3; i++) recordUsage(u);
  store.usage = u;
  await w.vm.$nextTick();
  const row = name => w.findAll('#usage .krow').find(r => r.find('.n').text() === name);
  const hot = name => row(name).findAll('span').filter(s => /\bhot/.test(s.classes().join(' '))).map(s => s.classes().find(c => c.startsWith('hot')));
  expect(hot('hot one')).toEqual(['hot2', 'hot1']); // 2.1 cores, 5 GB
  expect(hot('Lantern')).toEqual(['hot2', 'hot3']); // 3 cores averaged over its last six samples (not the 6 of the latest one), 20 GB
  expect(row('hot one').find('.hot2').attributes('title')).toBe('high CPU: about 2.1 cores for the last 30 s');
  expect(hot('everything else')).toEqual(['hot0', 'hot0']);
  w.unmount();
});
