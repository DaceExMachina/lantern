// The page's wiring (src/wiring.ts): the status line shrinking to fit, the fallback timer that stands in for rAF, pointing at
// and clicking a moth, and a tap that puts the card away. Each test loads the whole page afresh (src/wiring.ts imports the
// rest) on index.html's real markup, with fake timers, and stubs only what happy-dom lacks: the event stream, the
// lantern picker's Option, and rAF, so no frame loop runs.
import assert from 'node:assert';
import { afterEach, test, vi } from 'vitest';
import { layOut, stubCanvas2d } from './page.js';

const added = [];
afterEach(() => {
  for (const [type, f] of added.splice(0)) removeEventListener(type, f); // the next test's page starts with no window listeners but its own
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

async function open(search = '') {
  layOut(search);
  vi.useFakeTimers();
  vi.stubGlobal('EventSource', class { addEventListener() {} });
  vi.stubGlobal('Option', function (text, value) { return Object.assign(document.createElement('option'), { textContent: text, value }); });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({})));
  const add = addEventListener;
  vi.spyOn(window, 'addEventListener').mockImplementation((...args) => { added.push(args); return add.apply(window, args); });
  vi.resetModules();
  const [events, card, state, { live }] = await Promise.all([import('../src/wiring'), import('../src/scene/card'), import('../src/scene/state'), import('../src/scene/live')]);
  vi.mocked(window.addEventListener).mockRestore(); // only the page's own listeners were to be collected
  return { events, card, state, live, fetch: /** @type {import('vitest').Mock} */ (fetch) };
}
const timer = ms => vi.advanceTimersByTime(ms);
const hidden = value => vi.spyOn(document, 'hidden', 'get').mockReturnValue(value);
// the scene's units are its pixels: no screen transform
function flatScene() {
  vi.spyOn(document.querySelector('svg'), 'getScreenCTM').mockReturnValue(/** @type {any} */ ({ inverse: () => null }));
  vi.stubGlobal('DOMPoint', class { constructor(x, y) { this.x = x; this.y = y; } matrixTransform() { return this; } });
}

test('the status shrinks to fit on one line, down to 9px, and wraps only past that', async () => {
  const { events } = await open();
  vi.stubGlobal('getComputedStyle', () => ({ paddingLeft: '4px', paddingRight: '4px', fontSize: '16px' }));
  const st = document.getElementById('status');
  const fit = (clientWidth, scrollWidth) => {
    Object.assign(st.style, { fontSize: '13px', whiteSpace: 'normal' });
    Object.defineProperties(st, { clientWidth: { value: clientWidth, configurable: true }, scrollWidth: { value: scrollWidth, configurable: true } });
    events.fitStatus();
    return [st.style.fontSize, st.style.whiteSpace];
  };
  assert.deepStrictEqual(fit(208, 150), ['', ''], 'it fits: back to the stylesheet\'s size, on one line');
  assert.deepStrictEqual(fit(108, 128), ['13.3px', ''], 'a little too long: 100 of 120 wide, so 16px becomes 13.3px');
  assert.deepStrictEqual(fit(108, 404), ['9px', 'normal'], 'far too long: 9px, and it wraps');
});

test('the fallback timer ticks only while the page shows', async () => {
  await open();
  const tick = vi.fn();
  window.lanternTick = tick;
  timer(16);
  assert.strictEqual(tick.mock.calls.length, 1, 'a 16ms timer ticks while shown');
  hidden(true); timer(16);
  assert.strictEqual(tick.mock.calls.length, 1, 'none while hidden');
});

// WebKit can't tell the screensaver's window is on screen, so its page may report hidden while it shows
// (screensaver/LanternView.swift), and macOS can stop calling animateOneFrame: the timer is then all that draws.
test('the screensaver\'s fallback timer ticks even when its page says it\'s hidden', async () => {
  await open('?screensaver');
  const tick = vi.fn();
  window.lanternTick = tick;
  hidden(true); timer(16);
  assert.strictEqual(tick.mock.calls.length, 1);
});

