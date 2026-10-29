// The now playing widget (src/components/NowPlaying.vue, mounted in index.html's #nowPlayingSlot as src/main.ts does): it
// shows while there's an item, with its cover when it has one, and its buttons send their command to the server.
import assert from 'node:assert';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import NowPlaying from '../src/components/NowPlaying.vue';
import { useLanternStore } from '../src/stores/lantern';

let app, store, fetch;
const widget = () => document.getElementById('nowPlaying');
const SONG = { title: 'Idyll of Sorrow', artist: 'ASC', app: 'Spotify', bundle: 'com.spotify.client', playing: true };
beforeEach(() => {
  fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve());
  const pinia = createPinia();
  store = useLanternStore(pinia);
  app = createApp(NowPlaying).use(pinia);
  app.mount('#nowPlayingSlot');
});
afterEach(() => { app.unmount(); vi.restoreAllMocks(); });

test('it shows only while something is up, playing or paused, with its cover when there is one', async () => {
  assert.strictEqual(widget() !== null, false, 'nothing playing: no widget');
  store.nowPlaying = SONG; await nextTick();
  assert.strictEqual(widget().querySelector('.title').textContent, 'Idyll of Sorrow');
  assert.strictEqual(widget().querySelector('.by').textContent, 'ASC · Spotify');
  assert.strictEqual(widget().querySelector('.art') !== null, false, 'no cover, no empty frame'); // not the element itself: printing one in a failure hangs happy-dom
  assert.strictEqual(widget().querySelector('.toggle').getAttribute('aria-label'), 'Pause');
  store.nowPlayingArt = 'data:image/jpeg;base64,AAAA'; store.nowPlaying = { ...SONG, playing: false }; await nextTick();
  assert.strictEqual(widget().querySelector('.art').getAttribute('src'), 'data:image/jpeg;base64,AAAA');
  assert.strictEqual(widget().querySelector('.toggle').getAttribute('aria-label'), 'Play', 'paused: still there, to play again');
  store.nowPlaying = null; await nextTick();
  assert.strictEqual(widget() !== null, false, 'the app let go: gone');
});

test('each button posts its command to /now-playing', async () => {
  store.nowPlaying = SONG; await nextTick();
  for (const b of widget().querySelectorAll('button')) b.click();
  assert.deepStrictEqual(fetch.mock.calls.map(([url, o]) => [url, JSON.parse(o.body).command]),
    [['/now-playing', 'previous'], ['/now-playing', 'toggle'], ['/now-playing', 'next']]);
});

test('the cover and the words open the app that is playing, only when the server knows which it is', async () => {
  store.nowPlayingArt = 'data:image/jpeg;base64,AAAA'; store.nowPlaying = SONG; await nextTick();
  widget().querySelector('.art').click(); widget().querySelector('.what').click();
  assert.deepStrictEqual(fetch.mock.calls.map(([url, o]) => [url, JSON.parse(o.body).command]), [['/now-playing', 'open'], ['/now-playing', 'open']]);
  store.nowPlaying = { ...SONG, bundle: '' }; await nextTick();
  assert.strictEqual(widget().querySelector('.what').classList.contains('opens'), false, 'no known app: no pointer');
  assert.strictEqual(widget().querySelector('.art').classList.contains('opens'), false);
});
