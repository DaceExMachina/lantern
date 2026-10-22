// Printed pages on a paper lantern: paragraphs of what the sessions wrote (each session's `prose`, runs of plain
// sentences the server already filtered) wrapped round the paper. Each block's lines run the paper's full width and
// on round the sides, squeezing as they turn away and vanishing round the back, on the rows between the wires. A block
// fades in over about 18s, lingers for about a minute, and fades out, overlapping the others; some are printed on the
// inside (mirrored). The words read best where the flame's light is strongest. Besides live sessions' words, the server
// sends a pool from the newest few transcripts (recentProse), ended sessions too. With no words the paper stays blank.
// "Show session text" in the settings menu turns it all off (settings.json `lanternText`: "sessions" or "off"): the
// words fade out as quickly as a first appearance fades in, then the timer stops so nothing runs; turned back on, a full
// page comes up the same quick way, from the words it already has.
// Driven by a timer, not CSS transitions, since the screensaver's web view doesn't run animation frames.
//
// Drawn cheaply: the blocks are typeset flat on an offscreen canvas (the paper unrolled), then that page is warped onto
// the paper in tiles, and shown as one picture on the paper. On the barrel a tile is a whole vertical strip, a cylinder
// being the same all the way down; on the round chōchin the strips are cut into bands as well, each band as wide as the
// paper is at its height. It's redrawn only when a fade has moved enough to see, a couple of times a second at most,
// never per animation frame. In a window too small to read the words (the iTerm toolbelt), none of it runs.

import { live } from './live';
import { byId, nth } from './scene';
import type { Point, Surface } from '../types';

/** A block of session text on the paper: when it came and how long it holds, how dark at its peak, whether it's printed
 * mirrored, its type size, width, where it sits (`from` round the paper, `row` down it), its lines, its slant, and when
 * it began leaving. */
export interface Block {
  born: number; hold: number; peak: number; mirror: boolean; size: number; width: number; from: number; row: number; lines: string[];
  alpha: number; drawnAlpha: number; slope: number; leaving?: number;
}
import { mix, style } from './lanterns';
import { cool, level } from './frame';

export let lanternText = 'sessions';
// The paper's geometry comes from the lantern (style.surface, see lanterns.ts): its middle and width, the heights of its
// wires, and how much each bows at the front. `lines` lines of type share each gap between wires, riding the bow.
const INK = { warm: '#5A3420', cool: '#2E2350' };
// A paper shows `shown` blocks at most (the surface's), a new one coming every EVERY on a paper of six, sooner on one of
// more, so the paper keeps about that many going.
const FADE = 18000, HOLD = 70000, EVERY = 20000;
const every = (d: Surface) => EVERY * 6 / d.shown * (0.6 + Math.random() * 0.8);
const FONT = "Georgia, 'Times New Roman', serif";
// The light the words are read by (the surface's `light` ellipse): brightest just above the flame, falling off to a third
// at the paper's edges.
const READ_LIGHT: Point[] = [[0, 1], [0.55, 0.73], [1, 0.33]];
// Under this many CSS pixels of paper on screen the type is a few pixels tall, too small to read, so the text sleeps.
const MIN_PAPER = 175;
// the warp's vertical strips round the front half of the paper, and on a round lantern the bands each is cut into
const STRIPS = 90, TILES_DOWN = 24;
let blocks: Block[] = [], shownLately: string[] = [], nextBlockAt = 0;
// The first render waits for the server's first snapshot (or a moment, if it's offline), then starts with a full set of
// blocks part way through their lives, as if it had been running a while, so a reload doesn't wipe the paper.
let primed = false, waitFrom = performance.now(), pagesTimer: ReturnType<typeof setInterval> | undefined;
// the whole set's ink comes up together (or goes out) over INTRO, on a quicker timer of its own, rather than at once
const INTRO = 1200, PRIME_AGE = 2 * FADE + HOLD;
let introAt = 0, introTimer: ReturnType<typeof setInterval> | undefined, inking = 1; // inking: 1 coming up, -1 going out
// the unrolled page, the warped one, and what it was last drawn with; `showing` is the picture on the paper, and `busy`
// while a new one is being encoded and decoded
export let flat: HTMLCanvasElement | undefined, warped: HTMLCanvasElement | undefined, drawn = { scale: 0, cool: -1 }, showing = '', busy = false, dirty = false;
let paper: Surface | undefined; // the surface the blocks were laid out for

