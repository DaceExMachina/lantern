// The Vue recap (src/components/RecapPanel.vue): it draws the day in the store's `recap`, and its constellation's stars show
// a session's card on hover, pin on click, and unpin on Escape. The scene's ribbons and headline (src/scene/stats.ts) are stubbed.
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import RecapPanel from '../src/components/RecapPanel.vue';
import { useLanternStore } from '../src/stores/lantern';

const MIN = 60000, H = 3600000, start = Date.UTC(2026, 0, 5), end = start + 24 * H;
const day = (o = {}) => ({ start, end, mothMs: 1, warmLantern: 80, warmMoths: 70, medianWait: 90 * 1000, slowWait: null, waits: 4, merged: 2, open: 5, stale: 12, staleChange: -1, ...o });
const stats = (days = [day(), day()]) => ({
  days, gauges: [], tally: {}, streak: 3, warmGoal: 70, achievements: [['revived', 'today']],
  spans: [['alive', start + H, end, false, 'a', 'First', '-Users-me-code'], ['alive', start + 5 * H, end, false, 'b', 'Second', null], ['waiting', start + 5 * H, start + 6 * H, false, 'b']],
  prs: [[start + 2 * H, 'a', 'https://github.com/o/r/pull/7', null, 'ready', 'Fix it']],
});
const moment = { current: null };
vi.mock('../src/scene/stats', async importOriginal => ({ ...await importOriginal(),
  slices: d => d.mothMs ? { from: start, to: end, slices: [], starts: [] } : null,
  headline: () => '<div class="headline"></div>', dayRibbon: () => '<div class="dayRibbon"><div class="ribbon"></div></div>',
  followRibbon: vi.fn((box, r, d, onMoment) => { moment.current = onMoment; return t => onMoment(t); }),
  clock: () => '9:00 AM', dayKey: () => 'today',
  ACHIEVEMENTS: { revived: ['Revived', 'Brought a stale PR back'] },
}));
vi.mock('../src/scene/card', async importOriginal => ({ ...await importOriginal(), ago: ms => `${Math.round(ms / MIN)} min` }));
let host, store;
beforeEach(() => {
  setActivePinia(createPinia());
  host = document.body.appendChild(document.createElement('div'));
});
afterEach(() => host.remove());
const open = async s => {
  const pinia = createPinia();
  const w = mount(RecapPanel, { attachTo: host, global: { plugins: [pinia] } });
  store = useLanternStore(pinia);
  const popover = w.find('h3').element.parentElement; // happy-dom has no :popover-open
  popover.matches = sel => sel === ':popover-open';
  store.recap = { stats: s, i: s.days.length - 1 };
  await w.vm.$nextTick(); await w.vm.$nextTick();
  return w;
};

test('it draws the day: title, numbers, badge, streak and one star per session', async () => {
  const w = await open(stats());
  expect(w.find('h3').text()).toBe('Today’s recap ×');
  const nums = Object.fromEntries(w.findAll('dl > div').map(d => [d.find('dt').text(), d.find('dd').text()]));
  expect(nums).toEqual({ 'answer time': '2 min', fireflies: '2 merged, 5 open', 'stale PRs': '12 (-1)' });
  expect(w.find('.badge').attributes('aria-label')).toBe('Revived: Brought a stale PR back');
  expect(w.text()).toContain('Warm streak: 3 days at or over 70% warm moths.');
  expect(w.findAll('.star')).toHaveLength(2);
  expect(w.find('.star').attributes('aria-label')).toBe('First');
  w.unmount();
});

test('a day with no moths says so, and has no stars', async () => {
  const w = await open(stats([day(), day({ warmMoths: null, mothMs: 0 })]));
  expect(w.text()).toContain('No moths that day. A quiet one.');
  expect(w.find('.star').exists()).toBe(false);
  w.unmount();
});

test('hovering a star shows its session card, a click pins it, and Escape unpins it', async () => {
  const w = await open(stats());
  const star = w.find('.star');
  await star.trigger('pointerenter');
  await w.vm.$nextTick();
  const card = w.find('.starCard');
  expect(card.classes()).toContain('show');
  expect(card.find('h3').text()).toBe('First');
  expect(card.text()).toContain('PRs (1)');
  expect(card.find('.pr a').attributes('href')).toBe('https://github.com/o/r/pull/7');
  expect(card.text()).toContain('~/code'); // the project, from Claude's folder name
  await star.trigger('click');
  await star.trigger('pointerleave', { pointerType: 'mouse' });
  expect(w.find('.star').classes()).toContain('picked');
  expect(card.classes()).toContain('show'); // pinned: leaving doesn't hide it
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  await w.vm.$nextTick();
  expect(w.find('.star').classes()).not.toContain('picked');
  expect(w.find('.starCard').classes()).not.toContain('show');
  w.unmount();
});

test('a moment on the ribbon lights the star that started then, and moves the constellation\'s line', async () => {
  const w = await open(stats());
  moment.current(start + H);
  await w.vm.$nextTick();
  expect(w.find('.star.lit').attributes('data-i')).toBe('0');
  expect(w.find('.starsBox .cursor').attributes('hidden')).toBeUndefined();
  moment.current(null);
  await w.vm.$nextTick();
  expect(w.find('.star.lit').exists()).toBe(false);
  w.unmount();
});
