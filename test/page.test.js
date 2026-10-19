// The page's pure geometry and the lantern styles: landing spots on the lantern and what each style draws and does
// (page/lanterns.js), whether it sways (page/frame.js), and the flapping wing (page/scene.js). The page is plain classic
// scripts, so they run here in a vm context, in index.html's order, and share its globals; `document` is a stub holding
// the few elements applyStyle and swingLantern touch.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { drawn } = require('./lowest');

const row = () => ({ title: 'its own title', dataset: {}, classList: { toggle() {} } }); // a settings row
const attrs = {}, els = {
  lantern: { innerHTML: '', getAttribute: k => attrs[k] ?? null, setAttribute: (k, v) => { attrs[k] = v; } },
  style: { value: '' },
  textToggle: { disabled: false, parentElement: row() },
  ribbons: { children: [{ disabled: false }, { disabled: false }, { disabled: false }], parentElement: row() },
};
// the flame's parts, which drawFlame writes to
for (const id of ['flame', 'fHalo', 'tongues', 'fOuter', 'fMid', 'fCore', 'fBase']) {
  const a = {};
  els[id] = { getAttribute: k => a[k] ?? null, setAttribute: (k, v) => { a[k] = v; } };
}
els.fCore.getBBox = () => ({ x: 333, y: 352, width: 14, height: 30 }); // drawLight's flame core, somewhere in the tongue
const document = { getElementById: id => els[id] ?? null, querySelectorAll: () => [] };
// a plain window, no query string; the Moroccan's far wall counts as baked already (background.js isn't loaded)
// background.js isn't loaded, so drawBackground only records what drawLight gives it, and there's no dust
const page = vm.createContext({ URLSearchParams, location: { search: '' }, performance, document, farWallTex: {},
  drawBackground: v => { page.background = v; }, dust: [], farDust: [], dustData: { set() {} } });
for (const f of ['scene', 'lanterns', 'state', 'frame']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'page', f + '.js'), 'utf8'), page, { filename: f + '.js' });
const run = code => vm.runInContext(code, page);

// How far round the side a perch sits: 0 at the lantern's middle, 1 at its rim (at that height).
const across = (key, a, r) => {
  const [x, y] = run(`style = STYLES.${key}; pickPerch(${a}, () => ${r})`);
  return Math.abs(x - 340) / run(`style.body.half(${y})`);
};
const styles = [...run('Object.keys(STYLES)')]; // an array of this realm, so deepStrictEqual compares its items
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

test('the candle is the fourth lantern in the menu', () => {
  assert.deepStrictEqual(styles, ['barrel', 'chochin', 'moroccan', 'candle']);
  assert.strictEqual(run('STYLES.candle.name'), 'Pillar candle');
});

test('a standing lantern holds still with nothing to hang from; every hanging one sways on one', () => {
  assert.deepStrictEqual(styles.filter(k => run(`STYLES.${k}.stands`)), ['candle'], 'the candle, and only the candle, stands');
  // 30 seconds of frames for each style, the clock running on from one style to the next
  let start = 0;
  const check = key => {
    run(`applyStyle('${key}')`);
    // each frame's sway, and the turn it gives #lantern
    const frames = [...run(`Array.from({ length: 1800 }, (_, i) => (swingLantern(1 / 60, ${start} + i / 60),
      [swayAngle, document.getElementById('lantern').getAttribute('transform')]))`)];
    const sway = frames.map(f => f[0]), top = run('VIEW.top').toFixed(1);
    start += 30;
    const hang = /id="hang"/.test(els.lantern.innerHTML);
    if (run(`STYLES.${key}.stands`)) {
      assert.ok(sway.every(a => a === 0), `${key} stands still`);
      assert.strictEqual(attrs.transform, `rotate(0.000 340 ${run('VIEW.top').toFixed(1)})`, `${key} is drawn unturned`);
      assert.deepStrictEqual([...run('rot(300, 400)')], [300, 400], `${key}: nothing attached to it turns`);
      assert.ok(!hang, `${key} has nothing to hang from`);
    } else {
      assert.ok(sway.some(a => Math.abs(a) > 0.1), `${key} sways: at most ${Math.max(...sway.map(Math.abs))}`);
      assert.ok(Math.min(...sway) < -0.1 && Math.max(...sway) > 0.1, `${key} swings to and fro, past the middle: ${Math.min(...sway)} to ${Math.max(...sway)}`);
      const off = frames.find(([a, t]) => t !== `rotate(${a.toFixed(3)} 340 ${top})`);
      assert.ok(!off, `${key} is drawn turned by its sway: ${off}`);
      assert.ok(hang, `${key} hangs from a string or chain`);
    }
  };
  for (const key of styles) check(key);
  run(`applyStyle('candle')`);
  check('barrel'); // switching back brings the sway and the string back
});

