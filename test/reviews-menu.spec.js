// The review requests in the footer (src/components/ReviewsMenu.vue, mounted in index.html's real #reviewsSlot as src/main.ts does):
// a button with their count, only while some PR asks for my review, opening a list of them, each PR's link with its title and need.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import NowPlaying from '../src/components/NowPlaying.vue';
import ReviewsMenu from '../src/components/ReviewsMenu.vue';
import { flyColour } from '../src/scene/fireflies';
import { useLanternStore } from '../src/stores/lantern';
import { parseSettings } from '../src/types';

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
  assert.deepStrictEqual([button().textContent, button().getAttribute('popovertarget'), button().getAttribute('aria-label')], ['2', 'reviews', '2 reviews']);
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

test('a review already flying as a moth\'s firefly is left out of the list and its count', async () => {
  const pr = n => ({ url: `https://github.com/o/app/pull/${n}`, label: `app#${n}`, title: `T${n}`, need: 'waiting' });
  store.reviews = [pr(1), pr(2)];
  store.sessions = [{ id: 's', state: 'working', subagents: [], github: [pr(1)] }];
  await nextTick();
  assert.deepStrictEqual([button().textContent, rows().map(a => a.href)], ['1', [pr(2).url]]);
  store.sessions = [{ id: 's', state: 'working', subagents: [], github: [pr(1), pr(2)] }];
  await nextTick();
  assert.ok(!button(), 'every request on the board: the button hides');
  store.sessions = [];
  await nextTick();
  assert.strictEqual(button().textContent, '2', 'the session leaves: both are back');
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

test('the list is capped below the window drag strip, so it scrolls instead of running under the title bar', () => {
  const css = readFileSync(join(import.meta.dirname, '..', 'index.html'), 'utf8').match(/^\s*#reviews \{[^}]*\}/m)?.[0];
  assert.match(css, /max-height: calc\(100vh - 52px - max\(var\(--space-5\), var\(--titlebar\)\)\)/);
});

test('with review requests switched off in the settings there is no button, and it returns when they are on again', async () => {
  store.reviews = [{ url: 'https://github.com/o/app/pull/2', label: 'app#2', title: 'Fix it', need: 'waiting' }];
  await nextTick();
  assert.ok(button(), 'on by default');
  store.settings = parseSettings({ reviews: false }); await nextTick();
  assert.ok(!button());
  assert.ok(!document.getElementById('reviews'));
  store.settings = parseSettings({ reviews: true }); await nextTick();
  assert.ok(button());
});

// ---- the review desk's records, in the same list
const rec = (pr, more = {}) => ({ id: `o/app#${pr}@h`, repo: 'o/app', pr, kind: 'review', status: 'ready', title: `Rec ${pr}`, requestedBy: 'sam', ...more });
const request = n => ({ url: `https://github.com/o/app/pull/${n}`, label: `app#${n}`, title: `T${n}`, need: 'waiting' });
const desks = () => [...document.querySelectorAll('#reviews .desk')];
const post = vi.fn();
beforeEach(() => { post.mockClear(); vi.spyOn(globalThis, 'fetch').mockImplementation((url, o) => { post(url, JSON.parse(o.body)); return Promise.resolve(); }); });
afterEach(() => vi.restoreAllMocks());

test('a request\'s row carries its desk record: who asked, the audit\'s state and findings by severity, opening in place; a row without one is as before', async () => {
  const findings = [{ severity: 'blocker', file: 'a.ts', line: 12, title: 'Drops the lock', detail: 'Two writers race.' }, { severity: 'nit', file: 'b.ts', title: 'Typo' }, { severity: 'blocker', file: 'c.ts', title: 'Leaks' }];
  store.reviews = [request(1), request(2), request(3)];
  store.desk = [rec(1, { summary: 'Rewrites the loader.', fullPanel: true, findings }), rec(2, { status: 'auditing' })];
  await nextTick();
  assert.deepStrictEqual(rows().map(a => a.href), [request(1), request(2), request(3)].map(r => r.url), 'the requests, not the records, are the rows');
  assert.deepStrictEqual(desks().map(d => d.querySelector('.tg').textContent), ['asked by sam · 2 blocker, 1 nit', 'asked by sam · auditing']);
  assert.ok(!rows()[2].nextElementSibling?.classList.contains('desk'), 'no record: nothing under it');
  assert.ok(!document.querySelector('#reviews .more'), 'closed until clicked');
  desks()[0].querySelector('.tg').click(); await nextTick();
  const more = document.querySelector('#reviews .more');
  assert.match(more.textContent, /Rewrites the loader\./);
  assert.match(more.textContent, /Big PR: consider the full review panel\./);
  assert.deepStrictEqual([...more.querySelectorAll('.finding')].map(f => f.textContent), ['blocker a.ts:12Drops the lockTwo writers race.', 'nit b.tsTypo', 'blocker c.tsLeaks']);
  desks()[0].querySelector('.tg').click(); await nextTick();
  assert.ok(!document.querySelector('#reviews .more'), 'a second click closes it');
});

test('a record with no request in the list is a row of its own, labelled for what it is, and it counts', async () => {
  store.reviews = [request(1)];
  store.desk = [rec(1), rec(7, { kind: 'mention', requestedBy: 'dana', ask: 'Is it safe?', draft: 'Yes.', url: 'https://github.com/o/app/pull/7' }), rec(8, { status: 'failed' })];
  await nextTick();
  assert.strictEqual(button().textContent, '3');
  assert.deepStrictEqual(rows().map(a => a.querySelector('.me').textContent), ['app#1in review', 'app#7mention', 'app#8handled']);
  assert.deepStrictEqual(desks().map(d => d.querySelector('.tg').textContent), ['asked by sam · no findings', 'mentioned by dana · ready', 'asked by sam · failed']);
  desks()[1].querySelector('.tg').click(); await nextTick();
  assert.strictEqual(document.querySelector('#reviews .more').textContent, 'Asked: Is it safe?Draft reply: Yes.');
  store.reviews = [{ ...request(8), need: 'merged', since: 1 }];
  await nextTick();
  assert.deepStrictEqual(rows().map(a => a.querySelector('.me').textContent), ['app#1handled', 'app#7mention', 'app#8handled'], 'requests that are gone or merged leave their records behind as rows of their own');
});

test('a request already flying as a moth\'s firefly stays out of the list unless the desk has a record on it', async () => {
  store.reviews = [request(1), request(2)];
  store.sessions = [{ id: 's', state: 'working', subagents: [], github: [request(1), request(2)] }];
  await nextTick();
  assert.ok(!button(), 'both on the board, no records: nothing');
  store.desk = [rec(2)];
  await nextTick();
  assert.deepStrictEqual(rows().map(a => a.href), [request(2).url], 'the one with a record is back, as a request with its record under it');
  assert.strictEqual(rows()[0].querySelector('.me').textContent, 'app#2in review');
  assert.strictEqual(desks().length, 1);
});

test('the cross dismisses a record by id, saving it as a setting; its request row stays', async () => {
  store.reviews = [request(1), request(2)];
  store.desk = [rec(1), rec(7, { kind: 'mention' })];
  await nextTick();
  desks()[1].querySelector('.rm').click(); await nextTick();
  assert.deepStrictEqual(post.mock.calls, [['/settings', { dismissedReviews: ['o/app#7@h'] }]]);
  assert.deepStrictEqual(rows().map(a => a.href), [request(1).url, request(2).url], 'the mention\'s row is gone');
  desks()[0].querySelector('.rm').click(); await nextTick();
  assert.deepStrictEqual(rows().map(a => a.href), [request(1).url, request(2).url], 'the request stays');
  assert.strictEqual(desks().length, 0, 'with only its record gone');
  assert.deepStrictEqual(post.mock.calls.at(-1), ['/settings', { dismissedReviews: ['o/app#7@h', 'o/app#1@h'] }]);
});
