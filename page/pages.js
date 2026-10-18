// Printed pages on the barrel's paper: paragraphs of what the sessions wrote (each session's `prose`, runs of plain
// sentences the server already filtered) wrapped round the cylinder. Each block's lines run the paper's full width and
// on round the sides, squeezing as they turn away and vanishing round the back, on the rows between the wires. A block
// fades in over about 18s, lingers for about a minute, and fades out, overlapping the others; some are printed on the
// inside (mirrored). The words read best where the flame's light is strongest. Besides live sessions' words, the server
// sends a pool from the newest few transcripts (recentProse), ended sessions too. With no words the paper stays blank.
// "Show session text" in the settings menu turns it all off (settings.json `lanternText`: "sessions" or "off"): the
// words fade out and the timer stops, so nothing runs; turned back on, fresh words fade in once the server sends them.
// Driven by a timer, not CSS transitions, since the screensaver's web view doesn't run animation frames.

let lanternText = 'sessions';
let recentProse = []; // from the server's `prose` event
// The drum's geometry comes from the barrel (style.drum): its centre and radius, the heights of its wires, and how much
// each bows at the front. Two lines of type share each gap between wires, riding the bow.
const INK = { warm: '#5A3420', cool: '#2E2350' };
const FADE = 18000, HOLD = 70000, EVERY = 20000, SHOWN = 6;
const FONT = "Georgia, 'Times New Roman', serif";
let blocks = [], shownLately = [], nextBlockAt = 0;
// The first render waits for the server's first snapshot (or a moment, if it's offline), then starts with a full set of
// blocks part way through their lives, as if it had been running a while, so a reload doesn't wipe the paper.
let pagesData = false, primed = false, primeAge = 2 * FADE + HOLD, waitFrom = performance.now(), pagesTimer = 0;
// that first set comes up together over INTRO, on a quicker timer of its own, rather than appearing at once
const INTRO = 1200;
let introAt = 0, introTimer = 0;

const measure = document.createElement('canvas').getContext('2d');
const widthOf = (text, size) => { measure.font = `${size}px ${FONT}`; return measure.measureText(text).width; };
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

// A block of lines, laid out on the paper unrolled: `from` is how far round (in paper units, 0 at the front) its lines
// start, and they run `width` on from there, so some start round the left side and some carry on round the right.
// `age` backdates it: a block that has lived longer than its fade and hold is already fading out.
function addBlock(now, age = 0) {
  const text = pickText();
  if (!text) return;
  const r = Math.random, d = style.drum, gap = d.ribs[1] - d.ribs[0], size = gap * (0.28 + r() * 0.05), width = d.r * (1.8 + r() * 1.0);
  const block = {
    born: now - age, hold: HOLD * (0.6 + r() * 0.8), peak: 0.4 + r() * 0.3, mirror: r() < 0.4, size,
    from: -d.r * (1 + r() * 1.4), row: 0, lines: wrapWords(text, width, size),
    // pasted on a little askew: 4 to 8 degrees either way, so the baseline climbs or falls as it goes round
    slope: Math.tan((4 + r() * 4) * Math.PI / 180) * (r() < 0.5 ? -1 : 1),
  };
  // spread over the whole paper: of a few random heights, the one whose lines land where the fewest others' do
  const rows = 2 * (d.ribs.length - 1), covered = new Array(rows).fill(0);
  for (const b of blocks) if (!b.leaving) b.lines.forEach((_, i) => { if (b.row + i >= 0 && b.row + i < rows) covered[b.row + i]++; });
  const overlap = row => block.lines.reduce((n, _, i) => n + (covered[row + i] ?? 0), 0);
  for (let k = 0, best = Infinity; k < 8; k++) {
    const row = Math.floor(r() * rows) - 2, n = overlap(row) + r() * 0.5; // a little jitter breaks ties
    if (n < best) { best = n; block.row = row; }
  }
  if (age > FADE + block.hold) block.leaving = now - (age - FADE - block.hold);
  blocks.push(block);
  // the oldest leaves early when too many are showing
  const going = blocks.filter(b => !b.leaving);
  if (going.length > SHOWN) going[0].leaving = now;
}