test('moths land on the candle\'s wax: below its rim, above its dish and within the pillar', () => {
  const P = run('PILLAR');
  for (const a of angles) for (const r of [0, 0.5, 1]) {
    const [x, y] = run(`style = STYLES.candle; pickPerch(${a}, () => ${r})`);
    assert.ok(P.rim < y && y < P.dish, `a ${a.toFixed(2)}, rand ${r}: y ${y} is off the wax (${P.rim} to ${P.dish})`);
    assert.ok(Math.abs(x - P.cx) <= P.r, `a ${a.toFixed(2)}, rand ${r}: x ${x} is past the pillar's side`);
  }
});

test('a moth landed on the candle, of any size and in any pose, stays clear of the flame at its fullest, at the top of a hop too', () => {
  const [fx, fy, k] = run('STYLES.candle.flame'), FLAME_BASE = run('FLAME_BASE'), clear = run('FLAME_CLEARANCE'), HOP = run('HOP');
  // the outer tongue's outline at full size as it wobbles, sampled along its curves, in the scene
  const flame = new Map();
  for (let s = 0; s < 30; s += 0.05) {
    run(`drawFlame(${s}, { size: 1, pulse: 1 })`);
    const n = els.fOuter.getAttribute('d').match(/-?[\d.]+/g).map(Number);
    for (let i = 2; i + 5 < n.length; i += 6) for (let t = 0; t <= 1; t += 0.05) {
      const b = (p0, p1, p2, p3) => (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3 * p3;
      const x = fx + (b(n[i - 2], n[i], n[i + 2], n[i + 4]) - 340) * k, y = fy + (b(n[i - 1], n[i + 1], n[i + 3], n[i + 5]) - FLAME_BASE) * k;
      flame.set(`${Math.round(x)},${Math.round(y)}`, [x, y]); // one point a unit, enough to measure a 10-unit gap by
    }
  }
  const tongue = [...flame.values()];
  // a landed moth's wings as mothWings poses them: standing out along the surface's normal, the body up along it turned by
  // its landing jitter, from nearly shut to a breath's widest
  const { wing3d, unit, lerp3, cross, dot, WING_UP, WING_SIDE, SIZE } = run('({ wing3d, unit, lerp3, cross, dot, WING_UP, WING_SIDE, SIZE })');
  let nearest = Infinity;
  for (const a of angles) for (const r of [0, 0.5, 1]) {
    const [px, py, n0] = run(`style = STYLES.candle; pickPerch(${a}, () => ${r})`);
    for (const jitter of [-15, 0, 15]) for (const open of [0.05, 0.5, 0.91]) {
      const t0 = unit([n0[1] * n0[0], n0[1] * n0[1] - 1, n0[1] * n0[2]]), T = unit(lerp3(t0, cross(n0, t0), Math.tan(jitter * Math.PI / 180)));
      const N = unit(lerp3(n0, T, -dot(n0, T)));
      for (const pts of [wing3d(WING_UP, T, N, open), wing3d(WING_SIDE, T, N, open)]) for (const size of Object.values(SIZE)) for (const [wx, wy] of pts) {
        for (const lift of [0, HOP]) for (const [x, y] of tongue) nearest = Math.min(nearest, Math.hypot(px + wx * size - x, py - lift + wy * size - y));
      }
    }
  }
  assert.ok(nearest >= clear, `a wing tip comes within ${nearest.toFixed(1)} of the flame, under the ${clear} kept clear`);
});

test('a restless landed moth hops HOP off its spot', () => {
  // waiting 20 minutes, its dice on a hop, which starts at s = 10 and peaks 0.8s in, measured from the spot it lifts off
  run(`style = STYLES.candle; hopper = { key: 'hopper', size: 1.4, x: 340, y: 300, home: [150, 170], wasLanded: true, hops: 0, fidgetAt: 10, dice: 0.9,
    session: { id: 'hopper', state: 'waiting', waitingSince: Date.now() - 20 * 60000 } }; hopper.perch = findPerch(hopper, () => 0.5)`);
  const rest = run('rot(hopper.perch[0], hopper.perch[1])[1] + 6 * hopper.size'), { ty } = run('mothTarget("hopper", hopper, 1 / 60, 10.8)');
  assert.strictEqual(run('hopper.fidget'), 'hop');
  assert.ok(Math.abs(rest - ty - run('HOP')) < 1e-9, `it rises ${rest - ty}, not ${run('HOP')}`);
});

test('the candle shades the room below its rim, and nothing above its flame', () => {
  const c = run('STYLES.candle'), P = run('PILLAR');
  assert.deepStrictEqual([...c.holder], [P.rim, P.r], 'the fan below is set by the rim, the widest thing under the flame');
  assert.ok(c.light[1] < c.holder[0], 'the light sits above the rim, so the fan opens downward');
  assert.strictEqual(c.caps, undefined, 'no caps: nothing above the flame');
  assert.strictEqual(c.dim, undefined, 'the flame is bare');
  assert.ok(!/class="band"/.test(c.back + c.front), 'no solid bands');
});

test('the candle\'s fan of shade starts at its rim; every other lantern\'s starts at the light', () => {
  for (const key of styles) {
    run(`applyStyle('${key}'); swingLantern(1 / 60, 0.5)`);
    run(`drawLight(1 / 60, 0.5, { size: 0.8, flick: 1, pulse: 1 })`);
    // measured along the lantern's own axis, which the shader turns with its sway
    const c = run(`STYLES.${key}`), from = [...page.background.capFrom];
    if (key === 'candle') assert.deepStrictEqual(from, [0, c.holder[0] - c.light[1]], 'the fan below starts at the rim');
    else assert.deepStrictEqual(from, [0, 0], `${key}: its fans start at the light`);
  }
});

// The pillar's numbers, changed to untidy ones in a copy of lanterns.js, and the wax drawn there.
const pageFile = f => fs.readFileSync(path.join(__dirname, '..', 'page', f + '.js'), 'utf8');
test('the candle\'s wax is drawn where its pillar\'s numbers put it', () => {
  for (const [r, rim] of [[50, 275], [61, 247]]) {
    const at = `r ${r}, rim ${rim}`, c = vm.createContext({ URLSearchParams, location: { search: '' } });
    vm.runInContext(pageFile('scene'), c);
    const lanterns = pageFile('lanterns').replace(/^const PILLAR = .*$/m, line => `${line} PILLAR.r = ${r}; PILLAR.rim = ${rim};`);
    assert.notStrictEqual(lanterns, pageFile('lanterns'), 'PILLAR found');
    vm.runInContext(lanterns, c);
    const { back, front } = vm.runInContext('STYLES.candle', c), P = vm.runInContext('PILLAR', c), side = vm.runInContext('LACQUER.candle.side', c);
    const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.01, `${at}: ${what} at ${a}, not ${b}`);
    // the pillar's outline, every point it passes through M, Q, L, V and H
    const pts = [];
    for (const [, cmd, args] of back.match(/<clipPath id="cdWax"><path d="([^"]+)"/)[1].matchAll(/([MQLVHZ])([^MQLVHZ]*)/g)) {
      const v = args.trim().split(/[\s,]+/).filter(Boolean).map(Number), [x, y] = pts[pts.length - 1] || [];
      if (cmd === 'V') pts.push(...v.map(b => [x, b])); else if (cmd === 'H') pts.push(...v.map(a => [a, y]));
      else for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i], v[i + 1]]);
    }
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    near(Math.min(...xs), P.cx - r, 'its left side'); near(Math.max(...xs), P.cx + r, 'its right side');
    near(Math.max(...ys), P.bottom, 'its bottom');
    const foot = pts.filter(p => p[1] === P.bottom).map(p => p[0]);
    near(Math.min(...foot), P.cx - r, 'its bottom left corner'); near(Math.max(...foot), P.cx + r, 'its bottom right corner');
    const crown = Math.min(...ys);
    assert.ok(rim - 3 < crown && crown <= rim, `${at}: its crown tops out at ${crown}, off the rim`);
    // every drip runs down from the rim, its middle on the pillar
    const drips = [...back.match(/<clipPath id="cdDrips"><path d="([^"]+)"/)[1].matchAll(/M([\d.]+) ([\d.]+)V[\d.]+A[\d.]+ [\d.]+ 0 1 0 ([\d.]+)/g)];
    assert.ok(drips.length >= 6, `${at}: the drips`);
    for (const [, x0, y, x1] of drips) {
      assert.strictEqual(+y, rim, `${at}: a drip starts at ${y}, off the rim`);
      assert.ok(Math.abs((+x0 + +x1) / 2 - P.cx) <= r, `${at}: a drip at ${x0} to ${x1}, off the pillar`);
    }
    // the dark side from K.side of the way out to past the edge, and the glow over the whole pillar under the rim
    const dark = back.match(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)"[^>]*clip-path="url\(#cdWax\)"/).slice(1).map(Number);
    near(dark[0], P.cx + side * r, 'the dark side');
    assert.ok(dark[0] + dark[2] >= P.cx + r && dark[1] <= crown, `${at}: the dark side [${dark}] misses the pillar's edge or crown`);
    const glow = back.match(/<rect id="paperGlow" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)"/).slice(1).map(Number);
    assert.ok(glow[0] <= P.cx - r && glow[0] + glow[2] >= P.cx + r && glow[1] <= crown, `${at}: the glow [${glow}] misses the pillar`);
    // the notch the main drip spilled from sits on the rim, over a drip
    const notch = back.match(/class="paperLit" d="([^"]+)"/)[1].match(/[\d.]+/g).map(Number);
    notch.forEach((v, i) => assert.ok(i % 2 ? Math.abs(v - rim) < 4 : Math.abs(v - P.cx) < r, `${at}: the notch's ${v}, off the rim`));
    const mid = (notch[0] + notch[notch.length - 2]) / 2;
    assert.ok(drips.some(([, x0, , x1]) => Math.abs((+x0 + +x1) / 2 - mid) < 0.01), `${at}: the notch at ${mid} is over no drip`);
    // the wick stands in the crown's middle
    assert.ok(front.startsWith(`<path d="M${P.cx} ${rim}V`), `${at}: the wick starts at ${front.slice(9, 25)}`);
  }
});

