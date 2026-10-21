// The flame (page/frame.js stepFlame, page/background.js BARE_FLAME): the candle's and the Moroccan's is drawn by the
// background's shader and moved by a spring, a paper lantern's stays in the SVG. The page is plain classic scripts, run here
// in a vm context in index.html's order, over a stub DOM and a stub WebGL that records the uniforms each draw sets.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function context() {
  // a WebGL that compiles anything, lists each program's uniforms from its source, and keeps the last value set for each
  const uniforms = {}, sources = [];
  const gl = new Proxy({
    getShaderParameter: () => true, getProgramParameter: () => 64, isContextLost: () => false,
    shaderSource: (_, src) => sources.push(src),
    createProgram: () => { sources.length = 0; return {}; },
    getActiveUniform: (_, i) => {
      const names = sources.join('\n').match(/uniform\s+\w+\s+[^;]+;/g).flatMap(d => d.replace(/uniform\s+\w+\s+/, '').replace(';', '').split(',').map(n => n.trim().replace(/\[.*/, '[0]')));
      return { name: names[i] ?? `unused${i}` };
    },
    getUniformLocation: (_, name) => name,
  }, { get: (t, k) => k in t ? t[k] : typeof k === 'string' && k.startsWith('uniform') ? (loc, ...v) => { uniforms[loc] = v.length === 1 && v[0]?.length ? [...v[0]] : v; } : () => ({}) });
  const node = () => ({ attrs: {}, getAttribute(k) { return this.attrs[k] ?? null; }, setAttribute(k, v) { this.attrs[k] = String(v); } });
  const els = { bg: { getContext: () => gl, addEventListener() {}, width: 1200, height: 800 }, lantern: { ...node(), innerHTML: '' }, lanternLayer: { style: {} }, style: { value: '' } }; // lanternLayer: the layer the sway turns (frame.js swingLantern)
  const page = vm.createContext({ URLSearchParams, location: { search: '' }, performance: { now: () => 0 }, devicePixelRatio: 2, window: {},
    document: { getElementById: id => els[id] ?? null, querySelectorAll: () => [] } });
  for (const f of ['scene', 'dev', 'lanterns', 'state', 'background', 'frame']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'page', f + '.js'), 'utf8'), page, { filename: f + '.js' });
  const run = code => vm.runInContext(code, page);
  run('VIEW.box = [40, 20, 600, 600]; flyLightN = 0; ghostWingN = 0; farWallTex = {}'); // the Moroccan's far wall counts as baked already
  run('realDraw = drawBackground; drawBackground = v => { drawn = v; realDraw(v); }'); // keeping what drawLight gives it
  return { run, els, uniforms };
}
// The chain's mechanics, apart from how Dace tuned it: a loose, lightly damped feel at every size (the tuned blaze is
// damped past overshooting, so it settles without a whip)
const loose = ctx => ctx.run('Object.assign(FEEL, { stiffness: [70, 70], falloff: [3, 3], damping: [5, 5], inertia: [15, 15] })');
// a frame of the flame at page time s, `dt` on, burning at full size
const step = (ctx, s, dt = 1 / 60) => ctx.run(`stepFlame(${dt}, ${s}, { size: 1, flick: 1, pulse: 1 })`);

test('a paper lantern keeps its flame in the SVG; the candle and the Moroccan leave theirs to the shader', () => {
  const ctx = context();
  for (const key of ['barrel', 'chochin', 'moroccan', 'candle']) {
    const paper = key === 'barrel' || key === 'chochin';
    ctx.run(`applyStyle('${key}'); swingLantern(1 / 60, 3)`);
    assert.strictEqual(/id="fOuter"/.test(ctx.els.lantern.innerHTML), paper, `${key}: the SVG's tongues`);
    assert.ok(/id="sparks"/.test(ctx.els.lantern.innerHTML), `${key}: somewhere for sparks`);
    ctx.run(`drawLight(1 / 60, 3, stepFlame(1 / 60, 3, { size: 1, flick: 1, pulse: 1 }))`);
    assert.strictEqual(ctx.run('drawn').fire === null, paper, `${key}: the shader's flame`);
  }
});

