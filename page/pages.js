// Printed pages on the barrel's paper: paragraphs of what the sessions wrote (each session's `prose`, runs of plain
// sentences the server already filtered) wrapped round the cylinder. Each block's lines run the paper's full width and
// on round the sides, squeezing as they turn away and vanishing round the back, on the rows between the wires. A block
// fades in over about 18s, lingers for about a minute, and fades out, overlapping the others; some are printed on the
// inside (mirrored). The words read best where the flame's light is strongest. Besides live sessions' words, the server
// sends a pool from the newest few transcripts (recentProse), ended sessions too. With no words the paper stays blank.
// "Show session text" in the settings menu turns it all off (settings.json `lanternText`: "sessions" or "off"): the
// words fade out and the timer stops, so nothing runs; turned back on, fresh words fade in once the server sends them.
// Driven by a timer, not CSS transitions, since the screensaver's web view doesn't run animation frames.
//
// Drawn cheaply: the blocks are typeset flat on an offscreen canvas (the paper unrolled), then that page is warped onto
// the drum in vertical strips, a cylinder being the same all the way down, and shown as one canvas on the paper. It's
// redrawn only when a fade has moved enough to see, a couple of times a second at most, never per animation frame. In a
// window too small to read the words (the iTerm toolbelt), none of it runs.

let lanternText = 'sessions';
let recentProse = []; // from the server's `prose` event
// The drum's geometry comes from the barrel (style.drum): its centre and radius, the heights of its wires, and how much
// each bows at the front. Two lines of type share each gap between wires, riding the bow.
const INK = { warm: '#5A3420', cool: '#2E2350' };
const FADE = 18000, HOLD = 70000, EVERY = 20000, SHOWN = 6;
const FONT = "Georgia, 'Times New Roman', serif";
// The light the words are read by: brightest just above the flame, falling off to a third at the paper's edges.
const READ_LIGHT = { cx: 340, cy: 340, rx: 88, ry: 165, stops: [[0, 1], [0.55, 0.73], [1, 0.33]] };
// Under this many CSS pixels of drum on screen the type is a few pixels tall, too small to read, so the text sleeps.
const MIN_DRUM = 250;
const STRIPS = 90; // the warp's vertical strips round the front half of the drum
let blocks = [], shownLately = [], nextBlockAt = 0;
// The first render waits for the server's first snapshot (or a moment, if it's offline), then starts with a full set of
// blocks part way through their lives, as if it had been running a while, so a reload doesn't wipe the paper.
let pagesData = false, primed = false, primeAge = 2 * FADE + HOLD, waitFrom = performance.now(), pagesTimer = 0;
// that first set comes up together over INTRO, on a quicker timer of its own, rather than appearing at once
const INTRO = 1200;
let introAt = 0, introTimer = 0;
// the unrolled page, the warped one, and what it was last drawn with; `showing` is the picture on the paper, and `busy`
// while a new one is being encoded and decoded
let flat, warped, drawn = { scale: 0, cool: -1 }, showing = '', busy = false, dirty = false;

let measure;
const widthOf = (text, size) => {
  measure ??= document.createElement('canvas').getContext('2d');
  measure.font = `${size}px ${FONT}`;
  return measure.measureText(text).width;
};
const wrapWords = (text, width, size) => text.split(' ').reduce((lines, w) => {
  const last = lines[lines.length - 1];
  if (last && widthOf(last + ' ' + w, size) <= width) lines[lines.length - 1] = last + ' ' + w; else lines.push(w);
  return lines;
}, /** @type {string[]} */ ([]));

// A paragraph from one place: a live session's runs, or the recent transcripts' pool, both oldest first. From a random
// starting run it takes the ones after it until there are about 160 words, skipping starts shown lately. Nothing when
// there are no words.
function pickText() {
  const sources = [...raw.map(s => s.prose || []), recentProse].filter(list => list.length);
  const starts = sources.flatMap(list => list.map((run, i) => ({ list, i, run })));
  const fresh = starts.filter(st => !shownLately.includes(st.run)), pool = fresh.length ? fresh : starts;
  const start = pool[Math.floor(Math.random() * pool.length)];
  if (!start) return;
  shownLately = [...shownLately, start.run].slice(-8);
  let text = start.run;
  for (let i = start.i + 1; i < start.list.length && text.split(' ').length < 160; i++) text += ' ' + start.list[i];
  return text;
}