// The candlestick at its real numbers, at untidy ones (the pillar's rim and STEM) and with its drawing's neck moved, each in
// a copy of lanterns.js: its bronze parts stack from the pan down to the slab, each joint as drawn.
test('the candlestick\'s parts stack from the pan down to the slab as drawn, its stem STEM tall, wherever the pillar and stem put them', () => {
  const variants = [['as it is', {}], ['rim 263.5, STEM 47.3', { PILLAR: 'PILLAR.rim = 263.5;', STEM: 'STEM = 47.3;' }], ['the drawing\'s neck at 461.5', { DRAWN: 'DRAWN.neck = 461.5;' }]];
  for (const [at, edits] of variants) {
    const c = vm.createContext({ URLSearchParams, location: { search: '' } });
    vm.runInContext(pageFile('scene'), c);
    let src = pageFile('lanterns');
    if (edits.STEM) src = src.replace(/^const STEM = .*$/m, 'let STEM = 41;');
    for (const [name, code] of Object.entries(edits)) {
      const was = src;
      src = src.replace(new RegExp(`^(const|let) ${name} = .*$`, 'm'), line => `${line} ${code}`);
      assert.notStrictEqual(src, was, `${name} found`);
    }
    vm.runInContext(src, c);
    const get = code => vm.runInContext(code, c), svg = get('STYLES.candle.back'), P = get('PEDESTAL'), D = get('DRAWN'), STEM = get('STEM');
    const k = STEM / (D.collar - D.neck), lit = get('LACQUER.candle.lit');
    // each part's top and bottom at its sides: the turned bands (DRUM), the turned parts' profiles and the knop
    const parts = [...svg.matchAll(/<path d="M([\d.]+) ([\d.]+)Q340 ([\d.]+) ([\d.]+) \2V([\d.]+)Q340 ([\d.]+) \1 \5Z" fill="(#\w+)"/g)]
      .filter(m => m[7] === lit).map(m => ({ top: +m[2], bottom: +m[5] }));
    for (const id of ['cdBowl', 'cdBaluster', 'cdFoot']) {
      const ys = [...svg.match(new RegExp(`<clipPath id="${id}"><path d="M([^Q]+)Q`))[1].matchAll(/[\d.]+ ([\d.]+)/g)].map(m => +m[1]);
      parts.push({ id, top: Math.min(...ys), bottom: Math.max(...ys) });
    }
    const [, cy, ry] = svg.match(/<clipPath id="cdKnop"><ellipse cx="[\d.]+" cy="([\d.]+)" rx="[\d.]+" ry="([\d.]+)"/).map(Number);
    parts.push({ id: 'knop', top: cy - ry, bottom: cy + ry });
    parts.sort((a, b) => a.top - b.top);
    // top to bottom, and how far below the part above each starts: the neck's band ends at 460 in the drawing and the knop
    // starts at 463, 3 down the stem's scale (and what's left of the drawing's neck below the band, in the pan's units)
    const joints = [['the bowl', 0], ['the neck', 0], ['the knop', D.neck - 460 + (463 - D.neck) * k], ['the upper collar', 0], ['the baluster', 0],
      ['the lower collar', 0], ['the foot', 0], ['the foot\'s band', 0]];
    assert.strictEqual(parts.length, joints.length, `${at}: ${parts.length} parts`);
    assert.ok(Math.abs(parts[0].top - get('PILLAR.dish')) < 0.01, `${at}: the bowl hangs from the pan's rim`);
    joints.slice(1).forEach(([what, gap], i) => {
      const got = parts[i + 1].top - parts[i].bottom;
      assert.ok(Math.abs(got - gap) < 0.02, `${at}: ${what} starts ${got.toFixed(3)} below the part above, not ${gap.toFixed(3)}`);
    });
    // the foot's band sinks 2 into the slab, as drawn (551 on a slab at 549)
    assert.ok(Math.abs(parts[parts.length - 1].bottom - P.top - 2) < 0.02, `${at}: the foot's band ends ${parts[parts.length - 1].bottom - P.top} past the slab's top`);
    // the stem, from the neck's band down to the lower collar
    const stem = parts[4].bottom - parts[1].bottom;
    assert.ok(Math.abs(stem - (D.neck - 460 + STEM)) < 0.02, `${at}: the stem is ${stem} tall`);
  }
});

