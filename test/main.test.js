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
