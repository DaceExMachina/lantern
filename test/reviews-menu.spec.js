// The review requests in the footer (src/components/ReviewsMenu.vue, mounted in index.html's real #reviewsSlot as src/main.ts does):
// a button with their count, only while some PR asks for my review, opening a list of them, each PR's link with its title and need.
import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPinia } from 'pinia';
import { afterEach, beforeAll, beforeEach, describe, test, vi } from 'vitest';
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
  assert.deepStrictEqual([1, 2, 3, 4].map(status), ['2 blocker1 major1 nit1 other', 'Reviewing…', 'failed', 'clean'], 'worst severity first, counted whatever its case; one the list doesn\'t know still counts');
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
  desk([rec(2), rec(7, { kind: 'mention', ask: 'Can you check?', author: 'dana' }), rec(8, { kind: 'followup', ask: 'Reply?', author: 'noah', activity: [{ at: '2026-11-17T10:00:00Z', author: 'noah' }, { at: '2026-11-17T11:00:00Z', author: 'sam' }] })]);
  await nextTick();
  assert.deepStrictEqual(listed(), ['2', '7', '8'], 'app#1 flies as a firefly with no record: left out');
  assert.strictEqual(button().textContent, '3');
  assert.strictEqual(row(2).querySelector('.me').textContent, 'app#2in review', 'app#2 is listed as the request, with its need, though it flies as a firefly');
  assert.strictEqual(row(7).querySelector('.me').textContent, 'app#7danamention');
  assert.ok(row(8).querySelector('.bubble svg'), 'the follow-up\'s speech bubble');
  assert.strictEqual(row(8).querySelector('.bubble').textContent, 'Follow-up, 2');
  assert.strictEqual(row(7).querySelector('.bubble'), null, 'only follow-ups get one');
});

test('a record whose request has gone stays only if it asks something of me: a review leaves, a mention with an ask stays, a follow-up without one leaves', async () => {
  desk([rec(9), rec(10, { status: 'queued' }), rec(15, { ask: 'Anything?' }), rec(11, { kind: 'mention', ask: 'Can you check?' }), rec(12, { kind: 'mention' }), rec(13, { kind: 'followup', ask: 'Reply?' }), rec(14, { kind: 'followup' })]);
  await nextTick();
  assert.deepStrictEqual(listed(), ['11', '13'], 'reviews (new or not) and ask-less notes are gone; the ones with an ask stay');
  assert.strictEqual(row(11).querySelector('.new'), null, 'no unread dot');
});

test('a PR the desk marked merged or closed is left out of the list, whatever its kind, and a malformed closed leaves the record listed', async () => {
  store.reviews = [request(1), request(2)];
  desk([rec(1, { closed: { state: 'merged', at: 't' } }), rec(2), rec(7, { kind: 'mention', ask: 'x', closed: { state: 'closed' } }), rec(8, { kind: 'mention', ask: 'x' }), rec(9, { kind: 'mention', ask: 'x', closed: { state: 'bogus' } })]);
  await nextTick();
  assert.deepStrictEqual(listed(), ['2', '8', '9'], 'a closed request, a closed mention: gone; an unclosed one, or a bogus state, stays');
  assert.strictEqual(button().textContent, '3', 'the count follows');
});