test('the candle stands on a marble pedestal tilted as its candlestick is, with no floor under it', () => {
  const c = run('STYLES.candle'), P = run('PEDESTAL'), bow = run('LACQUER.candle.bow'), svg = c.back + c.front;
  const ellipses = [...svg.matchAll(/<ellipse\b[^>]*>/g)].map(([e]) => Object.fromEntries(['cy', 'rx', 'ry'].map(k => [k, +e.match(new RegExp(`\\b${k}="([\\d.]+)"`))[1]])));
  assert.ok(ellipses.some(e => e.cy === P.top && e.rx === P.r), `the slab's top, ${P.r} wide at ${P.top}`);
  for (const e of ellipses.filter(e => e.cy >= P.top - 10)) {
    assert.ok(e.cy <= P.top, `an ellipse at ${e.cy}, below the slab's top: a floor under it`);
    assert.ok(Math.abs(e.ry - e.rx * bow(e.cy) / 2) < 0.01, `the ellipse ${e.rx} wide at ${e.cy} is ${e.ry} deep, not ${e.rx * bow(e.cy) / 2}`);
  }
  // the column keeps going down into a tall window, below the 600-high view's bottom at 620
  const lowest = Math.max(...[...svg.matchAll(/V([\d.]+)/g)].map(m => +m[1]));
  assert.ok(lowest >= 700, `the column stops at ${lowest}`);
  // the turned bands (DRUM): each edge's front arc dips by the candlestick's bow, the slab's side and the foot's alike
  const bands = [...svg.matchAll(/<path d="M([\d.]+) ([\d.]+)Q340 ([\d.]+) ([\d.]+) \2V([\d.]+)Q340 ([\d.]+) \1 \5Z" fill="(#\w+)"/g)]
    .map(m => ({ half: (m[4] - m[1]) / 2, top: +m[2], topQ: +m[3], bottom: +m[5], bottomQ: +m[6], fill: m[7] }));
  for (const d of bands) for (const [y, q] of [[d.top, d.topQ], [d.bottom, d.bottomQ]]) {
    assert.ok(Math.abs(q - (y + d.half * bow(y))) < 0.01, `a band ${d.half} either side: its edge at ${y} dips to ${q}, not ${y + d.half * bow(y)}`);
  }
  const slab = bands.find(d => d.half === P.r && d.top === P.top);
  assert.ok(slab && slab.bottom === P.top + P.depth, `the slab's side, ${P.depth} deep under its top`);
  // the candlestick's foot, its lowest bronze band, stands on the slab's top, neither floating over it nor sunk in
  const foot = bands.filter(d => d.fill === run('LACQUER.candle.lit')).sort((a, b) => b.bottom - a.bottom)[0];
  assert.ok(Math.abs(foot.bottom - P.top) <= 3 && foot.half < P.r, `the foot ends at ${foot.bottom}, ${foot.half} either side, on a slab at ${P.top}`);
  // below the slab's top at its front, only the pedestal's own group (the slab, the column and the vine on them) draws
  const below = P.top + P.r * bow(P.top) / 2 + 0.5, all = drawn(svg);
  const inPedestal = n => { for (; n; n = n.parent) if (n.tag === 'g' && (n.attrs.class || '').split(/\s+/).includes('cdPedestal')) return true; return false; };
  assert.ok(all.some(d => d.low > below && inPedestal(d.node)), 'the pedestal reaches below its slab\'s top');
  for (const { node, low } of all) {
    assert.ok(low <= below || inPedestal(node), `a <${node.tag}> outside the pedestal reaches ${low.toFixed(1)}, below the slab's top at ${below.toFixed(1)}: a floor? ${JSON.stringify(node.attrs).slice(0, 100)}`);
  }
});

