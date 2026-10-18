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
    from: -d.r * (1 + r() * 1.4), row: Math.floor(r() * 2 * (d.ribs.length - 1)) - 6, lines: wrapWords(text, width, size),
    // pasted on a little askew: 4 to 8 degrees either way, so the baseline climbs or falls as it goes round
    slope: Math.tan((4 + r() * 4) * Math.PI / 180) * (r() < 0.5 ? -1 : 1),
  };
  if (age > FADE + block.hold) block.leaving = now - (age - FADE - block.hold);
  blocks.push(block);
  // the oldest leaves early when too many are showing
  const going = blocks.filter(b => !b.leaving);
  if (going.length > SHOWN) going[0].leaving = now;
}

// One glyph at a time, laid out on the paper unrolled (tilted with the block), then placed where its middle falls on
// the drum: squeezed sideways as the paper turns away and riding the wire's bow. Mirrored blocks run the other way
// round with their glyphs flipped, like print seen through.
function blockMarkup(b) {
  const esc = c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] || c;
  const d = style.drum, gap = d.ribs[1] - d.ribs[0], tilt = Math.atan(b.slope) * 180 / Math.PI, k = b.mirror ? -1 : 1;
  let out = '';
  b.lines.forEach((line, i) => {
    const row = b.row + i, g = Math.floor(row / 2);
    if (g < 0 || g >= d.ribs.length - 1) return; // above or below the paper
    const base = d.ribs[g] + gap * (row % 2 ? 0.93 : 0.46), bow = d.bow(base);
    let s = b.from - i * gap / 2 * b.slope; // a tilted page's lines start a little further along as they go down
    for (const c of line) {
      const w = widthOf(c, b.size), mid = s + w / 2, a = mid / d.r;
      s += w;
      if (c === ' ' || Math.abs(a) >= Math.PI / 2 - 0.05) continue; // round the back
      const x = d.cx + k * d.r * Math.sin(a), y = base + mid * b.slope + bow * Math.cos(a) ** 2 / 2;
      out += `<text transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${(k * Math.cos(a)).toFixed(3)} 1) rotate(${tilt.toFixed(1)})">${esc(c)}</text>`;
    }
  });
  return `<g font-size="${b.size.toFixed(2)}" text-anchor="middle">${out}</g>`;
}

// The light the words are read by, rebuilt whenever the barrel is drawn afresh (picking a lantern replaces its drawing).
function drawPages(root) {
  root.innerHTML = `<radialGradient id="pagesLight" gradientUnits="userSpaceOnUse" cx="340" cy="330" r="110" gradientTransform="translate(340 330) scale(.8 1.25) translate(-340 -330)">
      <stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#bbb"/><stop offset="1" stop-color="#222"/></radialGradient>
    <mask id="pagesMask" maskUnits="userSpaceOnUse" x="270" y="210" width="140" height="240"><rect x="270" y="210" width="140" height="240" fill="url(#pagesLight)"/></mask>
    <g id="pagesInk" mask="url(#pagesMask)" font-family="${FONT}"></g>`;
  for (const b of blocks) b.node = null;
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
    nextBlockAt = now + EVERY * (0.6 + Math.random() * 0.8);
  }
  if (!root.firstChild) drawPages(root);
  if (lanternText !== 'off' && now >= nextBlockAt) { addBlock(now); nextBlockAt = now + EVERY * (0.6 + Math.random() * 0.8); }
  const ink = $('pagesInk');
  ink.setAttribute('fill', mix(INK.warm, INK.cool, cool));
  ink.setAttribute('opacity', (0.5 + 0.5 * Math.max(level, cool * 0.45)).toFixed(2)); // brighter flame, clearer words
  blocks = blocks.filter(b => {
    if (!b.leaving && now - b.born > FADE + b.hold) b.leaving = now;
    const fadeIn = Math.min(1, (now - b.born) / FADE), fadeOut = b.leaving ? 1 - (now - b.leaving) / FADE : 1;
    if (fadeOut <= 0) { b.node?.remove(); return false; }
    if (!b.node) { ink.insertAdjacentHTML('beforeend', blockMarkup(b)); b.node = ink.lastElementChild; }
    b.node.setAttribute('opacity', (b.peak * Math.min(fadeIn, fadeOut)).toFixed(3));
    return true;
  });
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