let measure: CanvasRenderingContext2D | null | undefined;
const widthOf = (text: string, size: number) => {
  measure ??= document.createElement('canvas').getContext('2d');
  if (!measure) return 0;
  measure.font = `${size}px ${FONT}`;
  return measure.measureText(text).width;
};
const wrapWords = (text: string, width: number, size: number) => text.split(' ').reduce((lines, w) => {
  const last = lines[lines.length - 1];
  if (last && widthOf(last + ' ' + w, size) <= width) lines[lines.length - 1] = last + ' ' + w; else lines.push(w);
  return lines;
}, new Array<string>());

// A paragraph from one place: a live session's runs, or the recent transcripts' pool, both oldest first. From a random
// starting run it takes the ones after it until there are about 160 words, skipping starts shown lately. Nothing when
// there are no words.
function pickText(d: Surface) {
  const sources = [...live.raw.map(s => s.prose || []), live.recentProse].filter(list => list.length);
  const starts = sources.flatMap(list => list.map((run, i) => ({ list, i, run })));
  const fresh = starts.filter(st => !shownLately.includes(st.run)), pool = fresh.length ? fresh : starts;
  const start = pool[Math.floor(Math.random() * pool.length)];
  if (!start) return;
  shownLately = [...shownLately, start.run].slice(-(d.shown + 2)); // a paper's worth and a couple more
  let text = start.run;
  for (let i = start.i + 1; i < start.list.length && text.split(' ').length < 160; i++) text += ' ' + start.list[i];
  return text;
}

// Down a round lantern the paper turns away toward the top and bottom just as it does round the sides, so the page is
// unrolled by latitude: `flatY` is how far down the unrolled page a height on the paper is, and `paperY` the way back. A
// line squashes as it nears the top or bottom, as it narrows round the sides. On the barrel both are the height itself.
export const flatY = (d: Surface, y: number) => d.ry && d.cy !== undefined ? d.cy + d.ry * Math.asin(Math.max(-1, Math.min(1, (y - d.cy) / d.ry))) : y;
const paperY = (d: Surface, v: number) => d.ry && d.cy !== undefined ? d.cy + d.ry * Math.sin((v - d.cy) / d.ry) : v;

// The part of the unrolled paper worth filling: from 60° left of the front to 60° right, and the rows where the paper is
// at least half its widest (past that the type is squeezed to under half its size), split into loose cells of 3 across
// by 4 down, in paper units and rows.
export const COLS = 3, BANDS = 4;
export const span = (d: Surface) => d.r * Math.PI / 3;
// the rows worth filling, [first, past the last]: `lines` to each gap between wires
export const fillRows = (d: Surface): Point => {
  const ok = d.ribs.slice(1).map((y, g) => d.half((nth(d.ribs, g) + y) / 2) >= d.r / 2), first = ok.indexOf(true);
  return [d.lines * first, d.lines * (ok.lastIndexOf(true) + 1)];
};
// Where a block's lines land on the unrolled paper, once flipped if it's mirrored: [left, right, first row, last row].
export const extent = (b: Pick<Block, 'width' | 'mirror' | 'from' | 'row' | 'lines'>): [left: number, right: number, top: number, bottom: number] => {
  const w = b.width, [l, r] = b.mirror ? [-b.from - w, -b.from] : [b.from, b.from + w];
  return [l, r, b.row, b.row + b.lines.length];
};
// How much of each cell the showing blocks cover (leaving ones don't count, so their cells are refilled first), as the
// share of the cell's squares (a fifth of a column wide, one row tall) that have any type on them.
function cellCover(d: Surface, showing: Block[]) {
  const [first, rows] = fillRows(d), U = span(d), sub = 5, n = COLS * sub, step = 2 * U / n;
  const hit = Array.from({ length: rows }, () => new Array(n).fill(false));
  for (const b of showing) {
    const [l, r, r0, r1] = extent(b);
    for (let row = Math.max(first, r0); row < Math.min(rows, r1); row++)
      for (let c = 0; c < n; c++) { const line = hit[row]; if (line && -U + (c + 1) * step > l && -U + c * step < r) line[c] = true; }
  }
  return Array.from({ length: BANDS }, (_, band) => Array.from({ length: COLS }, (_, col) => {
    let on = 0, all = 0;
    for (let row = Math.floor(first + band * (rows - first) / BANDS); row < Math.floor(first + (band + 1) * (rows - first) / BANDS); row++)
      for (let c = col * sub; c < (col + 1) * sub; c++) { all++; if (hit[row]?.[c]) on++; }
    return on / all;
  }));
}