test('a tap outside the moths and the card puts the card away; a mouse click or a tap on the card doesn\'t', async () => {
  const { card } = await open();
  const hide = vi.spyOn(card, 'hideCard').mockImplementation(() => {});
  const click = (pointerType, target) => target.dispatchEvent(Object.assign(new MouseEvent('click', { bubbles: true }), { pointerType }));
  click('mouse', document.body); click('touch', document.getElementById('card'));
  assert.strictEqual(hide.mock.calls.length, 0);
  click('touch', document.body);
  assert.strictEqual(hide.mock.calls.length, 1);
});

// Hover areas are plain circles (card.ts), found from the scene's own pointer events (wiring.ts zoneFor), so a moth's card
// and its click only work if those handlers reach them
test('pointing at a moth shows its card, and clicking it brings its session to the front', async () => {
  const { card, state, live, fetch } = await open();
  flatScene();
  vi.spyOn(card, 'renderCard').mockImplementation(() => {});
  const scene = document.getElementById('scene');
  const moth = { key: 'api', zone: null };
  moth.zone = state.hoverArea(() => moth, 'moth');
  Object.assign(moth.zone, { x: 100, y: 200 });
  const fire = (type, x, y) => scene.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }), { pointerType: 'mouse' }));
  fire('pointermove', 300, 300);
  assert.strictEqual(live.hovered, null, 'nothing away from it');
  fire('pointermove', 110, 205);
  assert.strictEqual(live.hovered, moth, 'its card, pointing at it');
  assert.strictEqual(scene.style.cursor, 'pointer');
  fire('click', 110, 205);
  assert.deepStrictEqual(fetch.mock.calls.map(([url, o]) => [url, JSON.parse(o.body)]), [['/focus', { id: 'api' }]]);
});

// A moth's hover area at (100, 100) with radius 40, in screen and scene coordinates alike, under the open card.
async function withCard() {
  const o = await open();
  flatScene();
  const zone = Object.assign(o.card.hoverZone(() => ({}), () => {}, 40), { x: 100, y: 100 });
  const clickCard = (x, y, tag = '') => {
    const target = tag ? document.getElementById('card').appendChild(document.createElement(tag)) : document.getElementById('card');
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
    if (tag) target.remove();
  };
  return { ...o, zone, clickCard };
}

test('a click on a session\'s card body opens it only where the card covers its own moth; a stale PR\'s card opens from anywhere', async () => {
  const { card, live, zone, clickCard } = await withCard();
  const open = vi.spyOn(card, 'clickZone').mockImplementation(() => {});
  const opened = () => open.mock.calls.map(([z]) => z);
  live.hovered = { session: { id: 's1' }, zone };
  clickCard(300, 300);
  assert.deepStrictEqual(opened(), [], 'away from its moth');
  clickCard(110, 95);
  assert.deepStrictEqual(opened(), [zone], 'over its moth (a tall card in the iTerm panel)');
  clickCard(110, 95, 'a'); clickCard(110, 95, 'button');
  assert.strictEqual(opened().length, 1, 'but not on a link or button there (a row, the PR toggle)');
  live.hovered = { stale: {}, zone: 'wisp' };
  clickCard(300, 300);
  assert.deepStrictEqual(opened(), [zone, 'wisp'], 'a stale PR\'s card');
});

test('the open card and the sidebar redraw on every tick, whatever is under the pointer or focused (card.ts morph keeps it)', async () => {
  stubCanvas2d(); // the text on the paper draws on its own timer
  const { card, live } = await open();
  window.lanternTick = () => {};
  for (const id of ['card', 'dock']) vi.spyOn(document.getElementById(id), 'matches').mockReturnValue(true); // the pointer, focus and a press on both, whatever's asked
  const cards = vi.spyOn(card, 'renderCard').mockImplementation(() => {}), sidebars = vi.spyOn(card, 'renderSidebar').mockImplementation(() => {});
  const tick = () => timer(500);
  tick();
  assert.deepStrictEqual([cards.mock.calls.length, sidebars.mock.calls.length], [0, 1], 'no card open: only the sidebar');
  live.hovered = {};
  tick(); tick();
  assert.deepStrictEqual([cards.mock.calls.length, sidebars.mock.calls.length], [2, 3]);
});
