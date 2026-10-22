// The moth's hover card (src/scene/card.ts): the PR header that sums the PRs up and names a hovered chip, the list capped at
// the worst few, the per-session toggle from the server's settings, and the agent rows (job, time, model, a tag chip
// only for a tagged step). It runs against index.html's real card and dock, with the real morph patching them in happy-dom;
// test/morph.test.js checks the same patching in WebKit.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { $ } from '../src/scene/scene';
import { live } from '../src/scene/live';
import { sync } from '../src/scene/state';
import { HANDLERS, hideCard, hoverZone, openAgents, renderCard, renderSidebar } from '../src/scene/card';

const text = n => n.textContent;
const find = (n, cls) => [...n.querySelectorAll('.' + cls)];
const anchors = n => [...n.querySelectorAll('a')];

const posts = [];
const setSessions = (...ss) => { live.raw = ss; sync(); };
// the page as it first loads: nothing hovered, listed, pinned or known, the card and dock empty, 1440 wide
const reset = () => {
  live.hovered = null; live.prList = {}; live.pinned = []; live.moths = new Map();
  setSessions();
  hideCard();
  document.body.className = '';
  vi.stubGlobal('innerWidth', 1440);
  $('card').replaceChildren(); $('dock').children[0].replaceChildren();
  renderSidebar();
};
beforeEach(() => {
  posts.length = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation((url, o) => { posts.push([url, JSON.parse(o.body)]); return Promise.resolve(); });
  for (const [k, v] of [['offsetWidth', 240], ['offsetHeight', 40]]) Object.defineProperty($('prTip'), k, { value: v, configurable: true }); // no layout in happy-dom
  reset();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const show = s => { live.hovered = { session: s }; renderCard(); return $('card'); };
const now = Date.now();
const pr = (n, need) => ({ url: `https://github.com/o/r/pull/${n}`, label: `#${n}`, need, title: `PR ${n} title` });
const session = o => ({ id: 's1', cwd: '/w/proj', title: 'proj', state: 'waiting', started: now - 3600e3, last: now - 60e3, subagents: [], github: [], ...o });
const TEN = [pr(1, 'draft'), pr(2, 'ready'), pr(3, 'draft'), pr(4, 'waiting'), pr(5, 'waiting'), pr(6, 'draft'), pr(7, 'draft'), pr(8, 'draft'), pr(9, 'draft'), pr(10, 'draft'), pr(11, 'draft')];
const fire = (el, type, init = {}) => el.dispatchEvent(Object.assign(new Event(type), init));

test('the PR header sums them up, and a hovered chip puts its title there until the pointer leaves', () => {
  const card = show(session({ github: TEN }));
  const [ph] = find(card, 'ph');
  assert.strictEqual(text(ph), 'PRs · 1 ready · 2 in review · 8 drafts');
  const chips = [...find(card, 'chips')[0].children];
  assert.strictEqual(chips.length, 11, 'more than three PRs start as chips');
  assert.deepStrictEqual(chips.slice(0, 3).map(text), ['#2', '#4', '#5'], 'worst first: ready, then in review, then drafts');
  const header = () => text(find(card, 'ph')[0]);
  fire(chips[1], 'pointerenter');
  assert.strictEqual(header(), 'PR 4 title');
  assert.strictEqual(header(), text(find(show(session({ github: TEN })), 'ph')[0]), 'and keeps it through a redraw');
  fire(find(card, 'chips')[0].children[1], 'pointerleave');
  assert.strictEqual(header(), 'PRs · 1 ready · 2 in review · 8 drafts');
});

test('an open list shows the worst four, failing and changes requested first, then the rest as links', () => {
  const tip = $('prTip'), prs = [pr(1, 'draft'), pr(2, 'waiting'), pr(3, 'changes'), pr(4, 'ready'), pr(5, 'failing'), pr(6, 'draft')];
  live.prList.s1 = true;
  const card = show(session({ github: prs }));
  assert.deepStrictEqual(find(card, 'pr2').map(a => a.href), [5, 3, 4, 2].map(n => pr(n).url));
  const [more] = find(card, 'more');
  assert.strictEqual(text(more), '2 more: #1#6', 'the commas are drawn after each link (CSS), so the links touch');
  const overflow = anchors(more);
  assert.strictEqual(overflow[1].hasAttribute('title'), false, 'no native title over the tip');
  // near the window's right edge: the tip keeps 8px inside it
  vi.spyOn(overflow[1], 'getBoundingClientRect').mockReturnValue({ left: 1400, right: 1420, top: 300, bottom: 315, width: 20 });
  fire(overflow[1], 'focus');
  assert.deepStrictEqual([tip.style.left, tip.style.top], [`${1440 - 240 - 8}px`, `${300 - 40 - 8}px`], 'keyboard focus shows it, clamped');
  fire(overflow[1], 'blur');
  assert.strictEqual(tip.className, 'badgeTip', 'blur hides it');
  fire(overflow[1], 'pointerenter');
  assert.deepStrictEqual([text(tip), tip.className], ['PR 6 title', 'badgeTip show'], 'hovering one past the cap shows its title in the badges\' tooltip');
  fire(overflow[1], 'pointerleave');
  assert.strictEqual(tip.className, 'badgeTip', 'and leaving hides it');
  assert.strictEqual(find(card, 'chips').length, 0);
  live.prList = {};
  assert.strictEqual(find(show(session({ github: prs.slice(0, 3) })), 'pr2').length, 3, 'three or fewer are listed until toggled');
});

test('the toggle flips the session\'s view, tells the server, and the server\'s settings decide what every window shows', () => {
  const card = show(session({ github: TEN }));
  const [tog] = find(card, 'tog');
  assert.strictEqual(tog.getAttribute('aria-label'), 'List PRs with their titles');
  assert.strictEqual(tog.title, 'List PRs with their titles', 'a tooltip too');
  assert.strictEqual(text(tog), '', 'an icon, no text');
  tog.click(); // a button, which the card's own click handler leaves alone (wiring.ts)
  assert.strictEqual(JSON.stringify(posts), JSON.stringify([['/settings', { prList: { s1: true } }]]));
  assert.strictEqual(find(show(session({ github: TEN })), 'pr2').length, 4, 'now listed');
  // another window gets the setting from the server (wiring.ts: live.prList = st.prList)
  reset();
  live.prList = { s1: true, s2: false };
  assert.strictEqual(find(show(session({ github: TEN })), 'pr2').length, 4);
  assert.strictEqual(find(show(session({ id: 's2', github: [pr(1, 'ready')] })), 'pr2').length, 0, 's2 chose chips with one PR');
});

test('an agent is three lines: dot, tag chip only when its step has one, model and time; its job; its step', () => {
  const agent = o => ({ id: 'a', type: 'opus-implement', description: 'Build the card', model: 'Opus 5.5', started: now - 8 * 60e3, last: now - 2e3, ...o });
  const card = show(session({ state: 'working', subagents: [agent({ activity: '[card-e] Run the tests' }), agent({ id: 'b', started: now - 7 * 60e3, activity: 'Read card.ts', last: now - 30e3, model: 'Haiku 4.5', type: 'Explore' })] }));
  const agents = find(card, 'agent');
  assert.deepStrictEqual(agents.map(r => [r.localName, ...[...r.children[0].children].map(c => c.className)]), [['button', 'arow', 'job', 'astep'], ['button', 'arow', 'job', 'astep']], 'a native button, so the keyboard opens it too');
  assert.deepStrictEqual(find(card, 'arow').map(r => [...r.children].map(c => c.className)), [['live', 'tag', 'model', 't'], ['live quiet', 'model', 't']], 'a tag chip only for a tagged step; dim after 10 s quiet');
  assert.deepStrictEqual(find(card, 'arow').map(text), ['card-eOpus 5.58m', 'Haiku 4.57m'], 'no type');
  assert.deepStrictEqual(find(card, 'job').map(text), ['Build the card', 'Build the card']);
  assert.deepStrictEqual(find(card, 'astep').map(text), ['Run the tests', 'Read card.ts'], 'the tag comes off the step');
});

test('a click opens an agent in full and another closes it; it stays open through redraws until the card closes', () => {
  const s = session({ state: 'working', subagents: [{ id: 'a', description: 'One', started: now - 2e3, last: now }, { id: 'b', description: 'Two', started: now - 1e3, last: now }] });
  const states = card => find(card, 'agent').map(r => [r.className, r.getAttribute('aria-expanded')]);
  let card = show(s);
  assert.deepStrictEqual(states(card), [['agent', 'false'], ['agent', 'false']]);
  find(card, 'agent')[1].click();
  assert.deepStrictEqual(states(card), [['agent', 'false'], ['agent open', 'true']], 'opens in place');
  card = show(s);
  assert.deepStrictEqual(states(card), [['agent', 'false'], ['agent open', 'true']], 'still open after a redraw');
  find(card, 'agent')[1].click();
  assert.deepStrictEqual(states(show(s)), [['agent', 'false'], ['agent', 'false']], 'another click closes it');
  find(show(s), 'agent')[0].click();
  assert.deepStrictEqual(states(show(s)), [['agent open', 'true'], ['agent', 'false']], 'the first is open now');
  hideCard();
  assert.deepStrictEqual(states(show(s)), [['agent', 'false'], ['agent', 'false']], 'a new card starts closed');
});

test('a session\'s header opens the session, and shift-click on it snoozes', () => {
  const calls = [], m = {};
  m.zone = hoverZone(() => m, () => calls.push('open'), 48);
  m.zone.menu = () => calls.push('snooze');
  live.moths = new Map([['s1', m]]);
  const h = () => show(session({})).children[0].children[0];
  assert.deepStrictEqual([h().localName, h().title], ['button', 'Open this session'], 'a native button in the header');
  fire(h(), 'click', { shiftKey: false });
  fire(h(), 'click', { shiftKey: true });
  assert.deepStrictEqual(calls, ['open', 'snooze']);
});

test('compact shows every agent, oldest first, and the order holds however the list or their activity changes', () => {
  const agent = (id, startedAgo, lastAgo) => ({ id, type: 'Explore', description: `Agent ${id}`, started: now - startedAgo, last: now - lastAgo, activity: '' });
  const jobs = subagents => find(show(session({ state: 'working', subagents })), 'job').map(text);
  const first = jobs([agent('c', 3e5, 1e3), agent('a', 9e5, 50e3), agent('e', 1e5, 2e3), agent('b', 6e5, 30e3), agent('d', 6e5, 5e3)]);
  assert.deepStrictEqual(first, ['Agent a', 'Agent b', 'Agent d', 'Agent c', 'Agent e'], 'by start, ties by id, all five');
  // the next snapshot: the list in another order and who was heard from last turned around
  assert.deepStrictEqual(jobs([agent('d', 6e5, 50e3), agent('e', 1e5, 30e3), agent('b', 6e5, 1e3), agent('a', 9e5, 2e3), agent('c', 3e5, 5e3)]), first);
  assert.deepStrictEqual(find(show(session({ subagents: [agent('a', 9e5, 1e3)] })), 'more'), [], 'no "more" line');
});

test('the state line shows only what the pill doesn\'t already say', () => {
  const state = note => find(show(session({ note, forYou: { you: [], questions: note.startsWith('Asks') ? ['Merge it?'] : [] } })), 'state').map(text);
  for (const note of ['Finished its turn', 'Finished its turn (2 still running)', 'Waiting on 2 agents', 'Asks: Merge it?']) assert.deepStrictEqual(state(note), [], note);
  assert.deepStrictEqual(state('Wants permission to use Bash'), ['Wants permission to use Bash']);
  assert.deepStrictEqual(state('Turn ended with an API error'), ['Turn ended with an API error']);
});

test('a background task that is one of the agents is listed once, as the agent', () => {
  const card = show(session({ state: 'paused', tasks: ['Build the card', 'preview server'], subagents: [{ id: 'a', description: 'Build the card', last: now }] }));
  assert.deepStrictEqual(find(card, 'job').map(text), ['Build the card', 'preview server']);
});

test('the header stays outside the scrolling body, which is keyed by its session', () => {
  const card = show(session({ github: TEN }));
  assert.deepStrictEqual([...card.children].map(c => [c.localName, c.className, c.dataset.key]), [['h3', '', undefined], ['div', 'cardBody', 's1']]);
});

test('an agent with no start time sorts after the timed ones, by id, and stays put', () => {
  const agent = (id, started) => ({ id, description: `Agent ${id}`, started, last: now });
  const jobs = subagents => find(show(session({ state: 'working', subagents })), 'job').map(text);
  const want = ['Agent x', 'Agent a', 'Agent b'];
  assert.deepStrictEqual(jobs([agent('b'), agent('x', now - 1e3), agent('a')]), want);
  assert.deepStrictEqual(jobs([agent('a'), agent('b'), agent('x', now - 1e3)]), want);
});

test('agents sit in a band of their own in the tray, apart from the side sessions and PRs', () => {
  const card = show(session({ state: 'working', tasks: ['preview server'], subagents: [{ id: 'a', description: 'Build', started: now, last: now }], github: [pr(1, 'ready')] }));
  const [tray] = find(card, 'tray'), [zone] = find(card, 'agentZone');
  assert.strictEqual(tray.children[0], zone, 'first in the tray');
  assert.deepStrictEqual(find(zone, 'job').map(text), ['Build', 'preview server'], 'the agents and the background tasks');
  assert.deepStrictEqual(find(zone, 'phead'), [], 'the PRs are outside it');
});

test('a listed PR shows how long it has been open, at the end of its second line', () => {
  live.prList.s1 = true;
  const card = show(session({ github: [{ ...pr(1, 'ready'), createdAt: new Date(now - 3 * 86400e3 - 60e3).toISOString() }, pr(2, 'draft')] }));
  const lines = find(card, 'me');
  assert.deepStrictEqual(lines.map(l => l.childNodes[l.childNodes.length - 1].className), ['t', undefined], 'only with a createdAt');
  assert.strictEqual(text(lines[0].lastChild), '3d');
});

test('the status pill does what a right-click on the moth does (snooze, sleep, wake), and doesn\'t open the session', () => {
  const calls = [], m = {}, snoozes = [];
  m.zone = hoverZone(() => m, () => calls.push('open'), 48);
  m.zone.menu = () => snoozes.push('/snooze'); // state.ts's menu posts the next snooze
  live.moths = new Map([['s1', m]]);
  const pill = o => find(show(session(o)), 'chip')[0];
  const p = pill({});
  assert.strictEqual(p.localName, 'button');
  assert.deepStrictEqual([...show(session({})).children[0].children].map(c => c.className), ['open', 'chip waiting', 'pin'], 'beside the open button, not inside it, so its click can\'t reach it (then the pin)');
  p.click();
  assert.deepStrictEqual([calls, snoozes], [[], ['/snooze']], 'the snooze, and not the open');
  assert.deepStrictEqual([pill({}).title, pill({ snoozed: true }).title, pill({ snoozed: true, forGood: true }).title], ['Snooze', 'Sleep until you wake it', 'Wake']);
  assert.strictEqual(pill({}).getAttribute('aria-label'), 'needs you: snooze');
});

test('no PR link shows a native "#n" title; a list row shows its title in the tip only when it is cut short', () => {
  const tip = $('prTip');
  const titles = card => anchors(card).map(a => a.title);
  assert.deepStrictEqual(titles(show(session({ github: TEN }))).filter(Boolean), [], 'chips');
  live.prList.s1 = true;
  const card = show(session({ github: TEN }));
  assert.deepStrictEqual(titles(card).filter(Boolean), [], 'list rows and overflow links');
  const [row] = find(card, 'pr2'), [ti] = find(row, 'ti');
  vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ left: 10, right: 200, top: 300, bottom: 330, width: 190 });
  const width = (scroll, client) => { for (const [k, v] of [['scrollWidth', scroll], ['clientWidth', client]]) Object.defineProperty(ti, k, { value: v, configurable: true }); };
  width(150, 190);
  fire(row, 'pointerenter');
  assert.strictEqual(tip.className, 'badgeTip', 'it fits: no tip');
  width(400, 190);
  fire(row, 'pointerenter');
  assert.deepStrictEqual([text(tip), tip.className], [text(ti), 'badgeTip show'], 'cut short: its full title');
  fire(row, 'pointerleave');
  assert.strictEqual(tip.className, 'badgeTip');
});