// One glyph at a time, laid out on the paper unrolled (tilted with the block), then placed where its middle falls on
// the drum: squeezed sideways as the paper turns away and riding the wire's bow. Mirrored blocks run the other way
// round with their glyphs flipped, like print seen through. Each is [glyph, x, y, sideways squeeze].
function blockGlyphs(b) {
  const d = style.drum, gap = d.ribs[1] - d.ribs[0], k = b.mirror ? -1 : 1, out = [];
  b.lines.forEach((line, i) => {
    const row = b.row + i, g = Math.floor(row / 2);
    if (g < 0 || g >= d.ribs.length - 1) return; // above or below the paper
    const base = d.ribs[g] + gap * (row % 2 ? 0.93 : 0.46), bow = d.bow(base);
    let s = b.from - i * gap / 2 * b.slope; // a tilted page's lines start a little further along as they go down
    for (const c of line) {
      const w = widthOf(c, b.size), mid = s + w / 2, a = mid / d.r;
      s += w;
      if (c === ' ' || Math.abs(a) >= Math.PI / 2 - 0.05) continue; // round the back
      out.push([c, d.cx + k * d.r * Math.sin(a), base + mid * b.slope + bow * Math.cos(a) ** 2 / 2, k * Math.cos(a)]);
    }
  });
  return out;
}

// The words are printed onto a canvas, redrawn each tick (a few times a second, as they fade), and the paper shows it as
// one image, so a frame only moves one picture with the sway. As thousands of SVG glyphs under a mask, WebKit repainted
// them all every frame, which took Lantern.app down to about 1fps. PAPER is the canvas's box in the lantern's units.
const PAPER = { x: 270, y: 210, w: 140, h: 240 };
const canvas = document.createElement('canvas'), ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
let shownUrl = '', encoding = false; // the picture on the paper, and whether a new one is being made
function drawPages(root) {
  root.innerHTML = `<image id="pagesInk" x="${PAPER.x}" y="${PAPER.y}" width="${PAPER.w}" height="${PAPER.h}" preserveAspectRatio="none"/>`;
  if (shownUrl) URL.revokeObjectURL(shownUrl);
  shownUrl = '';
}

// A block's glyphs printed once, solid, on a sheet the size of the canvas; reprinted only if the window's scale changes.
function printBlock(b, px) {
  const sheet = document.createElement('canvas'), pen = /** @type {CanvasRenderingContext2D} */ (sheet.getContext('2d'));
  sheet.width = canvas.width; sheet.height = canvas.height;
  const t = Math.atan(b.slope), sin = px * Math.sin(t), cos = px * Math.cos(t);
  pen.font = `${b.size}px ${FONT}`;
  pen.textAlign = 'center';
  for (const [c, x, y, k] of blockGlyphs(b)) { // translate(x y) scale(k 1) rotate(t), in canvas pixels
    pen.setTransform(k * cos, sin, -k * sin, cos, (x - PAPER.x) * px, (y - PAPER.y) * px);
    pen.fillText(c, 0, 0);
  }
  return sheet;
}

