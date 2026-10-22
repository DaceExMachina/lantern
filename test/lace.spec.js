// The Moroccan's baked lace (bakeCutouts, src/scene/lanterns.ts) while the window resizes: many resize steps make one re-bake, and the
// picture on show stays until the new one has decoded. Timers and images are faked so the test steers them by hand.
import assert from 'node:assert';
import { afterEach, test, vi } from 'vitest';
import { layOut } from './page.js';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// each test loads the page afresh: the bake keeps the size it last baked at
async function setup() {
  const decodes = [], built = [], fail = { on: false };
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubGlobal('Image', class {
    set src(v) { this._src = v; built.push(this); }
    get src() { return this._src; }
    decode() { return fail.on ? Promise.reject(new Error('decode failed')) : new Promise(res => decodes.push(res)); }
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(/** @type {any} */ ({ drawImage() {} }));
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => 'data:baked' + built.length);
  layOut(); vi.resetModules();
  const { live } = await import('../src/scene/live');
  const { VIEW } = await import('../src/scene/scene');
  const { applyStyle, bakeCutouts } = await import('../src/scene/lanterns');
  live.farWall = /** @type {any} */ ({}); // the far wall counts as baked already
  applyStyle('moroccan'); // draws the lace's mask, #cutouts
  const mask = /** @type {Element} */ (document.getElementById('cutouts'));
  assert.ok(mask, 'the Moroccan has its lace mask');
  const resize = px => { VIEW.px = px; bakeCutouts(); };
  const bakes = () => vi.getTimerCount(); // the debounced bakes waiting
  const runTimers = () => vi.runOnlyPendingTimers();
  const settle = async () => { while (bakes() || decodes.length) { runTimers(); decodes.splice(0).forEach(r => r()); await new Promise(r => setImmediate(r)); } };
  return { mask, decodes, built, resize, bakes, runTimers, settle, fail };
}

test('several resize steps bake once, and the old picture stays up until the new one has decoded', async () => {
  const t = await setup();
  t.resize(1); await t.settle();
  const first = t.mask.innerHTML;
  assert.match(first, /data:baked/);
  for (const px of [1.5, 2, 2.5, 3]) t.resize(px);
  assert.strictEqual(t.bakes(), 1, 'one debounced bake for the whole drag');
  assert.strictEqual(t.mask.innerHTML, first, 'still the old picture while resizing');
  t.runTimers();
  for (let i = 0; i < 2; i++) { // the svg decodes, then the baked picture
    await new Promise(r => setImmediate(r));
    assert.strictEqual(t.decodes.length, 1, 'waiting on decode ' + i);
    assert.strictEqual(t.mask.innerHTML, first, 'still the old picture before decode ' + i + ' lands');
    t.decodes.splice(0)[0]();
  }
  await new Promise(r => setImmediate(r));
  assert.notStrictEqual(t.mask.innerHTML, first, 'swapped once decoded');
});

test('a small size change does not re-bake', async () => {
  const t = await setup();
  t.resize(1); await t.settle();
  const first = t.mask.innerHTML;
  t.resize(1.05); await t.settle();
  assert.strictEqual(t.mask.innerHTML, first);
});

test('a bake that finishes after a newer size started is dropped', async () => {
  const t = await setup();
  t.resize(1); await t.settle();
  t.resize(2); t.runTimers(); // the bake at 2 starts
  await new Promise(r => setImmediate(r));
  const two = t.decodes.splice(0); // waiting on its svg
  t.resize(3); t.runTimers(); await t.settle(); // the bake at 3 starts and finishes
  const three = t.mask.innerHTML;
  assert.match(three, /data:baked/);
  const images = t.built.length;
  two.forEach(r => r()); await new Promise(r => setImmediate(r)); await t.settle(); // then the one at 2 lands
  assert.strictEqual(t.built.length, images + 1, 'the bake at 2 went on to make its picture');
  assert.strictEqual(t.mask.innerHTML, three, 'the picture at 3 stays');
});

test('a bake that fails tries again at the same size', async () => {
  const t = await setup();
  t.resize(1); await t.settle();
  const first = t.mask.innerHTML;
  t.fail.on = true; t.resize(2); await t.settle();
  assert.strictEqual(t.mask.innerHTML, first, 'the old picture stays when the bake fails');
  t.fail.on = false; t.resize(2); await t.settle();
  assert.notStrictEqual(t.mask.innerHTML, first, 'baked at the next resize, at the size that failed');
});
