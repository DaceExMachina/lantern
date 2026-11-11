// The bookmarks button beside the CPU and RAM readout (src/components/BookmarksMenu.vue) and its dropdown: the bookmarked sessions,
// most recently active first, a running one's click bringing it to the front and an ended one's resuming it, each removable.
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import BookmarksMenu from '../src/components/BookmarksMenu.vue';
import { live } from '../src/scene/live';
import { sync } from '../src/scene/state';
import { useLanternStore } from '../src/stores/lantern';

const posts = [];
beforeEach(() => { posts.length = 0; vi.spyOn(globalThis, 'fetch').mockImplementation((url, o) => { posts.push([url, JSON.parse(o.body)]); return Promise.resolve(); }); });
afterEach(() => vi.restoreAllMocks());

const now = Date.now(), A = '00000000-0000-4000-8000-00000000000a', B = '00000000-0000-4000-8000-00000000000b';
const mounted = async () => {
  const pinia = createPinia(), store = useLanternStore(pinia);
  store.now = now;
  store.sessions = [{ id: A, title: 'live title', cwd: '/w/alpha', state: 'working', last: now - 5 * 60e3, subagents: [] }];
  store.settings = { ...store.settings, bookmarks: [{ id: B, title: null, cwd: '/w/beta', last: now - 3 * 864e5 }, { id: A, title: 'old title', cwd: '/w/alpha', last: now - 864e5 }] };
  const w = mount(BookmarksMenu, { global: { plugins: [pinia] } });
  await w.vm.$nextTick();
  return { w, store };
};

test('it lists the bookmarks, most recently active first, a running one as it is now and an ended one as the server kept it', async () => {
  const { w } = await mounted();
  expect(w.find('#bookmarksButton').attributes('aria-label')).toBe('Bookmarks (2)');
  expect(w.findAll('#bookmarks .go').map(r => r.text())).toEqual(['live titlealpha · running · 5m ago', 'betabeta · ended · 3d ago']);
  w.unmount();
});

test('a click opens the moth\'s card, a double click or Enter brings a running session to the front and resumes an ended one; the cross removes a bookmark', async () => {
  const { w, store } = await mounted();
  live.raw = [{ id: A, title: 'live title', cwd: '/w/alpha', state: 'working', subagents: [] }]; sync(); // A's moth (B has none, nor a ghost)
  const [running, ended] = w.findAll('#bookmarks .go');
  await running.trigger('click');
  expect([live.hovered?.key, live.expanded]).toEqual([A, true]); // its card, in full
  await ended.trigger('click');
  expect([live.hovered?.key, posts]).toEqual([A, []]); // no moth or ghost: no card, and nothing goes anywhere on a click
  await running.trigger('dblclick');
  expect(live.hovered).toBe(null); // the card the first click opened goes with the double click
  await ended.trigger('dblclick');
  await running.trigger('keydown', { key: 'Enter' });
  expect(posts).toEqual([['/focus', { id: A }], ['/resume', { id: B }], ['/focus', { id: A }]]);
  live.raw = []; sync();
  await w.findAll('#bookmarks .rm')[1].trigger('click');
  expect(posts.at(-1)).toEqual(['/settings', { bookmarks: [A] }]);
  expect(store.bookmarks.map(b => b.id)).toEqual([A]);
  w.unmount();
});

test('with none it says how to add one', async () => {
  const w = mount(BookmarksMenu, { global: { plugins: [createPinia()] } });
  expect(w.findAll('#bookmarks .go')).toHaveLength(0);
  expect(w.find('#bookmarks .empty').text()).toContain('Bookmark a session from its card');
  w.unmount();
});

// the scene lights the moth or ghost of the row the pointer or focus is on (src/scene/spot.ts), and lets go when it leaves or the menu closes
test('hovering or focusing a row points the scene at its session; leaving it or closing the menu lets go', async () => {
  const { w } = await mounted();
  const [first, second] = w.findAll('#bookmarks .row');
  await first.trigger('pointerenter');
  expect(live.spot).toBe(A);
  await first.trigger('pointerleave');
  expect(live.spot).toBe(null);
  await second.trigger('focusin');
  expect(live.spot).toBe(B);
  await second.trigger('focusout');
  expect(live.spot).toBe(null);
  await first.trigger('pointerenter');
  await w.find('#bookmarks').trigger('toggle');
  expect(live.spot).toBe(null);
  w.unmount();
});
