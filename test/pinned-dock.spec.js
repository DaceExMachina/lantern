// The pinned sidebar (src/components/PinnedDock.vue, mounted in index.html's real #dock as src/main.ts does, beside the card):
// the pin in a card's header pins or unpins its session, the server's list decides what every window docks, and the dock
// stacks them in full, in the order they were pinned. test/morph.test.js checks the same patching in WebKit.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import PinnedDock from '../src/components/PinnedDock.vue';
import SessionCard from '../src/components/SessionCard.vue';
import { chrome, live } from '../src/scene/live';
import { $ } from '../src/scene/scene';
import { sessionMoth, sessions, sync } from '../src/scene/state';
import { expandCard, hideCard } from '../src/scene/card';
import { useLanternStore } from '../src/stores/lantern';
import { parseSettings } from '../src/types';

const text = n => n.textContent;
const find = (n, cls) => [...n.querySelectorAll('.' + cls)];
const posts = [];
const setSessions = (...ss) => { live.raw = ss; sync(); };
let apps = [], store;
// the card and the dock as src/main.ts mounts them, with the scene's side of the store wired the same way
const mount = () => {
  apps.forEach(a => a.unmount());
  const pinia = createPinia();
  store = useLanternStore(pinia);
  chrome.update = () => { store.sessions = sessions; store.hovered = live.hovered; store.expanded = live.expanded; store.now = Date.now(); };
  apps = [createApp(SessionCard).use(pinia), createApp(PinnedDock).use(pinia)];
  apps[0].mount($('card')); apps[1].mount('#dock .stack');
};
// the server's list, as every window hears it
const pins = (...ps) => { store.settings = parseSettings({ ...store.settings, pinned: ps }); return nextTick(); };
const width = w => { vi.stubGlobal('innerWidth', w); dispatchEvent(new Event('resize')); return nextTick(); };
// the page as it first loads: nothing hovered, pinned or known, 1440 wide, in `mode` (the iTerm panel, a screensaver)
const reset = (mode = '') => {
  live.hovered = null; live.moths = new Map();
  setSessions();
  hideCard();
  document.body.className = mode;
  vi.stubGlobal('innerWidth', 1440);
  mount();
};
beforeEach(() => {
  posts.length = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation((url, o) => { posts.push([url, JSON.parse(o.body)]); return Promise.resolve(); });
  reset();
});
afterEach(() => { apps.forEach(a => a.unmount()); apps = []; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const show = async s => {
  live.raw = [...live.raw.filter(o => o.id !== s.id), s]; sync();
  if (!live.expanded || live.hovered !== sessionMoth(s.id)) expandCard(sessionMoth(s.id).zone);
  await nextTick();
  return $('card');
};
const now = Date.now();
const pr = (n, need) => ({ url: `https://github.com/o/r/pull/${n}`, label: `#${n}`, need, title: `PR ${n} title` });
const session = o => ({ id: 's1', cwd: '/w/proj', title: 'proj', state: 'waiting', started: now - 3600e3, last: now - 60e3, subagents: [], github: [], ...o });
const TEN = [pr(1, 'draft'), pr(2, 'ready'), pr(3, 'draft'), pr(4, 'waiting'), pr(5, 'waiting'), pr(6, 'draft'), pr(7, 'draft'), pr(8, 'draft'), pr(9, 'draft'), pr(10, 'draft'), pr(11, 'draft')];
const pinOf = el => el.querySelector('.pin');
const docked = () => document.body.classList.contains('pinned') ? find($('dock'), 'name').map(text) : [];
const sections = () => [...$('dock').querySelectorAll('section')];
const list = () => JSON.stringify(posts.map(([, b]) => b.pinned.map(p => p.id)));
const fire = (el, type) => el.dispatchEvent(new Event(type));

test('the card\'s pin toggles its session in the list, newest at the bottom, and each section\'s own pin unpins it', async () => {
  const a = session({ title: 'alpha' }), b = session({ id: 's2', title: 'bravo' }), c = session({ id: 's3', title: 'charlie' });
  setSessions(a, b, c);
  const pin = pinOf(await show(a));
  assert.deepStrictEqual([pin.localName, pin.getAttribute('aria-label'), text(pin)], ['button', 'Pin alpha to the sidebar', ''], 'an icon button with a label');
  pin.click(); await nextTick();
  assert.deepStrictEqual(docked(), ['alpha']);
  assert.deepStrictEqual([pinOf($('card')).getAttribute('aria-label'), pinOf($('card')).className], ['Unpin alpha', 'pin on'], 'the open card\'s pin shows it');
  pinOf(await show(c)).click();
  pinOf(await show(b)).click();
  await nextTick();
  assert.deepStrictEqual(docked(), ['alpha', 'charlie', 'bravo'], 'stacked in the order they were pinned');
  pinOf(await show(c)).click(); await nextTick();
  assert.deepStrictEqual(docked(), ['alpha', 'bravo'], 'a pinned session\'s card pin unpins it, and the rest keep their places');
  pinOf(sections()[0]).click(); await nextTick();
  assert.deepStrictEqual(docked(), ['bravo'], 'a section\'s own pin');
  pinOf(sections()[0]).click(); await nextTick();
  assert.deepStrictEqual(docked(), []);
  assert.strictEqual(list(), JSON.stringify([['s1'], ['s1', 's3'], ['s1', 's3', 's2'], ['s1', 's2'], ['s2'], []]), 'the whole list to the server each time');
  // another window docks what the server says
  reset();
  setSessions(a, b);
  await pins({ id: 's2' }, { id: 's1' });
  assert.deepStrictEqual(docked(), ['bravo', 'alpha']);
});

test('the sidebar shows each session in full: the whole prompt, every PR listed, no toggle', async () => {
  const long = 'x'.repeat(200);
  setSessions(session({ state: 'idle', prompt: long, github: TEN }));
  await pins({ id: 's1' });
  assert.strictEqual(find($('dock'), 'prompt').map(text)[0], `“${long}”`, 'not cut at 110');
  assert.strictEqual(find($('dock'), 'pr2').length, 11, 'every PR, however many');
  assert.deepStrictEqual([find($('dock'), 'more').length, find($('dock'), 'chips').length], [0, 0], 'no cap, and listed though the card would show chips');
  assert.strictEqual(find(await show(session({ state: 'idle', prompt: long, github: TEN })), 'prompt').map(text)[0].length, 113, 'the card still cuts it');
});

test('a pinned session that ends stays in its place, dimmed, as it last was, until unpinned', async () => {
  const a = session({ title: 'alpha', state: 'working', activity: 'Last step' }), b = session({ id: 's2', title: 'bravo' });
  setSessions(a, b);
  await pins({ id: 's1' }, { id: 's2' });
  assert.deepStrictEqual(sections().map(n => n.className), ['', '']);
  setSessions(b); await nextTick();
  assert.deepStrictEqual(docked(), ['alpha', 'bravo'], 'still docked, in its place');
  assert.deepStrictEqual(sections().map(n => n.className), ['ended', ''], 'dimmed');
  assert.deepStrictEqual(find(sections()[0], 'state').map(text), ['Last step'], 'as it last was');
  pinOf(sections()[0]).click(); await nextTick();
  assert.deepStrictEqual(docked(), ['bravo']);
  // a window that never saw it leaves it out
  reset();
  setSessions(b);
  await pins({ id: 'gone' }, { id: 's2' });
  assert.deepStrictEqual(docked(), ['bravo']);
});

test('no pin and no sidebar under 800px wide, in the iTerm panel or the screensavers; they come back when there\'s room', async () => {
  const s = session({});
  for (const [w, mode] of [[799, ''], [375, ''], [1440, 'panel'], [1440, 'screensaver'], [1440, 'ambient']]) {
    reset(mode); vi.stubGlobal('innerWidth', w); await width(w);
    setSessions(s);
    await pins({ id: 's1' });
    assert.ok(!pinOf((await show(s)).children[0]), `${w} ${mode}: no pin`); // not strictEqual: a failure would print the whole DOM node
    assert.deepStrictEqual(docked(), [], `${w} ${mode}: no sidebar`);
  }
  reset(); await width(799);
  setSessions(s);
  await pins({ id: 's1' });
  assert.deepStrictEqual(docked(), []);
  await width(800);
  assert.ok(pinOf((await show(s)).children[0]), '800 wide has the pin');
  assert.deepStrictEqual(docked(), ['proj'], 'and the remembered pin docks again');
});

test('each pinned section\'s PRs toggle to chips on their own, kept with the pin, apart from the card\'s', async () => {
  const a = session({ github: TEN }), b = session({ id: 's2', title: 'bravo', github: TEN });
  setSessions(a, b);
  await pins({ id: 's1' }, { id: 's2' });
  const listed = () => sections().map(sec => [find(sec, 'pr2').length, find(sec, 'chips').length]);
  assert.deepStrictEqual(listed(), [[11, 0], [11, 0]], 'listed by default');
  const tog = find(sections()[0], 'tog')[0];
  assert.strictEqual(tog.getAttribute('aria-label'), 'Show PRs as chips', 'the card\'s toggle');
  tog.click(); await nextTick();
  assert.deepStrictEqual(listed(), [[0, 1], [11, 0]], 'only that section turns to chips');
  assert.strictEqual(JSON.stringify(posts.at(-1)), JSON.stringify(['/settings', { pinned: [{ id: 's1', chips: true }, { id: 's2' }] }]), 'kept with its pin');
  assert.deepStrictEqual([find(await show(a), 'chips').length, find(await show(a), 'pr2').length], [1, 0], 'the card keeps its own rule (chips past three PRs)');
  assert.strictEqual(store.settings.prList, undefined, 'and the card\'s setting is untouched');
  store.settings = parseSettings({ ...store.settings, prList: { s2: false } }); await nextTick();
  assert.deepStrictEqual(listed(), [[0, 1], [11, 0]], 'nor does the card\'s setting reach the sidebar');
  find(sections()[0], 'tog')[0].click(); await nextTick();
  assert.deepStrictEqual(listed(), [[11, 0], [11, 0]], 'and back');
  // another window, from the server's settings
  reset();
  setSessions(a, b);
  await pins({ id: 's1' }, { id: 's2', chips: true });
  assert.deepStrictEqual(sections().map(sec => [find(sec, 'pr2').length, find(sec, 'chips').length]), [[11, 0], [0, 1]]);
});

test('a chip under the pointer puts its PR\'s title in its section\'s header, as on the card', async () => {
  setSessions(session({ github: TEN }));
  await pins({ id: 's1', chips: true });
  const header = () => text(find($('dock'), 'ph')[0]);
  assert.strictEqual(header(), 'PRs · 1 ready · 2 in review · 8 drafts');
  fire(find($('dock'), 'chips')[0].children[1], 'pointerenter'); await nextTick();
  assert.strictEqual(header(), 'PR 4 title');
  fire(find($('dock'), 'chips')[0].children[1], 'pointerleave'); await nextTick();
  assert.strictEqual(header(), 'PRs · 1 ready · 2 in review · 8 drafts');
});

test('the closed sidebar is inert: out of the tab order and the accessibility tree, with nothing pinned or under 800px', async () => {
  setSessions(session({}));
  assert.strictEqual($('dock').inert, true, 'nothing pinned');
  await pins({ id: 's1' });
  assert.strictEqual($('dock').inert, false, 'open');
  await width(799);
  assert.strictEqual($('dock').inert, true, 'too narrow');
});

test('a closed sidebar keeps what it showed, so it slides out whole', async () => {
  setSessions(session({ title: 'alpha' }));
  await pins({ id: 's1' });
  await pins();
  assert.strictEqual(document.body.classList.contains('pinned'), false, 'closed');
  assert.deepStrictEqual(find($('dock'), 'name').map(text), ['alpha'], 'still drawn while it slides');
});

test('pinning sends only the pins this window can show, so one whose session it never saw goes', async () => {
  const a = session({ title: 'alpha' }), b = session({ id: 's2', title: 'bravo' });
  setSessions(a, b);
  await pins({ id: 'gone' }, { id: 's2', chips: true });
  pinOf(await show(a)).click(); await nextTick();
  assert.strictEqual(JSON.stringify(posts.at(-1)), JSON.stringify(['/settings', { pinned: [{ id: 's2', chips: true }, { id: 's1' }] }]));
  assert.deepStrictEqual(docked(), ['bravo', 'alpha']);
  // one it saw and has since ended stays: it can still be shown
  setSessions(a); await nextTick();
  pinOf(sections()[1]).click(); await nextTick();
  assert.deepStrictEqual(docked(), ['bravo']);
  await pins({ id: 's2', chips: true }, { id: 's1' });
  pinOf(await show(a)).click(); await nextTick();
  assert.strictEqual(JSON.stringify(posts.at(-1)), JSON.stringify(['/settings', { pinned: [{ id: 's2', chips: true }] }]), 'bravo ended but this window still shows it');
});

test('in the sidebar an agent is a plain row, shown in full, that leaves the card\'s open agents alone', async () => {
  const s = session({ state: 'working', tasks: ['npm test'], subagents: [{ id: 'a', description: 'Build', started: now, last: now }] });
  setSessions(s);
  await pins({ id: 's1' });
  const rows = find($('dock'), 'agent');
  assert.strictEqual(rows.length, 2, 'the agent and the shell command');
  assert.deepStrictEqual(rows.map(r => [r.localName, r.className, r.getAttribute('aria-expanded')]), [['div', 'agent open', null], ['div', 'agent open', null]]);
  rows[0].click(); await nextTick();
  assert.deepStrictEqual(find($('dock'), 'agent').map(r => r.className), ['agent open', 'agent open'], 'a click does nothing');
  assert.deepStrictEqual(find(await show(s), 'agent').map(r => [r.localName, r.className]), [['button', 'agent'], ['button', 'agent']], 'the card\'s are still buttons, closed');
});

// WebKit drops a click when the button pressed is replaced before the release, and a move drops keyboard focus, so a
// re-render (a server update, the clock's tick) must patch the sidebar's controls in place. test/morph.test.js presses
// one for real in WebKit.
test('a re-render between press and release keeps every sidebar control\'s element and its focus', async () => {
  const s = session({ state: 'working', activity: 'Step 1', subagents: [{ id: 'a', description: 'Build', started: now, last: now }], github: TEN });
  setSessions(s);
  await pins({ id: 's1' });
  const controls = () => [...$('dock').querySelectorAll('button, a')];
  const before = controls(), tog = find($('dock'), 'tog')[0];
  assert.ok(before.length > 10 && tog, `the open button, pill, pin, toggle and PR rows: ${before.length}`);
  tog.focus();
  fire(tog, 'pointerdown');
  live.raw = [{ ...s, activity: 'Step 2', last: now + 1e3 }]; sync(); await nextTick(); // the next snapshot from the server lands mid-press
  assert.strictEqual(text(find($('dock'), 'state')[0]), 'Step 2', 'it re-rendered');
  assert.ok(controls().length === before.length && controls().every((c, i) => c === before[i]), 'each control is the element it was');
  assert.strictEqual(document.activeElement, tog, 'and the focused one keeps focus');
  tog.click(); await nextTick();
  assert.strictEqual(find($('dock'), 'chips').length, 1, 'and the release toggles the list');
});

test('the sidebar lists every agent, with no "more" past the card\'s five', async () => {
  const subagents = Array.from({ length: 7 }, (_, i) => ({ id: `a${i}`, description: `Agent ${i}`, started: now - (9 - i) * 1e3, last: now }));
  setSessions(session({ state: 'working', subagents }));
  await pins({ id: 's1' });
  assert.deepStrictEqual([find($('dock'), 'job').length, find($('dock'), 'more').length], [7, 0]);
});

// The app window lays a clear strip over the top of the page to drag it by (app/main.swift DragStrip), and AppKit gives that
// strip every click on it. So the first card's header, pin included, sat under it and could not be pressed (the last pin left
// could not be unpinned). Only the app window has the strip, so only its page (?app, which sets body.app) keeps clear of it,
// by --titlebar. The sidebar is the exception: the strip stops short of it (the page tells the app the sidebar's width), so
// it starts at the very top with no padding.
test('under the app window\'s drag strip nothing sits: --titlebar is its height under body.app, and the sidebar has no gap at the top', () => {
  const html = fs.readFileSync(path.join(import.meta.dirname, '../index.html'), 'utf8'), swift = fs.readFileSync(path.join(import.meta.dirname, '../app/main.swift'), 'utf8');
  const strip = swift.match(/DragStrip\(frame: [^\n]*height: (\d+)\)\)/)?.[1];
  assert.ok(strip, 'found the strip\'s height in main.swift');
  assert.match(swift, /let home = URL\(string: "[^"]*\/\?app"\)/, 'the app loads its page with ?app');
  assert.match(html, /--titlebar: 0px;/, 'no strip by default');
  assert.strictEqual(html.match(/body\.app \{ --titlebar: (\d+)px; \}/)?.[1], strip, 'the app\'s is the strip\'s height');
  assert.doesNotMatch(html.match(/#dock \.stack \{[^}]*\}/)?.[0] ?? '', /titlebar/, 'the column starts at the top');
});

// The app window's drag strip spans the width left of the sidebar (app/main.swift DragStrip.stopShort), so the page tells it
// the sidebar's width when it opens and closes: its --dock-width, or 0.
test('the app is told the sidebar\'s width when it opens and closes', async () => {
  const sent = [], bridge = { messageHandlers: { dock: { postMessage: w => sent.push(w) } } };
  vi.stubGlobal('webkit', bridge);
  mount(); // the page as it loads: closed
  assert.deepStrictEqual(sent, [0], 'closed at load: the full width');
  setSessions(session());
  await pins({ id: 's1' });
  assert.deepStrictEqual(sent, [0, 380], 'opening: the column\'s width');
  await pins();
  assert.deepStrictEqual(sent, [0, 380, 0], 'closing: nothing');
  vi.stubGlobal('webkit', undefined);
  await pins({ id: 's1' }); // a browser tab has no bridge, and nothing throws
  assert.strictEqual(sent.length, 3);
});
