// The moth's hover card (page/card.js): the PR header that sums the PRs up and names a hovered chip, the list capped at
// the worst few, the per-session toggle from the server's settings, and the agent rows (job, time, model, a tag chip
// only for a tagged step). Run in a vm context with a stub DOM holding only what the card builds.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const node = tag => {
  const n = {
    tag, className: '', style: {}, attrs: {}, dataset: {},
    _children: [], get children() { return n._children; }, set children(cs) { for (const c of n._children) if (typeof c === 'object' && !cs.includes(c)) c.scrollTop = 0; n._children = cs; }, // taken out: scrolled to the top, as in a browser
    classList: { add: c => { n.className += ' ' + c; }, remove: c => { n.className = n.className.split(' ').filter(x => x !== c).join(' '); },
      toggle: (c, on) => on ? n.classList.add(c) : n.classList.remove(c) },
    append: (...cs) => { n.children.push(...cs); }, prepend: (...cs) => { n.children.unshift(...cs); },
    replaceChildren: (...cs) => { n.children = cs; }, setAttribute: (k, v) => { n.attrs[k] = v; }, removeAttribute: k => { delete n.attrs[k]; n[k] = undefined; },
    getBoundingClientRect: () => n.rect, clientLeft: 1, clientTop: 1, offsetWidth: 240, offsetHeight: 40,
    set textContent(t) { n.children = [String(t)]; }, get textContent() { return text(n); },
  };
  return n;
};
const text = n => typeof n === 'string' ? n : n.children.map(text).join('');
const all = n => typeof n === 'string' ? [] : [n, ...n.children.flatMap(all)];
const find = (n, cls) => all(n).filter(c => c.className.split(' ').includes(cls));

function load() {
  const card = node('div'), posts = [];
  const page = vm.createContext({ document: { createElement: node }, innerWidth: 1440, $: () => card, clearTimeout() {}, hideTimer: 0, moths: new Map(), sessions: [], FLY: { ready: 'g', failing: 'r', changes: 'o', draft: 'y', quiet: 'b' },
    post: (url, body) => posts.push([url, body]) });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'page', 'card.js'), 'utf8'), page, { filename: 'card.js' });
  const show = s => { page.hovered = { session: s }; vm.runInContext('renderCard()', page); return card; };
  return { page, card, posts, show, run: code => vm.runInContext(code, page) };
}
const now = Date.now();
const pr = (n, need) => ({ url: `https://github.com/o/r/pull/${n}`, label: `#${n}`, need, title: `PR ${n} title` });
const session = o => ({ id: 's1', cwd: '/w/proj', title: 'proj', state: 'waiting', started: now - 3600e3, last: now - 60e3, subagents: [], github: [], ...o });
const TEN = [pr(1, 'draft'), pr(2, 'ready'), pr(3, 'draft'), pr(4, 'waiting'), pr(5, 'waiting'), pr(6, 'draft'), pr(7, 'draft'), pr(8, 'draft'), pr(9, 'draft'), pr(10, 'draft'), pr(11, 'draft')];

test('the PR header sums them up, and a hovered chip puts its title there until the pointer leaves', () => {
  const { show } = load(), card = show(session({ github: TEN }));
  const [ph] = find(card, 'ph');
  assert.strictEqual(text(ph), 'PRs · 1 ready · 2 in review · 8 drafts');
  const chips = find(card, 'chips')[0].children;
  assert.strictEqual(chips.length, 11, 'more than three PRs start as chips');
  assert.deepStrictEqual(chips.slice(0, 3).map(text), ['#2', '#4', '#5'], 'worst first: ready, then in review, then drafts');
  chips[1].onpointerenter();
  assert.strictEqual(text(ph), 'PR 4 title');
  chips[1].onpointerleave();
  assert.strictEqual(text(ph), 'PRs · 1 ready · 2 in review · 8 drafts');
});

