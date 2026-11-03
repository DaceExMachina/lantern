// The CPU and memory readout (src/components/UsageMenu.vue): a line at the top left and a dropdown of the Mac, Lantern and the
// busiest sessions, fed by the store's usage (the usage event), and gone when settings.systemStats is off.
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { expect, test } from 'vitest';
import UsageMenu from '../src/components/UsageMenu.vue';
import { useLanternStore } from '../src/stores/lantern';

const usage = { mac: { cpu: 41.6, used: 12288, total: 32768, pressure: 'warning' }, lantern: { cpu: 1.2, mem: 300, n: 4 },
  sessions: { a: { cpu: 0.4, mem: 900, n: 2 }, b: { cpu: 55.5, mem: 2048, n: 5 }, gone: { cpu: 0, mem: 0, n: 0 } } };

test('it shows nothing until a sample comes, then the Mac, Lantern and the busiest sessions by name; the setting turns it off', async () => {
  const pinia = createPinia(), store = useLanternStore(pinia);
  store.sessions = [{ id: 'a', title: 'quiet one', cwd: '/w/a' }, { id: 'b', title: '', cwd: '/w/busy' }];
  const w = mount(UsageMenu, { global: { plugins: [pinia] } });
  expect(w.find('#usageButton').exists()).toBe(false);
  store.usage = usage;
  await w.vm.$nextTick();
  expect(w.find('#usageButton').text()).toBe('Mac 42% · 12.0 GB · Lantern 300 MB');
  expect(w.find('#usageButton').classes()).toContain('warning'); // memory pressure
  expect(w.findAll('#usage .row').map(r => r.text())).toEqual(['42% CPU12.0 GB of 32.0 GB', '4 processes1% CPU · 300 MB', 'busy56% CPU · 2.0 GB', 'quiet one0% CPU · 900 MB']); // busiest first, a session with no processes left out
  store.settings = { ...store.settings, systemStats: false };
  await w.vm.$nextTick();
  expect(w.find('#usageButton').exists()).toBe(false);
  w.unmount();
});
