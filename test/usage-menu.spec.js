// The CPU and memory readout (src/components/UsageMenu.vue): two meters and a sparkline at the top left and a dropdown of the Mac, Lantern and the
// busiest sessions with their CPU and memory breakdowns, fed by the store's usage (the usage event), and gone when settings.systemStats is off.
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { beforeEach, expect, test, vi } from 'vitest';

beforeEach(() => localStorage.removeItem('lantern-usage-sort')); // the sort pick is kept per viewer, so no test inherits another's
import { tintFor } from '../src/scene/lanterns';
vi.mock('../src/scene/card', async orig => ({ ...await orig(), peekSession: vi.fn(), unpeekSession: vi.fn(), pinSession: vi.fn(), openSession: vi.fn() }));
import * as card from '../src/scene/card';
import UsageMenu from '../src/components/UsageMenu.vue';
import { useLanternStore } from '../src/stores/lantern';

const usage = { mac: { cpu: 41.6, used: 12288, total: 32768, pressure: 'warning' }, lantern: { cpu: 1.2, mem: 300, n: 4, procs: [{ name: 'WebKit GPU', n: 1, cpu: 1, mem: 150 }, { name: 'Lantern', n: 3, cpu: 0.2, mem: 200 }] },
  sessions: { a: { cpu: 0.4, mem: 900, n: 2 }, b: { cpu: 55.5, mem: 2048, n: 5, procs: [{ name: 'vitest', n: 3, cpu: 50, mem: 1500 }, { name: 'claude', n: 1, cpu: 5.5, mem: 500 }, { name: 'zsh', n: 1, cpu: 0, mem: 48 }] }, gone: { cpu: 0, mem: 0, n: 0 } },
  else: { cpu: 20, mem: 8000, n: 300, procs: [{ name: 'Docker', n: 1, cpu: 0, mem: 5000 }, { name: 'Slack Helper', n: 4, cpu: 12, mem: 2500 }, { name: 'other', n: 296, cpu: 8, mem: 460 }, { name: 'kernel_task', n: 1, cpu: 0, mem: 40 }] } };

Object.defineProperty(navigator, 'hardwareConcurrency', { value: 2, configurable: true }); // a session's CPU is of one core, the dropdown's percents of the Mac's two

const mounted = async (u = usage) => {
  const pinia = createPinia(), store = useLanternStore(pinia);
  store.sessions = [{ id: 'a', title: 'quiet one', cwd: '/w/a' }, { id: 'b', title: '', cwd: '/w/busy' }];
  const w = mount(UsageMenu, { global: { plugins: [pinia] } });
  store.usage = u;
  await w.vm.$nextTick();
  return { w, store };
};
const widths = el => [...el.children].map(i => parseFloat(i.style.width));

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
  expect(w.findAll('#usage .kh > *').map(s => s.text())).toEqual(['Session', 'CPU', 'MEM']);
  expect(w.findAll('#usage .krow').map(r => r.text())).toEqual(['busy28%2.0 GB', 'quiet one0%0.9 GB', 'everything else13%8.8 GB', 'Lantern1%0.3 GB']); // in GB, as the processes are; busiest first, a session with no processes left out, then the rest of the Mac, then Lantern's own use apart
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
  expect(cpu.map(n => +n.toFixed(2))).toEqual([27.75, 0.2, 13.05, 0.6]); // busy, quiet one (percent of the Mac's two cores), everything else, Lantern
  expect(cpu.reduce((a, b) => a + b, 0)).toBeCloseTo(41.6, 1); // together they are the Mac's own CPU
  expect(mem.map(n => +n.toFixed(2))).toEqual([6.25, 2.75, 27.59, 0.92]); // of 32768 MB; the third is 12288 - 300 - 2048 - 900
  expect(mem.reduce((a, b) => a + b, 0)).toBeCloseTo(37.5, 1);
  const track = k => w.findAll('#usage .krow').map(r => parseFloat(r.findAll('.track i')[k].element.style.width));
  expect(track(0)).toEqual(cpu); // a row's first bar is its CPU segment
  expect(track(1)).toEqual(mem); // and its second its RAM segment
  expect(w.findAll('#usage .bar')[0].findAll(':scope > *').map(i => i.attributes('title'))).toEqual(['busy · 28% CPU', 'quiet one · 0% CPU', 'everything else · 13% CPU', 'Lantern · 1% CPU']);
  expect(w.findAll('#usage .bar')[1].findAll(':scope > *')[0].attributes('title')).toBe('busy · 2.0 GB RAM');
  // a session's swatch is its moth's tint, which is also the colour of its segment and its row bar, and stays put when the ranking changes
  const tint = s => { const el = document.createElement('div'); el.style.background = tintFor(s); return el.style.background; }; // as the browser spells it
  const colours = () => Object.fromEntries(w.findAll('#usage .krow').map(r => [r.find('.n').text(), r.find('.sw').element.style.background]));
  const before = colours();
  expect(before.busy).toBe(tint({ id: 'b', cwd: '/w/busy' }));
  expect(before['quiet one']).toBe(tint({ id: 'a', cwd: '/w/a' }));
  expect(w.findAll('#usage .bar')[0].findAll(':scope > *')[0].element.style.background, 'its segment too').toBe(before.busy);
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

