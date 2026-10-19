// Moths' hover areas can overlap (a flying moth's area sits on its home, 48 wide). Where they do, a point belongs to the
// nearest moth whose area it's in (page/card.js's zoneAt), so neighbours split the overlap down the middle instead of
// whichever is drawn on top covering the other.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const page = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'page', 'card.js'), 'utf8'), page, { filename: 'card.js' });
const zoneAt = vm.runInContext('zoneAt', page);
const circle = (cx, cy, r) => ({ getAttribute: k => String({ cx, cy, r }[k]) });

test('two overlapping hover areas split at the midpoint, and a point outside both picks neither', () => {
  const a = circle(0, 0, 48), b = circle(60, 0, 48); // 60 apart, so they overlap from x = 12 to x = 48
  for (const zones of [[a, b], [b, a]]) { // either one drawn on top
    assert.strictEqual(zoneAt(zones, 29, 0), a, 'just on A\'s side of the midpoint (30) is A');
    assert.strictEqual(zoneAt(zones, 31, 0), b, 'just on B\'s side is B');
    assert.strictEqual(zoneAt(zones, 30, 60), null, 'above the midpoint, outside both, is neither');
  }
});

test('a landed moth keeps its own body next to a flying moth\'s wider area', () => {
  const landed = circle(0, 0, 22), flying = circle(30, 0, 48);
  assert.strictEqual(zoneAt([flying, landed], 0, 0), landed);
  assert.strictEqual(zoneAt([flying, landed], 14, 0), landed, 'up to the midpoint');
  assert.strictEqual(zoneAt([flying, landed], 16, 0), flying);
  assert.strictEqual(zoneAt([flying, landed], -21, 0), landed, 'its far side is its own');
});

test('shift+click runs an area\'s snooze menu, a plain click runs its click action', () => {
  const calls = [];
  vm.runInContext('globalThis.$ = () => ({ classList: { remove() {} } }); globalThis.clearTimeout = () => {}; globalThis.hideTimer = 0', page);
  const zone = vm.runInContext('hoverZone', page)({}, {}, () => calls.push('click'));
  vm.runInContext('areas', page).get(zone).menu = () => calls.push('snooze');
  const clickZone = vm.runInContext('clickZone', page);
  clickZone(zone, false);
  assert.deepStrictEqual(calls, ['click']);
  clickZone(zone, true);
  assert.deepStrictEqual(calls, ['click', 'snooze']);
});

test('landed moths 20 apart (r 32) still split at their midpoint', () => {
  const a = circle(0, 0, 32), b = circle(20, 0, 32);
  assert.strictEqual(zoneAt([a, b], 9, 0), a);
  assert.strictEqual(zoneAt([a, b], 11, 0), b);
});