// The part of the unrolled paper worth filling: from 60° left of the front to 60° right (past that the type is squeezed
// to under half its width), split into loose cells of 3 across by 4 down, in paper units and rows.
const COLS = 3, BANDS = 4;
const span = d => d.r * Math.PI / 3;
// Where a block's lines land on the unrolled paper, once flipped if it's mirrored: [left, right, first row, last row].
const extent = b => {
  const w = b.width, [l, r] = b.mirror ? [-b.from - w, -b.from] : [b.from, b.from + w];
  return [l, r, b.row, b.row + b.lines.length];
};
// How much of each cell the showing blocks cover (leaving ones don't count, so their cells are refilled first), as the
// share of the cell's squares (a fifth of a column wide, one row tall) that have any type on them.
function cellCover(d, live) {
  const rows = 2 * (d.ribs.length - 1), U = span(d), sub = 5, n = COLS * sub, step = 2 * U / n;
  const hit = Array.from({ length: rows }, () => new Array(n).fill(false));
  for (const b of live) {
    const [l, r, r0, r1] = extent(b);
    for (let row = Math.max(0, r0); row < Math.min(rows, r1); row++)
      for (let c = 0; c < n; c++) if (-U + (c + 1) * step > l && -U + c * step < r) hit[row][c] = true;
  }
  return Array.from({ length: BANDS }, (_, band) => Array.from({ length: COLS }, (_, col) => {
    let on = 0, all = 0;
    for (let row = Math.floor(band * rows / BANDS); row < Math.floor((band + 1) * rows / BANDS); row++)
      for (let c = col * sub; c < (col + 1) * sub; c++) { all++; if (hit[row][c]) on++; }
    return on / all;
  }));
}

// A new block's middle goes in the least-covered cell (ties broken at random), nudged up to a third of a cell either way
// so the blocks overlap loosely rather than sitting on a grid.
function place(block, live, r = Math.random) {
  const d = style.drum, rows = 2 * (d.ribs.length - 1), U = span(d), cover = cellCover(d, live);
  let best = Infinity, band = 0, col = 0;
  cover.forEach((cells, b) => cells.forEach((v, c) => { if (v + r() * 0.05 < best) { best = v + r() * 0.05; band = b; col = c; } }));
  const mid = -U + (col + 0.5 + (r() - 0.5) * 0.66) * 2 * U / COLS;
  const left = mid - block.width / 2;
  block.from = block.mirror ? -left - block.width : left;
  block.row = Math.round((band + 0.5 + (r() - 0.5) * 0.66) * rows / BANDS - block.lines.length / 2);
}