test('an open list shows the worst four, failing and changes requested first, then the rest as links', () => {
  const { show, run } = load(), prs = [pr(1, 'draft'), pr(2, 'waiting'), pr(3, 'changes'), pr(4, 'ready'), pr(5, 'failing'), pr(6, 'draft')];
  run('prList.s1 = true');
  const card = show(session({ github: prs }));
  assert.deepStrictEqual(find(card, 'pr2').map(a => a.href), [5, 3, 4, 2].map(n => pr(n).url));
  const [more] = find(card, 'more');
  assert.strictEqual(text(more), '2 more: #1, #6');
  const [tip] = find(more, 'badgeTip'), overflow = more.children.filter(c => c.tag === 'a');
  assert.strictEqual(tip.attrs.role, 'tooltip');
  assert.strictEqual(overflow[1].title, undefined, 'no native title over the tip');
  // near the window's right edge: the tip keeps 8px inside it, placed in the card's frame (the card is at 1100, 200)
  card.rect = { left: 1100, top: 200 };
  overflow[1].rect = { left: 1400, right: 1420, top: 300, bottom: 315, width: 20 };
  overflow[1].onfocus();
  assert.deepStrictEqual([tip.style.left, tip.style.top], [`${1440 - 240 - 8 - 1100 - 1}px`, `${300 - 40 - 8 - 200 - 1}px`], 'keyboard focus shows it, clamped');
  overflow[1].onblur();
  assert.strictEqual(tip.className, 'badgeTip', 'blur hides it');
  overflow[1].onpointerenter();
  assert.deepStrictEqual([text(tip), tip.className], ['PR 6 title', 'badgeTip show'], 'hovering one past the cap shows its title in the badges\' tooltip');
  overflow[1].onpointerleave();
  assert.strictEqual(tip.className, 'badgeTip', 'and leaving hides it');
  assert.strictEqual(find(card, 'chips').length, 0);
  run('prList = {}');
  assert.strictEqual(find(show(session({ github: prs.slice(0, 3) })), 'pr2').length, 3, 'three or fewer are listed until toggled');
});

test('the toggle flips the session\'s view, tells the server, and the server\'s settings decide what every window shows', () => {
  const { show, posts, run } = load();
  let card = show(session({ github: TEN }));
  const [tog] = find(card, 'tog');
  assert.strictEqual(tog.attrs['aria-label'], 'List PRs with their titles');
  assert.strictEqual(tog.title, 'List PRs with their titles', 'a tooltip too');
  assert.strictEqual(text(tog), '', 'an icon, no text');
  find(card, 'tog')[0].onclick(); // a button, which the card's own click handler leaves alone (main.js)
  assert.strictEqual(JSON.stringify(posts), JSON.stringify([['/settings', { prList: { s1: true } }]]));
  assert.strictEqual(find(show(session({ github: TEN })), 'pr2').length, 4, 'now listed');
  // another window gets the setting from the server (main.js: prList = st.prList)
  const other = load();
  other.run('prList = { s1: true, s2: false }');
  assert.strictEqual(find(other.show(session({ github: TEN })), 'pr2').length, 4);
  assert.strictEqual(find(other.show(session({ id: 's2', github: [pr(1, 'ready')] })), 'pr2').length, 0, 's2 chose chips with one PR');
});

test('an agent is three lines: dot, tag chip only when its step has one, model and time; its job; its step', () => {
  const { show } = load();
  const agent = o => ({ id: 'a', type: 'opus-implement', description: 'Build the card', model: 'Opus 5.5', started: now - 8 * 60e3, last: now - 2e3, ...o });
  const card = show(session({ state: 'working', subagents: [agent({ activity: '[card-e] Run the tests' }), agent({ id: 'b', started: now - 7 * 60e3, activity: 'Read card.js', last: now - 30e3, model: 'Haiku 4.5', type: 'Explore' })] }));
  const agents = find(card, 'agent');
  assert.deepStrictEqual(agents.map(r => [r.tag, ...r.children.map(c => c.className)]), [['button', 'arow', 'job', 'astep'], ['button', 'arow', 'job', 'astep']], 'a native button, so the keyboard opens it too');
  assert.deepStrictEqual(find(card, 'arow').map(r => r.children.map(c => c.className)), [['live', 'tag', 'model', 't'], ['live quiet', 'model', 't']], 'a tag chip only for a tagged step; dim after 10 s quiet');
  assert.deepStrictEqual(find(card, 'arow').map(text), ['card-eOpus 5.58m', 'Haiku 4.57m'], 'no type');
  assert.deepStrictEqual(find(card, 'job').map(text), ['Build the card', 'Build the card']);
  assert.deepStrictEqual(find(card, 'astep').map(text), ['Run the tests', 'Read card.js'], 'the tag comes off the step');
});

test('a click opens an agent in full and another closes it; it stays open through redraws until the card closes', () => {
  const { show, run } = load();
  const s = session({ state: 'working', subagents: [{ id: 'a', description: 'One', started: now - 2e3, last: now }, { id: 'b', description: 'Two', started: now - 1e3, last: now }] });
  const states = card => find(card, 'agent').map(r => [r.className, r.attrs['aria-expanded']]);
  let card = show(s);
  assert.deepStrictEqual(states(card), [['agent', 'false'], ['agent', 'false']]);
  find(card, 'agent')[1].onclick();
  assert.deepStrictEqual(states(card), [['agent', 'false'], ['agent open', 'true']], 'opens in place');
  card = show(s);
  assert.deepStrictEqual(states(card), [['agent', 'false'], ['agent open', 'true']], 'still open after a redraw');
  find(card, 'agent')[1].onclick();
  assert.deepStrictEqual(states(show(s)), [['agent', 'false'], ['agent', 'false']], 'another click closes it');
  find(show(s), 'agent')[0].onclick();
  run('hideCard()');
  assert.deepStrictEqual(states(show(s)), [['agent', 'false'], ['agent', 'false']], 'a new card starts closed');
});