test('an agent with no tag or model is two lines (job beside the dot), and a shell command has "shell" in the model\'s place', () => {
  const card = show(session({ state: 'working', tasks: ['npm run preview'], subagents: [
    { id: 'a', description: 'Tagged', model: 'Opus 5.5', activity: '[t] Step', started: now - 1e3, last: now },
    { id: 'b', description: 'Model only', model: 'Opus 5.5', activity: 'Step', started: now - 2e3 + 1e3, last: now },
    { id: 'c', description: 'Neither', activity: 'Step', started: now, last: now }] }));
  const shape = r => [...r.children[0].children].map(c => [c.className, ...(c.className === 'arow' ? [...c.children].map(x => x.className) : [])]);
  assert.deepStrictEqual(find(card, 'agent').map(shape), [
    [['arow', 'live', 'tag', 'model', 't'], ['job'], ['astep']],
    [['arow', 'live', 'model', 't'], ['job'], ['astep']],
    [['arow', 'live', 'job', 't'], ['astep']],
    [['arow', 'live quiet', 'model'], ['job']]], 'a shell command: "shell" where the model goes, then the command');
  assert.strictEqual(text(find(card, 'agent')[3]), 'shellnpm run preview');
  const [head] = find(find(card, 'agentZone')[0], 'head');
  assert.strictEqual(text(head), 'Running3 agents · 1 shell');
});

