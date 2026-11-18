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
const posts = [];
const button = () => document.getElementById('reviewsButton');
const rows = () => [...document.querySelectorAll('#reviews a')];
beforeEach(() => {
  posts.length = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation((url, o) => { posts.push([url, JSON.parse(o.body)]); return Promise.resolve(); });
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

test('a review that is also a stale wisp is left out while stale PRs show, and back in the list when they are off', async () => {
  const pr = n => ({ url: `https://github.com/o/app/pull/${n}`, label: `app#${n}`, title: `T${n}`, need: 'waiting' });
  store.reviews = [pr(1), pr(2)];
  store.stale = [{ ...pr(1), updatedAt: '2026-01-01T00:00:00Z' }];
  await nextTick();
  assert.deepStrictEqual(rows().map(a => a.href), [pr(2).url], 'already a wisp');
  store.settings = parseSettings({ stale: false }); await nextTick();
  assert.deepStrictEqual(rows().map(a => a.href).sort(), [pr(1).url, pr(2).url], 'wisps off: both listed');
});

test('each row shows its author between the label and the status, on one line where only the author clips', async () => {
  store.reviews = [{ url: 'https://github.com/o/app/pull/1', label: 'app#1', title: 'A', need: 'waiting', author: 'octocat' }, { url: 'https://github.com/o/app/pull/2', label: 'app#2', title: 'B', need: 'waiting' }];
  await nextTick();
  const me = rows().map(a => [...a.querySelector('.me').children].map(c => c.tagName + ':' + c.textContent));
  assert.deepStrictEqual(me, [['I:', 'B:app#1', 'SPAN:octocat'], ['I:', 'B:app#2']]);
  assert.strictEqual(rows()[0].querySelector('.me').textContent, 'app#1octocatin review');
  const css = readFileSync(join(import.meta.dirname, '..', 'index.html'), 'utf8');
  assert.match(css, /#reviews \.me \.by \{[^}]*min-width: 0; overflow: hidden; text-overflow: ellipsis/);
  assert.match(css, /#reviews \.me \{ white-space: nowrap; \}/);
  assert.match(css, /#reviews \.me :is\(i, b\) \{ flex: none; \}/);
});

test('an assigned PR carries an "assigned" marker after its author, still on one line, and a requested one does not', async () => {
  store.reviews = [{ url: 'https://github.com/o/app/pull/1', label: 'app#1', title: 'A', need: 'waiting', author: 'octocat', assigned: true }, { url: 'https://github.com/o/app/pull/2', label: 'app#2', title: 'B', need: 'waiting', author: 'octocat' }];
  await nextTick();
  const me = rows().map(a => [...a.querySelector('.me').children].map(c => c.className || c.tagName));
  assert.deepStrictEqual(me, [['I', 'B', 'by', 'asg'], ['I', 'B', 'by']]);
  assert.strictEqual(rows()[0].querySelector('.asg').textContent, 'assigned');
  const css = readFileSync(join(import.meta.dirname, '..', 'index.html'), 'utf8');
  assert.match(css, /#reviews \.me \.asg \{ flex: none;/, 'it never shrinks: only the author clips');
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

test('a review\'s priority defaults to normal, is picked directly from four icons, and sorts the list, highest (0) first, then worst first', async () => {
  const pr = (n, need = 'waiting') => ({ url: `https://github.com/o/app/pull/${n}`, label: `app#${n}`, title: `T${n}`, need });
  store.reviews = [pr(1), pr(2), pr(3, 'failing')];
  await nextTick();
  const pri = () => [...document.querySelectorAll('#reviews .pri')];
  const order = () => rows().map(a => a.href.slice(-1));
  assert.deepStrictEqual(pri().map(b => [b.getAttribute('aria-label'), b.classList.contains('set')]), [['Priority Normal, change', false], ['Priority Normal, change', false], ['Priority Normal, change', false]]);
  assert.deepStrictEqual(order(), ['3', '1', '2'], 'all default: worst first');
  pri()[2].click(); // open app#2's picker
  await nextTick();
  const pick = () => [...document.querySelectorAll('#reviews .pick button')];
  assert.deepStrictEqual(pick().map(b => [b.getAttribute('aria-label'), b.getAttribute('aria-pressed')]), [['Highest', 'false'], ['High', 'false'], ['Normal', 'true'], ['Low', 'false']], 'the current one is marked');
  assert.strictEqual(document.querySelectorAll('#reviews .pick').length, 1);
  assert.deepStrictEqual(order(), ['3', '1', '2'], 'nothing moves while the picker is open');
  assert.strictEqual(posts.length, 0, 'opening it saves nothing');
  pick()[0].click(); // Highest, in one click
  await nextTick();
  assert.deepStrictEqual(order(), ['2', '3', '1'], 'highest comes first');
  assert.ok(!document.querySelector('#reviews .pick'), 'the picker closes');
  assert.ok(document.querySelector('#reviews .row .pri').classList.contains('set'));
  assert.deepStrictEqual(posts.at(-1), ['/settings', { reviewPriority: { [pr(2).url]: 0 } }]);
  pri()[0].click(); await nextTick();
  pick()[3].click(); await nextTick(); // Low: last
  assert.deepStrictEqual([order(), posts.at(-1)[1]], [['3', '1', '2'], { reviewPriority: { [pr(2).url]: 3 } }], 'low sorts after normal');
  pri()[2].click(); await nextTick();
  pick()[2].click(); await nextTick(); // Normal (the default, not kept)
  assert.deepStrictEqual(posts.at(-1)[1], { reviewPriority: {} }, 'back to normal saves nothing for it');
});

test('Escape or a click elsewhere in the list closes the picker unchanged', async () => {
  const pr = n => ({ url: `https://github.com/o/app/pull/${n}`, label: `app#${n}`, title: `T${n}`, need: 'waiting' });
  store.reviews = [pr(1), pr(2)];
  await nextTick();
  const pri = () => document.querySelector('#reviews .pri'), picker = () => document.querySelector('#reviews .pick');
  pri().click(); await nextTick();
  assert.ok(picker());
  picker().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await nextTick();
  assert.ok(!picker(), 'Escape closes it');
  pri().click(); await nextTick();
  rows()[1].click(); await nextTick();
  assert.ok(!picker(), 'a click on another row closes it');
  pri().click(); await nextTick();
  document.getElementById('reviews').dispatchEvent(Object.assign(new Event('toggle'), { newState: 'closed' })); await nextTick();
  assert.ok(!picker(), 'the dropdown closing takes it along');
  assert.strictEqual(posts.length, 0, 'none of it saved anything');
});

test('a priority from settings.json shows on load', async () => {
  store.settings = parseSettings({ reviewPriority: { 'https://github.com/o/app/pull/1': 3, 'https://github.com/o/app/pull/2': 0 } });
  store.reviews = ['1', '2'].map(n => ({ url: `https://github.com/o/app/pull/${n}`, label: `app#${n}`, title: n, need: 'waiting' }));
  await nextTick();
  assert.deepStrictEqual([rows().map(a => a.href.slice(-1)), [...document.querySelectorAll('#reviews .pri')].map(b => b.getAttribute('aria-label'))], [['2', '1'], ['Priority Highest, change', 'Priority Low, change']]);
});