test('a session\'s header opens the session, and shift-click on it snoozes', () => {
  const { show, run, page } = load();
  const calls = [], m = {};
  m.zone = run('hoverZone')(m, () => calls.push('open'), 48);
  m.zone.menu = () => calls.push('snooze');
  page.moths = new Map([['s1', m]]);
  const h = () => show(session({})).children[0].children[0];
  assert.deepStrictEqual([h().tag, h().title], ['button', 'Open this session'], 'a native button in the header');
  h().onclick({ shiftKey: false });
  h().onclick({ shiftKey: true });
  assert.deepStrictEqual(calls, ['open', 'snooze']);
});

test('compact shows every agent, oldest first, and the order holds however the list or their activity changes', () => {
  const { show } = load();
  const agent = (id, startedAgo, lastAgo) => ({ id, type: 'Explore', description: `Agent ${id}`, started: now - startedAgo, last: now - lastAgo, activity: '' });
  const jobs = subagents => find(show(session({ state: 'working', subagents })), 'job').map(text);
  const first = jobs([agent('c', 3e5, 1e3), agent('a', 9e5, 50e3), agent('e', 1e5, 2e3), agent('b', 6e5, 30e3), agent('d', 6e5, 5e3)]);
  assert.deepStrictEqual(first, ['Agent a', 'Agent b', 'Agent d', 'Agent c', 'Agent e'], 'by start, ties by id, all five');
  // the next snapshot: the list in another order and who was heard from last turned around
  assert.deepStrictEqual(jobs([agent('d', 6e5, 50e3), agent('e', 1e5, 30e3), agent('b', 6e5, 1e3), agent('a', 9e5, 2e3), agent('c', 3e5, 5e3)]), first);
  assert.deepStrictEqual(find(show(session({ subagents: [agent('a', 9e5, 1e3)] })), 'more'), [], 'no "more" line');
});

test('the state line shows only what the pill doesn\'t already say', () => {
  const { show } = load();
  const state = note => find(show(session({ note, forYou: { you: [], questions: note.startsWith('Asks') ? ['Merge it?'] : [] } })), 'state').map(text);
  for (const note of ['Finished its turn', 'Finished its turn (2 still running)', 'Waiting on 2 agents', 'Asks: Merge it?']) assert.deepStrictEqual(state(note), [], note);
  assert.deepStrictEqual(state('Wants permission to use Bash'), ['Wants permission to use Bash']);
  assert.deepStrictEqual(state('Turn ended with an API error'), ['Turn ended with an API error']);
});

test('a background task that is one of the agents is listed once, as the agent', () => {
  const { show } = load();
  const card = show(session({ state: 'paused', tasks: ['Build the card', 'preview server'], subagents: [{ id: 'a', description: 'Build the card', last: now }] }));
  assert.deepStrictEqual(find(card, 'job').map(text), ['Build the card', 'preview server']);
});

test('the header stays outside the scrolling body, which keeps its scroll through a redraw but not into another session', () => {
  const { show } = load();
  const card = show(session({ github: TEN }));
  assert.deepStrictEqual(card.children.map(c => [c.tag, c.className]), [['h3', ''], ['div', 'cardBody']]);
  card.children[1].scrollTop = 120;
  assert.strictEqual(show(session({ github: TEN })).children[1].scrollTop, 120, 'the same session redrawn');
  assert.strictEqual(show(session({ id: 's2', github: TEN })).children[1].scrollTop, 0, 'another session\'s card starts at the top');
});

test('an agent with no start time sorts after the timed ones, by id, and stays put', () => {
  const { show } = load();
  const agent = (id, started) => ({ id, description: `Agent ${id}`, started, last: now });
  const jobs = subagents => find(show(session({ state: 'working', subagents })), 'job').map(text);
  const want = ['Agent x', 'Agent a', 'Agent b'];
  assert.deepStrictEqual(jobs([agent('b'), agent('x', now - 1e3), agent('a')]), want);
  assert.deepStrictEqual(jobs([agent('a'), agent('b'), agent('x', now - 1e3)]), want);
});
