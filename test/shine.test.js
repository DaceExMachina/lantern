// The candle's shine (page/frame.js drawShine): what its bare flame lights round it, following the flame's live lean and
// flicker, the hot air rising over it, and the plumes of smoke it lets go on a schedule every window
// shares. The page is plain classic scripts, run here in a vm context in index.html's order, over a stub DOM holding only
// the shine's elements.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = Date.parse('2026-10-18T15:00:00Z');
const node = () => {
  const n = { attrs: {}, children: [], getAttribute: k => n.attrs[k] ?? null, setAttribute: (k, v) => { n.attrs[k] = String(v); } };
  return n;
};
const clock = { wall: BASE };
function context() {
  const els = {};
  // background.js isn't loaded (it needs WebGL): drawLight's dust is one speck the test places, and the background draws nothing
  const page = vm.createContext({ URLSearchParams, location: { search: '' }, performance: { now: () => 0 }, wall: () => clock.wall,
    document: { getElementById: id => els[id] ?? null, querySelectorAll: () => [] },
    dust: [], farDust: [], dustData: new Float32Array(4), drawBackground: v => { page.drawn = v; }, DUST_DEBUG: 0 });
  for (const f of ['scene', 'dev', 'lanterns', 'state', 'stale', 'frame']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'page', f + '.js'), 'utf8'), page, { filename: f + '.js' });
  const run = code => vm.runInContext(code, page);
  run('Date.now = () => wall(); style = STYLES.candle;');
  for (const id of ['cdPoolGlint', 'cdWarmG', 'cdWarm', 'cdFootShadow']) els[id] = node();
  els.fCore = { getBBox: () => ({ x: 333, y: 352, width: 14, height: 30 }) }; // drawLight's flame core, somewhere in the tongue
  // the glint groups as the candle's markup draws them, each child with its attributes
  const back = run('STYLES.candle.back');
  for (const id of ['cdPedestalGlints', 'cdGrapeGlints']) {
    els[id] = node();
    els[id].children = [...back.match(new RegExp(`id="${id}">(.*?)</g>`))[1].matchAll(/<(?:circle|ellipse)\b([^>]*)>/g)].map(([, a]) => {
      const n = node();
      for (const [, k, v] of a.matchAll(/([\w-]+)="([^"]*)"/g)) n.attrs[k] = v;
      return n;
    });
  }
  els.cdBronze = node(); // the bronze's gradient, its stops as drawn
  els.cdBronze.children = [...back.match(/id="cdBronze">(.*?)<\/linearGradient>/)[1].matchAll(/<stop\b/g)].map(() => node());
  const flame = { size: 1, flick: 1, pulse: 1 };
  return { els, run, flame, shine: s => run('drawShine')(s, flame), lean: s => run(`(wobble(${s}, 3) * 6 + windLean(${s}) * 70 / 96) * 0.8`) };
}
// page times (s) where the flame leans well over to the left and to the right
const leaning = ctx => {
  const ss = Array.from({ length: 400 }, (_, i) => i * 0.05);
  return [ss.find(s => ctx.lean(s) < -3), ss.find(s => ctx.lean(s) > 3)];
};
const num = (el, k) => +el.getAttribute(k);

test('the pool\'s reflection slides the way the flame leans', () => {
  const ctx = context(), [left, right] = leaning(ctx);
  for (const s of [left, right]) {
    ctx.shine(s);
    assert.strictEqual(Math.sign(num(ctx.els.cdPoolGlint, 'cx') - 340), Math.sign(ctx.lean(s)), `the pool's reflection at s ${s}`);
  }
});

test('each grape\'s glint sits on its side facing the flame, wherever it leans', () => {
  const ctx = context(), grapes = ctx.run('STYLES.candle.shine'), [fx] = ctx.run('STYLES.candle.flame'), fy = ctx.run('STYLES.candle.light[1]');
  const glints = [...ctx.els.cdPedestalGlints.children, ...ctx.els.cdGrapeGlints.children];
  assert.ok(grapes.length > 10 && glints.length === grapes.length, `every grape has a glint: ${glints.length} for ${grapes.length}`);
  glints.forEach((c, i) => assert.deepStrictEqual([num(c, 'cx'), num(c, 'cy')], [...grapes[i]], `glint ${i} starts on its grape`));
  for (const s of leaning(ctx)) {
    ctx.shine(s);
    [...ctx.els.cdPedestalGlints.children, ...ctx.els.cdGrapeGlints.children].forEach((c, i) => {
      const [x, y] = grapes[i], dx = num(c, 'cx') - x, dy = num(c, 'cy') - y, tx = fx + ctx.lean(s) - x, ty = fy - y;
      assert.ok((dx * tx + dy * ty) / (Math.hypot(dx, dy) * Math.hypot(tx, ty)) > 0.95, `grape ${i} at s ${s}`);
    });
  }
});

