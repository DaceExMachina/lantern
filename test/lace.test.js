// The Moroccan's baked lace (bakeCutouts, page/lanterns.js) while the window resizes: many resize steps make one re-bake, and the
// picture on show stays until the new one has decoded. Timers and images are stubbed so the test steers them by hand.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function setup() {
  const mask = { style: {}, innerHTML: '' }, timers = [], decodes = [], built = [], fail = { on: false };
  class Image {
    set src(v) { this._src = v; built.push(this); }
    get src() { return this._src; }
    decode() { return fail.on ? Promise.reject(new Error('decode failed')) : new Promise(res => decodes.push(res)); }
  }
  const canvas = () => ({ getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:baked' + built.length });
  const page = vm.createContext({ URLSearchParams, location: { search: '' }, performance, farWallTex: {}, document: { getElementById: id => id === 'cutouts' ? mask : null, createElement: canvas },
    Image, devicePixelRatio: 1, setTimeout: f => timers.push(f), clearTimeout: () => { timers.length = 0; } });
  for (const f of ['scene', 'dev', 'lanterns']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'page', f + '.js'), 'utf8'), page, { filename: f + '.js' });
  const resize = px => { vm.runInContext(`VIEW.px = ${px}; bakeCutouts()`, page); };
  const settle = async () => { while (timers.length || decodes.length) { timers.splice(0).forEach(f => f()); decodes.splice(0).forEach(r => r()); await new Promise(r => setImmediate(r)); } };
  return { mask, timers, decodes, built, resize, settle, fail };
}

test('several resize steps bake once, and the old picture stays up until the new one has decoded', async () => {
  const t = setup();
  t.resize(1); await t.settle();
  const first = t.mask.innerHTML;
  assert.match(first, /data:baked/);
  for (const px of [1.5, 2, 2.5, 3]) t.resize(px);
  assert.strictEqual(t.timers.length, 1, 'one debounced bake for the whole drag');
  assert.strictEqual(t.mask.innerHTML, first, 'still the old picture while resizing');
  t.timers.splice(0)[0]();
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
  const t = setup();
  t.resize(1); await t.settle();
  const first = t.mask.innerHTML;
  t.resize(1.05); await t.settle();
  assert.strictEqual(t.mask.innerHTML, first);
});

test('a bake that finishes after a newer size started is dropped', async () => {
  const t = setup();
  t.resize(1); await t.settle();
  t.resize(2); t.timers.splice(0)[0](); // the bake at 2 starts
  await new Promise(r => setImmediate(r));
  const two = t.decodes.splice(0); // waiting on its svg
  t.resize(3); t.timers.splice(0)[0](); await t.settle(); // the bake at 3 starts and finishes
  const three = t.mask.innerHTML;
  assert.match(three, /data:baked/);
  const images = t.built.length;
  two.forEach(r => r()); await new Promise(r => setImmediate(r)); await t.settle(); // then the one at 2 lands
  assert.strictEqual(t.built.length, images + 1, 'the bake at 2 went on to make its picture');
  assert.strictEqual(t.mask.innerHTML, three, 'the picture at 3 stays');
});

test('a bake that fails tries again at the same size', async () => {
  const t = setup();
  t.resize(1); await t.settle();
  const first = t.mask.innerHTML;
  t.fail.on = true; t.resize(2); await t.settle();
  assert.strictEqual(t.mask.innerHTML, first, 'the old picture stays when the bake fails');
  t.fail.on = false; t.resize(2); await t.settle();
  assert.notStrictEqual(t.mask.innerHTML, first, 'baked at the next resize, at the size that failed');
});