// A new block's middle goes in the least-covered cell (ties broken at random), nudged up to a third of a cell either way
// so the blocks overlap loosely rather than sitting on a grid.
export function place(block: Block, showing: Block[], r = Math.random) {
  const d = style.surface;
  if (!d) return;
  const [first, rows] = fillRows(d), U = span(d), cover = cellCover(d, showing);
  let best = Infinity, band = 0, col = 0;
  cover.forEach((cells, b) => cells.forEach((v, c) => { if (v + r() * 0.05 < best) { best = v + r() * 0.05; band = b; col = c; } }));
  const mid = -U + (col + 0.5 + (r() - 0.5) * 0.66) * 2 * U / COLS;
  const left = mid - block.width / 2;
  block.from = block.mirror ? -left - block.width : left;
  block.row = Math.round(first + (band + 0.5 + (r() - 0.5) * 0.66) * (rows - first) / BANDS - block.lines.length / 2);
}

// A block of lines, laid out on the paper unrolled: `from` is how far round (in paper units, 0 at the front) its lines
// start, and they run `width` on from there, so some start round the left side and some carry on round the right.
// `age` backdates it: a block that has lived longer than its fade and hold is already fading out.
function addBlock(d: Surface, now: number, age = 0) {
  const text = pickText(d);
  if (!text) return;
  const r = Math.random, size = d.gap / d.lines * 2 * (0.28 + r() * 0.05);
  // as many words to a line as on the barrel, whatever the type's size for the paper
  const width = d.r * 2 / d.lines * (1.8 + r() * 1.0);
  const block: Block = {
    born: now - age, hold: HOLD * (0.6 + r() * 0.8), peak: 0.4 + r() * 0.3, mirror: r() < 0.4, size, width,
    from: 0, row: 0, lines: wrapWords(text, width, size), alpha: 0, drawnAlpha: -1,
    // pasted on a little askew: 4 to 8 degrees either way, so the baseline climbs or falls as it goes round
    slope: Math.tan((4 + r() * 4) * Math.PI / 180) * (r() < 0.5 ? -1 : 1),
  };
  place(block, blocks.filter(b => !b.leaving));
  if (age > FADE + block.hold) block.leaving = now - (age - FADE - block.hold);
  blocks.push(block);
  // the oldest leaves early when too many are showing
  const going = blocks.filter(b => !b.leaving);
  const oldest = going[0];
  if (going.length > d.shown && oldest) oldest.leaving = now;
}

// One block typeset on the unrolled page (ctx in paper units: x round from the front, y down the unrolled paper), each
// line tilted with the block. A mirrored block is flipped about the front, so it runs the other way round, like print
// seen through.
function typeset(ctx: CanvasRenderingContext2D, b: Block, d: Surface) {
  const wires = d.ribs.map(y => flatY(d, y));
  ctx.globalAlpha = b.alpha;
  ctx.font = `${b.size}px ${FONT}`;
  b.lines.forEach((line, i) => {
    const row = b.row + i, g = Math.floor(row / d.lines);
    if (g < 0 || g >= d.ribs.length - 1) return; // above or below the paper
    // the last line of a gap sits just above its wire, the others evenly up from it
    const base = nth(wires, g) + (nth(wires, g + 1) - nth(wires, g)) * (0.93 - (d.lines - 1 - row % d.lines) * 0.94 / d.lines);
    const s = b.from - i * d.gap / d.lines * b.slope; // a tilted page's lines start a little further along as they go down
    ctx.save();
    if (b.mirror) ctx.scale(-1, 1);
    ctx.translate(s, base + s * b.slope); // the baseline is at base + u * slope, u being how far round
    ctx.rotate(Math.atan(b.slope));
    ctx.fillText(line, 0, 0);
    ctx.restore();
  });
}