test('an audit the desk is still on (queued or auditing) shows a labelled in-progress state until it is ready or failed', async () => {
  store.reviews = [request(1), request(2), request(3)];
  desk([rec(1, { status: 'queued' }), rec(2, { status: 'auditing' }), rec(3, { status: 'failed' })]);
  await nextTick();
  const state = n => [row(n).closest('.row').classList.contains('working'), row(n).querySelector('.desk')?.textContent];
  assert.deepStrictEqual([1, 2, 3].map(state), [[true, 'Queued'], [true, 'Reviewing…'], [false, 'failed']]);
  desk([rec(1, { status: 'ready' })]); await nextTick();
  assert.ok(!row(1).closest('.row').classList.contains('working'), 'ready: back to normal');
  const css = readFileSync(join(import.meta.dirname, '..', 'index.html'), 'utf8');
  assert.match(css, /prefers-reduced-motion: reduce\) \{ #reviews \.top \.working i \{ animation: none;/);
});

test('a follow-up row takes a priority like a request, and sorts by it', async () => {
  store.reviews = [request(1)];
  desk([rec(8, { kind: 'followup', ask: 'x' })]);
  await nextTick();
  assert.deepStrictEqual(listed(), ['1', '8']);
  row(8).closest('.row').querySelector('.pri').click(); await nextTick();
  document.querySelectorAll('#reviews .pick button')[0].click(); await nextTick();
  assert.deepStrictEqual([listed(), posts.at(-1)], [['8', '1'], ['/settings', { reviewPriority: { [rec(8).url]: 0 } }]]);
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

  test('the ask links to its own comment', async () => {
    desk([rec(1, { kind: 'mention', ask: 'Can you check?', askUrl: 'https://github.com/o/app/pull/1#issuecomment-5' })]);
    store.review = rec(1).url; await nextTick();
    assert.strictEqual(panel().querySelector('p a').href, 'https://github.com/o/app/pull/1#issuecomment-5');
    desk([rec(1, { kind: 'mention', ask: 'Can you check?' })]); await nextTick();
    assert.ok(!panel().querySelector('p a'), 'no askUrl: no link');
  });

  test('findings can be ticked and posted as one review: blockers and majors start ticked, the button counts them, and what went out is marked posted', async () => {
    const findings = [{ severity: 'nit', title: 'Typo' }, { severity: 'blocker', file: 'a.ts', line: 3, title: 'Race' }, { severity: 'major', title: 'No file' }, { severity: 'minor', title: 'Naming' }];
    desk([rec(1, { findings })]);
    store.review = rec(1).url; await nextTick();
    const boxes = () => [...panel().querySelectorAll('.findings input')], go = () => panel().querySelector('.actions .primary');
    assert.deepStrictEqual(boxes().map(b => b.checked), [true, true, false, false], 'worst first: blocker and major ticked, minor and nit not');
    assert.deepStrictEqual([go().textContent, go().disabled], ['Post 2 as your review', false]);
    assert.strictEqual(panel().querySelector('.actions').lastElementChild, go().parentElement, 'in the actions row, at the far right');
    boxes()[2].click(); await nextTick();
    assert.strictEqual(go().textContent, 'Post 3 as your review');
    for (const b of boxes().filter(b => b.checked)) { b.click(); await nextTick(); } // a click at a time, as a person does
    assert.ok(!go(), 'nothing ticked: no button at all');
    boxes()[0].click(); await nextTick(); boxes()[3].click(); await nextTick();
    let answer = { status: 502, body: { error: 'GitHub refused the review: nope.' } };
    vi.spyOn(globalThis, 'fetch').mockImplementation((url, o) => { posts.push([url, JSON.parse(o.body)]); return Promise.resolve(new Response(JSON.stringify(answer.body), { status: answer.status })); });
    go().click(); await nextTick();
    assert.deepStrictEqual([go().textContent, go().disabled], ['Posting', true], 'working');
    await new Promise(r => setTimeout(r, 20));
    assert.deepStrictEqual(posts.at(-1), ['/desk/post', { url: rec(1).url, head: 'h', findings: [0, 1] }], 'the record\'s own indices, not the sorted rows\'');
    assert.strictEqual(panel().querySelector('.send .error').textContent, 'GitHub refused the review: nope.');
    answer = { status: 200, body: { url: 'https://github.com/o/app/pull/1#pullrequestreview-5' } };
    go().click(); await new Promise(r => setTimeout(r, 20));
    assert.strictEqual(panel().querySelector('.send a').href, 'https://github.com/o/app/pull/1#pullrequestreview-5');
    desk([rec(1, { findings, posted: 'https://github.com/o/app/pull/1#pullrequestreview-5', sent: { head: 'h', findings: [0, 1] } })]); await nextTick();
    assert.deepStrictEqual([boxes().length, [...panel().querySelectorAll('.findings input:disabled')].map(c => c.getAttribute('aria-label'))], [4, ['Already posted', 'Already posted']], 'sent ones are marked, not offered');
    assert.deepStrictEqual(boxes().filter(b => !b.disabled).map(b => b.checked), [true, false], 'only the unsent two can be ticked');
    assert.strictEqual(go().textContent, 'Post 1 as your review', 'the unsent major is ticked again');
    desk([rec(1, { findings, head: 'h2', sent: { head: 'h', findings: [0, 1] } })]); await nextTick();
    assert.strictEqual(boxes().length, 4, 'new commits: everything is offered again');
  });

  test('a review with no request stays listed, and its panel open, while its detail is shown; it leaves once the panel closes', async () => {
    desk([rec(1, { findings: [{ severity: 'major', title: 'Look' }] })]); await nextTick();
    const row = () => document.querySelector('#reviews .row');
    assert.ok(!row(), 'a review with no request isn\'t listed on its own');
    store.openReview(store.deskShown[0]); await nextTick(); await nextTick(); // opened some other way, e.g. a link
    assert.ok(row(), 'its row (the panel\'s invoker) is there while the panel is open');
    assert.match(panel().textContent, /Look/, 'and so is the panel');
    panel().dispatchEvent(Object.assign(new Event('toggle'), { newState: 'closed', oldState: 'open' })); await nextTick(); await nextTick();
    assert.ok(!row(), 'the panel closed: now it can go');
    assert.strictEqual(store.review, null);
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

  beforeAll(() => import('../src/code')); // the panel loads it on a finding's first open; loaded once here, so that takes a tick, not a cold import
  // happy-dom has no showPopover: note which popover each link opens
  const opened = [];
  beforeEach(() => { opened.length = 0; HTMLElement.prototype.showPopover = function () { opened.push(this.id); }; });
  afterEach(() => { delete HTMLElement.prototype.showPopover; });

  test('a link to a finding opens that finding on its own, counted in the record\'s own order though the list sorts worst first; one to the summary or the ask scrolls there', async () => {
    const findings = [{ severity: 'nit', title: 'Typo' }, { severity: 'blocker', title: 'Race' }, { severity: 'major', title: 'Leak' }];
    desk([rec(1, { findings, summary: 'Fine.', ask: 'Look?' }), rec(2)]);
    const scrolled = [];
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function () { scrolled.push(this.id); });
    const go = async (link) => { store.reviewLink = link; await new Promise(r => setTimeout(r, 30)); }; // a finding waits for the highlighter to load
    await go({ repo: 'O/App', pr: 1, anchor: 'finding-0' });
    assert.deepStrictEqual([store.review, opened], [rec(1).url, ['review']], 'its record, open (the repo\'s case doesn\'t matter)');
    assert.deepStrictEqual([panel().querySelector('.finding .title')?.textContent, !!panel().querySelector('.findings')], ['Typo', false], 'finding-0 is the record\'s first (the list would show it last), on its own');
    await go({ repo: 'o/app', pr: 1, anchor: 'finding-2' });
    assert.strictEqual(panel().querySelector('.finding .title')?.textContent, 'Leak');
    for (const [anchor, text] of [['summary', 'Fine.'], ['ask', 'The ask']]) {
      await go({ repo: 'o/app', pr: 1, anchor });
      assert.deepStrictEqual([!!panel().querySelector('.finding'), panel().querySelectorAll('.here').length, panel().querySelector('.here').textContent.includes(text), scrolled.at(-1)], [false, 1, true, anchor], anchor);
    }
    await go({ repo: 'o/app', pr: 1, anchor: 'finding-7' });
    assert.deepStrictEqual([store.review, !!panel().querySelector('.finding'), !!panel().querySelector('.here'), panel().querySelectorAll('.findings li').length], [rec(1).url, false, false, 3], 'past the last finding: the record, at its top');
    await go({ repo: 'o/app', pr: 2, anchor: '' });
    assert.strictEqual(store.review, rec(2).url, 'no anchor: just the record');
  });

  test('a link to a record the desk doesn\'t have, or one that didn\'t fit, opens the reviews list', async () => {
    store.reviews = [request(1)];
    desk([rec(1)]); await nextTick();
    for (const link of [{ repo: 'o/app', pr: 9, anchor: 'summary' }, { repo: '', pr: 0, anchor: '' }]) {
      opened.length = 0;
      store.reviewLink = link; await nextTick(); await nextTick();
      assert.deepStrictEqual([store.review, opened], [null, ['reviews']], JSON.stringify(link));
    }
  });

  test('a finding\'s title steps into it: its detail, its link and whatever else the desk wrote; All findings or Escape steps back to it in the list', async () => {
    const findings = [{ severity: 'nit', title: 'Typo', file: 'a.ts', line: 3, confidence: 80, lens: 'naming', tags: ['x'] }, { severity: 'blocker', title: 'Race', detail: 'Two writers.', file: 'b.ts', line: 20 }];
    desk([rec(1, { findings })]);
    store.review = rec(1).url; await nextTick(); await new Promise(r => setTimeout(r, 20)); // the diff links' hashes
    const race = () => panel().querySelector('#finding-1'), view = () => panel().querySelector('.finding');
    race().querySelector('button.what').click(); await new Promise(r => setTimeout(r, 30));
    assert.deepStrictEqual([view().querySelector('.sev').textContent, view().querySelector('.title').textContent, view().querySelector('.detail').textContent, view().querySelector('a.where').textContent, !!panel().querySelector('.findings')],
      ['blocker', 'Race', 'Two writers.', 'b.ts:20', false], 'in place of the list');
    panel().querySelector('.back').click(); await nextTick(); await nextTick();
    assert.deepStrictEqual([!!view(), document.activeElement === race().querySelector('button.what')], [false, true], 'back to the list, on the finding it left');
    assert.strictEqual(race().querySelector('input').checked, true, 'a click on the title steps in; it doesn\'t untick the blocker');
    panel().querySelector('#finding-0 button.what').click(); await new Promise(r => setTimeout(r, 30));
    assert.deepStrictEqual([!!view().querySelector('.code'), view().querySelector('a.where')?.textContent, [...view().querySelectorAll('.extra dt, .extra dd')].map(e => e.textContent)],
      [false, 'a.ts:3', ['confidence', '80', 'lens', 'naming']], 'no code: its text and its link; the desk\'s other fields, not lists');
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    panel().querySelector('.back').dispatchEvent(esc); await nextTick(); await nextTick();
    assert.deepStrictEqual([!!view(), esc.defaultPrevented, store.review], [false, true, rec(1).url], 'Escape steps out of the finding, not out of the panel');
  });

  test('a finding\'s view shows the explanation as Markdown, with no raw HTML, safe links and highlighted code; without one, its detail', async () => {
    const explanation = 'Two callers **race** on `load()`.\n\n<script>alert(1)</script><img src=x onerror=alert(1)>\n\n[docs](https://example.com/a) [bad](javascript:alert(1)) ![pic](https://example.com/p.png)\n\n```ts\nconst a = 1;\n```';
    desk([rec(1, { findings: [{ severity: 'major', title: 'Race', detail: 'One line.', explanation }, { severity: 'minor', title: 'Plain', detail: 'Just this.' }] })]);
    store.review = rec(1).url; await nextTick();
    store.reviewLink = { repo: 'o/app', pr: 1, anchor: 'finding-0' }; await new Promise(r => setTimeout(r, 30));
    const ex = panel().querySelector('.finding .explain');
    assert.deepStrictEqual([ex.querySelector('strong')?.textContent, ex.querySelector('p code')?.textContent, !!panel().querySelector('.finding .detail')], ['race', 'load()', false], 'Markdown, in place of the one-liner');
    assert.deepStrictEqual([!!ex.querySelector('script, img, [onerror]'), /<script>alert\(1\)<\/script>/.test(ex.textContent)], [false, true], 'raw HTML shows as text, never as elements');
    assert.deepStrictEqual([...ex.querySelectorAll('a')].map(a => [a.getAttribute('href'), a.target, a.rel]), [['https://example.com/a', '_blank', 'noopener'], ['https://example.com/p.png', '_blank', 'noopener']], 'only http(s) links, opening outside; an image is only a link, never loaded');
    assert.ok(ex.querySelector('pre code .hljs-keyword'), 'a code block is highlighted');
    store.reviewLink = { repo: 'o/app', pr: 1, anchor: 'finding-1' }; await new Promise(r => setTimeout(r, 30));
    assert.deepStrictEqual([!!panel().querySelector('.finding .explain'), panel().querySelector('.finding .detail')?.textContent], [false, 'Just this.'], 'no explanation: the detail');
  });

  test('a finding\'s code is fetched once one opens: the PR\'s change, green and red with both numbers and the cited line marked, else the file at head, else just the link', async () => {
    const findings = [{ severity: 'nit', title: 'Unchanged', file: 'a.swift', line: 3 }, { severity: 'blocker', title: 'Race', file: 'b.ts', line: 11 }, { severity: 'minor', title: 'Gone', file: 'c.ts', line: 1 }];
    const diff = { diff: true, mark: [11, 11], lines: [{ kind: ' ', old: 9, new: 10, text: 'const a = 1;' }, { kind: '-', old: 10, new: 0, text: 'race();' }, { kind: '+', old: 0, new: 11, text: 'await race();' }] };
    const head = { diff: false, mark: [3, 3], lines: [{ kind: ' ', old: 0, new: 3, text: 'let x = 2' }] };
    vi.spyOn(globalThis, 'fetch').mockImplementation((url, o) => { posts.push([url, JSON.parse(o.body)]); return Promise.resolve(new Response(JSON.stringify([head, diff, null]))); });
    desk([rec(1, { findings })]);
    store.review = rec(1).url; await nextTick(); await new Promise(r => setTimeout(r, 20));
    assert.ok(!posts.some(p => p[0] === '/desk/code'), 'the list doesn\'t fetch code');
    assert.ok(!panel().querySelector('.findings .code'), 'and doesn\'t show any');
    const open = async n => { panel().querySelector(`#finding-${n} button.what`).click(); await nextTick(); await new Promise(r => setTimeout(r, 20)); };
    const back = async () => { panel().querySelector('.back').click(); await nextTick(); await nextTick(); };
    await open(1);
    assert.deepStrictEqual(posts.filter(p => p[0] === '/desk/code'), [['/desk/code', { url: rec(1).url }]]);
    const rows = () => [...panel().querySelectorAll('.finding .code > span')].map(l => [l.className, [...l.querySelectorAll('b')].map(b => b.textContent).join('|'), l.querySelector('i').textContent, l.querySelector('code').textContent]);
    assert.deepStrictEqual(rows(), [['', '9|10', ' ', 'const a = 1;'], ['del', '10|', '-', 'race();'], ['add mark', '|11', '+', 'await race();']], 'removed red, added green, both numbers, the cited new line marked');
    assert.ok(panel().querySelector('.finding .code .add code .hljs-keyword'), 'coloured by its language (b.ts: TypeScript)');
    await back(); await open(0);
    assert.deepStrictEqual([panel().querySelector('.finding h4').textContent, rows()], ['The code, which this PR doesn\'t change', [['mark', '3', ' ', 'let x = 2']]], 'not in the change: the file at head, new numbers only');
    await back(); await open(2);
    assert.deepStrictEqual([!!panel().querySelector('.finding .code'), panel().querySelector('.finding a.where')?.textContent], [false, 'c.ts:1'], 'no code: the link');
    assert.strictEqual(posts.filter(p => p[0] === '/desk/code').length, 1, 'fetched once for the record');
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
    assert.deepStrictEqual([posts.at(-1), hide.mock.calls.length], [['/settings', { dismissedReviews: { [rec(1).url]: 'h|t1' } }], 1]); // closing it empties it (a link can still open a dismissed record)
    assert.deepStrictEqual([listed(), row(1).tagName], [['1'], 'A'], 'the request stays, a plain link again');
    desk([rec(1, { lastActivity: 't2' })], 'desk-session'); await nextTick();
    assert.strictEqual(row(1).tagName, 'BUTTON', 'a new post brings the record back');
  });
});
