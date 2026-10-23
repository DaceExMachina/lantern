// The session text (src/scene/pages.ts): where a new block goes, and how the flat page is warped onto the paper.
// Each test loads the module afresh, on fake timers, so the text's timers are the only ones it counts.
import assert from 'node:assert';
import { afterEach, test, vi } from 'vitest';
import { layOut, stubCanvas2d } from './page.js';

// #pages's on-screen scale is `screen` CSS pixels to a paper unit: a 229-unit drum is 229 px tall at 1, too small to read.
// The lantern isn't drawn in these tests, so a bare #pages stands in, reporting that scale.
async function load(screen) {
  layOut();
  vi.useFakeTimers();
  const pages = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  pages.id = 'pages';
  pages.getScreenCTM = () => /** @type {any} */ ({ a: scale.screen, b: 0 });
  pages.getCTM = () => /** @type {any} */ ({ a: scale.screen, d: scale.screen, e: 0, f: 0 });
  document.querySelector('svg').append(pages);
  const scale = { screen };
  vi.resetModules();
  const [text, { live }, { STYLES, style }] = await Promise.all([import('../src/scene/pages'), import('../src/scene/live'), import('../src/scene/lanterns')]);
  return { ...text, live, STYLES, style, scale };
}
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('the text sleeps in a window too small to read it, and wakes when it grows', async () => {
  const p = await load(0.6);
  assert.strictEqual(vi.getTimerCount(), 0, 'a 137 px drum loads with no timer');
  p.scale.screen = 2;
  window.dispatchEvent(new Event('resize'));
  assert.strictEqual(vi.getTimerCount(), 1, 'a 458 px drum starts it');
});

test('turning the text off takes the ink out in the intro\'s time, then stops the timer; on again brings it back at once', async () => {
  stubCanvas2d();
  const p = await load(2);
  const INTRO = 1200, ink = () => { p.tickPages(); return +document.getElementById('pagesInk').style.opacity; };
  p.live.pagesData = true; // the server has sent its words
  vi.advanceTimersByTime(250); // the first tick primes the page and starts the ink coming up
  vi.advanceTimersByTime(INTRO);
  const full = ink();
  assert.ok(full > 0, 'the ink is up');
  assert.strictEqual(vi.getTimerCount(), 1, 'only the text\'s own timer runs');
  p.setLanternText('off');
  assert.strictEqual(vi.getTimerCount(), 2, 'still running while the ink goes out');
  vi.advanceTimersByTime(INTRO / 2);
  assert.strictEqual(vi.getTimerCount(), 2, 'half way, still going');
  assert.ok(Math.abs(ink() / full - 0.5) < 0.05, 'half the ink left');
  p.setLanternText('sessions');
  assert.ok(Math.abs(ink() / full - 0.5) < 0.05, 'turned round from where it was, not restarted');
  p.setLanternText('off');
  vi.advanceTimersByTime(INTRO);
  assert.strictEqual(vi.getTimerCount(), 0, 'INTRO later the timer has stopped');
});

test('a new block goes in the least-covered cell, mirrored or not', async () => {
  const { COLS, BANDS, span, place, extent, style } = await load(1);
  const d = style.surface, rows = d.lines * (d.ribs.length - 1), U = span(d), w = 2 * U / COLS;
  const band = b => [Math.floor(b * rows / BANDS), Math.floor((b + 1) * rows / BANDS)];
  for (let tb = 0; tb < BANDS; tb++) for (let tc = 0; tc < COLS; tc++) for (const mirror of [false, true]) {
    // every other cell exactly covered by a block of its own
    const placed = [];
    for (let b = 0; b < BANDS; b++) for (let c = 0; c < COLS; c++) if (b !== tb || c !== tc) {
      const [r0, r1] = band(b);
      placed.push({ from: -U + c * w, width: w, mirror: false, row: r0, lines: new Array(r1 - r0).fill('') });
    }
    const block = { width: 100, mirror, lines: new Array(8).fill('') };
    place(block, placed, () => 0.5); // a middling random: no jitter, no tie to break
    const [l, r, r0, r1] = extent(block), mid = (l + r) / 2, midRow = (r0 + r1) / 2;
    assert.ok(mid > -U + tc * w && mid < -U + (tc + 1) * w, `cell ${tb},${tc}${mirror ? ' mirrored' : ''}: middle at ${mid.toFixed(1)} across`);
    assert.ok(midRow >= band(tb)[0] && midRow <= band(tb)[1], `cell ${tb},${tc}${mirror ? ' mirrored' : ''}: middle at row ${midRow}`);
  }
});

