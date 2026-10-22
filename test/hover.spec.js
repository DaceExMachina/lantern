// Moths' hover areas can overlap (a flying moth's area sits on its home, 48 wide). Where they do, a point belongs to the
// nearest moth whose area it's in (src/scene/card.js's zoneAt), so neighbours split the overlap down the middle instead of
// whichever is drawn on top covering the other.
import assert from 'node:assert';
import { test } from 'vitest';
import { $, WING_SIDE, WING_UP, caster, wing3d } from '../src/scene/scene.js';
import { clickZone, holdAnchor, hoverZone, tapZone, zoneAt } from '../src/scene/card.js';
import { mothZones } from '../src/scene/frame.js';
import { live } from '../src/scene/live.js';

const circle = (x, y, r) => ({ x, y, r, off: false });

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
  const zone = hoverZone({}, () => calls.push('click'));
  zone.menu = () => calls.push('snooze');
  clickZone(zone, false);
  assert.deepStrictEqual(calls, ['click']);
  clickZone(zone, true);
  assert.deepStrictEqual(calls, ['click', 'snooze']);
});

test('a tap shows a moth\'s card without running its click, and tapping the same moth again puts it away', () => {
  const calls = [], card = $('card');
  live.hovered = null;
  const moth = {}, other = {};
  const zone = hoverZone(moth, () => calls.push('click')), zone2 = hoverZone(other, () => calls.push('click'));
  card.classList.add('show');
  tapZone(zone);
  assert.strictEqual(live.hovered, moth, 'first tap shows its card');
  tapZone(zone2);
  assert.strictEqual(live.hovered, other, 'tapping another moth moves the card to it');
  assert.ok(card.classList.contains('show'), 'which is still showing');
  tapZone(zone2);
  assert.strictEqual(live.hovered, null, 'the same moth again dismisses');
  assert.ok(!card.classList.contains('show'), 'and puts the card away');
  assert.deepStrictEqual(calls, [], 'and no tap ran a click action');
});

test('landed moths 20 apart (r 32) still split at their midpoint', () => {
  const a = circle(0, 0, 32), b = circle(20, 0, 32);
  assert.strictEqual(zoneAt([a, b], 9, 0), a);
  assert.strictEqual(zoneAt([a, b], 11, 0), b);
});

test('a landed moth\'s area is centred on its drawn body, so a point on the lower of two close moths picks it', () => {
  // a moth folded on flat paper, its body pointing up the screen: the wings the way mothWings draws them, as caster() sums them up
  const shade = (x, y) => caster(x, y, 0, 1, [...wing3d(WING_UP, [0, -1, 0], [0, 0, 1], 0.1), ...wing3d(WING_SIDE, [0, -1, 0], [0, 0, 1], 0.16)]);
  const landed = y => { const m = { x: 300, y, size: 1, tilt: 0, zone: {}, shade: shade(300, y) }; mothZones(m, true); return m; };
  const upper = landed(78), lower = landed(100); // anchors 22 apart; the wings stand about 16 above each anchor
  // 14 above the lower anchor is the middle of the lower moth's drawn wings (they span roughly 100 - 28 to 100 - 4)
  assert.strictEqual(zoneAt([upper.zone, lower.zone], 298, 86), lower.zone);
  assert.strictEqual(zoneAt([upper.zone, lower.zone], 298, 62), upper.zone, 'and the upper moth keeps its own');
});

test('a card holds its anchor through small moves of its moth, and takes a new one once the moth is well away or another area', () => {
  const zone = {}, other = {};
  const at = (z, x, y) => { const a = holdAnchor(z, x, y); return [a.x, a.y]; };
  assert.deepStrictEqual(at(zone, 100, 100), [100, 100], 'the first spot is taken');
  assert.deepStrictEqual(at(zone, 115, 90), [100, 100], 'a hop or resettle nearby changes nothing');
  assert.deepStrictEqual(at(zone, 100, 130), [100, 100], 'still held a little short of the threshold');
  assert.deepStrictEqual(at(zone, 100, 145), [100, 145], 'well away takes a new anchor');
  assert.deepStrictEqual(at(other, 101, 146), [101, 146], 'another area takes its own at once');
});
