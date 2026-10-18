// The barrel's session text (page/pages.js): where a new block goes, and how the flat page is warped onto the drum.
// Like page.test.js, the page's classic scripts run in a vm context.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// #lantern's on-screen scale is `screen` CSS pixels to a paper unit: a 229-unit drum is 229 px tall at 1, too small to read
const page = vm.createContext({
  URLSearchParams, location: { search: '' }, performance, addEventListener: () => {}, setInterval: () => 7, clearInterval: () => {}, screen: 1,
  document: { getElementById: id => id === 'lantern' ? { getScreenCTM: () => ({ a: page.screen, b: 0 }) } : null },
});
for (const f of ['scene', 'lanterns', 'pages']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'page', f + '.js'), 'utf8'), page, { filename: f + '.js' });
const run = code => vm.runInContext(code, page);

test('the text sleeps in a window too small to read it, and wakes when it grows', () => {
  assert.strictEqual(run('pagesTimer'), 0, 'a 229 px drum loads with no timer');
  page.screen = 2;
  run('wakePages()');
  assert.strictEqual(run('pagesTimer'), 7, 'a 458 px drum starts it');
  run('stopPages()');
});

test('a new block goes in the least-covered cell, mirrored or not', () => {
  const { COLS, BANDS } = run('({ COLS, BANDS })');
  const d = run('style.drum'), rows = 2 * (d.ribs.length - 1), U = run('span(style.drum)'), w = 2 * U / COLS;
  const band = b => [Math.floor(b * rows / BANDS), Math.floor((b + 1) * rows / BANDS)];
  for (let tb = 0; tb < BANDS; tb++) for (let tc = 0; tc < COLS; tc++) for (const mirror of [false, true]) {
    // every other cell exactly covered by a block of its own
    const live = [];
    for (let b = 0; b < BANDS; b++) for (let c = 0; c < COLS; c++) if (b !== tb || c !== tc) {
      const [r0, r1] = band(b);
      live.push({ from: -U + c * w, width: w, mirror: false, row: r0, lines: new Array(r1 - r0).fill('') });
    }
    page.live = live;
    page.block = { width: 100, mirror, lines: new Array(8).fill('') };
    run('place(block, live, () => 0.5)'); // a middling random: no jitter, no tie to break
    const [l, r, r0, r1] = run('extent(block)'), mid = (l + r) / 2, midRow = (r0 + r1) / 2;
    assert.ok(mid > -U + tc * w && mid < -U + (tc + 1) * w, `cell ${tb},${tc}${mirror ? ' mirrored' : ''}: middle at ${mid.toFixed(1)} across`);
    assert.ok(midRow >= band(tb)[0] && midRow <= band(tb)[1], `cell ${tb},${tc}${mirror ? ' mirrored' : ''}: middle at row ${midRow}`);
  }
});

test('the warp strips tile the drum edge to edge and ride the wires\' bow', () => {
  const d = run('style.drum'), n = 90;
  const strips = Array.from({ length: n }, (_, i) => run(`strip(style.drum, Math.PI * (${i} / ${n} - 0.5), Math.PI * (${i + 1} / ${n} - 0.5))`));
  assert.ok(Math.abs(strips[0].x0 - (d.cx - d.r)) < 1e-9 && Math.abs(strips[n - 1].x1 - (d.cx + d.r)) < 1e-9, 'from one side of the drum to the other');
  strips.slice(1).forEach((s, i) => assert.ok(Math.abs(s.x0 - strips[i].x1) < 1e-9 && Math.abs(s.u0 - strips[i].u1) < 1e-9, `strip ${i + 1} meets the one before`));
  const front = strips[n / 2];
  assert.ok(Math.abs((front.x1 - front.x0) / (front.u1 - front.u0) - 1) < 0.001, 'facing the viewer, the page is barely squeezed');
  assert.ok((strips[0].x1 - strips[0].x0) / (strips[0].u1 - strips[0].u0) < 0.02, 'edge-on at the side, squeezed to almost nothing');
  // at the front each edge moves by half its wire's bow, as the per-letter version placed each glyph; at the side, not at all
  assert.ok(Math.abs(front.y0 - (d.top + d.bow(d.top) / 2)) < 0.01 && Math.abs(front.y1 - (d.bottom + d.bow(d.bottom) / 2)) < 0.01, `front ${front.y0}, ${front.y1}`);
  assert.ok(Math.abs(strips[0].y0 - d.top) < 0.01, `side ${strips[0].y0}`);
});
