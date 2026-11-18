// The review requests in the footer (src/components/ReviewsMenu.vue, mounted in index.html's real #reviewsSlot as src/main.ts does):
// a button with their count, only while some PR asks for my review, opening a list of them, each PR's link with its title and need.
import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, describe, test, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import NowPlaying from '../src/components/NowPlaying.vue';
import ReviewDetail from '../src/components/ReviewDetail.vue';
import ReviewsMenu from '../src/components/ReviewsMenu.vue';
import { flyColour } from '../src/scene/fireflies';
import { useLanternStore } from '../src/stores/lantern';
import { parseDesk, parseSettings } from '../src/types';

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

test('Up and Down move between the four choices, wrapping', async () => {
  const pr = n => ({ url: `https://github.com/o/app/pull/${n}`, label: `app#${n}`, title: `T${n}`, need: 'waiting' });
  store.reviews = [pr(1)];
  await nextTick();
  document.querySelector('#reviews .pri').click(); await nextTick(); await nextTick();
  const btns = [...document.querySelectorAll('#reviews .pick button')], key = k => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  assert.strictEqual(document.activeElement, btns[2], 'opens on the current one (normal)');
  key('ArrowDown'); assert.strictEqual(document.activeElement, btns[3]);
  key('ArrowDown'); assert.strictEqual(document.activeElement, btns[0], 'wraps to the top');
  key('ArrowUp'); assert.strictEqual(document.activeElement, btns[3], 'wraps to the bottom');
  key('ArrowUp'); assert.strictEqual(document.activeElement, btns[2]);
});

test('a priority from settings.json shows on load', async () => {
  store.settings = parseSettings({ reviewPriority: { 'https://github.com/o/app/pull/1': 3, 'https://github.com/o/app/pull/2': 0 } });
  store.reviews = ['1', '2'].map(n => ({ url: `https://github.com/o/app/pull/${n}`, label: `app#${n}`, title: n, need: 'waiting' }));
  await nextTick();
  assert.deepStrictEqual([rows().map(a => a.href.slice(-1)), [...document.querySelectorAll('#reviews .pri')].map(b => b.getAttribute('aria-label'))], [['2', '1'], ['Priority Highest, change', 'Priority Low, change']]);
});

// ---- the review desk's records (the review-desk skill), in the same list, and their detail panel (ReviewDetail.vue)
const rec = (pr, more = {}) => ({ url: `https://github.com/o/app/pull/${pr}`, repo: 'o/app', pr, kind: 'review', status: 'ready', head: 'h', title: `Rec ${pr}`, requestedBy: 'sam', at: '2026-11-17T10:00:00Z', ...more });
const request = (n, need = 'waiting') => ({ url: `https://github.com/o/app/pull/${n}`, label: `app#${n}`, title: `T${n}`, need });
const items = () => [...document.querySelectorAll('#reviews .go')];
const row = n => items().find(el => el.closest('.row').dataset.url.endsWith(`/${n}`));
const listed = () => items().map(el => el.closest('.row').dataset.url.split('/').pop());
const desk = (records, inbox = null) => { store.desk = parseDesk({ records, inbox }); };

test('a request with a desk record says where the audit stands beside its title and opens the detail; one without stays a GitHub link', async () => {
  const findings = [{ severity: 'nit', title: 'a' }, { severity: 'Blocker', title: 'b' }, { severity: 'blocker', title: 'c' }, { severity: 'major', title: 'd' }, { severity: 'high', title: 'e' }];
  store.reviews = [request(1), request(2), request(3), request(4), request(5)];
  desk([rec(1, { findings }), rec(2, { status: 'auditing' }), rec(3, { status: 'failed' }), rec(4)]);
  await nextTick();
  const status = n => row(n).querySelector('.top .desk')?.textContent;
  assert.deepStrictEqual([1, 2, 3, 4].map(status), ['2 blocker1 major1 nit1 other', 'auditing', 'failed', 'clean'], 'worst severity first, counted whatever its case; one the list doesn\'t know still counts');
  assert.deepStrictEqual([...row(1).querySelectorAll('.desk .sev')].map(s => s.className), ['sev blocker', 'sev major', 'sev nit', 'sev other']);
  assert.strictEqual(row(5).tagName, 'A', 'no record: a link to GitHub');
  assert.strictEqual(row(5).querySelector('.desk'), null);
  assert.deepStrictEqual([row(1).tagName, row(1).getAttribute('popovertarget'), row(1).getAttribute('popovertargetaction'), row(1).hasAttribute('href')], ['BUTTON', 'review', 'show', false]);
  row(1).click(); await nextTick();
  assert.strictEqual(store.review, rec(1).url, 'the detail panel shows its record');
});

