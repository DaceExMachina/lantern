// The candle's shine (page/frame.js drawShine): what its bare flame lights round it, following the flame's live lean and
// flicker, the hot air rising over it, and the curl of smoke it lets go every few minutes on a schedule every window
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
  const page = vm.createContext({ URLSearchParams, location: { search: '' }, performance: { now: () => 0 }, wall: () => clock.wall,
    document: { getElementById: id => els[id] ?? null, querySelectorAll: () => [] } });
  for (const f of ['scene', 'lanterns', 'state', 'stale', 'frame']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'page', f + '.js'), 'utf8'), page, { filename: f + '.js' });
  const run = code => vm.runInContext(code, page);
  run('Date.now = () => wall(); style = STYLES.candle;');
  for (const id of ['cdPoolGlint', 'cdWarmG', 'cdWarm', 'cdFootShadow', 'cdSmoke']) els[id] = node();
  els.cdGlints = node(); els.cdGlints.children = run('CANDLE.glints').map(node);
  els.cdGrapeGlints = node(); els.cdGrapeGlints.children = run('CANDLE.grapes').map(node);
  const flame = { size: 1, flick: 1, pulse: 1 };
  return { els, run, flame, shine: s => run('drawShine')(s, flame), lean: s => run(`wobble(${s}, 3) * 6 * 0.8`) };
}
// page times (s) where the flame leans well over to the left and to the right
const leaning = ctx => {
  const ss = Array.from({ length: 400 }, (_, i) => i * 0.05);
  return [ss.find(s => ctx.lean(s) < -3), ss.find(s => ctx.lean(s) > 3)];
};
const num = (el, k) => +el.getAttribute(k);

test('the brass glints and the pool\'s reflection slide the way the flame leans', () => {
  const ctx = context(), [left, right] = leaning(ctx), glints = ctx.run('CANDLE.glints');
  for (const s of [left, right]) {
    ctx.shine(s);
    const sign = Math.sign(ctx.lean(s));
    ctx.els.cdGlints.children.forEach((e, i) => assert.strictEqual(Math.sign(num(e, 'cx') - glints[i][0]), sign, `glint ${i} at s ${s}`));
    assert.strictEqual(Math.sign(num(ctx.els.cdPoolGlint, 'cx') - 340), sign, `the pool's reflection at s ${s}`);
  }
  // and they brighten with the flicker
  const at = flick => { ctx.flame.flick = flick; ctx.shine(left); return ctx.els.cdGlints.children.map(e => num(e, 'opacity')); };
  const dim = at(0.94), lit = at(1.06);
  dim.forEach((o, i) => assert.ok(lit[i] > o, `glint ${i} brighter at a higher flicker`));
});

test('each grape\'s glint sits on its side facing the flame, wherever it leans', () => {
  const ctx = context(), grapes = ctx.run('CANDLE.grapes'), [fx] = ctx.run('STYLES.candle.flame'), fy = ctx.run('STYLES.candle.light[1]');
  assert.ok(grapes.length > 30, 'every grape has a glint');
  for (const s of leaning(ctx)) {
    ctx.shine(s);
    ctx.els.cdGrapeGlints.children.forEach((c, i) => {
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

// the start (wall ms) of the next smoke at or after `from`, with the page's own schedule
const nextSmoke = (ctx, from) => {
  for (let now = from; ; now += 500) {
    const e = ctx.run(`scorchClock('candle:smoke', ${now}, SMOKE)`);
    if (e && now - e.t * 1000 >= from) return now - e.t * 1000;
  }
};

test('a curl of smoke leaves the flame every few minutes, at the same moments in every window', () => {
  const a = context(), b = context(), plan = a.run('SMOKE'), starts = [];
  for (let from = BASE; starts.length < 6;) starts.push(from = nextSmoke(a, from) + plan.length * 1000);
  const gaps = starts.slice(1).map((t, i) => (t - starts[i]) / 1000);
  assert.ok(gaps.every(g => g > 10 && g < 2 * plan.slot), `between ${gaps}`);
  // two windows with different frame clocks, so their flames lean differently, show it at the same moments
  for (let t = starts[0] - 3000; t < starts[0] + 9000; t += 700) {
    clock.wall = t; a.shine(1.3 + t / 1000); b.shine(87.1 + t / 1000);
    assert.strictEqual(a.els.cdSmoke.getAttribute('opacity'), b.els.cdSmoke.getAttribute('opacity'), `at ${t - starts[0]}ms`);
  }
});

test('smoke already let go rises steadily from where it left, whatever the flame does after', () => {
  const ctx = context(), start = nextSmoke(ctx, BASE), [left, right] = leaning(ctx), plan = ctx.run('SMOKE');
  clock.wall = start + 100; ctx.shine(left); // it leaves while the flame leans left
  const from = ctx.run('smokeFrom'), pts = d => d.slice(1).split('L').map(p => p.split(' ').map(Number));
  for (const at of [0.8, 2, 4.5]) {
    clock.wall = start + at * 1000;
    ctx.shine(left); const a = ctx.els.cdSmoke.getAttribute('d');
    ctx.shine(right); const b = ctx.els.cdSmoke.getAttribute('d');
    assert.strictEqual(a, b, `${at}s in, the curl is the same whichever way the flame leans now`);
    const ps = pts(a);
    assert.ok(ps.length > 2, `${at}s in, a curl`);
    // each bit, let go `k / 30` of the release in, is as high above where the curl left as its age says
    ps.forEach(([, y], k) => assert.ok(Math.abs(from.y - y - (at - k / 30 * plan.release) * plan.rise) < 0.1, `${at}s in, bit ${k}`));
  }
  clock.wall = start + plan.length * 1000 + 100; ctx.shine(left);
  assert.strictEqual(ctx.els.cdSmoke.getAttribute('opacity'), '0', 'gone once it has faded');
});