test('a shell command shows how long it has run, from the session\'s taskStarted', () => {
  const card = show(session({ state: 'paused', tasks: ['npm run preview', 'tail -f log'], taskStarted: { 'npm run preview': now - 5 * 60e3 } }));
  assert.deepStrictEqual(find(card, 'agent').map(r => find(r, 't').map(text)), [['5m'], []], 'a start, then none');
});

test('every control is an outer button or link that fills its zone, around an inner face that\'s the visible part', () => {
  const faced = card => [...find(card, 'open'), ...find(card, 'chip'), ...find(card, 'agent'), ...anchors(card).filter(n => /pr2|ov|^$/.test(n.className) && n.href)]
    .map(n => [n.localName, n.children.length, n.children[0]?.className?.split(' ')[0]]);
  const s = session({ state: 'working', subagents: [{ id: 'a', description: 'Build', started: now, last: now }], github: TEN });
  assert.ok(faced(show(s)).every(([, n, c]) => n === 1 && c === 'face'), 'header, pill, agent, chips');
  live.prList.s1 = true;
  const listed = faced(show(s));
  assert.ok(listed.length > 6 && listed.every(([, n, c]) => n === 1 && c === 'face'), 'list rows and overflow links');
});

test('one PR with changes requested reads singular, and two shell commands with the same description open separately', () => {
  const card = show(session({ github: [pr(3, 'ready'), pr(4, 'changes')] }));
  assert.strictEqual(text(find(card, 'ph')[0]), 'PRs · 1 change requested · 1 ready');
  assert.strictEqual(text(find(show(session({ github: [pr(1, 'changes'), pr(2, 'changes')] })), 'ph')[0]), 'PRs · 2 changes requested');
  const s = session({ state: 'paused', tasks: ['npm test', 'npm test'] }), rows = () => find(show(s), 'agent');
  rows()[1].click();
  assert.deepStrictEqual(rows().map(r => r.className), ['agent', 'agent open'], 'only the one clicked');
});