test('the foot\'s shadow on the marble shifts away from the flame\'s lean', () => {
  const ctx = context();
  for (const s of leaning(ctx)) {
    ctx.shine(s);
    assert.strictEqual(Math.sign(num(ctx.els.cdFootShadow, 'cx') - 340), -Math.sign(ctx.lean(s)), `at s ${s}`);
  }
});

test('the hot air rises in a column straight above the flame and nowhere else, and only over the candle', () => {
  const ctx = context(), [left] = leaning(ctx);
  ctx.shine(left);
  const { x, y } = ctx.run('heat'), at = (dx, dy) => ctx.run(`heatAt(${x + dx}, ${y + dy})`);
  for (const up of [20, 60, 110]) assert.ok(at(0, -up) > 0.9, `straight up ${up} over the tip`);
  assert.ok(at(0, -170) > 0 && at(0, -170) < at(0, -110), 'fading out higher up');
  for (const [dx, dy] of [[0, 5], [0, 60], [30, -10], [-30, -10], [45, -100], [-45, -100], [0, -240]]) assert.strictEqual(at(dx, dy), 0, `${dx}, ${dy} from the tip`);
  ctx.run('style = STYLES.barrel');
  ctx.shine(left);
  assert.strictEqual(ctx.run('heat'), null, 'the barrel\'s flame is behind paper');
  assert.strictEqual(ctx.run(`heatAt(${x}, ${y - 60})`), 0);
});

// The flame's plumes at wall time `now` (the shader draws them), burning at `strength`, its tip at `tip`.
const flamePlumes = (ctx, now, strength = 0, tip = [340, 180]) => [...ctx.run('smoke')(now, now / 1000, strength, tip).plumes].map(q => [...q]);
// the starts (wall ms) of the flame's plumes over `hours` from BASE, a second apart, at `strength`
const plumeStarts = (ctx, strength, hours) => {
  const starts = new Set();
  for (let now = BASE; now < BASE + hours * 36e5; now += 1000) for (const q of flamePlumes(ctx, now, strength)) starts.add(Math.round((now - q[2] * 1000) / 100) * 100 + ':' + q[4]);
  return [...starts].map(k => +k.split(':')[0]).sort((x, y) => x - y);
};

test('a curl of smoke leaves the flame every minute or two even at idle, at the same moments in every window', () => {
  const a = context(), b = context(), starts = plumeStarts(a, 0, 24);
  const gaps = starts.slice(1).map((t, i) => (t - starts[i]) / 1000);
  assert.ok(starts.length > 600 && Math.min(...gaps) >= 60 && Math.max(...gaps) <= 120, `${starts.length} curls, between ${Math.min(...gaps)} and ${Math.max(...gaps)} seconds apart`);
  for (let t = starts[0] - 3000; t < starts[0] + 9000; t += 700) assert.deepStrictEqual(flamePlumes(a, t), flamePlumes(b, t), `at ${t - starts[0]}ms`);
});

test('the harder the flame burns, the more often it smokes, and the denser', () => {
  const ctx = context(), [idle, busy, full] = [0, 0.6, 1].map(k => plumeStarts(ctx, k, 2).length);
  assert.ok(idle < busy && busy < full, `curls in two hours: ${idle} idle, ${busy} busy, ${full} at full`);
  assert.ok(full > 4 * idle, `at full it smokes far more often: ${full} to ${idle}`);
  const at = plumeStarts(ctx, 1, 0.1)[0] + 500, [weak] = flamePlumes(ctx, at, 0.8), [strong] = flamePlumes(ctx, at, 1);
  assert.ok(strong[3] > weak[3], `denser: ${strong[3]} to ${weak[3]}`);
});

test('smoke already let go stays where it left, whatever the flame does after, and each curl has its own shape', () => {
  const ctx = context(), [start] = plumeStarts(ctx, 0, 0.1);
  const [first] = flamePlumes(ctx, start + 100, 0, [330, 182]);
  assert.deepStrictEqual(first.slice(0, 2), [330, 182], 'it leaves from the tip');
  for (const at of [800, 2500, 5000]) {
    const [q] = flamePlumes(ctx, start + at, 0, [352, 170]);
    assert.deepStrictEqual(q.slice(0, 2), [330, 182], `${at}ms in, still from where it left`);
    assert.deepStrictEqual(q.slice(8), [352, 170], `${at}ms in, its newest smoke rising from the tip where it is now`);
  }
  // the next one: from the tip as it is then, curling its own way
  const next = plumeStarts(ctx, 0, 0.2).find(t => t > start + 10000), [second] = flamePlumes(ctx, next + 100, 0, [352, 170]);
  assert.deepStrictEqual(second.slice(0, 2), [352, 170]);
  assert.notDeepStrictEqual(second.slice(6, 8), first.slice(6, 8), 'a different curl and drift');
});