// A block of lines, laid out on the paper unrolled: `from` is how far round (in paper units, 0 at the front) its lines
// start, and they run `width` on from there, so some start round the left side and some carry on round the right.
// `age` backdates it: a block that has lived longer than its fade and hold is already fading out.
function addBlock(now, age = 0) {
  const text = pickText();
  if (!text) return;
  const r = Math.random, d = style.drum, gap = d.ribs[1] - d.ribs[0], size = gap * (0.28 + r() * 0.05), width = d.r * (1.8 + r() * 1.0);
  const block = {
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
  if (going.length > SHOWN) going[0].leaving = now;
}

// One block typeset on the unrolled page (ctx in paper units: x round from the front, y down the drum), each line tilted
// with the block. A mirrored block is flipped about the front, so it runs the other way round, like print seen through.
function typeset(ctx, b) {
  const d = style.drum, gap = d.ribs[1] - d.ribs[0];
  ctx.globalAlpha = b.alpha;
  ctx.font = `${b.size}px ${FONT}`;
  b.lines.forEach((line, i) => {
    const row = b.row + i, g = Math.floor(row / 2);
    if (g < 0 || g >= d.ribs.length - 1) return; // above or below the paper
    const base = d.ribs[g] + gap * (row % 2 ? 0.93 : 0.46);
    const s = b.from - i * gap / 2 * b.slope; // a tilted page's lines start a little further along as they go down
    ctx.save();
    if (b.mirror) ctx.scale(-1, 1);
    ctx.translate(s, base + s * b.slope); // the baseline is at base + u * slope, u being how far round
    ctx.rotate(Math.atan(b.slope));
    ctx.fillText(line, 0, 0);
    ctx.restore();
  });
}

// Where the strip of the unrolled page between angles a0 and a1 (radians round from the front) lands on the drum, in
// paper units: across, from cx + r sin a, so it narrows as it turns away; down, each end moved by its wire's bow,
// cos² a / 2 of it, as the words used to ride it one glyph at a time.
function strip(d, a0, a1) {
  const c = Math.cos((a0 + a1) / 2) ** 2 / 2;
  return {
    u0: d.r * a0, u1: d.r * a1, x0: d.cx + d.r * Math.sin(a0), x1: d.cx + d.r * Math.sin(a1),
    // ponytail: only the ends are moved and the strip stretched between, exact while the bow is straight in y (it is)
    y0: d.top + d.bow(d.top) * c, y1: d.bottom + d.bow(d.bottom) * c,
  };
}

// The shown canvas's box on the paper, in paper units: the drum's width, and its height plus room for the bow.
const paperBox = d => {
  const m = Math.max(Math.abs(d.bow(d.top)), Math.abs(d.bow(d.bottom))) / 2 + 1;
  return { x: d.cx - d.r, y: d.top - m, w: 2 * d.r, h: d.bottom - d.top + 2 * m };
};

// Typesets every block flat, warps the page onto the drum, and lights it, `s` device pixels to a paper unit.
function render(s) {
  const d = style.drum, out = warped ??= document.createElement('canvas'), B = paperBox(d), U = d.r * Math.PI / 2;
  const W = Math.ceil(B.w * s), H = Math.ceil(B.h * s);
  if (out.width !== W || out.height !== H) { out.width = W; out.height = H; }
  flat ??= document.createElement('canvas');
  const fw = Math.ceil(2 * U * s), fh = Math.ceil((d.bottom - d.top) * s);
  if (flat.width !== fw || flat.height !== fh) { flat.width = fw; flat.height = fh; } // also clears it
  const f = flat.getContext('2d');
  f.setTransform(1, 0, 0, 1, 0, 0);
  f.clearRect(0, 0, fw, fh);
  f.setTransform(s, 0, 0, s, U * s, -d.top * s);
  f.fillStyle = mix(INK.warm, INK.cool, cool);
  for (const b of blocks) if (b.alpha > 0) typeset(f, b);
  const o = out.getContext('2d');
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.globalCompositeOperation = 'source-over';
  o.clearRect(0, 0, W, H);
  for (let i = 0; i < STRIPS; i++) {
    const st = strip(d, Math.PI * (i / STRIPS - 0.5), Math.PI * ((i + 1) / STRIPS - 0.5));
    // whole device pixels across, so neighbouring strips meet without a seam
    const x0 = Math.round((st.x0 - B.x) * s), x1 = Math.round((st.x1 - B.x) * s);
    if (x1 <= x0) continue; // edge-on, round the side
    o.drawImage(flat, (st.u0 + U) * s, 0, (st.u1 - st.u0) * s, fh, x0, (st.y0 - B.y) * s, x1 - x0, (st.y1 - st.y0) * s);
  }
  o.globalCompositeOperation = 'destination-in';
  o.setTransform(s * READ_LIGHT.rx, 0, 0, s * READ_LIGHT.ry, (READ_LIGHT.cx - B.x) * s, (READ_LIGHT.cy - B.y) * s);
  const light = o.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [at, a] of READ_LIGHT.stops) light.addColorStop(at, `rgba(0,0,0,${a})`);
  o.fillStyle = light;
  o.fillRect(-B.w, -B.h, 2 * B.w, 2 * B.h); // the whole box, in the light's units
  for (const b of blocks) b.drawnAlpha = b.alpha;
  drawn = { scale: s, cool }; dirty = false;
  show(out);
}