test('a session row is a button that stands in for its moth; Lantern and everything else are buttons too, but highlight only', async () => {
  const { w } = await mounted();
  const rows = w.findAll('#usage .krow');
  expect(rows.map(r => r.element.tagName)).toEqual(['BUTTON', 'BUTTON', 'BUTTON', 'BUTTON']); // busy, quiet one, everything else, Lantern (whose processes open, but there's no card)
  await rows[0].trigger('pointerenter');
  expect(card.peekSession).toHaveBeenCalledWith('b');
  await rows[0].trigger('pointerleave');
  expect(card.unpeekSession).toHaveBeenCalledTimes(1);
  await rows[1].trigger('focus');
  expect(card.peekSession).toHaveBeenLastCalledWith('a');
  await rows[2].trigger('pointerenter'); await rows[3].trigger('pointerenter'); // everything else, Lantern: highlight only
  expect(card.peekSession).toHaveBeenCalledTimes(2);
  w.unmount();
});

test('a click opens a session\'s processes under its row, in the dropdown, one row at a time; a double click and their buttons open the card or the session and close the dropdown', async () => {
  const { w } = await mounted();
  const hide = w.find('#usage').element.hidePopover = vi.fn();
  const key = () => [...w.find('#usage .key').element.children].map(el => el.classList.contains('sd') ? 'detail' : el.textContent.split(/\d/)[0]);
  const krow = name => w.findAll('#usage .krow').find(r => r.text().startsWith(name));
  await krow('busy').trigger('click');
  expect(key()).toEqual(['SessionCPUMEM', 'busy', 'detail', 'quiet one', 'everything else', '', 'Lantern']); // the heading row, then the open row's processes right under it
  expect(krow('busy').attributes('aria-expanded')).toBe('true');
  expect(w.findAll('#usage .proc').map(r => r.findAll('span').map(c => c.text()))).toEqual([['vitest', '×3', '25%', '1.5 GB'], ['claude', '', '3%', '0.5 GB'], ['zsh', '', '0%', '<0.1 GB']]);
  expect(w.findAll('#usage .acts button').map(b => b.text())).toEqual(['Open card', 'Go to session']);
  expect([card.pinSession, card.openSession, hide].map(f => f.mock.calls.length)).toEqual([0, 0, 0]); // no card held, the dropdown stays
  await krow('quiet one').trigger('click');
  expect(key()).toEqual(['SessionCPUMEM', 'busy', 'quiet one', 'detail', 'everything else', '', 'Lantern']); // another row: it opens and the first closes
  await krow('quiet one').trigger('click');
  expect(w.findAll('#usage .sd')).toHaveLength(0); // its second click closes it
  await krow('busy').trigger('click');
  await w.find('#usage .acts button').trigger('click');
  expect(card.pinSession).toHaveBeenLastCalledWith('b'); // Open card
  expect(hide).toHaveBeenCalledTimes(1);
  await w.findAll('#usage .acts button')[1].trigger('click');
  expect(card.openSession).toHaveBeenLastCalledWith('b', false); // Go to session
  expect(hide).toHaveBeenCalledTimes(2);
  // hovering the open row's processes (busy's, still open) counts as hovering its row: the moth's card stays up, and goes once the pointer leaves them
  card.peekSession.mockClear(); card.unpeekSession.mockClear();
  await krow('busy').trigger('pointerenter'); await krow('busy').trigger('pointerleave');
  await w.find('#usage .sd').trigger('pointerenter');
  expect(card.peekSession).toHaveBeenLastCalledWith('b'); // back on the card it just left
  expect(card.peekSession).toHaveBeenCalledTimes(2);
  await w.find('#usage .sd').trigger('pointerleave');
  expect(card.unpeekSession).toHaveBeenCalledTimes(2);
  await krow('busy').trigger('click');
  await krow('quiet one').trigger('dblclick');
  expect(card.pinSession).toHaveBeenLastCalledWith('a'); // a double click: the card in full
  expect(hide).toHaveBeenCalledTimes(3);
  w.unmount();
});

