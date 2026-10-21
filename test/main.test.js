// The page's wiring (page/main.js): the status line shrinking to fit, the fallback timer that stands in for rAF, pointing at
// and clicking a moth, and a tap that puts the card away. Every page script runs in a vm context, in index.html's order; the DOM is a stub that accepts
// anything, apart from the few things a test steers (document.hidden, the elements in `els`, getComputedStyle).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/** @type {any} */
const stub = new Proxy(function () {}, { get: (_, k) => k === Symbol.toPrimitive ? () => '' : stub, apply: () => stub, construct: () => stub, set: () => true });
function open(search = '', els = {}) {
  const intervals = [], listeners = {}, made = function () { return stub; };
  const document = new Proxy(stub, { get: (_, k) => k === 'hidden' ? page.hidden : k === 'getElementById' ? id => els[id] ?? stub : k === 'querySelector' ? sel => els[sel] ?? stub : stub });
  const page = vm.createContext({ URLSearchParams, location: { search }, performance, document, console, hidden: false,
    setInterval: (f, ms) => intervals.push([f, ms]), setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame() {},
    addEventListener: (type, f) => (listeners[type] ??= []).push(f), getComputedStyle: () => stub, devicePixelRatio: 1,
    EventSource: made, MutationObserver: made, Image: made, DOMPoint: made, Option: made, localStorage: stub, fetch: () => Promise.resolve(stub) });
  page.window = page;
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const [, f] of html.matchAll(/src="(page\/[a-z]+\.js)"/g)) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), page, { filename: f });
  return { page, els, listeners, every: ms => intervals.filter(([, t]) => t === ms).map(([f]) => f) };
}

test('the status shrinks to fit on one line, down to 9px, and wraps only past that', () => {
  const { page, els } = open();
  page.getComputedStyle = () => ({ paddingLeft: '4px', paddingRight: '4px', fontSize: '16px' });
  const fit = (clientWidth, scrollWidth) => {
    const st = els.status = { style: { fontSize: '13px', whiteSpace: 'normal' }, clientWidth, scrollWidth };
    page.fitStatus();
    return [st.style.fontSize, st.style.whiteSpace];
  };
  assert.deepStrictEqual(fit(208, 150), ['', ''], 'it fits: back to the stylesheet\'s size, on one line');
  assert.deepStrictEqual(fit(108, 128), ['13.3px', ''], 'a little too long: 100 of 120 wide, so 16px becomes 13.3px');
  assert.deepStrictEqual(fit(108, 404), ['9px', 'normal'], 'far too long: 9px, and it wraps');
});

test('the fallback timer ticks only while the page shows', () => {
  const { page, every } = open();
  let ticks = 0;
  page.lanternTick = () => ticks++;
  const [timer] = every(16);
  assert.ok(timer, 'a 16ms timer');
  timer();
  page.hidden = true; timer();
  assert.strictEqual(ticks, 1, 'one tick while shown, none while hidden');
});

// WebKit can't tell the screensaver's window is on screen, so its page may report hidden while it shows
// (screensaver/LanternView.swift), and macOS can stop calling animateOneFrame: the timer is then all that draws.
test('the screensaver\'s fallback timer ticks even when its page says it\'s hidden', () => {
  const { page, every } = open('?screensaver');
  let ticks = 0;
  page.lanternTick = () => ticks++;
  page.hidden = true; every(16)[0]();
  assert.strictEqual(ticks, 1);
});

test('a tap outside the moths and the card puts the card away; a mouse click or a tap on the card doesn\'t', () => {
  const { page, listeners } = open();
  let hides = 0;
  page.hideCard = () => hides++;
  const click = (pointerType, inside) => listeners.click.forEach(f => f({ pointerType, target: { closest: () => inside ? {} : null } }));
  click('mouse', false); click('touch', true);
  assert.strictEqual(hides, 0);
  click('touch', false);
  assert.strictEqual(hides, 1);
});

// Hover areas are plain circles (card.js), found from the scene's own pointer events (main.js zoneFor), so a moth's card
// and its click only work if those handlers reach them
test('pointing at a moth shows its card, and clicking it brings its session to the front', () => {
  const scene = { listeners: {}, style: { cursor: '' }, addEventListener(type, f) { (this.listeners[type] ??= []).push(f); } };
  const { page } = open('', { scene, svg: { getScreenCTM: () => ({ inverse: () => null }), getBoundingClientRect: () => ({}) } }); // the scene's units are its pixels here
  page.DOMPoint = class { constructor(x, y) { this.x = x; this.y = y; } matrixTransform() { return this; } };
  const posts = [];
  page.fetch = (url, o) => { posts.push([url, JSON.parse(o.body)]); return Promise.resolve(stub); };
  page.renderCard = () => {};
  const run = code => vm.runInContext(code, page);
  run(`moth = { key: 'api' }; moth.zone = hoverArea(moth, 'moth'); Object.assign(moth.zone, { x: 100, y: 200 })`);
  const fire = (type, x, y) => scene.listeners[type].forEach(f => f({ pointerType: 'mouse', clientX: x, clientY: y, target: { closest: sel => sel === '#scene' ? scene : null } }));
  fire('pointermove', 300, 300);
  assert.strictEqual(run('hovered'), null, 'nothing away from it');
  fire('pointermove', 110, 205);
  assert.strictEqual(run('hovered'), run('moth'), 'its card, pointing at it');
  assert.strictEqual(scene.style.cursor, 'pointer');
  fire('click', 110, 205);
  assert.deepStrictEqual(posts, [['/focus', { id: 'api' }]]);
});

