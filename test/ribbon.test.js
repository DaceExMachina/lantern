// The barrel's ribbon bookmark (stepRibbon in page/frame.js) under the things that used to fling it about: uneven and
// long frames, the window resizing (its length changing, its knot jumping) and bad state. Its fastest point moves at about
// 35 a second in ordinary wind; the resize glitch reached 3600, and a near-zero frame blew it up to 1e306 long.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const page = vm.createContext({ URLSearchParams, location: { search: '' }, performance });
for (const f of ['scene', 'dev', 'lanterns', 'frame']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'page', f + '.js'), 'utf8'), page, { filename: f + '.js' });
const stepRibbon = vm.runInContext('stepRibbon', page);

const KNOT = [340, 470], DT = 1 / 60;
const settled = () => { const r = {}; for (let k = 0; k < 120; k++) stepRibbon(r, ...KNOT, 128, DT, k * DT); return r; };
const fastest = r => Math.max(...r.pts.map(p => Math.hypot(p.vx, p.vy)));
const length = r => r.pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - r.pts[i].x, p.y - r.pts[i].y), 0);
// joints where the chain bends one way then straight back the other, sharply: the odd-even zigzag
const zigzags = r => {
  const a = r.pts.slice(1).map((p, i) => Math.atan2(p.x - r.pts[i].x, p.y - r.pts[i].y));
  return a.slice(1, -1).filter((_, i) => { const d1 = a[i + 1] - a[i], d2 = a[i + 2] - a[i + 1]; return d1 * d2 < 0 && Math.abs(d1) > 0.05 && Math.abs(d2) > 0.05; }).length;
};
const sane = (r, what) => {
  assert.ok(r.pts.every(p => [p.x, p.y, p.vx, p.vy].every(Number.isFinite)), `${what}: a point isn't a number`);
  assert.ok(length(r) <= 1.05 * r.seg * (r.pts.length - 1), `${what}: stretched to ${length(r).toFixed(1)}, rest length ${(r.seg * (r.pts.length - 1)).toFixed(1)}`);
  assert.ok(fastest(r) < 400, `${what}: a point flew off at ${fastest(r).toFixed(0)} a second`);
};

test('a long frame (a hidden tab, the screensaver waking) runs no more steps than a slow one', () => {
  const a = settled(), b = settled();
  stepRibbon(a, ...KNOT, 128, 2, 2); stepRibbon(b, ...KNOT, 128, 0.5, 2);
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

test('uneven frames (the frame rate dropping, two timers firing together) keep it whole and smooth', () => {
  for (const [name, dts] of [['16/50ms', [0.016, 0.05]], ['near-zero then full', [0.0001, 0.05, 0.0005, 0.05]], ['long stalls', [0.2, 0.016, 0.5, 0.033]]]) {
    const r = {};
    let t = 0;
    for (let k = 0; k < 1500; k++) {
      const dt = dts[k % dts.length];
      t += dt;
      stepRibbon(r, KNOT[0], KNOT[1] + Math.sin(t * 0.7) * 3, 128, dt, t); // the knot rides the sway
      if (k < 10) continue; // let it settle from hanging straight
      sane(r, `${name}, frame ${k}`);
      assert.ok(Math.abs(length(r) / 128 - 1) < 0.05, `${name}, frame ${k}: ${length(r).toFixed(1)} long, not 128`);
      assert.strictEqual(zigzags(r), 0, `${name}, frame ${k}: zigzags at ${zigzags(r)} joints`);
    }
  }
});
