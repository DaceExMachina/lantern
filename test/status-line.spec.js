// The footer's status line (src/components/StatusLine.vue, mounted in index.html's real #statusSlot as src/main.ts does): what it
// says for each state of the stream and the sessions, the counts that open their sessions one at a time, "warm for" counting
// on with the store's clock, and the line shrinking to fit.
import assert from 'node:assert';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import StatusLine from '../src/components/StatusLine.vue';
import { useLanternStore } from '../src/stores/lantern';
import { parseSettings } from '../src/types';

let app, store;
const status = () => document.getElementById('status');
const line = () => status().textContent;
const session = (id, o) => ({ id, state: 'working', subagents: [], ...o });
const set = async (sessions, extra = {}) => { Object.assign(store, { sessions, link: 'up', ...extra }); await nextTick(); };
beforeEach(() => {
  vi.useFakeTimers({ now: Date.parse('2026-10-18T15:00:00Z') });
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve());
  const pinia = createPinia();
  store = useLanternStore(pinia);
  app = createApp(StatusLine).use(pinia);
  app.mount('#statusSlot');
});
afterEach(() => { app.unmount(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const fire = (el, type) => el.dispatchEvent(new Event(type));
const tick = async ms => { vi.advanceTimersByTime(ms); await nextTick(); };

test('it says connecting, then offline, then what the sessions are doing', async () => {
  assert.deepStrictEqual([line(), status().className], ['connecting…', 'offline']);
  await set([]);
  assert.deepStrictEqual([line(), status().className], ['quiet night, no sessions', '']);
  await set([session('a'), session('b', { state: 'paused', reported: true }), session('c', { state: 'paused' })]);
  assert.strictEqual(line(), '3 sessions · 2 working', 'a session waiting on its agents counts as working, one that reported back does not');
  await set([session('a')]);
  assert.strictEqual(line(), '1 session · 1 working');
  store.link = 'offline'; await nextTick();
  assert.deepStrictEqual([line(), status().className], ['server offline, retrying…', 'offline']);
  store.link = 'up'; await nextTick();
  assert.strictEqual(line(), '1 session · 1 working', 'and back with the next word from the server');
});

test('each count that wants me is a button that opens its sessions one at a time, longest waiting first', async () => {
  const posts = [];
  vi.mocked(fetch).mockImplementation((url, o) => { posts.push(JSON.parse(o.body).id); return Promise.resolve(); });
  await set([session('w2', { state: 'waiting', waitingSince: 2 }), session('w1', { state: 'waiting', waitingSince: 1 }), session('z', { state: 'waiting', snoozed: true }), session('s', { state: 'waiting', snoozed: true, forGood: true })]);
  assert.strictEqual(line(), '4 sessions · 0 working · 2 need you · 1 snoozed · 1 sleeping');
  assert.strictEqual(status().className, 'waiting');
  const [need, snoozed, sleeping] = [...status().querySelectorAll('button.next')];
  assert.deepStrictEqual([need.title, snoozed.title, sleeping.title], ['Open the session that has waited longest', 'Open the snoozed sessions one at a time', 'Open the sleeping sessions one at a time']);
  need.click(); need.click(); need.click(); snoozed.click(); sleeping.click();
  assert.deepStrictEqual(posts, ['w1', 'w2', 'w1', 'z', 's'], 'each click moves on to the next, round and round');
  await set([session('w1', { state: 'waiting', waitingSince: 1 })]);
  assert.strictEqual(line(), '1 session · 0 working · 1 needs you');
});

test('a count keeps its element through a re-render, since WebKit drops a click whose pressed button is replaced', async () => {
  await set([session('w1', { state: 'waiting' }), session('a')]);
  const button = status().querySelector('button.next');
  fire(button, 'pointerdown');
  await set([session('w1', { state: 'waiting', activity: 'new' }), session('a'), session('b')]);
  assert.strictEqual(line(), '3 sessions · 2 working · 1 needs you', 'it re-rendered');
  assert.strictEqual(status().querySelector('button.next'), button);
  await set([session('w1', { state: 'waiting' }), session('w2', { state: 'waiting' })]);
  assert.strictEqual(status().querySelector('button.next'), button, 'and when the count changes');
});

test('quiet hours say so, until when, and the reviews link to GitHub', async () => {
  const until = Date.now() + 3600e3;
  store.settings = parseSettings({ quietUntil: until, quietEnd: '7:15' });
  await set([session('a')]);
  assert.strictEqual(line(), '1 session · 1 working · snoozed until 7:15am');
  await set([session('a', { state: 'waiting', snoozed: true, quiet: true })]);
  assert.strictEqual(line(), '1 session · 0 working · 1 snoozed until 7:15am');
  store.settings = parseSettings({ quietUntil: 8.64e15 });
  await set([session('a')]);
  assert.strictEqual(line(), '1 session · 1 working · snoozed', 'with no end, no time');
  store.settings = parseSettings({});
  store.reviews = [{ url: 'u', label: 'app#1', title: 'Fix it' }, { url: 'v', label: 'app#2', title: null }];
  await nextTick();
  const a = status().querySelector('a.next');
  assert.deepStrictEqual([a.textContent, a.href, a.title], ['2 reviews', 'https://github.com/pulls/review-requested', 'app#1 Fix it\napp#2 null']);
  assert.strictEqual(line(), '1 session · 1 working · 2 reviews');
});

// The bug Dace shelved: the status's "warm for" went stale between the minute's syncs. It counts on with the store's clock.
test('"warm for" shows a minute after the lantern was last violet, and counts on every second', async () => {
  const waiting = session('s', { state: 'waiting' });
  await tick(30e3); await set([waiting]); // violet from 30 s in
  await tick(1e3); await set([session('s')]); // warm again
  assert.ok(!status().querySelector('.warm'), 'not yet: it was violet a second ago');
  await tick(59e3);
  assert.strictEqual(status().querySelector('.warm')?.textContent, undefined, '59 s on, still no');
  await tick(1e3);
  assert.strictEqual(status().querySelector('.warm')?.textContent, 'warm for 1m');
  assert.strictEqual(line(), '1 session · 1 working · warm for 1m');
  await tick(148e3);
  assert.strictEqual(status().querySelector('.warm')?.textContent, 'warm for 3m', 'and on, between syncs');
  await tick(3600e3 + 120e3);
  assert.strictEqual(status().querySelector('.warm')?.textContent, 'warm for 1h 5m');
  await set([waiting]);
  assert.ok(!status().querySelector('.warm'), 'gone when violet again');
});

test('the status shrinks to fit on one line, down to 9px, and wraps only past that', async () => {
  vi.stubGlobal('getComputedStyle', () => ({ paddingLeft: '4px', paddingRight: '4px', fontSize: '16px' }));
  const st = status();
  const fit = async (clientWidth, scrollWidth) => {
    Object.assign(st.style, { fontSize: '13px', whiteSpace: 'normal' });
    Object.defineProperties(st, { clientWidth: { value: clientWidth, configurable: true }, scrollWidth: { value: scrollWidth, configurable: true } });
    dispatchEvent(new Event('resize'));
    return [st.style.fontSize, st.style.whiteSpace];
  };
  assert.deepStrictEqual(await fit(208, 150), ['', ''], 'it fits: back to the stylesheet\'s size, on one line');
  assert.deepStrictEqual(await fit(108, 128), ['13.3px', ''], 'a little too long: 100 of 120 wide, so 16px becomes 13.3px');
  assert.deepStrictEqual(await fit(108, 404), ['9px', 'normal'], 'far too long: 9px, and it wraps');
  Object.assign(st.style, { fontSize: '', whiteSpace: '' });
  await set([session('a')]);
  assert.deepStrictEqual([st.style.fontSize, st.style.whiteSpace], ['9px', 'normal'], 'and again when the text changes');
});