// A card that records its listeners, and a moth's hover area at (100, 100) with radius 40, in screen and scene coordinates alike.
function withCard() {
  const handlers = {}, card = { addEventListener: (type, f) => (handlers[type] ??= []).push(f), matches: () => false };
  const o = open('', { card, svg: { getScreenCTM: () => ({ inverse: () => null }), getBoundingClientRect: () => ({}) } });
  o.page.DOMPoint = class { constructor(x, y) { this.x = x; this.y = y; } matrixTransform() { return this; } };
  const zone = vm.runInContext('Object.assign(hoverZone({}, () => {}, 40), { x: 100, y: 100 })', o.page);
  const fire = (type, e = {}) => handlers[type].forEach(f => f(e));
  return { ...o, zone, fire };
}

test('a click on a session\'s card body opens it only where the card covers its own moth; a stale PR\'s card opens from anywhere', () => {
  const { page, zone, fire } = withCard();
  const opened = [];
  page.clickZone = z => opened.push(z);
  const click = (x, y, tag = '') => fire('click', { target: { closest: sel => sel.split(', ').includes(tag) ? {} : null }, clientX: x, clientY: y, shiftKey: false });
  page.zoneOf = zone;
  vm.runInContext('hovered = { session: { id: "s1" }, zone: zoneOf }', page);
  click(300, 300);
  assert.deepStrictEqual(opened, [], 'away from its moth');
  click(110, 95);
  assert.deepStrictEqual(opened, [zone], 'over its moth (a tall card in the iTerm panel)');
  click(110, 95, 'a'); click(110, 95, 'button');
  assert.strictEqual(opened.length, 1, 'but not on a link or button there (a row, the PR toggle)');
  vm.runInContext('hovered = { stale: {}, zone: "wisp" }', page);
  click(300, 300);
  assert.deepStrictEqual(opened, [zone, 'wisp'], 'a stale PR\'s card');
});

test('the open card isn\'t redrawn while a finger is on it', () => {
  const { page, every, fire } = withCard();
  let draws = 0;
  page.renderCard = () => draws++;
  vm.runInContext('hovered = {}', page);
  const tick = () => every(500).forEach(f => f());
  tick();
  assert.strictEqual(draws, 1);
  fire('touchstart');
  tick();
  assert.strictEqual(draws, 1, 'mid-swipe');
  fire('touchend');
  tick();
  assert.strictEqual(draws, 2);
});

test('a card under the pointer or keyboard focus isn\'t redrawn, unless its session\'s state or snooze changes (its own pill)', () => {
  const { page, every, fire } = withCard();
  let draws = 0, over = true;
  page.renderCard = () => draws++;
  const handlers = page.document.getElementById('card'); // the card withCard made: its matches answers for pointer and focus alike
  handlers.matches = sel => over && sel.includes(':hover') && sel.includes(':focus-visible');
  const tick = () => every(500).forEach(f => f());
  page.s = { id: 's1', state: 'waiting', snoozed: false };
  vm.runInContext('hovered = { session: s }', page);
  tick();
  assert.strictEqual(draws, 1, 'a new card is drawn');
  tick();
  assert.strictEqual(draws, 1, 'not redrawn under the pointer, or while a control has keyboard focus');
  vm.runInContext('hovered = { session: { ...s, snoozed: true } }', page); // the pill was clicked and the server says so
  tick();
  assert.strictEqual(draws, 2, 'redrawn, so the pill now offers what comes next');
  tick();
  assert.strictEqual(draws, 2);
  over = false;
  tick();
  assert.strictEqual(draws, 3, 'away from the card it redraws as before');
});

test('the sidebar isn\'t redrawn under the pointer or while a control in it has keyboard focus', () => {
  let over = '';
  const dock = { matches: sel => sel.split(', ').includes(over) };
  const { page, every } = open('', { dock });
  let draws = 0;
  page.renderSidebar = () => draws++;
  const tick = () => every(500).forEach(f => f());
  tick();
  assert.strictEqual(draws, 1, 'redrawn on the timer');
  for (over of [':hover', ':focus-within']) tick();
  assert.strictEqual(draws, 1, 'not under the pointer, nor with focus inside it');
});