test('each row has a CPU bar with a RAM bar right under it, scaled like the Mac\'s own bars; Lantern\'s own use sits last under a rule, marked with a ring, not a swatch', async () => {
  const { w } = await mounted();
  const row = name => w.findAll('#usage .krow').find(r => r.text().startsWith(name));
  const bars = r => r.findAll('.tracks .track i').map(i => [parseFloat(i.element.style.width), i.element.style.background]);
  const busy = bars(row('busy'));
  expect(busy.map(b => b[0])).toEqual([27.75, 2048 / 32768 * 100]); // CPU of the Mac (55.5% of one of two cores), then RAM of its total
  expect(busy.map(b => b[1])).toEqual([tintFor({ id: 'b', cwd: '/w/busy' }), tintFor({ id: 'b', cwd: '/w/busy' })]); // both in the session's colour, as in the Mac's bars
  expect(w.findAll('#usage .krow').map(r => r.findAll('.tracks .track').length)).toEqual([2, 2, 2, 2]);
  const key = [...w.find('#usage .key').element.children];
  expect(key.slice(-2).map(e => e.tagName)).toEqual(['HR', 'BUTTON']); // the rule, then Lantern
  expect(row('Lantern').find('.sw').classes()).toContain('app');
  expect(w.findAll('#usage .krow .sw').filter(s => s.classes('app'))).toHaveLength(1);
  w.unmount();
});

test('Lantern\'s row opens its processes like a session\'s, with no card to open and no peeking at a moth', async () => {
  const { w } = await mounted();
  card.peekSession.mockClear();
  const row = () => w.findAll('#usage .krow').find(r => r.text().startsWith('Lantern'));
  await row().trigger('pointerenter');
  await row().trigger('click');
  expect(row().attributes('aria-expanded')).toBe('true');
  expect(w.findAll('#usage .proc').map(r => r.findAll('span').map(c => c.text()))).toEqual([['WebKit GPU', '', '1%', '0.1 GB'], ['Lantern', '×3', '0%', '0.2 GB']]);
  expect(w.findAll('#usage .acts')).toHaveLength(0);
  expect(card.peekSession).not.toHaveBeenCalled();
  await row().trigger('dblclick');
  expect(card.pinSession).not.toHaveBeenCalled();
  w.unmount();
});

