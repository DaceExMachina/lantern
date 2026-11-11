// The moth's hover card (src/components/SessionCard.vue, mounted in index.html's real #card as src/main.ts does): the PR
// header that sums the PRs up and the chips with their title tooltip (never rows or a toggle, those are the sidebar's), the agent rows (job, time, model, a tag chip only for a tagged step), times that tick, and controls
// that keep their elements through a re-render. (The pinned sidebar is test/pinned-dock.spec.js's; test/morph.test.js
// checks both in WebKit.)
import assert from 'node:assert';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import SessionCard from '../src/components/SessionCard.vue';
import { tintFor } from '../src/scene/lanterns';
import { $, post } from '../src/scene/scene';
import { chrome, live } from '../src/scene/live';
import { sessionMoth, sessions, sync } from '../src/scene/state';
import { ghosts } from '../src/scene/stale';
import { enterZone, expandCard, goToSession, hideCard, hoverZone, openCard, placeCard, pointAt, sessionUse } from '../src/scene/card';
import { useLanternStore } from '../src/stores/lantern';

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
const pr = (n, need, repo = 'r') => ({ url: `https://github.com/o/${repo}/pull/${n}`, label: `#${n}`, need, title: `PR ${n} title` });
const session = o => ({ id: 's1', cwd: '/w/proj', title: 'proj', state: 'waiting', started: now - 3600e3, last: now - 60e3, subagents: [], github: [], ...o });
const TEN = [pr(1, 'draft'), pr(2, 'ready'), pr(3, 'draft'), pr(4, 'waiting'), pr(5, 'waiting'), pr(6, 'draft'), pr(7, 'draft'), pr(8, 'draft'), pr(9, 'draft'), pr(10, 'draft'), pr(11, 'draft')];
const fire = (el, type, init = {}) => el.dispatchEvent(Object.assign(new Event(type), init));

test('a PR with feedback waiting ranks below changes requested and above ready, and says so', async () => {
  const card = await show(session({ github: [pr(1, 'ready'), pr(2, 'feedback'), pr(3, 'changes')] }));
  assert.strictEqual(text(find(card, 'ph')[0]), 'PRs · r · 1 change requested · 1 feedback waiting · 1 ready');
});

test('the PR header sums them up and stays put; a hovered or focused chip shows its title in the tooltip', async () => {
  const tip = $('prTip'), card = await show(session({ github: TEN }));
  const header = () => text(find(card, 'ph')[0]);
  assert.strictEqual(header(), 'PRs · r · 1 ready · 2 in review · 8 drafts');
  const chips = [...find(card, 'chips')[0].children];
  assert.strictEqual(chips.length, 11, 'every PR is a chip, however many');
  assert.deepStrictEqual(chips.slice(0, 3).map(text), ['#2', '#4', '#5'], 'worst first: ready, then in review, then drafts');
  assert.strictEqual(chips[1].hasAttribute('title'), false, 'no native title over the tip');
  fire(chips[1], 'pointerenter'); await nextTick();
  assert.deepStrictEqual([text(tip), tip.className], ['PR 4 title', 'badgeTip show'], 'the badges\' tooltip');
  assert.strictEqual(header(), 'PRs · r · 1 ready · 2 in review · 8 drafts', 'the header is left alone');
  fire(chips[1], 'pointerleave');
  assert.strictEqual(tip.className, 'badgeTip', 'leaving hides it');
  // near the window's right edge: the tip keeps 8px inside it
  vi.spyOn(chips[2], 'getBoundingClientRect').mockReturnValue({ left: 1400, right: 1420, top: 300, bottom: 315, width: 20 });
  fire(chips[2], 'focus');
  assert.deepStrictEqual([text(tip), tip.style.left, tip.style.top], ['PR 5 title', `${1440 - 240 - 8}px`, `${300 - 40 - 8}px`], 'keyboard focus shows it, clamped');
  fire(chips[2], 'blur');
  assert.strictEqual(tip.className, 'badgeTip', 'blur hides it');
});