test('the status sits beside the title, which clips first, so the author line keeps its room', () => {
  const css = readFileSync(join(import.meta.dirname, '..', 'index.html'), 'utf8');
  assert.match(css, /#reviews \.top \{ display: flex;/);
  assert.match(css, /#reviews \.top \.ti \{ flex: 0 1 auto; min-width: 0; \}/);
  assert.match(css, /#reviews \.top \.desk \{ flex: none;/);
});

test('a record with no request in the list is a row of its own, a follow-up with a speech bubble and its post count, and a firefly\'s request stays listed while it has one', async () => {
  store.reviews = [request(1), request(2)];
  store.sessions = [{ id: 's', state: 'working', subagents: [], github: [request(1), request(2)] }];
  desk([rec(2), rec(7, { kind: 'mention', author: 'dana' }), rec(8, { kind: 'followup', author: 'noah', activity: [{ at: '2026-11-17T10:00:00Z', author: 'noah' }, { at: '2026-11-17T11:00:00Z', author: 'sam' }] })]);
  await nextTick();
  assert.deepStrictEqual(listed(), ['2', '7', '8'], 'app#1 flies as a firefly with no record: left out');
  assert.strictEqual(button().textContent, '3');
  assert.strictEqual(row(2).querySelector('.me').textContent, 'app#2in review', 'app#2 is listed as the request, with its need, though it flies as a firefly');
  assert.strictEqual(row(7).querySelector('.me').textContent, 'app#7danamention');
  assert.ok(row(8).querySelector('.bubble svg'), 'the follow-up\'s speech bubble');
  assert.strictEqual(row(8).querySelector('.bubble').textContent, 'Follow-up, 2');
  assert.strictEqual(row(7).querySelector('.bubble'), null, 'only follow-ups get one');
});

test('an audit whose request has gone stays listed only while it has something unread', async () => {
  desk([rec(9), rec(10, { status: 'queued' })]);
  await nextTick();
  assert.deepStrictEqual(listed(), ['9'], 'unread: listed; a queued one with no request and nothing new: not');
  assert.strictEqual(row(9).querySelector('.me').textContent, 'app#9', 'no need, no word');
  row(9).click(); await nextTick();
  assert.ok(!button(), 'seen: it leaves the list');
  desk([rec(9, { lastActivity: '2026-11-17T12:00:00Z', activity: [{ at: '2026-11-17T12:00:00Z', author: 'sam' }] })]); await nextTick();
  assert.deepStrictEqual(listed(), ['9'], 'a new post brings it back');
});

test('a follow-up row takes a priority like a request, and sorts by it', async () => {
  store.reviews = [request(1)];
  desk([rec(8, { kind: 'followup' })]);
  await nextTick();
  assert.deepStrictEqual(listed(), ['1', '8']);
  row(8).closest('.row').querySelector('.pri').click(); await nextTick();
  document.querySelectorAll('#reviews .pick button')[0].click(); await nextTick();
  assert.deepStrictEqual([listed(), posts.at(-1)], [['8', '1'], ['/settings', { reviewPriority: { [rec(8).url]: 0 } }]]);
});

test('a dot marks news since I last opened a record: a post, or a finished audit of a new head, not a repeat request', async () => {
  store.reviews = [request(1), request(2)];
  desk([rec(1, { lastActivity: '2026-11-17T12:00:00Z' }), rec(2, { status: 'auditing' })]);
  await nextTick();
  const dot = n => !!row(n).querySelector('.new');
  assert.deepStrictEqual([dot(1), dot(2)], [true, false], 'never opened: new; an audit still running shows its status, no dot');
  row(1).click(); await nextTick();
  assert.deepStrictEqual(posts.at(-1), ['/settings', { reviewSeen: { [rec(1).url]: 'h|2026-11-17T12:00:00Z' } }]);
  assert.ok(!dot(1), 'seen');
  row(1).click(); await nextTick();
  assert.strictEqual(posts.length, 1, 'opening it again with nothing new saves nothing');
  desk([rec(1, { lastActivity: '2026-11-17T12:00:00Z', at: '2026-11-17T13:00:00Z', requestedBy: 'noah', updated: '2026-11-17T13:00:00Z' })]); await nextTick();
  assert.ok(!dot(1), 'asked again on the same head: nothing new');
  desk([rec(1, { lastActivity: '2026-11-17T12:05:00Z' })]); await nextTick();
  assert.ok(dot(1), 'a newer post');
  store.settings = parseSettings({ reviewSeen: { [rec(1).url]: 'h|2026-11-17T12:05:00Z' } });
  desk([rec(1, { lastActivity: '2026-11-17T12:05:00Z', head: 'h2', status: 'auditing' })]); await nextTick();
  assert.ok(!dot(1), 'a new head still auditing');
  desk([rec(1, { lastActivity: '2026-11-17T12:10:00Z', head: 'h2', status: 'auditing' })]); await nextTick();
  row(1).click(); await nextTick();
  assert.deepStrictEqual([dot(1), posts.at(-1)[1]], [false, { reviewSeen: { [rec(1).url]: 'h|2026-11-17T12:10:00Z' } }], 'a post seen mid-audit marks the post, not the head still being audited');
  desk([rec(1, { lastActivity: '2026-11-17T12:10:00Z', head: 'h2' })]); await nextTick();
  assert.ok(dot(1), 'its audit ready');
});

test('a record that doesn\'t quite fit the shape still shows: a finding or post that can\'t be shown is dropped, not the record', () => {
  const d = parseDesk({ records: [
    rec(1, { fullPanel: 'true', findings: [{ severity: 'major', title: 'ok', line: '12-18' }, { severity: 'major' }, 'nope'], activity: [{ at: 't', excerpt: 'no author' }, { author: 'no time' }], summary: 7 }),
    { repo: 'o/app', pr: '2', kind: 'review', status: 'ready', url: 'u' }], inbox: 3 });
  assert.strictEqual(d.records.length, 1, 'a record with no PR number is left out');
  const r = d.records[0];
  assert.deepStrictEqual([r.fullPanel, r.findings.map(f => [f.title, f.line]), r.activity.map(a => a.author), r.summary, d.inbox], [false, [['ok', '12-18']], ['someone'], undefined, null]);
});

describe('the detail panel', () => {
  let detail;
  const panel = () => document.getElementById('review');
  beforeEach(() => { detail = createApp(ReviewDetail).use(app.config.globalProperties.$pinia); detail.mount('#review'); });
  afterEach(() => detail.unmount());

  test('shows the verdict, the findings worst first linked to their lines in the diff, and the activity newest first', async () => {
    const findings = [{ severity: 'nit', file: 'src/a.ts', line: 3, title: 'Typo' }, { severity: 'blocker', file: 'src/b.ts', line: 12, title: 'Drops the lock', detail: 'Two writers race.' }, { severity: 'major', title: 'No file' }, { severity: 'minor', file: 'src/c.ts', line: '4-9', title: 'Range' }];
    const activity = [{ at: '2026-11-17T10:00:00Z', author: 'noah', url: 'https://github.com/o/app/pull/1#c1', excerpt: 'Looks fine' }, { at: '2026-11-17T11:00:00Z', author: 'sam', excerpt: 'Fixed it', mine: 'true' }, { at: '2026-11-17T09:00:00Z', author: 'dana', mine: 'false' }];
    desk([rec(1, { summary: 'Rewrites the loader.', findings, activity, fullPanel: true })]);
    store.review = rec(1).url; await nextTick(); await new Promise(r => setTimeout(r, 20));
    assert.match(panel().textContent, /Rewrites the loader\./);
    assert.match(panel().textContent, /Big PR: consider the full review panel\./);
    const f = [...panel().querySelectorAll('.findings li')];
    assert.deepStrictEqual(f.map(li => li.querySelector('.sev').textContent), ['blocker', 'major', 'minor', 'nit']);
    const hash = p => createHash('sha256').update(p).digest('hex');
    assert.strictEqual(f[0].querySelector('a.where').href, `https://github.com/o/app/pull/1/files#diff-${hash('src/b.ts')}R12`);
    assert.strictEqual(f[1].querySelector('.where'), null, 'no file, no link');
    assert.deepStrictEqual([f[2].querySelector('a.where').href, f[2].querySelector('a.where').textContent], [`https://github.com/o/app/pull/1/files#diff-${hash('src/c.ts')}`, 'src/c.ts:4-9'], 'a range shows, linked to its file only');
    assert.deepStrictEqual([...panel().querySelectorAll('.activity li')].map(li => [li.querySelector('b').textContent, li.querySelector('a')?.href ?? null, /in your thread/.test(li.textContent)]),
      [['sam', null, true], ['noah', 'https://github.com/o/app/pull/1#c1', false], ['dana', null, false]], 'newest first; "true" written as a string still means mine');
    assert.strictEqual(panel().querySelector('.actions a').href, rec(1).url, 'Open on GitHub');
  });

  test('a mention\'s ask and draft, with a copy button', async () => {
    const copied = [];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { copied.push(t); return Promise.resolve(); } }, configurable: true });
    desk([rec(7, { kind: 'mention', ask: 'Is it safe?', draft: 'Yes, it is.' })]);
    store.review = rec(7).url; await nextTick();
    assert.match(panel().textContent, /Is it safe\?/);
    const copy = panel().querySelector('.draft button');
    copy.click(); await nextTick(); await nextTick();
    assert.deepStrictEqual([copied, copy.textContent], [['Yes, it is.'], 'Copied']);
  });

  test('Talk it over brings up the desk\'s session only while it runs; Dismiss hides the record until there\'s news and closes the panel', async () => {
    store.reviews = [request(1)];
    desk([rec(1, { lastActivity: 't1' })], 'desk-session');
    store.review = rec(1).url; await nextTick();
    const talk = () => [...panel().querySelectorAll('.actions button')].find(b => b.textContent === 'Talk it over');
    assert.ok(!talk(), 'the desk\'s session isn\'t running');
    store.sessions = [{ id: 'desk-session', state: 'idle', subagents: [] }]; await nextTick();
    talk().click();
    assert.deepStrictEqual(posts.at(-1), ['/focus', { id: 'desk-session' }]);
    const hide = panel().hidePopover = vi.fn();
    [...panel().querySelectorAll('.actions button')].find(b => b.textContent === 'Dismiss').click(); await nextTick();
    assert.deepStrictEqual([posts.at(-1), hide.mock.calls.length, panel().textContent], [['/settings', { dismissedReviews: { [rec(1).url]: 'h|t1' } }], 1, '']);
    assert.deepStrictEqual([listed(), row(1).tagName], [['1'], 'A'], 'the request stays, a plain link again');
    desk([rec(1, { lastActivity: 't2' })], 'desk-session'); await nextTick();
    assert.strictEqual(row(1).tagName, 'BUTTON', 'a new post brings the record back');
  });
});
