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