test('the hot air lifts dust only inside its column, and lets it sink back out of it', () => {
  const ctx = context(), [left] = leaning(ctx);
  ctx.shine(left);
  const { x, y } = ctx.run('heat'), lift = ctx.run('liftDust'), rise = (dx, dy, secs = 2) => {
    const p = { lift: 0 };
    for (let i = 0; i < secs * 60; i++) lift(p, x + dx, y + dy, 1 / 60);
    return p.lift;
  };
  assert.ok(rise(0, -40) > 10, 'carried up over the tip');
  for (const [dx, dy] of [[40, -40], [-40, -40], [0, 30], [0, -260]]) assert.strictEqual(rise(dx, dy), 0, `${dx}, ${dy} from the tip`);
  const p = { lift: 0 };
  for (let i = 0; i < 120; i++) lift(p, x, y - 40, 1 / 60);
  const high = p.lift;
  for (let i = 0; i < 120; i++) lift(p, x + 200, y - 40, 1 / 60);
  assert.ok(p.lift < high / 1.5, `sinks back once out of the column: ${high} to ${p.lift}`);
  ctx.run('style = STYLES.barrel'); ctx.shine(left);
  assert.strictEqual(lift(p, x, y - 40, 1 / 60), 0, 'none over a flame behind paper');
});

test('the column\'s edges sit where HEAT_COLUMN puts them, and it never goes NaN below the tip', () => {
  const ctx = context(), C = ctx.run('HEAT_COLUMN');
  assert.ok(C.half > 0 && C.widen >= 0 && C.start > 0 && C.start < C.fade[0] && C.fade[0] < C.fade[1] && C.bend > 0,
    'a column that starts above the tip, has width, and fades in before it fades out');
  ctx.run('heat = { x: 340, y: 100, k: 1, t: 0 }');
  const at = (dx, up) => ctx.run(`heatAt(${340 + dx}, ${100 - up})`);
  for (const up of [C.start, 60, C.fade[0]]) {
    const half = C.half + C.widen * up;
    assert.strictEqual(at(0.7 * half - 0.01, up), 1, `full just inside ${0.7 * half} at ${up} up`);
    assert.strictEqual(at(half + 0.01, up), 0, `none just outside ${half} at ${up} up`);
  }
  assert.strictEqual(at(0, C.fade[1]), 0, `gone ${C.fade[1]} up`);
  assert.strictEqual(at(0, 0), 0, 'none at the tip itself');
  // where the column's width would reach 0 and below it, each speck still gets a number
  const zero = -C.half / C.widen;
  for (const up of [zero, zero - 1, zero + 1, -1e6]) for (const dx of [0, 0.5, 5]) assert.strictEqual(at(dx, up), 0, `${dx} across at ${up} up`);
});

test('the wind carries smoke aside exactly as far as it carries the dust over the same time', () => {
  // a middling near speck (radius 1.3) with no orbiting of its own, level with the light 200 to its right: what's left of
  // its x after its slow wander is the wind's push
  const ctx = context(), data = ctx.run('dustData'), p = { a: 0, d: 200, w: 0, ph: 0, r: 1.3, lift: 0 };
  ctx.run('dust').push(p);
  const life = ctx.run('PLUME.life'), lx = ctx.run('style.light[0]');
  const draw = s => { ctx.shine(s); ctx.run('drawLight')(0, s, ctx.flame); return ctx.run('drawn'); };
  const pushed = s => { draw(s); return data[0] - lx - 200 - Math.sin(s * 0.3) * 18 - Math.sin(s * 0.7) * 6; };
  let windy = 0;
  for (const s of [12.3, 47.9, 133.1, 280.4]) {
    const { drift } = draw(s);
    assert.strictEqual(drift.length, 13);
    drift.forEach((d, i) => {
      const age = i * life / 12, dust = pushed(s) - pushed(s - age);
      assert.ok(Math.abs(d - dust) < 1e-3, `${s}s, smoke ${age}s old: carried ${d.toFixed(3)}, the dust ${dust.toFixed(3)}`);
      windy = Math.max(windy, Math.abs(d));
    });
  }
  assert.ok(windy > 3, `the wind did blow: ${windy.toFixed(1)}`);
});