// The pinned sidebar: the pin in a card's header pins or unpins its session, the server's list decides what every
// window docks, and the dock stacks them in full, in the order they were pinned.
const pinOf = el => el.querySelector('.pin');
const docked = () => document.body.classList.contains('pinned') ? find($('dock'), 'name').map(text) : [];
const sections = () => [...$('dock').querySelectorAll('section')];
const list = () => JSON.stringify(posts.map(([, b]) => b.pinned.map(p => p.id)));

test('the card\'s pin toggles its session in the list, newest at the bottom, and each section\'s own pin unpins it', () => {
  const a = session({ title: 'alpha' }), b = session({ id: 's2', title: 'bravo' }), c = session({ id: 's3', title: 'charlie' });
  setSessions(a, b, c);
  const pin = pinOf(show(a));
  assert.deepStrictEqual([pin.localName, pin.getAttribute('aria-label'), text(pin)], ['button', 'Pin alpha to the sidebar', ''], 'an icon button with a label');
  pin.click();
  assert.deepStrictEqual(docked(), ['alpha']);
  assert.deepStrictEqual([pinOf($('card')).getAttribute('aria-label'), pinOf($('card')).className], ['Unpin alpha', 'pin on'], 'the open card\'s pin shows it');
  pinOf(show(c)).click();
  pinOf(show(b)).click();
  assert.deepStrictEqual(docked(), ['alpha', 'charlie', 'bravo'], 'stacked in the order they were pinned');
  pinOf(show(c)).click();
  assert.deepStrictEqual(docked(), ['alpha', 'bravo'], 'a pinned session\'s card pin unpins it, and the rest keep their places');
  pinOf(sections()[0]).click();
  assert.deepStrictEqual(docked(), ['bravo'], 'a section\'s own pin');
  pinOf(sections()[0]).click();
  assert.deepStrictEqual(docked(), []);
  assert.strictEqual(list(), JSON.stringify([['s1'], ['s1', 's3'], ['s1', 's3', 's2'], ['s1', 's2'], ['s2'], []]), 'the whole list to the server each time');
  // another window docks what the server says (wiring.ts: live.pinned = st.pinned, then renderSidebar)
  reset();
  setSessions(a, b);
  live.pinned = [{ id: 's2' }, { id: 's1' }]; renderSidebar();
  assert.deepStrictEqual(docked(), ['bravo', 'alpha']);
});

