// The barrel's ribbon bookmark (stepRibbon in page/frame.js) under the things that used to fling it about: a long frame,
// the window resizing (its length changing, its knot jumping) and bad state. Its fastest point moves at about 35 a second
// in ordinary wind; the resize glitch reached 3600.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const page = vm.createContext({ URLSearchParams, location: { search: '' }, performance });
for (const f of ['scene', 'lanterns', 'frame']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'page', f + '.js'), 'utf8'), page, { filename: f + '.js' });
const stepRibbon = vm.runInContext('stepRibbon', page);

const KNOT = [340, 470], DT = 1 / 60;
const settled = () => { const r = {}; for (let k = 0; k < 120; k++) stepRibbon(r, ...KNOT, 128, DT, k * DT); return r; };
const fastest = r => Math.max(...r.pts.map(p => Math.hypot(p.vx, p.vy)));
const length = r => r.pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - r.pts[i].x, p.y - r.pts[i].y), 0);
const sane = (r, what) => {
  assert.ok(r.pts.every(p => [p.x, p.y, p.vx, p.vy].every(Number.isFinite)), `${what}: a point isn't a number`);
  assert.ok(length(r) <= 1.05 * r.seg * (r.pts.length - 1), `${what}: stretched to ${length(r).toFixed(1)}, rest length ${(r.seg * (r.pts.length - 1)).toFixed(1)}`);
  assert.ok(fastest(r) < 400, `${what}: a point flew off at ${fastest(r).toFixed(0)} a second`);
};

test('a long frame (a hidden tab, the screensaver waking) only moves the ribbon as far as a normal one', () => {
  const a = settled(), b = settled();
  stepRibbon(a, ...KNOT, 128, 2, 2); stepRibbon(b, ...KNOT, 128, 0.05, 2);
  assert.deepStrictEqual(a.pts.map(p => [p.x, p.y]), b.pts.map(p => [p.x, p.y]));
  sane(a, 'after a 2s frame');
});

test('a new length (the window resized) grows in without flinging the ribbon', () => {
  const r = settled();
  for (const [to, frames] of [[260, 240], [60, 240]]) for (let k = 0; k < frames; k++) {
    stepRibbon(r, ...KNOT, to, DT, 2 + k * DT);
    sane(r, `heading for ${to}, frame ${k}`);
  }
  assert.ok(Math.abs(r.seg * (r.pts.length - 1) - 60) < 5, `it should have reached 60 long, not ${r.seg * (r.pts.length - 1)}`);
});

test('when a resize moves the knot, the ribbon goes with it', () => {
  const r = settled();
  for (let k = 0; k < 60; k++) { stepRibbon(r, KNOT[0], KNOT[1] + 150, 128, DT, 2 + k * DT); sane(r, `after the knot jumped, frame ${k}`); }
  assert.strictEqual(r.pts[0].y, KNOT[1] + 150, 'the chain should be tied at the new knot');
});

test('a ribbon in a bad state hangs straight from its knot again', () => {
  const r = settled();
  r.pts[5].x = NaN;
  stepRibbon(r, ...KNOT, 128, DT, 2);
  sane(r, 'after a NaN');
  assert.ok(r.pts.every(p => Math.abs(p.x - KNOT[0]) < 1), 'it should hang straight down');
});