test('the candle\'s wax under the rim takes the flame\'s colour', () => {
  const c = run('STYLES.candle'), svg = c.back + c.front;
  const glow = svg.match(/<\w+\b[^>]*\bid="paperGlow"[^>]*>/);
  assert.ok(glow, 'a #paperGlow band');
  const grad = glow[0].match(/fill="url\(#([\w-]+)\)"/);
  assert.ok(grad, `filled by a gradient: ${glow[0]}`);
  const body = svg.match(new RegExp(`<(linear|radial)Gradient\\b[^>]*\\bid="${grad[1]}"[^>]*>([\\s\\S]*?)</\\1Gradient>`));
  assert.ok(body, `#${grad[1]} is defined in the markup`);
  const stops = body[2].match(/<stop\b[^>]*>/g) || [];
  assert.ok(stops.length > 1 && stops.every(t => /class="paperStop"/.test(t)), `its stops take the flame's colour: ${stops}`);
  assert.strictEqual((svg.match(/class="paperLit"/g) || []).length, 1, 'one patch lit by the flame');
});

test('on the candle the session text and ribbon controls grey out', () => {
  run(`applyStyle('candle')`);
  assert.strictEqual(els.textToggle.disabled, true);
  assert.strictEqual(els.textToggle.parentElement.title, 'Only the paper lanterns show session text');
  assert.ok(els.ribbons.children.every(b => b.disabled), 'every swatch');
  assert.strictEqual(els.ribbons.parentElement.title, 'Only the barrel has a ribbon');
  run(`applyStyle('barrel')`);
  assert.strictEqual(els.textToggle.disabled, false, 'and come back on the barrel');
  assert.strictEqual(els.ribbons.parentElement.title, 'its own title');
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
