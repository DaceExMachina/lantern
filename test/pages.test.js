// The session text (page/pages.js): where a new block goes, and how the flat page is warped onto the paper.
// Like page.test.js, the page's classic scripts run in a vm context.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// #pages's on-screen scale is `screen` CSS pixels to a paper unit: a 229-unit drum is 229 px tall at 1, too small to read
const page = vm.createContext({
  URLSearchParams, location: { search: '' }, performance, addEventListener: () => {}, setInterval: () => 7, clearInterval: () => {}, screen: 0.6,
  document: { getElementById: id => id === 'pages' ? { getScreenCTM: () => ({ a: page.screen, b: 0 }) } : null },
});
for (const f of ['scene', 'dev', 'lanterns', 'pages']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'page', f + '.js'), 'utf8'), page, { filename: f + '.js' });
const run = code => vm.runInContext(code, page);

test('the text sleeps in a window too small to read it, and wakes when it grows', () => {
  assert.strictEqual(run('pagesTimer'), 0, 'a 137 px drum loads with no timer');
  page.screen = 2;
  run('wakePages()');
  assert.strictEqual(run('pagesTimer'), 7, 'a 458 px drum starts it');
  run('stopPages()');
});

test('a new block goes in the least-covered cell, mirrored or not', () => {
  const { COLS, BANDS } = run('({ COLS, BANDS })');
  const d = run('style.surface'), rows = d.lines * (d.ribs.length - 1), U = run('span(style.surface)'), w = 2 * U / COLS;
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

test('the barrel\'s warp strips tile the drum edge to edge and ride the wires\' bow', () => {
  const d = run('style.surface'), n = 90;
  const strips = Array.from({ length: n }, (_, i) => run(`tile(style.surface, Math.PI * (${i} / ${n} - 0.5), Math.PI * (${i + 1} / ${n} - 0.5), ${d.top}, ${d.bottom})`));
  assert.ok(Math.abs(strips[0].x0 - (d.cx - d.r)) < 1e-9 && Math.abs(strips[n - 1].x1 - (d.cx + d.r)) < 1e-9, 'from one side of the drum to the other');
  strips.slice(1).forEach((s, i) => assert.ok(Math.abs(s.x0 - strips[i].x1) < 1e-9 && Math.abs(s.u0 - strips[i].u1) < 1e-9, `strip ${i + 1} meets the one before`));
  const front = strips[n / 2];
  assert.ok(Math.abs((front.x1 - front.x0) / (front.u1 - front.u0) - 1) < 0.001, 'facing the viewer, the page is barely squeezed');
  assert.ok((strips[0].x1 - strips[0].x0) / (strips[0].u1 - strips[0].u0) < 0.02, 'edge-on at the side, squeezed to almost nothing');
  // at the front each edge moves by half its wire's bow, as the per-letter version placed each glyph; at the side, not at all
  assert.ok(Math.abs(front.y0 - (d.top + d.bow(d.top) / 2)) < 0.01 && Math.abs(front.y1 - (d.bottom + d.bow(d.bottom) / 2)) < 0.01, `front ${front.y0}, ${front.y1}`);
  assert.ok(Math.abs(strips[0].y0 - d.top) < 0.01, `side ${strips[0].y0}`);
});

test('on the chōchin the tiles cover the ball, squash toward the top and bottom, and ride its wires\' bow', () => {
  const d = run('STYLES.chochin.surface'), n = 90, down = 24, a = i => Math.PI * (i / n - 0.5);
  page.d = d;
  const v = j => run(`flatY(d, ${d.top})`) + j * (run(`flatY(d, ${d.bottom})`) - run(`flatY(d, ${d.top})`)) / down;
  const at = (i, j) => run(`tile(d, ${a(i)}, ${a(i + 1)}, ${v(j)}, ${v(j + 1)})`);
  // down the front, band after band from the top of the paper to the bottom, each meeting the one before
  const front = Array.from({ length: down }, (_, j) => at(n / 2, j));
  assert.ok(Math.abs(front[0].y0 - (d.top + d.bow(d.top) / 2)) < 0.01 && Math.abs(front[down - 1].y1 - (d.bottom + d.bow(d.bottom) / 2)) < 0.01, 'top to bottom');
  front.slice(1).forEach((t, j) => assert.ok(Math.abs(t.y0 - front[j].y1) < 1e-9, `band ${j + 1} meets the one before`));
  // the middle band faces the viewer; the top band has turned away, its rows squashed and its strip narrowed
  const tall = t => (t.y1 - t.y0) / (v(1) - v(0)), mid = front[down / 2];
  assert.ok(Math.abs(tall(mid) - 1) < 0.1, `the middle is barely squashed: ${tall(mid)}`);
  assert.ok(tall(front[0]) < 0.2 && tall(front[1]) < tall(front[4]), `squashed toward the top: ${tall(front[0])}`);
  assert.ok((front[1].x1 - front[1].x0) < (mid.x1 - mid.x0) / 2, 'narrower near the top');
  // a band edge on a wire's height at the front sits where that wire is drawn (SUNKEN's arc peaks at half the bow)
  const y = 90, j = (run(`flatY(d, ${y})`) - v(0)) / (v(1) - v(0)), t = run(`tile(d, ${a(n / 2)}, ${a(n / 2 + 1)}, ${v(0) + j * (v(1) - v(0))}, ${v(down)})`);
  assert.ok(Math.abs(t.y0 - (y + d.bow(y) * Math.cos((a(n / 2) + a(n / 2 + 1)) / 2) ** 2 / 2)) < 1e-9 && t.y0 < y - 1, `on the wire, bowed up: ${t.y0}`);
  // blocks go only where the paper is at least half its widest: not in the gaps by the caps
  assert.strictEqual(run('fillRows(d).join()'), '3,27');
});
