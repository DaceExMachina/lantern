// The Vue stats panel (src/components/StatsPanel.vue): it loads /stats when its popover opens and draws the numbers,
// the week and the badges. The scene's ribbons come through window.sceneBridge, stubbed here.
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import StatsPanel from '../src/components/StatsPanel.vue';

const MIN = 60000, now = Date.now();
const day = (i, o = {}) => ({ start: now - (7 - i) * 864e5, end: now, mothMs: i % 2, warmLantern: 80, warmMoths: 70, medianWait: 90 * 1000, slowWait: null, waits: 4, merged: 2, open: 5, stale: 12, staleChange: -1, ...o });
const log = { days: [...Array(7).keys()].map(i => day(i)), spans: [], gauges: [], prs: [], tally: { revived: [2, '2026-10-17'] }, achievements: [['revived', '2026-10-17']], streak: 3, warmGoal: 70 };
const bridge = {
  slices: d => d.mothMs ? { from: d.start, to: d.end, slices: [], starts: [] } : null,
  ribbonBody: () => '<rect/>', headline: () => '<div class="headline"></div>', dayRibbon: () => '<div class="dayRibbon"><div class="ribbon"></div></div>',
  followRibbon: vi.fn(), restoreBadge: vi.fn(), setTally: vi.fn(), clock: () => '9:00 AM', dayKey: () => 'today', pct: v => v == null ? '–' : `${v}%`,
  ago: ms => `${Math.round(ms / MIN)} min`, ACHIEVEMENTS: { revived: ['Revived', 'Brought a stale PR back'], clear_night: ['Clear night', 'No stale PRs'] },
};
let popover;
beforeEach(() => {
  setActivePinia(createPinia());
  window.sceneBridge = bridge;
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(log))));
  popover = document.body.appendChild(document.createElement('div'));
});
afterEach(() => { popover.remove(); vi.unstubAllGlobals(); });

// the toggle event fires on the popover, which is the panel's parent (VTU mounts it in a wrapper inside `popover`)
const toggle = (w, newState) => w.find('h3').element.parentElement.dispatchEvent(Object.assign(new Event('toggle'), { newState }));
const open = async () => {
  const w = mount(StatsPanel, { attachTo: popover, global: { plugins: [createPinia()] } });
  toggle(w, 'open');
  await flushPromises();
  return w;
};

test('it waits for the popover to open, then reads the log and draws today and the week', async () => {
  const w = mount(StatsPanel, { attachTo: popover, global: { plugins: [createPinia()] } });
  expect(fetch).not.toHaveBeenCalled();
  expect(w.text()).toContain('Reading the log…');
  toggle(w, 'open');
  await flushPromises();
  expect(fetch).toHaveBeenCalledWith('/stats');
  const nums = Object.fromEntries(w.findAll('dl > div').map(d => [d.find('dt').text(), d.find('dd').text()]));
  expect(nums).toMatchObject({ 'answer time': '2 min', waits: '4', merged: '2', 'in flight': '5', 'stale PRs': '12 (-1)', 'slowest answers': '–' });
  expect(w.findAll('.week .day')).toHaveLength(6);
  expect(w.findAll('.week button.day')).toHaveLength(3); // the days with a log (odd mothMs) open the recap; the rest say nothing recorded
  w.unmount();
});

test('badges: this week\'s with the day they came, and every badge on the shelf, the unearned dimmed', async () => {
  const w = await open();
  const earned = w.find('#statsWeek > .badges .badge');
  expect(earned.attributes('aria-label')).toBe('Revived: Brought a stale PR back');
  expect(earned.text()).toBe('Revived Sat');
  const shelf = w.findAll('.shelf .badge');
  expect(shelf.map(b => [b.attributes('data-id'), b.classes('unearned')])).toEqual([['revived', false], ['clear_night', true]]);
  expect(shelf[0].text()).toBe('Revived ×2');
  expect(bridge.setTally).toHaveBeenCalledWith(log.tally);
  w.unmount();
});

test('a failed read says so, and closing the popover stops the refresh', async () => {
  vi.useFakeTimers();
  const w = await open();
  fetch.mockClear();
  await vi.advanceTimersByTimeAsync(MIN);
  expect(fetch).toHaveBeenCalledTimes(1);
  toggle(w, 'closed');
  await vi.advanceTimersByTimeAsync(3 * MIN);
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockRejectedValue(new Error('down'));
  toggle(w, 'open');
  await vi.advanceTimersByTimeAsync(0);
  await w.vm.$nextTick();
  expect(w.find('#statsBody').text()).toBe('Couldn’t read the stats. Is the Lantern app running?');
  w.unmount();
  vi.useRealTimers();
});