test('the dust drawn over the candle rises where the hot air carries it, in the near ring and the far one', () => {
  // one heavy speck (the wind barely moves it) on its orbit straight above the middle, 50 or so over the flame's tip: the
  // near ring circles the light, the far one the scene's middle
  for (const [ring, d] of [['dust', 120], ['farDust', 240]]) {
    const ctx = context(), [left] = leaning(ctx), data = ctx.run('dustData');
    const p = { a: -Math.PI / 2, d, w: 0, ph: 0, r: 10, lift: 0 };
    ctx.run(ring).push(p);
    const frame = (s, dt) => { ctx.shine(s); ctx.run('drawLight')(dt, s, ctx.flame); return data[1]; };
    for (let i = 0; i < 120; i++) frame(left + i / 60, 1 / 60);
    // the same frame drawn again, lifted and then not: the speck is drawn as high as its lift
    const s = left + 2, lifted = frame(s, 0);
    p.lift = 0;
    const still = frame(s, 0);
    assert.ok(still - lifted > 10, `${ring}: drawn ${(still - lifted).toFixed(1)} higher for the hot air`);
  }
});

test('the shader\'s column is HEAT_COLUMN, each number in its place', () => {
  const ctx = context(), src = fs.readFileSync(path.join(__dirname, '..', 'page', 'background.js'), 'utf8');
  const body = src.match(/vec2 heat\(vec2 p\) \{[\s\S]*?\n\}/)[0], glf = ctx.run('glf');
  for (const v of [18, 0.12, 0.1234, 0.0004, 1.25, 1e-7]) assert.strictEqual(Number(glf(v)), v, `${v} as a GLSL float`), assert.match(glf(v), /[.e]/);
  // the shader as background.js writes it, with HEAT_COLUMN's values and with others in their place
  for (const C of [ctx.run('({ ...HEAT_COLUMN })'), { half: 17.5, widen: 0.125, start: 11, fade: [121.5, 219], bend: 1.3 }]) {
    ctx.run(`Object.assign(HEAT_COLUMN, ${JSON.stringify(C)})`);
    const glsl = ctx.run('`' + body + '`'), f = glf;
    for (const slot of [`wide = max(1.0, ${f(C.half)} + ${f(C.widen)} * up)`, `smoothstep(0.0, ${f(C.start)}, up)`,
      `smoothstep(${f(C.fade[0])}, ${f(C.fade[1])}, up)`, `return ${f(C.bend)} * k`]) assert.ok(glsl.includes(slot), `heat() has ${slot}`);
  }
});


test('the bronze\'s highlight follows the flame: brighter as it burns and flickers', () => {
  const ctx = context(), [left] = leaning(ctx), hi = () => ctx.els.cdBronze.children[3].getAttribute('stop-color');
  const lum = c => [1, 3, 5].reduce((t, i) => t + parseInt(c.slice(i, i + 2), 16), 0);
  const at = (size, flick) => { Object.assign(ctx.flame, { size, flick }); ctx.shine(left); return lum(hi()); };
  assert.ok(at(1, 1) > at(0.2, 1) + 40, `a big flame lights it more than an ember: ${at(1, 1)} to ${at(0.2, 1)}`);
  assert.ok(at(0.6, 1) > at(0.6, 0.6) + 15, `and it dims as the flame flickers down: ${at(0.6, 1)} to ${at(0.6, 0.6)}`);

});

test('a gust turns each vine leaf toward downwind by how far it points from it', () => {
  const ctx = context();
  const leaf = deg => ({ e: node(), x: 340, y: 600, k: 1, low: -1, deg, ph: 0 }), angle = l => +l.e.getAttribute('transform').match(/rotate\((-?[\d.]+)/)[1];
  for (const sign of [1, -1]) {
    const s = Array.from({ length: 4000 }, (_, i) => i * 0.05).find(t => sign * ctx.run(`GUST(${t} - 0.15)`) > 1.5 && sign * ctx.run(`GUST(${t})`) > 0);
    const [up, withIt, against] = [leaf(0), leaf(sign * 90), leaf(-sign * 90)];
    ctx.run('(l => { cdLeaves = l; })')([up, withIt, against]);
    ctx.run(`drawLeaves(${s})`);
    assert.ok(Math.abs(angle(withIt)) < 0.6, `blowing ${sign > 0 ? 'right' : 'left'}, a leaf already pointing downwind barely turns: ${angle(withIt)}`);
    assert.ok(sign * angle(up) > 2, `one pointing up turns downwind: ${angle(up)}`);
    assert.ok(sign * angle(against) > sign * angle(up) * 1.5, `one pointing into the wind is pushed over more: ${angle(against)} to ${angle(up)}`);
  }
});
