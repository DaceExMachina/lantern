// The review requests in the footer (src/components/ReviewsMenu.vue, mounted in index.html's real #reviewsSlot as src/main.ts does):
// a button with their count, only while some PR asks for my review, opening a list of them, each PR's link with its title and need.
import assert from 'node:assert';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, test } from 'vitest';
import { createApp, nextTick } from 'vue';
import NowPlaying from '../src/components/NowPlaying.vue';
import ReviewsMenu from '../src/components/ReviewsMenu.vue';
import { flyColour } from '../src/scene/fireflies';
import { useLanternStore } from '../src/stores/lantern';

let app, store;
const button = () => document.getElementById('reviewsButton');
const rows = () => [...document.querySelectorAll('#reviews a')];
beforeEach(() => {
  const pinia = createPinia();
  store = useLanternStore(pinia);
  app = createApp(ReviewsMenu).use(pinia);
  app.mount('#reviewsSlot');
});
afterEach(() => app.unmount());

test('the button and the list are there only while a PR asks for my review, and list each with its state', async () => {
  assert.ok(!button(), 'nothing asked: no button');
  assert.ok(!document.getElementById('reviews'));
  store.reviews = [{ url: 'https://github.com/o/app/pull/2', label: 'app#2', title: 'Fix it', need: 'waiting' }, { url: 'https://github.com/o/app/pull/1', label: 'app#1', title: null, need: 'failing' }];
  await nextTick();
  assert.deepStrictEqual([button().textContent, button().getAttribute('popovertarget'), button().getAttribute('aria-label')], ['2', 'reviews', '2 review requests']);
  assert.deepStrictEqual(rows().map(a => [a.href, a.querySelector('.ti').textContent, a.querySelector('b').textContent, a.querySelector('.me').textContent]),
    [['https://github.com/o/app/pull/1', '', 'app#1', 'app#1checks failing'], ['https://github.com/o/app/pull/2', 'Fix it', 'app#2', 'app#2in review']], 'worst first');
  assert.strictEqual(rows()[0].querySelector('i').style.background, flyColour('failing'));
  store.reviews = [{ url: 'https://github.com/o/app/pull/3', label: 'app#3', title: 'Done', need: 'merged', since: 1 }];
  await nextTick();
  assert.ok(!button(), 'one leaving (merged, closed or reviewed) is no longer asking');
  store.reviews = [];
  await nextTick();
  assert.ok(!button(), 'all reviewed: the button goes');
});

test('the now playing widget gives way while the dropdown is open', async () => {
  const pinia = createPinia(), playing = createApp(NowPlaying).use(pinia);
  app.unmount();
  app = createApp(ReviewsMenu).use(pinia);
  store = useLanternStore(pinia);
  app.mount('#reviewsSlot'); playing.mount('#nowPlayingSlot');
  store.nowPlaying = { title: 'Idyll of Sorrow', artist: 'ASC', app: 'Spotify', bundle: '', playing: true };
  store.reviews = [{ url: 'https://github.com/o/app/pull/1', label: 'app#1', title: 'Fix it', need: 'waiting' }];
  await nextTick();
  const shown = () => !!document.getElementById('nowPlaying'), toggle = newState => { const e = new Event('toggle'); e.newState = newState; document.getElementById('reviews').dispatchEvent(e); return nextTick(); };
  assert.ok(shown(), 'shown while the dropdown is shut');
  await toggle('open');
  assert.ok(!shown(), 'gone while it is open');
  await toggle('closed');
  assert.ok(shown(), 'back once it closes');
  await toggle('open');
  store.reviews = [];
  await nextTick();
  assert.ok(shown(), 'back when the list empties under an open dropdown');
  playing.unmount();
});