test('the sidebar shows each session in full: the whole prompt, every PR listed, no toggle', () => {
  const long = 'x'.repeat(200);
  setSessions(session({ state: 'idle', prompt: long, github: TEN }));
  live.pinned = [{ id: 's1' }]; renderSidebar();
  assert.strictEqual(find($('dock'), 'prompt').map(text)[0], `“${long}”`, 'not cut at 110');
  assert.strictEqual(find($('dock'), 'pr2').length, 11, 'every PR, however many');
  assert.deepStrictEqual([find($('dock'), 'more').length, find($('dock'), 'chips').length], [0, 0], 'no cap, and listed though the card would show chips');
  assert.strictEqual(find(show(session({ state: 'idle', prompt: long, github: TEN })), 'prompt').map(text)[0].length, 113, 'the card still cuts it');
});

test('a pinned session that ends stays in its place, dimmed, as it last was, until unpinned', () => {
  const a = session({ title: 'alpha', state: 'working', activity: 'Last step' }), b = session({ id: 's2', title: 'bravo' });
  setSessions(a, b);
  live.pinned = [{ id: 's1' }, { id: 's2' }]; renderSidebar();
  assert.deepStrictEqual(sections().map(n => n.className), ['', '']);
  setSessions(b);
  renderSidebar();
  assert.deepStrictEqual(docked(), ['alpha', 'bravo'], 'still docked, in its place');
  assert.deepStrictEqual(sections().map(n => n.className), ['ended', ''], 'dimmed');
  assert.deepStrictEqual(find(sections()[0], 'state').map(text), ['Last step'], 'as it last was');
  pinOf(sections()[0]).click();
  assert.deepStrictEqual(docked(), ['bravo']);
  // a window that never saw it leaves it out
  reset();
  setSessions(b);
  live.pinned = [{ id: 'gone' }, { id: 's2' }]; renderSidebar();
  assert.deepStrictEqual(docked(), ['bravo']);
});