test('the tip the smoke, the hot air and the rim\'s shadow leave from is the shader flame\'s tip', () => {
  const ctx = context(), src = fs.readFileSync(path.join(__dirname, '..', 'page', 'background.js'), 'utf8');
  // the shader's outer tongue ends at its height (flameHalf is 0 from t = 1), its spine bent over to the full lean there,
  // and its noise gone at the tip
  const half = new Function(src.match(/float flameHalf\(float t\) \{[\s\S]*?\n\}/)[0].replace('float flameHalf(float t)', 'return t =>')
    .replace(/\bfloat /g, 'let ').replace(/\b(sqrt|pow)\(/g, 'Math.$1('))();
  assert.ok(half(0.999) > 0 && half(1) === 0 && half(1.01) === 0, 'the tongue comes to its point at t = 1');
  // nothing of any tongue shows above its tip or below its base, however its spine falls across a pixel
  const tongue = new Function('flameHalf', src.match(/float tongue\(vec2 q, float w, float h, float px\) \{[\s\S]*?\n\}/)[0]
    .replace('float tongue(vec2 q, float w, float h, float px)', 'return (q, w, h, px) =>').replace(/\bfloat /g, 'let ')
    .replace(/\babs\(/g, 'Math.abs(').replace(/\bclamp\(([^;]*), 0\.0, 1\.0\)/, 'Math.min(1, Math.max(0, $1))'))(half);
  for (const [w, h] of [[34, 96], [24, 70], [13, 40]]) for (const y of [h, h * 1.001, h * 1.2, -0.05 * h]) for (const x of [0, 0.1, -0.3]) {
    assert.strictEqual(tongue({ x, y }, w, h, 1), 0, `a tongue ${w} by ${h} shows at ${x}, ${y}: a line off its tip`);
  }
  assert.ok(tongue({ x: 0, y: 48 }, 34, 96, 1) === 1, 'and covers its middle');
  assert.match(src, /q\.x -= spineX\(t\) \+ uShape\.y \* mid \*/, 'the tongues stand on the spine, and the noise is weighed by mid');
  // the spine, run as JS: a curve through the chain's points, the base's at t = 0 and the tip's at t = 1
  const CHAIN = ctx.run('CHAIN'), glf = ctx.run('glf');
  const spineX = (uSpine, t) => new Function('uSpine', 'clamp', ctx.run('`' + src.match(/float spineX\(float t\) \{[\s\S]*?\n\}/)[0].replace(/\\/g, '\\\\') + '`')
    .replace('float spineX(float t)', 'return t =>').replace(/\b(float|int) /g, 'let ').replace(/\bfloat\(j\)/, 'j').replace(/\b(min|floor)\(/g, 'Math.$1('))(uSpine, (v, a, b) => Math.min(b, Math.max(a, v)))(t);
  assert.match(src, /mid = 4\.0 \* t \* \(1\.0 - t\)/, 'mid is 0 at the tip');
  assert.match(src, /tongue\(q, 34\.0 \* swell, h, px\)/, 'the outer tongue is h tall');
  for (const key of ['candle', 'moroccan']) {
    ctx.run(`applyStyle('${key}')`);
    for (let i = 0; i < 240; i++) { ctx.run(`swingLantern(1 / 60, ${10 + i / 60})`); step(ctx, 10 + i / 60); } // swinging and blowing about
    const flame = step(ctx, 14);
    ctx.run(`drawHeat(14, ${JSON.stringify(flame)}); drawLight(1 / 60, 14, ${JSON.stringify(flame)})`);
    const [bx, by, k] = ctx.uniforms.uBase, [h] = ctx.uniforms.uShape, spine = ctx.uniforms['uSpine[0]'];
    assert.strictEqual(spine.length, CHAIN + 1, `${key}: the base and each link's point`);
    spine.forEach((x, j) => assert.ok(Math.abs(spineX(spine, j / CHAIN) - x) < 1e-9, `${key}: the spine passes through point ${j}`));
    const lean = spineX(spine, 1), tip = [bx + lean * k, by - h * k];
    assert.ok(Math.abs(lean) > 0.5, `${key}: the flame leans (${lean}), so the test can tell`);
    for (const [what, [x, y]] of [['flameTip', flame.tip], ['the rim shadow', ctx.run('drawn.flame.slice(2)')]]) {
      assert.ok(Math.hypot(x - tip[0], y - tip[1]) < 1e-6, `${key}: ${what} at ${x}, ${y}, the shader's tip at ${tip}`);
    }
    if (key === 'candle') { const { x, y } = ctx.run('heat'); assert.ok(Math.hypot(x - tip[0], y - tip[1]) < 1e-6, `the hot air leaves ${x}, ${y}, not the tip ${tip}`); }
  }
});

test('the flame\'s spring settles: kicked, it swings past upright and comes to rest', () => {
  const ctx = context();
  loose(ctx);
  ctx.run(`applyStyle('candle')`);
  const rest = step(ctx, 5).tip; // the clock held at 5: a steady wind and wobble, so it has somewhere to settle
  for (let i = 0; i < 600; i++) step(ctx, 5); // ten seconds: even the loosest spring has come to rest
  const settled = step(ctx, 5).tip;
  ctx.run('flameChain.pts.at(-1).vx += 400');
  const xs = Array.from({ length: 300 }, () => step(ctx, 5).tip[0] - settled[0]);
  assert.ok(Math.max(...xs) > 3, `the kick throws it over: ${Math.max(...xs)}`);
  assert.ok(Math.min(...xs) < -0.1, `it swings back past where it rests: ${Math.min(...xs)}`);
  assert.ok(Math.abs(xs.at(-1)) < 0.01 && Math.abs(ctx.run('flameChain.pts.at(-1).vx')) < 0.1, `and settles after 5 seconds: ${xs.at(-1)}, moving ${ctx.run('flameChain.pts.at(-1).vx')}`);
  assert.ok(Math.abs(rest[0] - settled[0]) < 5, 'resting where it started, give or take its first settle');
});

test('when the lantern swings off, its flame lags behind and leans back, then rights itself', () => {
  const ctx = context();
  ctx.run(`applyStyle('moroccan'); swayAngle = 0`);
  for (let i = 0; i < 300; i++) step(ctx, 5);
  const still = step(ctx, 5), lean = f => f.tip[0] - f.base[0] - (still.tip[0] - still.base[0]);
  // the lantern swings off at a steady rate of turn picked up over 0.2 seconds, so its flame's base speeds up to one side
  const go = [];
  for (let i = 1; i <= 12; i++) { ctx.run(`swayAngle = ${0.02 * i * i / 2}`); go.push(step(ctx, 5)); }
  const ax = go.at(-1).base[0] - 2 * go.at(-2).base[0] + go.at(-3).base[0];
  assert.ok(Math.abs(ax) > 1e-3, `the base speeds up: ${ax}`);
  assert.strictEqual(Math.sign(lean(go.at(-1))), -Math.sign(ax), `it leans away from the push: ${lean(go.at(-1))} for ${ax}`);
  // and held there, it rights itself
  let f;
  for (let i = 0; i < 600; i++) f = step(ctx, 5);
  assert.ok(Math.abs(lean(f)) < 0.05, `upright again: ${lean(f)}`);
});

test('the flame feels like an ember when idle and a blaze at full, easing between with its size', () => {
  const ctx = context(), FEEL = ctx.run('FEEL'), at = size => ctx.run(`feelAt(${size})`);
  for (const [k, [ember, full]] of Object.entries(FEEL)) {
    assert.ok(ember !== full, `${k}: an ember and a blaze differ, so the test can tell`);
    assert.strictEqual(at(0.3)[k], ember, `${k} at an idle ember`); assert.strictEqual(at(0.1)[k], ember, `${k} below it`);
    assert.strictEqual(at(1)[k], full, `${k} at full`);
    const mid = at(0.65)[k];
    assert.ok(Math.abs(mid - (ember + full) / 2) < 1e-9, `${k} half way at half way: ${mid}`);
    assert.ok(Math.abs(at(0.4)[k] - ember) < Math.abs(mid - ember) / 6, `${k} eases out of the ember, not straight: ${at(0.4)[k]}`);
  }
});

test('a swing travels up the flame: its lower links lean first, the tip after, then all of it settles', () => {
  const ctx = context();
  loose(ctx);
  ctx.run(`applyStyle('moroccan'); swayAngle = 0`);
  for (let i = 0; i < 600; i++) step(ctx, 5);
  const rest = ctx.run('flameChain.pts.map(p => p.x)'), n = rest.length;
  // a short shove: the lantern swings off and stops within a tenth of a second
  const lean = [];
  for (let i = 1; i <= 240; i++) {
    ctx.run(`swayAngle = ${Math.min(i, 6) * 0.15}`); step(ctx, 5);
    lean.push(ctx.run('flameChain.pts.map(p => p.x)').map((x, j) => x - rest[j]));
  }
  // when each point swings furthest from where it rested: from the base up, each no sooner than the one below
  const peak = j => lean.reduce((best, l, f) => Math.abs(l[j]) > Math.abs(lean[best][j]) ? f : best, 0);
  const at = Array.from({ length: n }, (_, j) => peak(j));
  const mean = js => js.reduce((t, j) => t + at[j], 0) / js.length, half = Math.floor(n / 2);
  assert.ok(at[n - 1] > at[0] + 5, `the tip swings furthest well after the lowest link: frames ${at}`);
  assert.ok(mean([...Array(n - half).keys()].map(j => j + half)) > mean([...Array(half).keys()]), `the top half after the bottom half: frames ${at}`);
  // on the way it bends into an S: the lower links leaning one way while the tip leans back the other
  const most = Math.max(...lean.map(l => Math.abs(l[n - 1])));
  assert.ok(lean.some(l => l[1] * l[n - 1] < 0 && Math.min(Math.abs(l[1]), Math.abs(l[n - 1])) > 0.03 * most), 'an S: the low links and the tip lean opposite ways at some moment');
  // and the flame comes back to rest, with its lean where it was before the shove (it stands upright in the world)
  for (let i = 0; i < 360; i++) step(ctx, 5);
  ctx.run('flameChain.pts.map(p => p.x)').forEach((x, j) => assert.ok(Math.abs(x - rest[j]) < 0.05, `point ${j + 1} settles: ${x - rest[j]}`));
});

test('the links are joined: a kick to the lowest one reaches each link above it in turn', () => {
  const ctx = context();
  ctx.run(`applyStyle('candle')`);
  for (let i = 0; i < 600; i++) step(ctx, 5); // the clock held at 5, so nothing else moves it
  const rest = ctx.run('flameChain.pts.map(p => p.x)'), n = rest.length;
  ctx.run('flameChain.pts[0].vx += 300');
  // the first frame each point has moved a tenth of a unit from rest
  const first = Array(n).fill(-1);
  for (let f = 0; f < 120; f++) {
    step(ctx, 5);
    ctx.run('flameChain.pts.map(p => p.x)').forEach((x, j) => { if (first[j] < 0 && Math.abs(x - rest[j]) > 0.1) first[j] = f; });
  }
  for (let j = 1; j < n; j++) {
    assert.ok(first[j] >= 0, `point ${j + 1} never moves: the kick doesn't reach it (${first})`);
    assert.ok(first[j] >= first[j - 1], `point ${j + 1} moves at frame ${first[j]}, before point ${j} below it (${first[j - 1]})`);
  }
  assert.ok(first[n - 1] > first[0], `the tip moves after the lowest link: ${first}`);
});