// Where the tile of the unrolled page between angles a0 and a1 (radians round from the front) and rows v0 to v1 lands on
// the paper, in paper units: across, from cx + half sin a, half being the paper's half-width at the tile's middle height,
// so it narrows as it turns away; down, each edge at its height on the paper, moved by the bow a wire there would have,
// cos² a / 2 of it, as the words used to ride it one glyph at a time.
export function tile(d: Surface, a0: number, a1: number, v0: number, v1: number) {
  const c = Math.cos((a0 + a1) / 2) ** 2 / 2, top = paperY(d, v0), bottom = paperY(d, v1), h = d.half((top + bottom) / 2);
  return {
    u0: d.r * a0, u1: d.r * a1, x0: d.cx + h * Math.sin(a0), x1: d.cx + h * Math.sin(a1),
    // ponytail: only the edges are moved and the tile stretched between, close enough while tiles are short or the bow
    // straight in y (on the barrel it is, and the barrel's tile is the whole strip)
    y0: top + d.bow(top) * c, y1: bottom + d.bow(bottom) * c,
  };
}

// The shown canvas's box on the paper, in paper units: the paper's widest, and its height plus room for the bow.
const paperBox = (d: Surface) => {
  const m = Math.max(Math.abs(d.bow(d.top)), Math.abs(d.bow(d.bottom))) / 2 + 1;
  return { x: d.cx - d.r, y: d.top - m, w: 2 * d.r, h: d.bottom - d.top + 2 * m };
};

// Typesets every block flat, warps the page onto the paper, and lights it, `s` device pixels to a paper unit.
function render(d: Surface, s: number) {
  const out = warped ??= document.createElement('canvas'), B = paperBox(d), U = d.r * Math.PI / 2;
  const W = Math.ceil(B.w * s), H = Math.ceil(B.h * s);
  if (out.width !== W || out.height !== H) { out.width = W; out.height = H; }
  const flatCanvas = flat ??= document.createElement('canvas');
  const vTop = flatY(d, d.top), vBottom = flatY(d, d.bottom), fw = Math.ceil(2 * U * s), fh = Math.ceil((vBottom - vTop) * s);
  if (flatCanvas.width !== fw || flatCanvas.height !== fh) { flatCanvas.width = fw; flatCanvas.height = fh; } // also clears it
  const f = flatCanvas.getContext('2d'), o = out.getContext('2d');
  if (!f || !o) return;
  f.setTransform(1, 0, 0, 1, 0, 0);
  f.clearRect(0, 0, fw, fh);
  f.setTransform(s, 0, 0, s, U * s, -vTop * s);
  f.fillStyle = mix(INK.warm, INK.cool, cool);
  for (const b of blocks) if (b.alpha > 0) typeset(f, b, d);
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.globalCompositeOperation = 'source-over';
  o.clearRect(0, 0, W, H);
  const down = d.ry ? TILES_DOWN : 1, step = (vBottom - vTop) / down; // a cylinder is the same all the way down
  for (let j = 0; j < down; j++) {
    const v0 = vTop + j * step, v1 = j === down - 1 ? vBottom : v0 + step;
    for (let i = 0; i < STRIPS; i++) {
      const t = tile(d, Math.PI * (i / STRIPS - 0.5), Math.PI * ((i + 1) / STRIPS - 0.5), v0, v1);
      // whole device pixels across, and between bands, so neighbouring tiles meet without a seam
      const x0 = Math.round((t.x0 - B.x) * s), x1 = Math.round((t.x1 - B.x) * s);
      if (x1 <= x0) continue; // edge-on, round the side
      let y0 = (t.y0 - B.y) * s, y1 = (t.y1 - B.y) * s;
      if (j > 0) y0 = Math.round(y0);
      if (j < down - 1) y1 = Math.round(y1);
      if (y1 <= y0) continue; // edge-on, at the top or bottom
      const sy = (v0 - vTop) * s; // the last band takes the flat canvas to its bottom pixel
      o.drawImage(flatCanvas, (t.u0 + U) * s, sy, (t.u1 - t.u0) * s, (j === down - 1 ? fh : (v1 - vTop) * s) - sy, x0, y0, x1 - x0, y1 - y0);
    }
  }
  o.globalCompositeOperation = 'destination-in';
  o.setTransform(s * d.light.rx, 0, 0, s * d.light.ry, (d.light.cx - B.x) * s, (d.light.cy - B.y) * s);
  const light = o.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [at, a] of READ_LIGHT) light.addColorStop(at, `rgba(0,0,0,${a})`);
  o.fillStyle = light;
  o.fillRect(-B.w, -B.h, 2 * B.w, 2 * B.h); // the whole box, in the light's units
  for (const b of blocks) b.drawnAlpha = b.alpha;
  drawn = { scale: s, cool }; dirty = false;
  show(out);
}