test('everything else opens its processes like Lantern\'s, with no card to open and no peeking at a moth', async () => {
  const { w } = await mounted();
  card.peekSession.mockClear(); card.pinSession.mockClear();
  const row = () => w.findAll('#usage .krow').find(r => r.text().startsWith('everything else'));
  await row().trigger('pointerenter');
  await row().trigger('click');
  expect(row().attributes('aria-expanded')).toBe('true');
  expect(w.findAll('#usage .proc').map(r => r.findAll('span').map(c => c.text()))).toEqual([['Slack Helper', '×4', '6%', '2.4 GB'], ['macOS', '', '3%', '1.0 GB'], ['Docker', '', '0%', '4.9 GB'], ['kernel_task', '', '0%', '<0.1 GB'], ['other', '×296', '4%', '0.4 GB']]); // CPU as shown, the gap to the header (macOS) sorted in with them, "other" last
  expect(w.find('#usage .sd .head').text()).toBe('Processes300');
  const heat = name => w.findAll('#usage .proc').find(r => r.text().startsWith(name)).findAll('span').flatMap(c => c.classes());
  expect(heat('Docker')).toContain('hot1'); // 4.9 GB is yellow (so the colours work here)...
  expect(heat('other').filter(c => c.startsWith('hot') && c !== 'hot0')).toEqual([]); // ...but "other", many small things, never gets one
  expect(heat('macOS').filter(c => c.startsWith('hot') && c !== 'hot0')).toEqual([]);
  expect(w.findAll('#usage .proc').find(r => r.text().startsWith('macOS')).find('.pn').attributes('title')).toMatch(/kernel, the GPU and compressed memory.*can't read/);
  expect(w.findAll('#usage .acts')).toHaveLength(0);
  await row().trigger('dblclick');
  expect([card.peekSession, card.pinSession].map(f => f.mock.calls.length)).toEqual([0, 0]);
  await row().trigger('click');
  expect(w.findAll('#usage .sd')).toHaveLength(0);
  w.unmount();
});

const elseRows = async u => { // [header, process rows] of everything else, as shown, with its processes open
  const { w } = await mounted(u);
  const row = w.findAll('#usage .krow').find(r => r.text().startsWith('everything else'));
  await row.trigger('click');
  const nums = el => el.findAll('span').slice(-2).map(c => c.text());
  return { header: nums(row), procs: w.findAll('#usage .proc').map(r => [r.find('.pn').text(), ...nums(r)]) };
};
test('the macOS row is the gap between everything else and its process rows, so the rows add up to the header', async () => {
  const { header, procs } = await elseRows();
  expect(header).toEqual(['13%', '8.8 GB']); // the Mac's 41.6% and 12 GB, less the sessions and Lantern
  expect(procs.reduce((a, p) => a + parseInt(p[1]), 0)).toBe(parseInt(header[0])); // 6 + 3 + 0 + 0 + 4 = 13 of 13
  expect(procs.find(p => p[0] === 'macOS')).toEqual(['macOS', '3%', '1.0 GB']);
});
test('the macOS row sorts in with the other processes by its value under either sort, and "other" stays last', async () => {
  const order = async by => {
    const { w } = await mounted(); // CPU: Slack 6%, macOS 3%, Docker 0% (4.9 GB), kernel_task 0%; by RAM: Docker 4.9, Slack 2.4, macOS 1.0, kernel_task
    if (by === 'mem') await w.findAll('#usage .kh button')[1].trigger('click');
    await w.findAll('#usage .krow').find(r => r.text().startsWith('everything else')).trigger('click');
    return w.findAll('#usage .proc .pn').map(n => n.text());
  };
  expect(await order('cpu')).toEqual(['Slack Helper', 'macOS', 'Docker', 'kernel_task', 'other']);
  expect(await order('mem')).toEqual(['Docker', 'Slack Helper', 'macOS', 'kernel_task', 'other']);
});
test('everything else is never less than its own rows: the header rises to their sum when the Mac\'s remainder is smaller, and macOS is then hidden', async () => {
  const small = { ...usage, mac: { ...usage.mac, cpu: 5, used: 3500 } }; // the sessions and Lantern already take more than this Mac's remainder leaves
  const { header, procs } = await elseRows(small);
  expect(header).toEqual(['10%', '7.8 GB']); // the rows' 20 of 2 cores and 8000 MB, not 0% and 0.0 GB
  expect(procs.map(p => p[0])).toEqual(['Slack Helper', 'Docker', 'kernel_task', 'other']);
});
test('the macOS row is left out when it would show nothing', async () => {
  const { procs } = await elseRows({ ...usage, mac: { ...usage.mac, cpu: 27.75 + 0.6 + 10.2, used: 900 + 2048 + 300 + 8000 + 50 } });
  expect(procs.map(p => p[0])).not.toContain('macOS');
});
test('with no processes from the server for everything else (an older one), its row stays a plain row', async () => {
  const { w } = await mounted({ ...usage, else: undefined });
  const row = w.findAll('#usage .krow').find(r => r.text().startsWith('everything else'));
  expect(row.element.tagName).toBe('DIV');
  w.unmount();
});

test('the CPU and MEM headers pick the sort key: sessions and the open processes follow it, Lantern and everything else stay last, the pick is kept, and an open row is re-sorted once', async () => {
  const sorted = { ...usage, sessions: { a: { cpu: 30, mem: 4000, n: 2 }, b: { cpu: 110, mem: 2048, n: 5, procs: [{ name: 'vitest', n: 3, cpu: 100, mem: 300 }, { name: 'claude', n: 1, cpu: 10, mem: 1500 }] } } };
  const { w } = await mounted(sorted);
  const names = () => w.findAll('#usage .krow .n').map(n => n.text());
  const head = k => w.findAll('#usage .kh button').find(b => b.text() === k);
  expect(names()).toEqual(['busy', 'quiet one', 'everything else', 'Lantern']); // CPU by default
  expect(head('CPU').attributes('aria-pressed')).toBe('true');
  expect(head('MEM').attributes('aria-pressed')).toBe('false');
  expect([head('CPU'), head('MEM')].map(b => b.find('svg').exists())).toEqual([true, false]); // the active key carries the caret
  await w.findAll('#usage .krow')[0].trigger('click'); // busy opens: its processes by CPU, and the rows' order is held
  expect(w.findAll('#usage .pn').map(n => n.text())).toEqual(['vitest', 'claude']);
  await head('MEM').trigger('click');
  await w.vm.$nextTick(); await w.vm.$nextTick();
  expect(names()).toEqual(['quiet one', 'busy', 'everything else', 'Lantern']); // sorted again, with its row still open
  expect(w.findAll('#usage .pn').map(n => n.text())).toEqual(['claude', 'vitest']); // its processes by RAM
  expect(localStorage.getItem('lantern-usage-sort')).toBe('mem');
  expect([head('CPU'), head('MEM')].map(b => b.find('svg').exists())).toEqual([false, true]);
  w.unmount();
  const again = await mounted(sorted); // a new dropdown remembers it
  expect(again.w.findAll('#usage .krow .n').map(n => n.text())).toEqual(['quiet one', 'busy', 'everything else', 'Lantern']);
  expect(again.w.findAll('#usage .kh button').find(b => b.text() === 'MEM').attributes('aria-pressed')).toBe('true');
  localStorage.removeItem('lantern-usage-sort');
  again.w.unmount();
});

test('a session segment in the bars behaves like its row: a button that peeks, opens its processes and, double clicked, opens the card; everything else and Lantern are highlight only', async () => {
  vi.clearAllMocks();
  const { w } = await mounted();
  const segs = w.findAll('#usage .bar')[0].findAll(':scope > *');
  expect(segs.map(s => s.element.tagName)).toEqual(['BUTTON', 'BUTTON', 'BUTTON', 'BUTTON']); // busy, quiet one, everything else, Lantern (their processes open, they have no moth)
  const hide = w.find('#usage').element.hidePopover = vi.fn();
  await segs[0].trigger('pointerenter');
  expect(card.peekSession).toHaveBeenCalledWith('b');
  await segs[0].trigger('pointerleave');
  expect(card.unpeekSession).toHaveBeenCalledTimes(1);
  await w.findAll('#usage .bar')[1].findAll(':scope > *')[1].trigger('focus'); // quiet one's RAM segment
  expect(card.peekSession).toHaveBeenLastCalledWith('a');
  await segs[2].trigger('pointerenter'); await segs[3].trigger('pointerenter'); // everything else, Lantern
  expect(card.peekSession).toHaveBeenCalledTimes(2);
  await segs[0].trigger('click');
  expect(w.findAll('#usage .sd')).toHaveLength(1); // its row's processes open
  expect(w.find('#usage .krow[aria-expanded="true"]').text()).toContain('busy');
  expect(card.pinSession).not.toHaveBeenCalled();
  await segs[0].trigger('dblclick');
  expect(card.pinSession).toHaveBeenCalledWith('b');
  expect(hide).toHaveBeenCalledTimes(1);
  w.unmount();
});

test('hovering a segment or a row highlights that session in both bars and the key, and dims the rest', async () => {
  const { w } = await mounted();
  const hot = () => ({ segs: w.findAll('#usage .bar > *').map(i => i.classes('hot')), rows: w.findAll('#usage .krow').map(r => r.classes('hot')), dim: w.find('#usage').classes('hl') });
  expect(hot()).toEqual({ segs: Array(8).fill(false), rows: Array(4).fill(false), dim: false });
  await w.findAll('#usage .bar')[1].findAll(':scope > *')[0].trigger('pointerenter'); // busy's RAM segment
  expect(hot()).toEqual({ segs: [true, false, false, false, true, false, false, false], rows: [true, false, false, false], dim: true }); // its CPU segment too, and its row
  await w.findAll('#usage .bar')[1].findAll(':scope > *')[0].trigger('pointerleave');
  expect(hot().dim).toBe(false);
  await w.findAll('#usage .krow')[2].trigger('pointerenter'); // everything else: highlight only
  expect(hot()).toEqual({ segs: [false, false, true, false, false, false, true, false], rows: [false, false, true, false], dim: true });
  w.unmount();
});

test('while a row is open the rows keep their order, numbers still live; a new session joins at the end; closing it sorts them again', async () => {
  const { w, store } = await mounted();
  const names = () => w.findAll('#usage .krow').map(r => r.find('.n').text());
  const krow = name => w.findAll('#usage .krow').find(r => r.text().startsWith(name));
  expect(names()).toEqual(['busy', 'quiet one', 'everything else', 'Lantern']);
  await krow('busy').trigger('click');
  store.sessions = [...store.sessions, { id: 'c', title: 'newcomer', cwd: '/w/c' }];
  store.usage = { ...usage, sessions: { ...usage.sessions, a: { cpu: 90, mem: 900, n: 2 }, c: { cpu: 200, mem: 100, n: 1 } } }; // the quiet one and a newcomer now lead
  await w.vm.$nextTick();
  expect(names()).toEqual(['busy', 'quiet one', 'newcomer', 'everything else', 'Lantern']); // held, the newcomer at the end
  expect(krow('quiet one').text()).toContain('45%'); // its numbers move all the same
  await krow('busy').trigger('click');
  expect(names()).toEqual(['newcomer', 'quiet one', 'busy', 'everything else', 'Lantern']); // closed: sorted again
  w.unmount();
});
