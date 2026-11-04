// The CPU and memory readout (src/components/UsageMenu.vue): two meters and a sparkline at the top left and a dropdown of the Mac, Lantern and the
// busiest sessions with their CPU and memory breakdowns, fed by the store's usage (the usage event), and gone when settings.systemStats is off.
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { expect, test, vi } from 'vitest';
import { tintFor } from '../src/scene/lanterns';
vi.mock('../src/scene/card', async orig => ({ ...await orig(), peekSession: vi.fn(), unpeekSession: vi.fn(), pinSession: vi.fn(), openSession: vi.fn() }));
import * as card from '../src/scene/card';
import UsageMenu from '../src/components/UsageMenu.vue';
import { useLanternStore } from '../src/stores/lantern';

const usage = { mac: { cpu: 41.6, used: 12288, total: 32768, pressure: 'warning' }, lantern: { cpu: 1.2, mem: 300, n: 4 },
  sessions: { a: { cpu: 0.4, mem: 900, n: 2 }, b: { cpu: 55.5, mem: 2048, n: 5, procs: [{ name: 'vitest', n: 3, cpu: 50, mem: 1500 }, { name: 'claude', n: 1, cpu: 5.5, mem: 500 }, { name: 'zsh', n: 1, cpu: 0, mem: 48 }] }, gone: { cpu: 0, mem: 0, n: 0 } } };

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

test('each metric has its own sparkline under its bar in the dropdown, which grows with each sample and stops at two minutes', async () => {
  const { w, store } = await mounted();
  const pts = k => w.findAll('#usage section')[k === 'cpu' ? 0 : 1].find('.spark polyline').attributes('points').split(' ').length;
  expect(w.find('#usageButton .spark').exists(), 'none on the HUD').toBe(false);
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

test('the dropdown has no x axis or y labels, only a line in a box on a fixed scale', async () => {
  const { w } = await mounted();
  expect(w.findAll('#usage .chart')).toHaveLength(2);
  expect(w.find('#usage .chart').text(), 'no labels').toBe('');
  expect(w.find('#usage .chart line').exists(), 'no midline').toBe(false);
  const y = k => +w.findAll('#usage section')[k].find('.spark polyline').attributes('points').split(',')[1];
  expect([y(0), y(1)]).toEqual([+(14 - 0.416 * 14).toFixed(1), +(14 - 0.375 * 14).toFixed(1)]); // the Mac's 41.6% CPU and 37.5% RAM against a 0 to 100 scale
  w.unmount();
});

test('a session row is a button that stands in for its moth; Lantern and everything else are not', async () => {
  const { w } = await mounted();
  const rows = w.findAll('#usage .krow');
  expect(rows.map(r => r.element.tagName)).toEqual(['BUTTON', 'DIV', 'BUTTON', 'DIV']); // busy, Lantern, quiet one, everything else
  await rows[0].trigger('pointerenter');
  expect(card.peekSession).toHaveBeenCalledWith('b');
  await rows[0].trigger('pointerleave');
  expect(card.unpeekSession).toHaveBeenCalledTimes(1);
  await rows[2].trigger('focus');
  expect(card.peekSession).toHaveBeenLastCalledWith('a');
  await rows[1].trigger('pointerenter'); // Lantern: highlight only
  expect(card.peekSession).toHaveBeenCalledTimes(2);
  w.unmount();
});

test('a click opens a session\'s processes under its row, in the dropdown, one row at a time; a double click and their buttons open the card or the session and close the dropdown', async () => {
  const { w } = await mounted();
  const hide = w.find('#usage').element.hidePopover = vi.fn();
  const key = () => [...w.find('#usage .key').element.children].map(el => el.classList.contains('sd') ? 'detail' : el.textContent.split(/\d/)[0]);
  const krow = name => w.findAll('#usage .krow').find(r => r.text().startsWith(name));
  await krow('busy').trigger('click');
  expect(key()).toEqual(['SessionCPUMEM', 'busy', 'detail', 'Lantern', 'quiet one', 'everything else']); // the heading row, then the open row's processes right under it
  expect(krow('busy').attributes('aria-expanded')).toBe('true');
  expect(w.findAll('#usage .proc').map(r => r.findAll('span').map(c => c.text()))).toEqual([['vitest', '×3', '25%', '1.5 GB'], ['claude', '', '3%', '0.5 GB'], ['zsh', '', '0%', '<0.1 GB']]);
  expect(w.findAll('#usage .acts button').map(b => b.text())).toEqual(['Open card', 'Go to session']);
  expect([card.pinSession, card.openSession, hide].map(f => f.mock.calls.length)).toEqual([0, 0, 0]); // no card held, the dropdown stays
  await krow('quiet one').trigger('click');
  expect(key()).toEqual(['SessionCPUMEM', 'busy', 'Lantern', 'quiet one', 'detail', 'everything else']); // another row: it opens and the first closes
  await krow('quiet one').trigger('click');
  expect(w.findAll('#usage .sd')).toHaveLength(0); // its second click closes it
  await krow('busy').trigger('click');
  await w.find('#usage .acts button').trigger('click');
  expect(card.pinSession).toHaveBeenLastCalledWith('b'); // Open card
  expect(hide).toHaveBeenCalledTimes(1);
  await w.findAll('#usage .acts button')[1].trigger('click');
  expect(card.openSession).toHaveBeenLastCalledWith('b', false); // Go to session
  expect(hide).toHaveBeenCalledTimes(2);
  await krow('quiet one').trigger('dblclick');
  expect(card.pinSession).toHaveBeenLastCalledWith('a'); // a double click: the card in full
  expect(hide).toHaveBeenCalledTimes(3);
  w.unmount();
});

test('hovering a segment or a row highlights that session in both bars and the key, and dims the rest', async () => {
  const { w } = await mounted();
  const hot = () => ({ segs: w.findAll('#usage .bar i').map(i => i.classes('hot')), rows: w.findAll('#usage .krow').map(r => r.classes('hot')), dim: w.find('#usage').classes('hl') });
  expect(hot()).toEqual({ segs: Array(8).fill(false), rows: Array(4).fill(false), dim: false });
  await w.findAll('#usage .bar')[1].findAll('i')[0].trigger('pointerenter'); // busy's RAM segment
  expect(hot()).toEqual({ segs: [true, false, false, false, true, false, false, false], rows: [true, false, false, false], dim: true }); // its CPU segment too, and its row
  await w.findAll('#usage .bar')[1].findAll('i')[0].trigger('pointerleave');
  expect(hot().dim).toBe(false);
  await w.findAll('#usage .krow')[3].trigger('pointerenter'); // everything else: highlight only
  expect(hot()).toEqual({ segs: [false, false, false, true, false, false, false, true], rows: [false, false, false, true], dim: true });
  w.unmount();
});