test('the card shows chips only: no rows and no toggle, whatever the number of PRs', async () => {
  for (const github of [[pr(1, 'ready')], TEN]) {
    const card = await show(session({ github }));
    assert.deepStrictEqual([find(card, 'pr2').length, find(card, 'tog').length, find(card, 'more').length, find(card, 'chips')[0].children.length], [0, 0, 0, github.length]);
  }
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

// Quiet hours mark only the waits they snooze as quiet, so a snooze by hand stays one (its pill still offers to wake it),
// and a fresh snooze by hand puffs a "zz" off the moth while the first sync only records where it stands.
test('quiet hours leave a snooze by hand as it is, and a fresh snooze puffs', () => {
  live.quietUntil = Date.now() + 3600e3;
  try {
    setSessions(session({ id: 'a' }), session({ id: 'b', snoozed: true }));
    assert.deepStrictEqual(sessions.map(s => [s.id, !!s.snoozed, !!s.quiet]), [['a', true, true], ['b', true, false]]);
  } finally { live.quietUntil = 0; }
  setSessions(session({ id: 'c' }));
  assert.strictEqual(sessionMoth('c').puff, undefined, 'no puff for where it stands');
  setSessions(session({ id: 'c', snoozed: true }));
  assert.strictEqual(typeof sessionMoth('c').puff, 'number', 'a puff for the fresh snooze');
});

test('the status pill does what a right-click on the moth does (snooze, wake), and doesn\'t open the session', async () => {
  const calls = [], m = { key: 's1' }, snoozes = [];
  m.zone = hoverZone(() => m, () => calls.push('open'), 48);
  m.zone.menu = () => snoozes.push('/snooze'); // state.ts's menu posts the next snooze
  live.moths = new Map([['s1', m]]);
  const pill = async o => find(await show(session(o)), 'chip')[0];
  const p = await pill({});
  assert.strictEqual(p.localName, 'button');
  assert.deepStrictEqual([...(await show(session({}))).children[0].children].map(c => c.className), ['open', 'chip waiting', 'mark', 'pin'], 'beside the open button, not inside it, so its click can\'t reach it (then the bookmark and the pin)');
  p.click();
  assert.deepStrictEqual([calls, snoozes], [[], ['/snooze']], 'the snooze, and not the open');
  assert.deepStrictEqual([(await pill({})).title, (await pill({ snoozed: true })).title, (await pill({ snoozed: true, quiet: true })).title], ['Snooze', 'Wake', 'Snooze'], 'a snooze by quiet hours alone can still be snoozed');
  assert.strictEqual((await pill({})).getAttribute('aria-label'), 'needs you: snooze');
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
  const faced = card => [...find(card, 'open'), ...find(card, 'chip'), ...find(card, 'agent'), ...anchors(card).filter(n => /^$/.test(n.className) && n.href)]
    .map(n => [n.localName, n.children.length, n.children[0]?.className?.split(' ')[0]]);
  const s = session({ state: 'working', subagents: [{ id: 'a', description: 'Build', started: now, last: now }], github: TEN });
  const controls = faced(await show(s));
  assert.ok(controls.length > 12 && controls.every(([, n, c]) => n === 1 && c === 'face'), 'header, pill, agent, chips');
});

test('one PR with changes requested reads singular, and two shell commands with the same description open separately', async () => {
  const card = await show(session({ github: [pr(3, 'ready'), pr(4, 'changes')] }));
  assert.strictEqual(text(find(card, 'ph')[0]), 'PRs · r · 1 change requested · 1 ready');
  assert.strictEqual(text(find(await show(session({ github: [pr(1, 'changes'), pr(2, 'changes')] })), 'ph')[0]), 'PRs · r · 2 changes requested');
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
  assert.deepStrictEqual(times(), ['58s ago', '59s']);
  vi.advanceTimersByTime(2000); await nextTick();
  assert.deepStrictEqual(times(), ['1m ago', '1m'], 'two seconds on');
});

// WebKit drops a click when the button pressed is replaced before the release, so a re-render (a server update, the
// clock's tick) must patch every control in place. test/morph.test.js presses one for real in WebKit.
test('a re-render between press and release keeps every control\'s element', async () => {
  const s = session({ state: 'working', activity: 'Step 1', subagents: [{ id: 'a', description: 'Build', started: now, last: now }], github: TEN });
  const card = await show(s);
  const controls = () => [...card.querySelectorAll('button, a')];
  const before = controls(), pill = find(card, 'chip')[0];
  assert.ok(before.length > 10 && pill, `the open button, pill, pin, agent and chips: ${before.length}`);
  fire(pill, 'pointerdown');
  await show({ ...s, activity: 'Step 2', last: now + 1e3 }); // the next snapshot from the server lands mid-press
  assert.strictEqual(text(find(card, 'state')[0]), 'Step 2', 'it re-rendered');
  assert.ok(controls().every((c, i) => c === before[i]) && controls().length === before.length, 'each control is the element it was');
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
  assert.deepStrictEqual(find(card, 'hint').map(text), ['Click for details, double click to open session'], 'with the moth\'s clicks hinted, even with no work counted');
  assert.strictEqual(find(card, 'go').length, 0, 'no open arrow on the compact card');
  expandCard(sessionMoth('s1').zone); await nextTick();
  assert.deepStrictEqual([find(card, 'gist').length, find(card, 'cardBody').length], [0, 1], 'a click expands it in full');
  assert.strictEqual(find(card, 'hint').length, 0, 'and the expanded card has no hint');
  assert.strictEqual(find(card, 'go').length, 1, 'but it has the open arrow');
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

// a stale PR's wisp or a ghost moth, hovered (compact), or clicked too (expanded)
const hoverStale = async (stale, click = true) => {
  const target = { stale, zone: hoverZone(() => target, () => {}, 12) };
  (click ? expandCard : enterZone)(target.zone);
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

test('a wisp whose session has gone quiet shows that session\'s ghost card', async () => {
  const o = { id: 'quiet', title: 'Imageproxy PR 11', cwd: '/w/imageproxy', last: now - 9 * 864e5 };
  const stale = { ...wisp, owner: o };
  ghosts.set('quiet', { o, prs: [stale] });
  try {
    const card = await hoverStale(stale);
    assert.ok(text(card).includes('gone quiet'), 'the ghost card');
    assert.ok(text(card).includes('PRs (1)'));
    assert.ok(!text(card).includes('Made by'), 'not the PR-only card');
  } finally { ghosts.delete('quiet'); }
});

test('a ghost card\'s title is the same link a session\'s is, and clicking it resumes the session', async () => {
  const o = { id: 'quiet', title: 'Imageproxy PR 11', cwd: '/w/imageproxy', last: now - 9 * 864e5 };
  const ghost = { o, prs: [{ ...wisp, owner: o }] };
  ghost.zone = hoverZone(() => ({ ghost, zone: ghost.zone }), () => post('/resume', { id: o.id }), 20); // what stale.ts makes
  ghosts.set('quiet', ghost);
  try {
    enterZone(ghost.zone);
    await nextTick();
    let open = find($('card'), 'open');
    assert.deepStrictEqual([open.length, open[0].tagName, text(open[0]), find(open[0], 'go').length], [1, 'BUTTON', 'Imageproxy PR 11', 0], 'a title link, its arrow only once expanded');
    expandCard(ghost.zone);
    await nextTick();
    open = find($('card'), 'open');
    assert.strictEqual(find(open[0], 'go').length, 1, 'the arrow');
    open[0].click();
    assert.deepStrictEqual(posts, [['/resume', { id: 'quiet' }]], 'it resumes the session');
  } finally { ghosts.delete('quiet'); }
});

// someone looking at an ended session's ghost wants to come back to it: its card bookmarks it, as a live session's does
test('a ghost card has the bookmark toggle, which bookmarks its session and takes the bookmark off again', async () => {
  const o = { id: 'quiet', title: 'Imageproxy PR 11', cwd: '/w/imageproxy', last: now - 9 * 864e5 };
  const ghost = { o, prs: [{ ...wisp, owner: o }] };
  ghost.zone = hoverZone(() => ({ ghost, zone: ghost.zone }), () => {}, 20);
  ghosts.set('quiet', ghost);
  try {
    enterZone(ghost.zone);
    await nextTick();
    const mark = () => find($('card'), 'mark')[0];
    assert.strictEqual(mark()?.getAttribute('aria-label'), 'Bookmark Imageproxy PR 11');
    mark().click();
    await nextTick();
    assert.deepStrictEqual(posts.at(-1), ['/settings', { bookmarks: ['quiet'] }]);
    assert.deepStrictEqual([mark().classList.contains('on'), mark().getAttribute('aria-label')], [true, 'Remove the bookmark on Imageproxy PR 11']);
    mark().click();
    assert.deepStrictEqual(posts.at(-1), ['/settings', { bookmarks: [] }]);
  } finally { ghosts.delete('quiet'); }
});

test('hovering a ghost or a wisp shows a compact card with a hint that names its double click', async () => {
  const hint = card => find(card, 'hint').map(text);
  setSessions({ id: 'known', state: 'idle', subagents: [], title: 'My session', last: now });
  let card = await hoverStale({ ...wisp, owner: { id: 'known', title: 'My session', last: now } }, false);
  assert.deepStrictEqual(hint(card), ['Click for details, double click to open session'], 'a wisp of a live session');
  hideCard();
  const o = { id: 'quiet', title: 'Imageproxy PR 11', cwd: '/w/imageproxy', last: now - 9 * 864e5 };
  const stale = { ...wisp, owner: o };
  ghosts.set('quiet', { o, prs: [stale, { ...wisp, url: 'https://github.com/o/r/pull/10', owner: o }] });
  try {
    card = await hoverStale(stale, false);
    assert.deepStrictEqual(hint(card), ['Click for details, double click to resume session'], 'a ghost, or the wisp of one');
    assert.deepStrictEqual([find(card, 'counts').map(text), text(card).includes('PRs ('), find(card, 'pr').length], [['2 stale PRs'], false, 0], 'its PRs counted, not listed');
  } finally { ghosts.delete('quiet'); }
  hideCard();
  card = await hoverStale(wisp, false);
  assert.deepStrictEqual(hint(card), ['Click for details, double click to open PR'], 'an orphan wisp');
  assert.deepStrictEqual([find(card, 'gist').map(text), find(card, 'counts').map(text)], [['Old PR'], ['review · untouched for 9 days']], 'its title and age');
  assert.ok(!text(card).includes('Made by'));
  card = await hoverStale(wisp);
  assert.deepStrictEqual(hint(card), [], 'and expanded, no hint');
});

test('PRs in one repo name it after "PRs"; across repos a "PRs" heading with the total sits over a section per repo', async () => {
  const mixed = [pr(1, 'ready', 'api'), pr(2, 'draft', 'extension'), pr(3, 'feedback', 'api')];
  const card = await show(session({ github: mixed }));
  assert.deepStrictEqual(find(card, 'phead').map(text), ['PRs3', 'api · 1 feedback waiting · 1 ready', 'extension · 1 draft'], 'a heading with the total, then a section per repo');
  assert.deepStrictEqual(find(card, 'ph').map(h => h.title), ['', 'o/api', 'o/extension'], 'the owner is in the tooltip');
  assert.strictEqual(find(card, 'tog').length, 0, 'no toggle on the card');
  assert.deepStrictEqual([...find(card, 'tray')[0].children].map(r => r.className.split(' ')[0]), ['phead', 'phead', 'chips', 'phead', 'chips', 'foot'], 'chips sit under their own repo');
  const one = await show(session({ github: [pr(1, 'ready', 'api'), pr(2, 'draft', 'api')] }));
  assert.deepStrictEqual(find(one, 'phead').map(text), ['PRs · api · 1 ready · 1 draft'], 'a single repo is baked into the one heading');
});

test('the card\'s dim info line ends with its session\'s CPU and RAM, in GB, and a swatch of the session\'s colour starts the title; nothing without a sample or processes', async () => {
  Object.defineProperty(navigator, 'hardwareConcurrency', { value: 4, configurable: true });
  const card = await show(session());
  assert.strictEqual(find(card, 'use').length, 0);
  store.usage = { sessions: { s1: { cpu: 100, mem: 615, n: 3 }, other: { cpu: 90, mem: 10, n: 1 } }, lantern: { cpu: 0, mem: 1, n: 1 }, mac: { cpu: 0, used: 1, total: 6144, pressure: 'normal' } };
  await nextTick();
  const line = () => find(card, 'foot').map(text).find(t => t.includes('old'));
  assert.match(line(), /old · \d+m ago25% · 0\.6 GB$/, 'a quarter of the Mac, 615 MB as 0.6 GB: the same unit whatever the size');
  assert.strictEqual(find(card, 'use')[0].querySelectorAll('svg').length, 2, 'the chip and the RAM stick stand for the words');
  assert.strictEqual(find(card, 'bar').length + find(card, 'track').length, 0, 'no bars on the card');
  const tint = document.createElement('div'); tint.style.background = tintFor(session()); // the colour its moth has, as the browser spells it
  assert.strictEqual(find(card, 'sw')[0].style.background, tint.style.background, 'the swatch before the title is the session\'s colour');
  assert.strictEqual(find(card, 'name')[0].style.color, '', 'and the title keeps its own colour');
  assert.strictEqual(find(card, 'name')[0].firstElementChild, find(card, 'sw')[0], 'the swatch comes first in the title');
  store.usage = { ...store.usage, sessions: { s1: { cpu: 200, mem: 3072, n: 3 } } };
  await nextTick();
  assert.match(line(), /ago50% · 3\.0 GB$/, 'follows each sample');
  store.usage = { ...store.usage, sessions: { s1: { cpu: 0, mem: 0, n: 0 } } };
  await nextTick();
  assert.strictEqual(find(card, 'use').length, 0, 'no processes, nothing');
});

// A menu row standing in for a session (bookmarks, CPU and RAM): pointing at it lights the moth in the scene and shows no card; opening
// its card shows it in full, a moth's or a ghost's; going to the session puts the card away. One with neither on screen has no card.
test('a menu row points at its moth without a card, opens its moth\'s or ghost\'s card in full, and going to the session puts it away', async () => {
  live.raw = [session()]; sync();
  pointAt('s1'); await nextTick();
  assert.deepStrictEqual([live.spot, live.hovered], ['s1', null], 'pointing lights it in the scene, with no card');
  pointAt(null);
  openCard('s1'); await nextTick();
  assert.deepStrictEqual([live.hovered, live.expanded], [sessionMoth('s1'), true], 'its card, in full, as clicking the moth does');
  openCard('s1');
  assert.strictEqual(live.hovered, sessionMoth('s1'), 'opening it again leaves it open (no toggling shut)');
  goToSession('s1', true);
  assert.deepStrictEqual([live.hovered, posts.at(-1)], [null, ['/focus', { id: 's1' }]], 'going to the session puts the card away');
  const o = { id: 'quiet', title: 'Old', cwd: '/w/old', last: now - 9 * 864e5 }, ghost = { o, prs: [] };
  ghost.zone = hoverZone(() => ({ ghost, zone: ghost.zone }), () => {}, 20);
  ghosts.set('quiet', ghost);
  try {
    openCard('quiet');
    assert.strictEqual(live.hovered?.ghost, ghost, 'a ghost\'s card too');
    goToSession('quiet', false);
    assert.deepStrictEqual(posts.at(-1), ['/resume', { id: 'quiet' }], 'and an ended one resumes');
  } finally { ghosts.delete('quiet'); }
  hideCard();
  openCard('nobody');
  assert.strictEqual(live.hovered, null, 'one with no moth or ghost has no card');
});

test('a card shown from the usage dropdown goes in the top layer after it, so it draws above it, and stays at its moth', async () => {
  live.raw = [session()]; sync();
  const menu = document.createElement('div'), c = $('card');
  menu.id = 'usage'; document.body.append(menu);
  let open = false; // happy-dom has no top layer: a stand-in that tracks showPopover and hidePopover
  const layer = [];
  c.showPopover = () => { layer.push('card'); }; c.hidePopover = () => { layer.length = 0; };
  const matches = c.matches.bind(c); c.matches = sel => sel === ':popover-open' ? layer.length > 0 : matches(sel);
  document.querySelector = (q => sel => sel === ':is(#usage, #bookmarks):popover-open' ? (open ? menu : null) : q.call(document, sel))(document.querySelector);
  const footer = document.querySelector('footer'); footer.getBoundingClientRect = () => ({ top: 700 }); // no layout or SVG matrices in happy-dom
  const svg = document.querySelector('svg');
  svg.getScreenCTM = () => ({ a: 1 }); svg.createSVGPoint = () => ({ matrixTransform: () => ({ x: 100, y: 200 }) });
  try {
    openCard('s1');
    assert.strictEqual(c.getAttribute('popover'), null, 'with the dropdown closed the card stays in the page');
    hideCard();
    open = true;
    openCard('s1');
    assert.strictEqual(c.getAttribute('popover'), 'manual', 'with it open the card is a popover of its own');
    assert.deepStrictEqual(layer, ['card'], 'shown, after the dropdown');
    placeCard();
    const gap = sessionMoth('s1').zone.r * 0.7;
    assert.strictEqual(c.style.transform, `translate(${100 + gap}px, ${200 + gap}px)`, 'and placed at its moth\'s anchor, as ever');
    hideCard();
    assert.strictEqual(c.getAttribute('popover'), null, 'putting the card away takes it out of the top layer');
  } finally { delete document.querySelector; menu.remove(); delete c.showPopover; delete c.hidePopover; delete c.matches; delete footer.getBoundingClientRect; delete svg.getScreenCTM; delete svg.createSVGPoint; }
});

test('the bookmark beside the pin bookmarks the session, saving its id, and a second click removes it', async () => {
  const mark = async () => (await show(session({}))).querySelector('h3 .mark');
  assert.deepStrictEqual([(await mark()).title, (await mark()).classList.contains('on')], ['Bookmark', false]);
  (await mark()).click();
  assert.strictEqual(JSON.stringify(posts.at(-1)), JSON.stringify(['/settings', { bookmarks: ['s1'] }]));
  assert.deepStrictEqual([(await mark()).title, (await mark()).classList.contains('on')], ['Remove bookmark', true], 'shown at once, before the settings event confirms it');
  (await mark()).click();
  assert.strictEqual(JSON.stringify(posts.at(-1)), JSON.stringify(['/settings', { bookmarks: [] }]));
  assert.strictEqual((await mark()).classList.contains('on'), false);
});

test('a long title shortens to one line with an ellipsis; the open arrow and the pin stay on its row', async () => {
  const card = await show(session({ title: 'free trial, develop '.repeat(12) }));
  const [nm, go] = [card.querySelector('h3 .nm'), card.querySelector('h3 .go')], style = el => getComputedStyle(el);
  assert.ok(nm && go && nm.parentElement === go.parentElement, 'the title text and the arrow share one row');
  assert.deepStrictEqual([style(nm.parentElement).display, style(nm).whiteSpace, style(nm).textOverflow], ['flex', 'nowrap', 'ellipsis']);
  assert.strictEqual(style(go).flexShrink, '0', 'the arrow never shrinks or wraps');
  for (const el of [card.querySelector('h3 .chip'), card.querySelector('h3 .mark'), card.querySelector('h3 .pin')].filter(Boolean)) assert.strictEqual(style(el).flexShrink, '0');
});

test('a session\'s CPU and RAM on its card turn yellow, orange, then red as it uses more, each with its reason, the icon along with the number', async () => {
  Object.defineProperty(navigator, 'hardwareConcurrency', { value: 4, configurable: true });
  const card = await show(session());
  const steps = [[50, 1024, 'hot0', 'hot0'], [150, 4 * 1024, 'hot1', 'hot1'], [250, 8 * 1024, 'hot2', 'hot2'], [450, 16 * 1024, 'hot3', 'hot3']]; // cores' worth, GB
  for (const [cpu, mem, c, m] of steps) {
    store.usage = { sessions: { s1: { cpu, mem, n: 3 } }, lantern: { cpu: 0, mem: 1, n: 1 }, mac: { cpu: 0, used: 1, total: 65536, pressure: 'normal' } };
    await nextTick();
    const parts = [...find(card, 'use')[0].children];
    assert.deepStrictEqual(parts.map(p => p.className), [c, m], `${cpu}% of a core, ${mem} MB`);
    assert.ok(parts.every(p => p.querySelector('svg')), 'the icon is inside the coloured part, so it takes the colour too');
    assert.strictEqual(parts[0].title !== '' && /^(high CPU: about|\d+% of all cores$)/.test(parts[0].title), true);
  }
  assert.strictEqual(find(card, 'use')[0].children[1].title, 'high RAM: 16.0 GB');
});

const PROCS = [{ name: 'vitest', n: 4, cpu: 300, mem: 2048 }, { name: 'claude', n: 1, cpu: 8, mem: 820 }, { name: 'zsh', n: 2, cpu: 0, mem: 12 }];
const busy = (more = {}) => ({ sessions: { s1: { cpu: 308, mem: 2880, n: 7, procs: PROCS }, ...more }, lantern: { cpu: 0, mem: 1, n: 1 }, mac: { cpu: 0, used: 1, total: 65536, pressure: 'normal' } });
const labels = card => find(card, 'acts').flatMap(a => [...a.children].map(text));

test('a card\'s processes sit behind its info line: a click opens them in place, by name, a count past one, CPU of the Mac and RAM in GB, hot ones coloured, and closes them again', async () => {
  Object.defineProperty(navigator, 'hardwareConcurrency', { value: 4, configurable: true });
  store.usage = busy();
  const card = await show(session());
  assert.strictEqual(find(card, 'proc').length, 0, 'hidden until asked for');
  const [line] = find(card, 'stat');
  assert.ok(line && line.localName === 'button' && /old · .* ago77% · 2\.8 GB$/.test(text(line)), 'the info line, CPU and RAM and all, is the button');
  assert.strictEqual(line.getAttribute('aria-expanded'), 'false');
  line.click(); await nextTick();
  assert.strictEqual(find(card, 'stat')[0].getAttribute('aria-expanded'), 'true');
  const head = find(card, 'head').find(h => h.textContent.startsWith('Processes'));
  assert.strictEqual(head && text(head), 'Processes7', 'a heading with how many processes');
  assert.deepStrictEqual(find(card, 'proc').map(r => [...r.children].map(text)), [['vitest', '×4', '75%', '2.0 GB'], ['claude', '', '2%', '0.8 GB'], ['zsh', '×2', '0%', '<0.1 GB']], 'in the order the server sent, a few MB as under a tenth of a GB');
  assert.strictEqual(find(card, 'proc')[0].children[2].className, 'hot2', 'three cores of CPU runs orange, as the session\'s own number would');
  assert.strictEqual(find(card, 'pn')[0].title, 'vitest', 'a long name cut short is in full in its tooltip');
  assert.deepStrictEqual(labels(card), [], 'no buttons: the card is open in full already, and its title goes to the session');
  find(card, 'stat')[0].click(); await nextTick();
  assert.strictEqual(find(card, 'proc').length, 0, 'a second click closes them');
  const compact = await hover(session());
  assert.deepStrictEqual([find(compact, 'proc').length, find(compact, 'stat').length, find(compact, 'hint').length], [0, 0, 1], 'the hover card, a tooltip, keeps to its plain line of totals and its hint');
});

test('opening a card from the usage dropdown (a double click, or Open card) never puts away one already open', async () => {
  live.raw = [session()]; sync();
  openCard('s1'); await nextTick();
  assert.deepStrictEqual([live.hovered === sessionMoth('s1'), live.expanded], [true, true], 'the moth\'s card, in full');
  openCard('s1'); await nextTick();
  assert.deepStrictEqual([live.hovered === sessionMoth('s1'), live.expanded], [true, true], 'again: still open, where a click on the moth would close it');
});

test('a side session shows its own CPU and RAM left of its time; an agent, inside the session\'s processes, has none', async () => {
  Object.defineProperty(navigator, 'hardwareConcurrency', { value: 4, configurable: true });
  store.usage = busy({ side: { cpu: 40, mem: 600, n: 2, procs: [] } });
  live.raw = [session({ id: 'side', parent: 's1', state: 'working', activity: 'Side work', started: now - 120e3 })]; sync();
  const card = await show(session({ state: 'working', subagents: [{ id: 'a', description: 'Build', started: now - 60e3, last: now }] }));
  const rows = find(card, 'agent').map(r => [...r.querySelector('.arow').children].map(c => c.className.split(' ')[0]));
  assert.deepStrictEqual(rows, [['live', 'job', 't'], ['live', 'job', 'use', 't']], 'the agent: dot, job, time; the side session: its CPU and RAM just before its time');
  assert.match(text(find(card, 'agent')[1].querySelector('.use')), /10% · 0\.6 GB/);
});

test('a session\'s processes sort by CPU as shown (whole percents of the Mac), then RAM, then name, with "other" last', () => {
  Object.defineProperty(navigator, 'hardwareConcurrency', { value: 4, configurable: true });
  // the server's order, by tenths of a core: 1.2% of a core (0.3% of the Mac) before 0.4% (0.1%), both showing 0%
  const procs = [{ name: 'node', n: 1, cpu: 1.2, mem: 10 }, { name: 'other', n: 3, cpu: 0, mem: 900 }, { name: 'claude', n: 1, cpu: 0.4, mem: 500 }, { name: 'zsh', n: 1, cpu: 0, mem: 500 }, { name: 'vite', n: 1, cpu: 8, mem: 40 }];
  const u = { sessions: { s1: { cpu: 9.6, mem: 1950, n: 7, procs } }, lantern: { cpu: 0, mem: 1, n: 1 }, mac: { cpu: 0, used: 1, total: 65536, pressure: 'normal' } };
  assert.deepStrictEqual(sessionUse(u, 's1').procs.map(p => `${p.name} ${p.cpu}`), ['vite 2%', 'claude 0%', 'zsh 0%', 'node 0%', 'other 0%'],
    'vite first; then the 0% ones by RAM, the bigger first, whatever their tenths; a tie by name; "other" last');
});