// Puts the warped page on the paper as a picture, swapped in only once it's decoded so the words never blink out.
// (A canvas inside the SVG would skip the encoding, but WebKit doesn't paint one in a foreignObject.) The PNG is encoded
// in a worker: on the main thread a big page's encoding stalls it for 10 to 20ms each time, a dropped frame or two.
// ponytail: WebKit before macOS 13.3 has no OffscreenCanvas, so there it's encoded on the main thread as before.
let encoder: Worker | undefined;
const ENCODER = 'onmessage = async e => { const c = new OffscreenCanvas(e.data.width, e.data.height); '
  + 'c.getContext("2d").drawImage(e.data, 0, 0); postMessage(await c.convertToBlob()); };';
function encode(out: HTMLCanvasElement, done: (blob: Blob | null) => void) {
  if (typeof OffscreenCanvas === 'undefined') return out.toBlob(done);
  const worker = encoder ??= new Worker(URL.createObjectURL(new Blob([ENCODER], { type: 'text/javascript' })));
  worker.onmessage = e => { const blob: unknown = e.data; done(blob instanceof Blob ? blob : null); };
  worker.onerror = () => done(null);
  createImageBitmap(out).then(bmp => worker.postMessage(bmp, [bmp]), () => done(null));
}
function show(out: HTMLCanvasElement) {
  busy = true;
  const ink = byId('pagesInk', SVGImageElement); // a lantern picked meanwhile has its own, for its own paper
  encode(out, async blob => {
    if (!blob) { busy = false; dirty = true; return; } // nothing to show; the next tick tries again
    const url = URL.createObjectURL(blob), img = new Image();
    img.src = url;
    await img.decode().catch(() => {});
    ink?.setAttribute('href', url);
    const was = showing;
    showing = url; busy = false;
    if (was) setTimeout(() => URL.revokeObjectURL(was), 1000); // after the picture has swapped
  });
}

// Paper units to CSS pixels on screen, whatever the sway's rotation and however the lantern is drawn.
const pagesG = () => byId('pages', SVGGElement);
const toScreen = () => { const m = pagesG()?.getScreenCTM(); return m ? Math.hypot(m.a, m.b) : 0; };
// Until a paper lantern is drawn there's nothing to judge, so the timer may start and its tick judges.
const legible = () => { const d = style.surface; return !pagesG() || !d || toScreen() * (d.bottom - d.top) >= MIN_PAPER; };

// The picture on the paper, rebuilt whenever the lantern is drawn afresh (picking a lantern replaces its drawing).
function drawPages(root: Element, d: Surface) {
  const B = paperBox(d);
  root.innerHTML = `<image id="pagesInk" x="${B.x}" y="${B.y}" width="${B.w}" height="${B.h}" preserveAspectRatio="none" href="${showing}"/>`;
  drawn = { scale: 0, cool: -1 };
}