test('no pin and no sidebar under 800px wide, in the iTerm panel or the screensavers; they come back when there\'s room', () => {
  const s = session({});
  setSessions(s);
  live.pinned = [{ id: 's1' }];
  for (const [width, mode] of [[799, ''], [375, ''], [1440, 'panel'], [1440, 'screensaver'], [1440, 'ambient']]) {
    vi.stubGlobal('innerWidth', width); document.body.className = mode;
    assert.ok(!pinOf(show(s).children[0]), `${width} ${mode}: no pin`); // not strictEqual: a failure would print the whole DOM node
    renderSidebar();
    assert.deepStrictEqual(docked(), [], `${width} ${mode}: no sidebar`);
  }
  vi.stubGlobal('innerWidth', 800); document.body.className = '';
  assert.ok(pinOf(show(s).children[0]), '800 wide has the pin');
  renderSidebar();
  assert.deepStrictEqual(docked(), ['proj'], 'and the remembered pin docks again');
});

test('each pinned section\'s PRs toggle to chips on their own, kept with the pin, apart from the card\'s', () => {
  const a = session({ github: TEN }), b = session({ id: 's2', title: 'bravo', github: TEN });
  setSessions(a, b);
  live.pinned = [{ id: 's1' }, { id: 's2' }]; renderSidebar();
  const listed = () => sections().map(sec => [find(sec, 'pr2').length, find(sec, 'chips').length]);
  assert.deepStrictEqual(listed(), [[11, 0], [11, 0]], 'listed by default');
  const tog = find(sections()[0], 'tog')[0];
  assert.strictEqual(tog.getAttribute('aria-label'), 'Show PRs as chips', 'the card\'s toggle');
  tog.click();
  assert.deepStrictEqual(listed(), [[0, 1], [11, 0]], 'only that section turns to chips');
  assert.strictEqual(JSON.stringify(posts.at(-1)), JSON.stringify(['/settings', { pinned: [{ id: 's1', chips: true }, { id: 's2' }] }]), 'kept with its pin');
  assert.deepStrictEqual([find(show(a), 'chips').length, find(show(a), 'pr2').length], [1, 0], 'the card keeps its own rule (chips past three PRs)');
  assert.strictEqual(JSON.stringify(live.prList), '{}', 'and the card\'s setting is untouched');
  live.prList = { s2: false }; renderSidebar();
  assert.deepStrictEqual(listed(), [[0, 1], [11, 0]], 'nor does the card\'s setting reach the sidebar');
  find(sections()[0], 'tog')[0].click();
  assert.deepStrictEqual(listed(), [[11, 0], [11, 0]], 'and back');
  // another window, from the server's settings
  reset();
  setSessions(a, b);
  live.pinned = [{ id: 's1' }, { id: 's2', chips: true }]; renderSidebar();
  assert.deepStrictEqual(sections().map(sec => [find(sec, 'pr2').length, find(sec, 'chips').length]), [[11, 0], [0, 1]]);
});

