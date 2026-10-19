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
  // the glint groups as the candle's markup draws them, each child with its attributes
  const back = run('STYLES.candle.back');
  for (const id of ['cdGlints', 'cdPedestalGlints', 'cdGrapeGlints']) {
    els[id] = node();
    els[id].children = [...back.match(new RegExp(`id="${id}">(.*?)</g>`))[1].matchAll(/<(?:circle|ellipse)\b([^>]*)>/g)].map(([, a]) => {
      const n = node();
      for (const [, k, v] of a.matchAll(/([\w-]+)="([^"]*)"/g)) n.attrs[k] = v;
      return n;
    });
  }
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
  const glints = [...ctx.els.cdPedestalGlints.children, ...ctx.els.cdGrapeGlints.children];
  assert.ok(grapes.length > 30 && glints.length === grapes.length, `every grape has a glint: ${glints.length} for ${grapes.length}`);
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

// the start (wall ms) of the next smoke at or after `from`, with the page's own schedule
const nextSmoke = (ctx, from) => {
  const scan = ctx.run('(from, slot) => { for (let now = from; now < from + 2 * slot * 1000; now += 500) { const e = scorchClock(\'candle:smoke\', now, SMOKE); if (e && now - e.t * 1000 >= from) return now - e.t * 1000; } return null; }');
  const at = scan(from, ctx.run('SMOKE.slot'));
  assert.ok(at !== null, `no smoke within two slots of ${from}`);
  return at;
};

test('a curl of smoke leaves the flame every few minutes, at the same moments in every window', () => {
  const a = context(), b = context(), plan = a.run('SMOKE'), starts = [];
  // a week of curls: each two to four minutes after the last
  for (let from = BASE; from < BASE + 7 * 864e5;) starts.push(nextSmoke(a, from)), from = starts[starts.length - 1] + plan.length * 1000;
  const gaps = starts.slice(1).map((t, i) => (t - starts[i]) / 1000);
  assert.ok(Math.min(...gaps) >= 120 && Math.max(...gaps) <= 240, `between ${Math.min(...gaps)} and ${Math.max(...gaps)} seconds apart`);
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
    // whatever the flame does now, leaning, flickering, growing or shrinking, pulsing
    const curls = [[left, 1, 1, 1], [right, 1.06, 0.3, 0.7], [left, 0.94, 0.6, 1]].map(([s, flick, size, pulse]) => {
      Object.assign(ctx.flame, { flick, size, pulse }); ctx.shine(s); return ctx.els.cdSmoke.getAttribute('d');
    });
    Object.assign(ctx.flame, { flick: 1, size: 1, pulse: 1 });
    const [a] = curls;
    curls.forEach((d, i) => assert.strictEqual(d, a, `${at}s in, flame ${i}: the curl is the same whatever the flame does now`));
    const ps = pts(a);
    assert.ok(ps.length > 2, `${at}s in, a curl`);
    // each bit, let go `k / 30` of the release in, is as high above where the curl left as its age says
    ps.forEach(([, y], k) => assert.ok(Math.abs(from.y - y - (at - k / 30 * plan.release) * plan.rise) < 0.1, `${at}s in, bit ${k}`));
  }
  clock.wall = start + plan.length * 1000 + 100; ctx.shine(left);
  assert.strictEqual(ctx.els.cdSmoke.getAttribute('opacity'), '0', 'gone once it has faded');
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

test('the column\'s edges sit where HEAT_COLUMN, the shader\'s numbers too, puts them, and it never goes NaN below the tip', () => {
  const ctx = context(), C = ctx.run('HEAT_COLUMN');
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