// Puts the warped page on the paper as a picture, swapped in only once it's decoded so the words never blink out.
// (A canvas inside the SVG would skip the encoding, but WebKit doesn't paint one in a foreignObject.)
function show(out) {
  busy = true;
  out.toBlob(async blob => {
    if (!blob) { busy = false; dirty = true; return; } // nothing to show; the next tick tries again
    const url = URL.createObjectURL(blob), img = new Image();
    img.src = url;
    await img.decode().catch(() => {});
    $('pagesInk')?.setAttribute('href', url);
    const was = showing;
    showing = url; busy = false;
    if (was) setTimeout(() => URL.revokeObjectURL(was), 1000); // after the picture has swapped
  });
}

// Paper units to CSS pixels on screen, whatever the sway's rotation.
const toScreen = () => { const m = $('lantern')?.getScreenCTM(); return m ? Math.hypot(m.a, m.b) : 0; };
const legible = () => toScreen() * (STYLES.barrel.drum.bottom - STYLES.barrel.drum.top) >= MIN_DRUM;

// The picture on the paper, rebuilt whenever the barrel is drawn afresh (picking a lantern replaces its drawing).
function drawPages(root) {
  const B = paperBox(style.drum);
  root.innerHTML = `<image id="pagesInk" x="${B.x}" y="${B.y}" width="${B.w}" height="${B.h}" preserveAspectRatio="none" href="${showing}"/>`;
  drawn = { scale: 0, cool: -1 };
}

function tickPages() {
  const root = $('pages');
  if (!root) return; // not the barrel
  const now = performance.now();
  if (lanternText === 'off' && !blocks.length) { root.replaceChildren(); stopPages(); return; } // faded out: stop
  if (lanternText !== 'off' && !primed) {
    if (!pagesData && now - waitFrom < 1500) return; // nothing drawn yet
    primed = true;
    for (let i = 0; i < SHOWN; i++) addBlock(now, Math.random() * primeAge);
    introAt = now; clearInterval(introTimer); introTimer = setInterval(inkOpacity, 40);
    nextBlockAt = now + EVERY * (0.6 + Math.random() * 0.8);
  }
  if (!root.firstChild) drawPages(root);
  if (lanternText !== 'off' && now >= nextBlockAt) { addBlock(now); nextBlockAt = now + EVERY * (0.6 + Math.random() * 0.8); }
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
  if (dirty || Math.abs(s - drawn.scale) > 0.01 || Math.abs(cool - drawn.cool) > 0.03) render(s);
}
// Brighter flame, clearer words, times the first set's quick fade in.
function inkOpacity() {
  const intro = Math.min(1, (performance.now() - introAt) / INTRO);
  if (intro >= 1) { clearInterval(introTimer); introTimer = 0; }
  $('pagesInk')?.setAttribute('opacity', ((0.5 + 0.5 * Math.max(level, cool * 0.45)) * intro).toFixed(3));
}

function stopPages() { clearInterval(pagesTimer); clearInterval(introTimer); pagesTimer = introTimer = 0; }
// Starts the timer when there's something to show and room to read it, priming a fresh set (as on load: a full paper,
// coming up quickly) if it had been put to sleep. Called on load, on resize, and when the words are turned on.
function wakePages() {
  if (pagesTimer || lanternText === 'off' || !legible()) return;
  pagesTimer = setInterval(tickPages, 250);
}
// A window shrunk too small to read in drops the words and stops everything; grown back, they fade in again.
addEventListener('resize', () => {
  if (legible()) return wakePages();
  if (!pagesTimer) return;
  stopPages();
  blocks = []; $('pages')?.replaceChildren(); URL.revokeObjectURL(showing); showing = '';
  primed = false; primeAge = 2 * FADE + HOLD; waitFrom = performance.now(); // back to a paper already full when it wakes
});

// Turning words off fades every block out (then the timer stops); turning them on waits for the server's fresh words
// and fades a set in. Called by main.js with the shared setting.
function setLanternText(value) {
  if (value === lanternText) return;
  lanternText = value;
  const now = performance.now();
  if (value === 'off') { for (const b of blocks) b.leaving ??= now; return; }
  primed = false; pagesData = false; primeAge = 0; waitFrom = now; // a fresh set, all fading in from nothing
  wakePages();
}
wakePages();