export function tickPages() {
  const root = pagesG(), d = style.surface;
  if (!root || !d) return; // not a paper lantern
  if (!legible()) return sleepPages(); // a lantern picked in a window too small to read it
  if (paper !== d) { forget(); paper = d; } // another lantern: a fresh set laid out for its paper
  const now = performance.now();
  if (lanternText !== 'off' && !primed) {
    if (!live.pagesData && now - waitFrom < 1500) return; // nothing drawn yet
    primed = true;
    for (let i = 0; i < d.shown; i++) addBlock(d, now, Math.random() * PRIME_AGE);
    fadeInk(1);
    nextBlockAt = now + every(d);
  }
  if (!root.firstChild) drawPages(root, d);
  if (lanternText !== 'off' && now >= nextBlockAt) { addBlock(d, now); nextBlockAt = now + every(d); }
  inkOpacity();
  blocks = blocks.filter(b => {
    if (!b.leaving && now - b.born > FADE + b.hold) b.leaving = now;
    const fadeIn = Math.min(1, (now - b.born) / FADE), fadeOut = b.leaving ? 1 - (now - b.leaving) / FADE : 1;
    b.alpha = Math.max(0, b.peak * Math.min(fadeIn, fadeOut));
    if (Math.abs(b.alpha - b.drawnAlpha) > 0.02 || (b.alpha === 0) !== (b.drawnAlpha === 0)) dirty = true;
    if (fadeOut <= 0) dirty = true;
    return fadeOut > 0;
  });
  const s = toScreen() * devicePixelRatio;
  if (busy) return; // the last picture isn't up yet; what changed is still dirty next tick
  if (dirty || Math.abs(s - drawn.scale) > 0.01 || Math.abs(cool - drawn.cool) > 0.03) render(d, s);
}
// Brighter flame, clearer words, times the first set's quick fade in. INK_OPACITY keeps the words faint on any paper.
const INK_OPACITY = 0.75;
const intro = () => { const p = Math.min(1, (performance.now() - introAt) / INTRO); return inking > 0 ? p : 1 - p; };
// Starts the ink coming up (1) or going out (-1) from wherever it is now, so a toggle flipped mid-fade turns round.
function fadeInk(dir: number) {
  const f = intro(); // how much ink shows now
  inking = dir; introAt = performance.now() - (dir > 0 ? f : 1 - f) * INTRO;
  clearInterval(introTimer); introTimer = setInterval(inkOpacity, 40);
}
function inkOpacity() {
  const fade = intro(), done = fade === (inking > 0 ? 1 : 0);
  if (done) { clearInterval(introTimer); introTimer = undefined; }
  if (done && inking < 0) { forget(); stopPages(); return; } // faded out: nothing left running
  byId('pagesInk', SVGImageElement)?.setAttribute('opacity', (INK_OPACITY * (0.5 + 0.5 * Math.max(level, cool * 0.45)) * fade).toFixed(3));
}

function stopPages() { clearInterval(pagesTimer); clearInterval(introTimer); pagesTimer = introTimer = undefined; }
// Starts the timer when there's something to show and room to read it, priming a fresh set (as on load: a full paper,
// coming up quickly) if it had been put to sleep. Called on load, on resize, and when the words are turned on.
function wakePages() {
  if (pagesTimer || lanternText === 'off' || !legible()) return;
  pagesTimer = setInterval(tickPages, 250);
}
// Drops every block and the picture, ready to prime a paper already full.
function forget() {
  blocks = []; pagesG()?.replaceChildren(); URL.revokeObjectURL(showing); showing = '';
  primed = false;
}
// A window shrunk too small to read in drops the words and stops everything; grown back, they fade in again.
function sleepPages() { stopPages(); forget(); waitFrom = performance.now(); }
addEventListener('resize', () => legible() ? wakePages() : pagesTimer && sleepPages());

// Turning words off takes the ink out quickly (then the timer stops); turning them on brings a full page in the way the
// first appearance does, from the words already here. Called by wiring.ts with the shared setting.
export function setLanternText(value: 'sessions' | 'off') {
  if (value === lanternText) return;
  lanternText = value;
  const now = performance.now();
  if (value === 'off') { if (pagesTimer) fadeInk(-1); return; }
  if (pagesTimer && primed) return fadeInk(1); // still going out: turn the same page round
  waitFrom = now;
  wakePages();
  tickPages(); // prime now, not on the next tick
}
wakePages();