test('the closed sidebar is inert: out of the tab order and the accessibility tree, with nothing pinned or under 800px', () => {
  setSessions(session({}));
  renderSidebar();
  assert.strictEqual($('dock').inert, true, 'nothing pinned');
  live.pinned = [{ id: 's1' }]; renderSidebar();
  assert.strictEqual($('dock').inert, false, 'open');
  vi.stubGlobal('innerWidth', 799);
  renderSidebar();
  assert.strictEqual($('dock').inert, true, 'too narrow');
});

test('pinning sends only the pins this window can show, so one whose session it never saw goes', () => {
  const a = session({ title: 'alpha' }), b = session({ id: 's2', title: 'bravo' });
  setSessions(a, b);
  live.pinned = [{ id: 'gone' }, { id: 's2', chips: true }]; renderSidebar();
  pinOf(show(a)).click();
  assert.strictEqual(JSON.stringify(posts.at(-1)), JSON.stringify(['/settings', { pinned: [{ id: 's2', chips: true }, { id: 's1' }] }]));
  assert.deepStrictEqual(docked(), ['bravo', 'alpha']);
});

test('in the sidebar an agent is a plain row, shown in full, that leaves the card\'s open agents alone', () => {
  const s = session({ state: 'working', tasks: ['npm test'], subagents: [{ id: 'a', description: 'Build', started: now, last: now }] });
  setSessions(s);
  live.pinned = [{ id: 's1' }]; renderSidebar();
  const rows = find($('dock'), 'agent');
  assert.strictEqual(rows.length, 2, 'the agent and the shell command');
  assert.deepStrictEqual(rows.map(r => [r.localName, r.className, r.onclick, r.getAttribute('aria-expanded')]), [['div', 'agent open', null, null], ['div', 'agent open', null, null]]);
  assert.strictEqual(openAgents.size, 0);
  assert.deepStrictEqual(find(show(s), 'agent').map(r => [r.localName, r.className]), [['button', 'agent'], ['button', 'agent']], 'the card\'s are still buttons, closed');
});

test('every handler property the card and its stale cards set is one morph copies onto the live element', () => {
  const src = ['card', 'stale'].map(f => fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'scene', f + '.ts'), 'utf8')).join('\n');
  const set = [...new Set([...src.matchAll(/\.(on[a-z]+) =/g)].map(m => m[1]))];
  assert.ok(set.includes('onclick') && set.includes('onfocus'), `found ${set}`);
  assert.deepStrictEqual(set.filter(h => !HANDLERS.includes(h)), [], 'set but not copied, so a redraw would keep the old handler');
});
