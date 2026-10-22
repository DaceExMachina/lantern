// The moth's hover card (src/components/SessionCard.vue, mounted in index.html's real #card as src/main.ts does): the PR
// header that sums the PRs up and names a hovered chip, the list capped at the worst few, the per-session toggle from the
// server's settings, the agent rows (job, time, model, a tag chip only for a tagged step), times that tick, and controls
// that keep their elements through a re-render. (The pinned sidebar is test/pinned-dock.spec.js's; test/morph.test.js
// checks both in WebKit.)
import assert from 'node:assert';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import SessionCard from '../src/components/SessionCard.vue';
import { $ } from '../src/scene/scene';
import { chrome, live } from '../src/scene/live';
import { sessionMoth, sessions, sync } from '../src/scene/state';
import { enterZone, expandCard, hideCard, hoverZone } from '../src/scene/card';
import { useLanternStore } from '../src/stores/lantern';
import { parseSettings } from '../src/types';

const text = n => n.textContent;
const find = (n, cls) => [...n.querySelectorAll('.' + cls)];
const anchors = n => [...n.querySelectorAll('a')];

const posts = [];
const setSessions = (...ss) => { live.raw = ss; sync(); };
// the page as it first loads: nothing hovered, listed, pinned or known, the card empty, 1440 wide
let app, store;
// the card as src/main.ts mounts it, with the scene's side of the store wired the same way
const mount = () => {
  app?.unmount();
  const pinia = createPinia();
  store = useLanternStore(pinia);
  chrome.update = () => { store.sessions = sessions; store.hovered = live.hovered; store.expanded = live.expanded; store.now = Date.now(); };
  app = createApp(SessionCard).use(pinia);
  app.mount($('card'));
};
// the server's settings for every window: which sessions list their PRs (wiring.ts and events.ts hear them)
const settings = o => { store.settings = parseSettings(o); };
const reset = () => {
  live.hovered = null; live.moths = new Map();
  setSessions();
  hideCard();
  document.body.className = '';
  vi.stubGlobal('innerWidth', 1440);
  mount();
};
beforeEach(() => {
  posts.length = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation((url, o) => { posts.push([url, JSON.parse(o.body)]); return Promise.resolve(); });
  for (const [k, v] of [['offsetWidth', 240], ['offsetHeight', 40]]) Object.defineProperty($('prTip'), k, { value: v, configurable: true }); // no layout in happy-dom
  reset();
});
afterEach(() => { app?.unmount(); app = null; vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

// the card for `s`, as the server sends it: its moth hovered, after Vue has patched
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
const fire = (el, type, init = {}) => el.dispatchEvent(Object.assign(new Event(type), init));

test('the PR header sums them up, and a hovered chip puts its title there until the pointer leaves', async () => {
  const card = await show(session({ github: TEN }));
  const [ph] = find(card, 'ph');
  assert.strictEqual(text(ph), 'PRs · 1 ready · 2 in review · 8 drafts');
  const chips = [...find(card, 'chips')[0].children];
  assert.strictEqual(chips.length, 11, 'more than three PRs start as chips');
  assert.deepStrictEqual(chips.slice(0, 3).map(text), ['#2', '#4', '#5'], 'worst first: ready, then in review, then drafts');
  const header = () => text(find(card, 'ph')[0]);
  fire(chips[1], 'pointerenter'); await nextTick();
  assert.strictEqual(header(), 'PR 4 title');
  assert.strictEqual(header(), text(find(await show(session({ github: TEN })), 'ph')[0]), 'and keeps it through a redraw');
  fire(find(card, 'chips')[0].children[1], 'pointerleave'); await nextTick();
  assert.strictEqual(header(), 'PRs · 1 ready · 2 in review · 8 drafts');
});

test('an open list shows the worst four, failing and changes requested first, then the rest as links', async () => {
  const tip = $('prTip'), prs = [pr(1, 'draft'), pr(2, 'waiting'), pr(3, 'changes'), pr(4, 'ready'), pr(5, 'failing'), pr(6, 'draft')];
  settings({ prList: { s1: true } });
  const card = await show(session({ github: prs }));
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
  settings({});
  assert.strictEqual(find(await show(session({ github: prs.slice(0, 3) })), 'pr2').length, 3, 'three or fewer are listed until toggled');
});

test('the toggle flips the session\'s view, tells the server, and the server\'s settings decide what every window shows', async () => {
  const card = await show(session({ github: TEN }));
  const [tog] = find(card, 'tog');
  assert.strictEqual(tog.getAttribute('aria-label'), 'List PRs with their titles');
  assert.strictEqual(tog.title, 'List PRs with their titles', 'a tooltip too');
  assert.strictEqual(text(tog), '', 'an icon, no text');
  tog.click(); // a button, which the card's own click handler leaves alone (wiring.ts)
  assert.strictEqual(JSON.stringify(posts), JSON.stringify([['/settings', { prList: { s1: true } }]]));
  assert.strictEqual(find(await show(session({ github: TEN })), 'pr2').length, 4, 'now listed');
  // another window gets the setting from the server (events.ts: store.settings)
  reset();
  settings({ prList: { s1: true, s2: false } });
  assert.strictEqual(find(await show(session({ github: TEN })), 'pr2').length, 4);
  assert.strictEqual(find(await show(session({ id: 's2', github: [pr(1, 'ready')] })), 'pr2').length, 0, 's2 chose chips with one PR');
});

test('an agent is three lines: dot, tag chip only when its step has one, model and time; its job; its step', async () => {
  const agent = o => ({ id: 'a', type: 'opus-implement', description: 'Build the card', model: 'Opus 5.5', started: now - 8 * 60e3, last: now - 2e3, ...o });
  const card = await show(session({ state: 'working', subagents: [agent({ activity: '[card-e] Run the tests' }), agent({ id: 'b', started: now - 7 * 60e3, activity: 'Read card.ts', last: now - 30e3, model: 'Haiku 4.5', type: 'Explore' })] }));
  const agents = find(card, 'agent');
  assert.deepStrictEqual(agents.map(r => [r.localName, ...[...r.children[0].children].map(c => c.className)]), [['button', 'arow', 'job', 'astep'], ['button', 'arow', 'job', 'astep']], 'a native button, so the keyboard opens it too');
  assert.deepStrictEqual(find(card, 'arow').map(r => [...r.children].map(c => c.className)), [['live', 'tag', 'model', 't'], ['live quiet', 'model', 't']], 'a tag chip only for a tagged step; dim after 10 s quiet');
  assert.deepStrictEqual(find(card, 'arow').map(text), ['card-eOpus 5.58m', 'Haiku 4.57m'], 'no type');
  assert.deepStrictEqual(find(card, 'job').map(text), ['Build the card', 'Build the card']);
  assert.deepStrictEqual(find(card, 'astep').map(text), ['Run the tests', 'Read card.ts'], 'the tag comes off the step');
});

test('a click opens an agent in full and another closes it; it stays open through redraws until the card closes', async () => {
  const s = session({ state: 'working', subagents: [{ id: 'a', description: 'One', started: now - 2e3, last: now }, { id: 'b', description: 'Two', started: now - 1e3, last: now }] });
  const states = card => find(card, 'agent').map(r => [r.className, r.getAttribute('aria-expanded')]);
  let card = await show(s);
  assert.deepStrictEqual(states(card), [['agent', 'false'], ['agent', 'false']]);
  const pressed = find(card, 'agent')[1];
  pressed.click(); await nextTick();
  assert.deepStrictEqual(states(card), [['agent', 'false'], ['agent open', 'true']], 'opens in place');
  assert.strictEqual(find(card, 'agent')[1], pressed, 'the same button, opened');
  card = await show(s);
  assert.deepStrictEqual(states(card), [['agent', 'false'], ['agent open', 'true']], 'still open after a redraw');
  find(card, 'agent')[1].click();
  assert.deepStrictEqual(states(await show(s)), [['agent', 'false'], ['agent', 'false']], 'another click closes it');
  find(await show(s), 'agent')[0].click();
  assert.deepStrictEqual(states(await show(s)), [['agent open', 'true'], ['agent', 'false']], 'the first is open now');
  hideCard();
  assert.deepStrictEqual(states(await show(s)), [['agent', 'false'], ['agent', 'false']], 'a new card starts closed');
});

test('a session\'s header opens the session, and shift-click on it snoozes', async () => {
  const calls = [], m = { key: 's1' };
  m.zone = hoverZone(() => m, () => calls.push('open'), 48);
  m.zone.menu = () => calls.push('snooze');
  live.moths = new Map([['s1', m]]);
  const h = async () => (await show(session({}))).children[0].children[0];
  assert.deepStrictEqual([(await h()).localName, (await h()).title], ['button', 'Open this session'], 'a native button in the header');
  fire(await h(), 'click', { shiftKey: false });
  fire(await h(), 'click', { shiftKey: true });
  assert.deepStrictEqual(calls, ['open', 'snooze']);
});

test('compact shows every agent, oldest first, and the order holds however the list or their activity changes', async () => {
  const agent = (id, startedAgo, lastAgo) => ({ id, type: 'Explore', description: `Agent ${id}`, started: now - startedAgo, last: now - lastAgo, activity: '' });
  const jobs = async subagents => find(await show(session({ state: 'working', subagents })), 'job').map(text);
  const first = await jobs([agent('c', 3e5, 1e3), agent('a', 9e5, 50e3), agent('e', 1e5, 2e3), agent('b', 6e5, 30e3), agent('d', 6e5, 5e3)]);
  assert.deepStrictEqual(first, ['Agent a', 'Agent b', 'Agent d', 'Agent c', 'Agent e'], 'by start, ties by id, all five');
  // the next snapshot: the list in another order and who was heard from last turned around
  assert.deepStrictEqual(await jobs([agent('d', 6e5, 50e3), agent('e', 1e5, 30e3), agent('b', 6e5, 1e3), agent('a', 9e5, 2e3), agent('c', 3e5, 5e3)]), first);
  assert.deepStrictEqual(find(await show(session({ subagents: [agent('a', 9e5, 1e3)] })), 'more'), [], 'no "more" line');
});

test('the state line shows only what the pill doesn\'t already say', async () => {
  const state = async note => find(await show(session({ note, forYou: { you: [], questions: note.startsWith('Asks') ? ['Merge it?'] : [] } })), 'state').map(text);
  for (const note of ['Finished its turn', 'Finished its turn (2 still running)', 'Waiting on 2 agents', 'Asks: Merge it?']) assert.deepStrictEqual(await state(note), [], note);
  assert.deepStrictEqual(await state('Wants permission to use Bash'), ['Wants permission to use Bash']);
  assert.deepStrictEqual(await state('Turn ended with an API error'), ['Turn ended with an API error']);
});

test('a background task that is one of the agents is listed once, as the agent', async () => {
  const card = await show(session({ state: 'paused', tasks: ['Build the card', 'preview server'], subagents: [{ id: 'a', description: 'Build the card', last: now }] }));
  assert.deepStrictEqual(find(card, 'job').map(text), ['Build the card', 'preview server']);
});

test('the header stays outside the scrolling body', async () => {
  const card = await show(session({ github: TEN }));
  assert.deepStrictEqual([...card.children].map(c => [c.localName, c.className]), [['h3', ''], ['div', 'cardBody']]);
});

test('an agent with no start time sorts after the timed ones, by id, and stays put', async () => {
  const agent = (id, started) => ({ id, description: `Agent ${id}`, started, last: now });
  const jobs = async subagents => find(await show(session({ state: 'working', subagents })), 'job').map(text);
  const want = ['Agent x', 'Agent a', 'Agent b'];
  assert.deepStrictEqual(await jobs([agent('b'), agent('x', now - 1e3), agent('a')]), want);
  assert.deepStrictEqual(await jobs([agent('a'), agent('b'), agent('x', now - 1e3)]), want);
});

test('agents sit in a band of their own in the tray, apart from the side sessions and PRs', async () => {
  const card = await show(session({ state: 'working', tasks: ['preview server'], subagents: [{ id: 'a', description: 'Build', started: now, last: now }], github: [pr(1, 'ready')] }));
  const [tray] = find(card, 'tray'), [zone] = find(card, 'agentZone');
  assert.strictEqual(tray.children[0], zone, 'first in the tray');
  assert.deepStrictEqual(find(zone, 'job').map(text), ['Build', 'preview server'], 'the agents and the background tasks');
  assert.deepStrictEqual(find(zone, 'phead'), [], 'the PRs are outside it');
});

test('a listed PR shows how long it has been open, at the end of its second line', async () => {
  settings({ prList: { s1: true } });
  const card = await show(session({ github: [{ ...pr(1, 'ready'), createdAt: new Date(now - 3 * 86400e3 - 60e3).toISOString() }, pr(2, 'draft')] }));
  const lines = find(card, 'me');
  assert.deepStrictEqual(lines.map(l => l.childNodes[l.childNodes.length - 1].className), ['t', undefined], 'only with a createdAt');
  assert.strictEqual(text(lines[0].lastChild), '3d');
});

test('the status pill does what a right-click on the moth does (snooze, sleep, wake), and doesn\'t open the session', async () => {
  const calls = [], m = { key: 's1' }, snoozes = [];
  m.zone = hoverZone(() => m, () => calls.push('open'), 48);
  m.zone.menu = () => snoozes.push('/snooze'); // state.ts's menu posts the next snooze
  live.moths = new Map([['s1', m]]);
  const pill = async o => find(await show(session(o)), 'chip')[0];
  const p = await pill({});
  assert.strictEqual(p.localName, 'button');
  assert.deepStrictEqual([...(await show(session({}))).children[0].children].map(c => c.className), ['open', 'chip waiting', 'pin'], 'beside the open button, not inside it, so its click can\'t reach it (then the pin)');
  p.click();
  assert.deepStrictEqual([calls, snoozes], [[], ['/snooze']], 'the snooze, and not the open');
  assert.deepStrictEqual([(await pill({})).title, (await pill({ snoozed: true })).title, (await pill({ snoozed: true, forGood: true })).title], ['Snooze', 'Sleep until you wake it', 'Wake']);
  assert.strictEqual((await pill({})).getAttribute('aria-label'), 'needs you: snooze');
});

test('no PR link shows a native "#n" title; a list row shows its title in the tip only when it is cut short', async () => {
  const tip = $('prTip');
  const titles = card => anchors(card).map(a => a.title);
  assert.deepStrictEqual(titles(await show(session({ github: TEN }))).filter(Boolean), [], 'chips');
  settings({ prList: { s1: true } });
  const card = await show(session({ github: TEN }));
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

test('an agent with no tag or model is two lines (job beside the dot), and a shell command has "shell" in the model\'s place', async () => {
  const card = await show(session({ state: 'working', tasks: ['npm run preview'], subagents: [
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

test('a shell command shows how long it has run, from the session\'s taskStarted', async () => {
  const card = await show(session({ state: 'paused', tasks: ['npm run preview', 'tail -f log'], taskStarted: { 'npm run preview': now - 5 * 60e3 } }));
  assert.deepStrictEqual(find(card, 'agent').map(r => find(r, 't').map(text)), [['5m'], []], 'a start, then none');
});

test('every control is an outer button or link that fills its zone, around an inner face that\'s the visible part', async () => {
  const faced = card => [...find(card, 'open'), ...find(card, 'chip'), ...find(card, 'agent'), ...anchors(card).filter(n => /pr2|ov|^$/.test(n.className) && n.href)]
    .map(n => [n.localName, n.children.length, n.children[0]?.className?.split(' ')[0]]);
  const s = session({ state: 'working', subagents: [{ id: 'a', description: 'Build', started: now, last: now }], github: TEN });
  assert.ok(faced(await show(s)).every(([, n, c]) => n === 1 && c === 'face'), 'header, pill, agent, chips');
  settings({ prList: { s1: true } });
  const listed = faced(await show(s));
  assert.ok(listed.length > 6 && listed.every(([, n, c]) => n === 1 && c === 'face'), 'list rows and overflow links');
});

test('one PR with changes requested reads singular, and two shell commands with the same description open separately', async () => {
  const card = await show(session({ github: [pr(3, 'ready'), pr(4, 'changes')] }));
  assert.strictEqual(text(find(card, 'ph')[0]), 'PRs · 1 change requested · 1 ready');
  assert.strictEqual(text(find(await show(session({ github: [pr(1, 'changes'), pr(2, 'changes')] })), 'ph')[0]), 'PRs · 2 changes requested');
  const s = session({ state: 'paused', tasks: ['npm test', 'npm test'] }), rows = async () => find(await show(s), 'agent');
  (await rows())[1].click();
  assert.deepStrictEqual((await rows()).map(r => r.className), ['agent', 'agent open'], 'only the one clicked');
});

// The bug Dace shelved: relative times went stale. They count from the store's `now`, which ticks every second.
test('the card\'s times move on with the clock, a second at a time, with nothing else happening', async () => {
  vi.useFakeTimers({ now });
  mount(); // a store made on the fake clock, so its tick is one
  const card = await show(session({ state: 'working', last: now - 58e3, subagents: [{ id: 'a', description: 'Build', started: now - 59e3, last: now }] }));
  const times = () => [text(find(card, 'foot')[0]).split(' · ').at(-1), text(find(card, 't')[0])];
  assert.deepStrictEqual(times(), ['active 58s ago', '59s']);
  vi.advanceTimersByTime(2000); await nextTick();
  assert.deepStrictEqual(times(), ['active 1m ago', '1m'], 'two seconds on');
});

// WebKit drops a click when the button pressed is replaced before the release, so a re-render (a server update, the
// clock's tick) must patch every control in place. test/morph.test.js presses one for real in WebKit.
test('a re-render between press and release keeps every control\'s element', async () => {
  const s = session({ state: 'working', activity: 'Step 1', subagents: [{ id: 'a', description: 'Build', started: now, last: now }], github: TEN });
  const card = await show(s);
  const controls = () => [...card.querySelectorAll('button, a')];
  const before = controls(), tog = find(card, 'tog')[0];
  assert.ok(before.length > 10 && tog, `the open button, pill, pin, agent, toggle and chips: ${before.length}`);
  fire(tog, 'pointerdown');
  await show({ ...s, activity: 'Step 2', last: now + 1e3 }); // the next snapshot from the server lands mid-press
  assert.strictEqual(text(find(card, 'state')[0]), 'Step 2', 'it re-rendered');
  assert.ok(controls().every((c, i) => c === before[i]) && controls().length === before.length, 'each control is the element it was');
  tog.click(); await nextTick();
  assert.strictEqual(find(card, 'pr2').length, 4, 'and the release toggles the list');
});

// hovered, not clicked: the compact card for `s`
const hover = async s => { hideCard(); live.raw = [...live.raw.filter(o => o.id !== s.id), s]; sync(); enterZone(sessionMoth(s.id).zone); await nextTick(); return $('card'); };

test('a hovered moth\'s card is compact: the header, one line of what it wants or is doing, and its work counted', async () => {
  const agents = [{ id: 'a', description: 'One', started: now - 2e3, last: now }, { id: 'b', description: 'Two', started: now - 1e3, last: now }];
  let card = await hover(session({ state: 'working', activity: 'Editing card.ts', subagents: agents, tasks: ['npm test'], github: [pr(1, 'ready'), pr(2, 'draft'), pr(3, 'waiting')] }));
  assert.deepStrictEqual([find(card, 'name').map(text), find(card, 'chip').map(text)], [['proj'], ['working']], 'the same header');
  assert.deepStrictEqual([find(card, 'gist').map(text), find(card, 'foot').map(text)], [['Editing card.ts'], ['2 agents · 1 shell · 3 PRs']]);
  assert.deepStrictEqual([find(card, 'cardBody').length, find(card, 'agent').length, find(card, 'phead').length], [0, 0, 0], 'and nothing else');
  card = await hover(session({ forYou: { questions: ['Merge it?'], you: ['Look at ', { label: '#1', url: pr(1).url }] }, github: [pr(1, 'ready')] }));
  assert.deepStrictEqual([find(card, 'gist').map(text), find(card, 'foot').map(text)], [['Merge it?'], ['1 PR']], 'a waiting session\'s question');
  card = await hover(session({ forYou: { you: ['Look at ', { label: '#1', url: pr(1).url }] } }));
  assert.deepStrictEqual([find(card, 'gist').map(text), find(card, 'foot').map(text)], [['Look at #1'], []], 'or its "You:" message, and no count with no work');
  expandCard(sessionMoth('s1').zone); await nextTick();
  assert.deepStrictEqual([find(card, 'gist').length, find(card, 'cardBody').length], [0, 1], 'a click expands it in full');
  hideCard(); await nextTick();
  assert.deepStrictEqual([find(card, 'gist').length, find(card, 'cardBody').length], [0, 1], 'and fading out, it stays in full');
});

test('the expanded card lists five agents and "n more", which lists the rest', async () => {
  const subagents = Array.from({ length: 7 }, (_, i) => ({ id: `a${i}`, description: `Agent ${i}`, started: now - (9 - i) * 1e3, last: now }));
  const card = await show(session({ state: 'working', subagents }));
  const more = find(card, 'more');
  assert.deepStrictEqual([find(card, 'job').map(text), more.map(text), more[0]?.localName], [['Agent 0', 'Agent 1', 'Agent 2', 'Agent 3', 'Agent 4'], ['2 more'], 'button']);
  more[0].click(); await nextTick();
  assert.deepStrictEqual([find(card, 'job').length, find(card, 'more').length], [7, 0], 'all seven once it\'s clicked');
  hideCard();
  assert.strictEqual(find(await show(session({ state: 'working', subagents })), 'job').length, 5, 'and five again on a new card');
});

// a stale PR's wisp or a ghost moth, hovered
const hoverStale = async (stale) => {
  const target = { stale, zone: hoverZone(() => target, () => {}, 12) };
  enterZone(target.zone);
  await nextTick();
  return $('card');
};
const wisp = { url: 'https://github.com/o/r/pull/9', label: '#9', title: 'Old PR', need: 'review', updatedAt: new Date(now - 9 * 864e5).toISOString() };

test('a wisp whose session Lantern knows shows that session\'s card, and an orphan keeps the PR-only card', async () => {
  const s = { id: 'known', state: 'idle', subagents: [], title: 'My session', last: now };
  setSessions(s);
  let card = await hoverStale({ ...wisp, owner: { id: 'known', title: 'My session', last: now } });
  assert.strictEqual(find(card, 'open').length, 1, 'the session header, which opens the session');
  assert.ok(!text(card).includes('Made by'), 'not the PR-only card');
  hideCard();
  card = await hoverStale({ ...wisp, owner: { id: 'gone', title: 'Old one', last: now } });
  assert.ok(text(card).includes('Made by Old one'), 'an owner Lantern has forgotten is only a PR');
  hideCard();
  card = await hoverStale(wisp);
  assert.ok(text(card).includes('untouched for 9 days'), 'no owner at all');
});

test('the PR-only card\'s header is laid out like a session\'s: a .title and a pill, not bare text', async () => {
  const card = await hoverStale(wisp);
  assert.strictEqual(find(card, 'title').length, 1);
  assert.strictEqual(find(card.querySelector('h3'), 'chip').length, 1);
});
