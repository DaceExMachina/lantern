// The review desk's button and list (src/components/ReviewDesk.vue): a corner button with the count of ready records, a dropdown of them
// newest first with who asked and the audit's state, a click opening the summary and findings (or a mention's ask and draft), and a cross dismissing one.
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import ReviewDesk from '../src/components/ReviewDesk.vue';
import { useLanternStore } from '../src/stores/lantern';

const posts = [];
beforeEach(() => { posts.length = 0; vi.spyOn(globalThis, 'fetch').mockImplementation((url, o) => { posts.push([url, JSON.parse(o.body)]); return Promise.resolve(); }); });
afterEach(() => vi.restoreAllMocks());

const records = [
  { id: 'o/app#9@a', repo: 'o/app', pr: 9, kind: 'review', status: 'ready', title: 'Big change', url: 'https://github.com/o/app/pull/9', requestedBy: 'sam', fullPanel: true,
    summary: 'Rewrites the loader.', findings: [{ severity: 'blocker', file: 'a.ts', line: 12, title: 'Drops the lock', detail: 'Two writers race.' }, { severity: 'nit', file: 'b.ts', title: 'Typo' }, { severity: 'blocker', file: 'c.ts', line: 3, title: 'Leaks' }] },
  { id: 'o/app#8@b', repo: 'o/app', pr: 8, kind: 'review', status: 'auditing', title: 'Smaller', url: 'https://github.com/o/app/pull/8', requestedBy: 'noah' },
  { id: 'o/api#7@c', repo: 'o/api', pr: 7, kind: 'mention', status: 'ready', title: 'Question', requestedBy: 'sam', ask: 'Is this safe?', draft: 'Yes, because X.' },
  { id: 'o/api#6@d', repo: 'o/api', pr: 6, kind: 'review', status: 'failed', title: 'Broke', requestedBy: 'sam', summary: 'Could not fetch.' },
];
const mounted = async (desk = records) => {
  const pinia = createPinia(), store = useLanternStore(pinia);
  store.desk = desk;
  const w = mount(ReviewDesk, { global: { plugins: [pinia] } });
  await w.vm.$nextTick();
  return { w, store };
};

test('the button counts the ready records, and says nothing when none are', async () => {
  const { w, store } = await mounted();
  expect(w.find('#deskButton .n').text()).toBe('2');
  expect(w.find('#deskButton').attributes('aria-label')).toBe('Reviews (2 ready)');
  store.desk = [records[1]];
  await w.vm.$nextTick();
  expect([w.find('#deskButton .n').exists(), w.find('#deskButton .busy').exists()]).toEqual([false, true]);
  store.desk = [];
  await w.vm.$nextTick();
  expect([w.find('#deskButton .n').exists(), w.find('#deskButton .busy').exists()]).toEqual([false, false]);
  expect(w.find('#desk .empty').text()).toContain('/review-desk');
  w.unmount();
});

test('each row has its linked title, who asked and its state, with the findings counted by severity', async () => {
  const { w } = await mounted();
  expect(w.findAll('#desk .row').map(r => [r.find('.ti').text(), r.find('.me').text()])).toEqual([
    ['Big change', 'app#9 · asked by sam · 2 blocker, 1 nit'], ['Smaller', 'app#8 · asked by noah · auditing'],
    ['Question', 'api#7 · mentioned by sam · mention'], ['Broke', 'api#6 · asked by sam · failed']]);
  expect(w.find('#desk a.ti').attributes('href')).toBe('https://github.com/o/app/pull/9');
  expect(w.find('#desk a.ti .go').exists()).toBe(true);
  w.unmount();
});

test('a click on a row opens its summary and findings, or a mention\'s ask and draft, and a second closes it', async () => {
  const { w } = await mounted();
  expect(w.find('#desk .more').exists()).toBe(false);
  await w.findAll('#desk .tg')[0].trigger('click');
  const more = w.find('#desk .more');
  expect(more.text()).toContain('Rewrites the loader.');
  expect(more.text()).toContain('Big PR: consider the full review panel.');
  expect(more.findAll('.finding').map(f => f.text())).toEqual(['blocker a.ts:12Drops the lockTwo writers race.', 'nit b.tsTypo', 'blocker c.ts:3Leaks']);
  await w.findAll('#desk .tg')[0].trigger('click');
  expect(w.find('#desk .more').exists()).toBe(false);
  await w.findAll('#desk .tg')[2].trigger('click');
  expect(w.find('#desk .more').text()).toBe('Asked: Is this safe?Draft reply: Yes, because X.');
  w.unmount();
});

test('the cross dismisses a record by id, saving it as a setting, and hides it', async () => {
  const { w, store } = await mounted();
  await w.findAll('#desk .rm')[1].trigger('click');
  expect(posts).toEqual([['/settings', { dismissedReviews: ['o/app#8@b'] }]]);
  expect(w.findAll('#desk .row').map(r => r.find('.ti').text())).toEqual(['Big change', 'Question', 'Broke']);
  store.settings = { ...store.settings, dismissedReviews: [] };
  await w.vm.$nextTick();
  expect(w.findAll('#desk .row')).toHaveLength(4);
  w.unmount();
});
