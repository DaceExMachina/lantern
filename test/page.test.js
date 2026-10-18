// The page's pure geometry: landing spots on the lantern (page/lanterns.js) and the flapping wing (page/scene.js).
// The page is plain classic scripts, so they run here in a vm context, in index.html's order, and share its globals.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const page = vm.createContext({ URLSearchParams, location: { search: '' } }); // a plain window, no query string
for (const f of ['scene', 'lanterns']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'page', f + '.js'), 'utf8'), page, { filename: f + '.js' });
const run = code => vm.runInContext(code, page);

// How far round the side a perch sits: 0 at the lantern's middle, 1 at its rim (at that height).
const across = (key, a, r) => {
  const [x, y] = run(`style = STYLES.${key}; pickPerch(${a}, () => ${r})`);
  return Math.abs(x - 340) / run(`style.body.half(${y})`);
};
const styles = run('Object.keys(STYLES)');
const angles = Array.from({ length: 73 }, (_, i) => -Math.PI + i * Math.PI / 36);

test('landing spots stay out of the middle third of the lantern', () => {
  for (const key of styles) for (const a of angles) for (const r of [0, 0.5, 1]) {
    assert.ok(across(key, a, r) >= 1 / 3 - 1e-9, `${key}: a ${a.toFixed(2)}, rand ${r} lands ${across(key, a, r).toFixed(3)} of the way out`);
  }
});

test('landing spots keep their slices in order: a direction nearer the side lands further round', () => {
  // from straight down (a = pi/2) to straight out (a = 0), with the same random depth, every step lands further round
  for (const key of styles) for (const r of [0, 0.5, 1]) {
    const quarter = angles.filter(a => a >= 0 && a <= Math.PI / 2).reverse().map(a => across(key, a, r));
    for (let i = 1; i < quarter.length; i++) assert.ok(quarter[i] > quarter[i - 1], `${key}, rand ${r}: step ${i} lands at ${quarter[i]}, not past ${quarter[i - 1]}`);
  }
});

// flapWing became a view onto the one 3D wing model (wing3d); in flight it has to draw exactly what the old
// closed-form version did.
const { AU, AN, EYE } = run('({ AU, AN, EYE })');
const oldFlap = (pts, lift, sweep, roll) => pts.map(([x, y]) => {
  const a = x * AU[0] + y * AU[1], r = x * AN[0] + y * AN[1];
  const z = Math.abs(r) * Math.sin(lift), r2 = r * Math.cos(lift), a2 = a + sweep * z;
  const side = r2 * Math.cos(roll) + z * Math.sin(roll), depth = z * Math.cos(roll) - r2 * Math.sin(roll), k = EYE / (EYE - depth);
  return [(a2 * AU[0] + side * AN[0]) * k, (a2 * AU[1] + side * AN[1]) * k];
});

test('flapWing matches the old closed-form flap', () => {
  for (const wing of ['WING_UP', 'WING_SIDE']) for (const lift of [0, 0.4, 1.2, -0.3]) for (const sweep of [0, 0.3]) for (const roll of [0, 0.5, -1.4]) {
    const now = run(`flapWing(${wing}, ${lift}, ${sweep}, ${roll})`), was = oldFlap(run(wing), lift, sweep, roll);
    now.forEach(([x, y], i) => assert.ok(Math.hypot(x - was[i][0], y - was[i][1]) < 1e-9,
      `${wing} lift ${lift} sweep ${sweep} roll ${roll}: point ${i} is at ${x},${y}, was ${was[i]}`));
  }
});

test('a wing faces the flame on the side its lit face turns to', () => {
  // seen from above, a wing spread flat faces the viewer, so it's lit from in front of the screen whatever the flame's
  // direction in the plane; tipped up on its edge toward the flame its seen face points away from it
  const flat = run('wing3d(WING_SIDE, [AU[0], AU[1], 0], [0, 0, 1], Math.PI / 2 - 0.3).normal');
  assert.ok(flat[2] > 0.9, `a spread wing faces the viewer: ${flat.map(v => v.toFixed(2))}`);
  const up = run('wing3d(WING_SIDE, [AU[0], AU[1], 0], [0, 0, 1], 0.4).normal');
  const lift = run('[AN[0], AN[1]]'); // the side WING_SIDE spreads to
  assert.strictEqual(run(`facesFlame([${up}], ${lift[0]}, ${lift[1]})`), 0, 'the flame on the side the wing opens to is behind its seen face');
  assert.strictEqual(run(`facesFlame([${up}], ${-lift[0]}, ${-lift[1]})`), 1, 'the flame across the body lights its seen face');
});
