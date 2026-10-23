// The page's wiring (src/wiring.ts): the fallback timer that stands in for rAF, pointing at
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
// a session moth at (100, 200) on the page's real scene, and pointer events on the scene, the card and the window
async function withMoth() {
  const o = await open();
  flatScene();
  window.lanternTick = () => {}; // no frames while the timers run
  const scene = document.getElementById('scene'), cardEl = document.getElementById('card');
  const moth = { key: 'api', session: { id: 'api', state: 'waiting' }, zone: null }, other = { key: 'web', zone: null };
  moth.zone = o.state.hoverArea(() => moth, 'moth'); other.zone = o.state.hoverArea(() => other, 'moth');
  Object.assign(moth.zone, { x: 100, y: 200 }); Object.assign(other.zone, { x: 400, y: 200 });
  const fire = (el, type, x = 0, y = 0, init = {}) => el.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, ...init }), { pointerType: 'mouse' }));
  return { ...o, scene, cardEl, moth, other, fire };
}

test('pointing at a moth shows its compact card, and clicking it expands the card rather than opening the session', async () => {
  const { live, fetch, scene, cardEl, moth, fire } = await withMoth();
  fire(scene, 'pointermove', 300, 300);
  assert.strictEqual(live.hovered, null, 'nothing away from it');
  fire(scene, 'pointermove', 110, 205);
  assert.strictEqual(live.hovered, moth, 'its card, pointing at it');
  assert.strictEqual(scene.style.cursor, 'pointer');
  assert.deepStrictEqual([live.expanded, cardEl.classList.contains('compact')], [false, true], 'compact while hovered');
  fire(scene, 'click', 110, 205);
  assert.deepStrictEqual([live.hovered, live.expanded, cardEl.classList.contains('compact')], [moth, true, false], 'expanded by the click');
  assert.deepStrictEqual(fetch.mock.calls, [], 'and the session isn\'t brought to the front');
  fire(scene, 'click', 110, 205);
  assert.deepStrictEqual([live.hovered, live.expanded], [null, false], 'a second click puts it away');
  fire(scene, 'click', 110, 205, { shiftKey: true });
  assert.deepStrictEqual(fetch.mock.calls.map(([url]) => url), ['/snooze'], 'shift-click still snoozes');
});

test('a hover card is a tooltip: the pointer passes through it, and it goes the moment the pointer leaves the moth', async () => {
  const { live, scene, cardEl, moth, fire } = await withMoth();
  fire(scene, 'pointermove', 110, 205);
  assert.strictEqual(getComputedStyle(cardEl).pointerEvents, 'none', 'a compact card takes no pointer events');
  assert.strictEqual(live.hovered, moth, 'shown while pointing at it');
  fire(scene, 'pointermove', 300, 300); timer(0);
  assert.strictEqual(live.hovered, null, 'gone at once, no grace period');
});

test('an expanded card stays until the pointer has been away from it and its moth for 2 seconds, or a click lands elsewhere', async () => {
  const { live, scene, cardEl, moth, other, fire } = await withMoth();
  const expanded = () => { fire(scene, 'pointermove', 110, 205); fire(scene, 'click', 110, 205); assert.ok(live.expanded); };
  expanded();
  assert.strictEqual(getComputedStyle(cardEl).pointerEvents, 'auto', 'an expanded card takes the pointer');
  fire(scene, 'pointermove', 300, 300); timer(1999);
  assert.strictEqual(live.hovered, moth, 'still open just short of 2 seconds away');
  timer(1);
  assert.strictEqual(live.hovered, null, 'closed at 2 seconds');
  expanded();
  fire(scene, 'pointermove', 300, 300); timer(1500);
  fire(scene, 'pointermove', 110, 205); timer(5000);
  assert.ok(live.expanded && live.hovered === moth, 'coming back to its moth in time keeps it');
  fire(scene, 'pointerleave', 300, 300); fire(cardEl, 'pointerenter'); timer(5000);
  assert.ok(live.expanded, 'and so does moving onto the card');
  fire(cardEl, 'pointerleave'); fire(scene, 'pointermove', 410, 205);
  assert.strictEqual(live.hovered, moth, 'another moth doesn\'t take it over on hover');
  timer(2000);
  assert.strictEqual(live.hovered, null, 'and it closes 2 seconds after leaving the card');
  expanded();
  fire(cardEl, 'click');
  assert.ok(live.expanded, 'a click on the card keeps it');
  fire(document.body, 'click');
  assert.deepStrictEqual([live.hovered, live.expanded], [null, false], 'a click elsewhere closes it');
  expanded();
  fire(scene, 'click', 410, 205);
  assert.deepStrictEqual([live.hovered, live.expanded], [other, true], 'a click on another moth expands that one\'s');
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

test('a click on a session\'s card body does nothing (it opens from its header); a stale PR\'s card opens from anywhere but a link', async () => {
  const { card, live, zone, clickCard } = await withCard();
  const open = vi.spyOn(card, 'clickZone').mockImplementation(() => {});
  const opened = () => open.mock.calls.map(([z]) => z);
  live.hovered = { key: 's1', session: { id: 's1' }, zone };
  clickCard(300, 300); clickCard(110, 95);
  assert.deepStrictEqual(opened(), [], 'not even over its own moth');
  live.hovered = { stale: {}, zone: 'wisp' };
  clickCard(300, 300); clickCard(300, 300, 'a');
  assert.deepStrictEqual(opened(), ['wisp'], 'a stale PR\'s card, but not from a link on it');
});

test('a click on a card button that takes itself away (the agents\' "more") keeps the card open, and Escape closes it', async () => {
  const { live, scene, cardEl, fire } = await withMoth();
  fire(scene, 'pointermove', 110, 205); fire(scene, 'click', 110, 205);
  assert.ok(live.expanded);
  const more = cardEl.appendChild(document.createElement('button'));
  let reached = false;
  more.addEventListener('click', () => more.remove()); // as Vue's v-if does, before the click bubbles out to the window
  addEventListener('click', () => { reached = true; }, { once: true });
  fire(more, 'click');
  assert.ok(reached && !more.isConnected, 'the click reached the window after its button was gone');
  assert.ok(live.expanded, 'and the card stayed open');
  dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  assert.deepStrictEqual([live.hovered, live.expanded], [null, false], 'Escape closes it');
});