// Lays every block's sheet down at its fade, colours it all the ink's colour, then dims it by the light the words are
// read by: brightest round the flame, an upright ellipse falling off to a third.
function paintPages(ink, now) {
  if (encoding) return; // the last picture is still being made
  if (!blocks.length) { ink.removeAttribute('href'); return; } // blank paper: nothing to make
  const m = ink.getScreenCTM();
  const px = Math.ceil(Math.hypot(m?.a ?? 1, m?.b ?? 0) * devicePixelRatio * 2) / 2; // canvas pixels per unit, crisp at any window size
  if (canvas.width !== Math.round(PAPER.w * px)) { canvas.width = Math.round(PAPER.w * px); canvas.height = Math.round(PAPER.h * px); }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const b of blocks) {
    const fadeIn = Math.min(1, (now - b.born) / FADE), fadeOut = b.leaving ? 1 - (now - b.leaving) / FADE : 1;
    if (b.sheet?.width !== canvas.width) b.sheet = printBlock(b, px);
    ctx.globalAlpha = b.peak * Math.min(fadeIn, fadeOut);
    ctx.drawImage(b.sheet, 0, 0);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = mix(INK.warm, INK.cool, cool);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.setTransform(0.8 * px, 0, 0, 1.5 * px, (340 * 0.2 - PAPER.x) * px, (340 * -0.5 - PAPER.y) * px); // centred on (340, 340)
  const light = ctx.createRadialGradient(340, 340, 0, 340, 340, 110);
  light.addColorStop(0, '#000'); light.addColorStop(0.55, 'rgba(0, 0, 0, 0.733)'); light.addColorStop(1, 'rgba(0, 0, 0, 0.333)');
  ctx.fillStyle = light;
  ctx.fillRect(200, 200, 400, 300);
  encoding = true;
  encoder ??= startEncoder();
  createImageBitmap(canvas).then(picture => encoder.postMessage(picture, [picture]));
}
// Making the PNG takes about 8ms, which on the page's own thread made a frame late every tick, so a worker makes it.
let encoder;
function startEncoder() {
  const worker = new Worker(URL.createObjectURL(new Blob([`onmessage = async e => {
    const c = new OffscreenCanvas(e.data.width, e.data.height);
    c.getContext('2d').drawImage(e.data, 0, 0);
    postMessage(await c.convertToBlob());
  }`])));
  worker.onmessage = e => {
    encoding = false;
    const ink = $('pagesInk'), old = shownUrl;
    if (!ink) return;
    ink.setAttribute('href', shownUrl = URL.createObjectURL(e.data));
    if (old) setTimeout(() => URL.revokeObjectURL(old), 1000); // once the new one has loaded
  };
  return worker;
}

function tickPages() {
  const root = $('pages');
  if (!root) return; // not the barrel
  const now = performance.now();
  if (lanternText === 'off' && !blocks.length) { root.replaceChildren(); clearInterval(pagesTimer); pagesTimer = 0; return; } // faded out: stop
  if (lanternText !== 'off' && !primed) {
    if (!pagesData && now - waitFrom < 1500) return; // nothing drawn yet
    primed = true;
    for (let i = 0; i < SHOWN; i++) addBlock(now, Math.random() * primeAge);
    introAt = now; clearInterval(introTimer); introTimer = setInterval(inkOpacity, 40);
    nextBlockAt = now + EVERY * (0.6 + Math.random() * 0.8);
  }
  if (!root.firstChild) drawPages(root);
  if (lanternText !== 'off' && now >= nextBlockAt) { addBlock(now); nextBlockAt = now + EVERY * (0.6 + Math.random() * 0.8); }
  blocks = blocks.filter(b => {
    if (!b.leaving && now - b.born > FADE + b.hold) b.leaving = now;
    return !b.leaving || now - b.leaving < FADE;
  });
  inkOpacity();
  paintPages($('pagesInk'), now);
}
// Brighter flame, clearer words, times the first set's quick fade in.
function inkOpacity() {
  const ink = $('pagesInk'), intro = Math.min(1, (performance.now() - introAt) / INTRO);
  if (intro >= 1) { clearInterval(introTimer); introTimer = 0; }
  ink?.setAttribute('opacity', ((0.5 + 0.5 * Math.max(level, cool * 0.45)) * intro).toFixed(3));
}

// Turning words off fades every block out (then the timer stops); turning them on waits for the server's fresh words
// and fades a set in. Called by main.js with the shared setting.
function setLanternText(value) {
  if (value === lanternText) return;
  lanternText = value;
  const now = performance.now();
  if (value === 'off') { for (const b of blocks) b.leaving ??= now; return; }
  primed = false; pagesData = false; primeAge = 0; waitFrom = now; // a fresh set, all fading in from nothing
  pagesTimer ||= setInterval(tickPages, 250);
}
pagesTimer = setInterval(tickPages, 250);