test('the barrel\'s warp strips tile the drum edge to edge and ride the wires\' bow', async () => {
  const { tile, style } = await load(1);
  const d = style.surface, n = 90;
  const strips = Array.from({ length: n }, (_, i) => tile(d, Math.PI * (i / n - 0.5), Math.PI * ((i + 1) / n - 0.5), d.top, d.bottom));
  assert.ok(Math.abs(strips[0].x0 - (d.cx - d.r)) < 1e-9 && Math.abs(strips[n - 1].x1 - (d.cx + d.r)) < 1e-9, 'from one side of the drum to the other');
  strips.slice(1).forEach((s, i) => assert.ok(Math.abs(s.x0 - strips[i].x1) < 1e-9 && Math.abs(s.u0 - strips[i].u1) < 1e-9, `strip ${i + 1} meets the one before`));
  const front = strips[n / 2];
  assert.ok(Math.abs((front.x1 - front.x0) / (front.u1 - front.u0) - 1) < 0.001, 'facing the viewer, the page is barely squeezed');
  assert.ok((strips[0].x1 - strips[0].x0) / (strips[0].u1 - strips[0].u0) < 0.02, 'edge-on at the side, squeezed to almost nothing');
  // at the front each edge moves by half its wire's bow, as the per-letter version placed each glyph; at the side, not at all
  assert.ok(Math.abs(front.y0 - (d.top + d.bow(d.top) / 2)) < 0.01 && Math.abs(front.y1 - (d.bottom + d.bow(d.bottom) / 2)) < 0.01, `front ${front.y0}, ${front.y1}`);
  assert.ok(Math.abs(strips[0].y0 - d.top) < 0.01, `side ${strips[0].y0}`);
});

test('on the chōchin the tiles cover the ball, squash toward the top and bottom, and ride its wires\' bow', async () => {
  const { STYLES, flatY, tile, fillRows } = await load(1);
  const d = STYLES.chochin.surface, n = 90, down = 24, a = i => Math.PI * (i / n - 0.5);
  const v = j => flatY(d, d.top) + j * (flatY(d, d.bottom) - flatY(d, d.top)) / down;
  const at = (i, j) => tile(d, a(i), a(i + 1), v(j), v(j + 1));
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
  const y = 90, j = (flatY(d, y) - v(0)) / (v(1) - v(0)), t = tile(d, a(n / 2), a(n / 2 + 1), v(0) + j * (v(1) - v(0)), v(down));
  assert.ok(Math.abs(t.y0 - (y + d.bow(y) * Math.cos((a(n / 2) + a(n / 2 + 1)) / 2) ** 2 / 2)) < 1e-9 && t.y0 < y - 1, `on the wire, bowed up: ${t.y0}`);
  // blocks go only where the paper is at least half its widest: not in the gaps by the caps
  assert.strictEqual(fillRows(d).join(), '3,27');
});

test('in steady state the text is drawn on the paper\'s canvas, never encoded into a Blob, data URL or object URL', async () => {
  const calls = stubCanvas2d();
  const encodes = [];
  for (const name of ['toBlob', 'toDataURL']) vi.spyOn(HTMLCanvasElement.prototype, name).mockImplementation(() => { encodes.push(name); return ''; });
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => { encodes.push('createObjectURL'); return ''; });
  vi.stubGlobal('Worker', class { constructor() { encodes.push('Worker'); } });
  const p = await load(2);
  p.live.recentProse = ['Some words the sessions wrote, long enough to wrap onto a few lines of the paper before they stop.'];
  p.live.pagesData = true;
  vi.advanceTimersByTime(3 * 60 * 1000); // three minutes of fades moving
  assert.ok(calls.filter(c => c === 'drawImage').length > 20, 'the page was drawn and redrawn as the fades moved');
  assert.ok(calls.includes('fillText'), 'with words on it');
  assert.deepStrictEqual(encodes, []);
});

test('the type is filled a character at a time at one font size, so new text adds nothing WebKit keeps', async () => {
  // WebKit keeps what it works out for each distinct string and font it fills, and gives it back only under memory
  // pressure, so whole lines at each block's size grew the web process for as long as new text came (pages.ts TYPE)
  const calls = stubCanvas2d();
  const p = await load(2);
  p.live.recentProse = Array.from({ length: 40 }, (_, i) => `Run ${i} says something new about lantern number ${i * 7}, and the paper it lights up.`);
  p.live.pagesData = true;
  vi.advanceTimersByTime(10 * 60 * 1000);
  const filled = new Set(calls.filled), chars = new Set(p.live.recentProse.join('').replaceAll(' ', ''));
  assert.ok(calls.filled.length > 1000, `the text was drawn: ${calls.filled.length} fills`);
  assert.ok(filled.size <= chars.size, `${filled.size} distinct fonts and strings filled, from ${chars.size} characters`);
});
