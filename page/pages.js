// Book pages on the barrel's paper: three pages pasted on at slight angles, filling slowly with fragments of what the
// sessions wrote (each session's `prose`, already filtered by the server). A fragment fades in over about 18s, lingers
// for about a minute, and fades out; some are printed on the inside (mirrored), some run off a page's edge. The words
// read best where the flame's light is strongest. Besides live sessions' words, the server sends a pool from the newest
// few transcripts (recentProse), ended sessions too. With no words at all the pages stay empty. settings.json
// `lanternText`: "sessions" (the default) or "off".
// Driven by a timer, not CSS transitions, since the screensaver's web view doesn't run animation frames.

let lanternText = 'sessions';
let recentProse = []; // from the server's `prose` event
// on the barrel's paper (x 280 to 400, y 216 to 445), tilted about their middles
const PAGES = [{ x: 286, y: 238, w: 90, h: 140, rot: -6 }, { x: 310, y: 305, w: 86, h: 125, rot: 5 }, { x: 298, y: 270, w: 72, h: 95, rot: 1.5 }];
const INK = { warm: '#5A3420', cool: '#2E2350' };
const FADE = 18000, HOLD = 70000, EVERY = 9000, SHOWN = 10;
let fragments = [], shownLately = [], nextFragmentAt = performance.now() + EVERY;

const wrapWords = (text, width) => text.split(' ').reduce((lines, w) => {
  const last = lines[lines.length - 1];
  if (last && (last + ' ' + w).length <= width) lines[lines.length - 1] = last + ' ' + w; else lines.push(w);
  return lines;
}, /** @type {string[]} */ ([]));

// Any session's words, live or recent, skipping those shown lately; nothing when there are none.
function pickText() {
  const said = [...new Set([...raw.flatMap(s => s.prose || []), ...recentProse])];
  const fresh = said.filter(t => !shownLately.includes(t)), pool = fresh.length ? fresh : said;
  const text = pool[Math.floor(Math.random() * pool.length)];
  if (text) shownLately = [...shownLately, text].slice(-12);
  return text;
}

function addFragment(now) {
  const text = pickText();
  if (!text) return;
  const r = Math.random, page = Math.floor(r() * PAGES.length), pg = PAGES[page];
  const size = 4.4 + r() * 1.6;
  fragments.push({
    page, born: now, hold: HOLD * (0.6 + r() * 0.8), peak: 0.35 + r() * 0.35, mirror: r() < 0.4, size,
    lines: wrapWords(text, Math.round(26 + r() * 10)).slice(0, 1 + Math.floor(r() * 3)),
    x: pg.x - 10 + r() * pg.w * 0.55, y: pg.y + 8 + r() * (pg.h - 10), // can start off the page's left edge and get cut off
  });
  // the oldest leaves early when too many are showing
  const going = fragments.filter(f => !f.leaving);
  if (going.length > SHOWN) going[0].leaving = now;
}

// The pages' frame, rebuilt whenever the barrel is drawn afresh (picking a lantern replaces its drawing).
function drawPages(root) {
  const page = (pg, k) => `<g transform="rotate(${pg.rot} ${pg.x + pg.w / 2} ${pg.y + pg.h / 2})">
    <clipPath id="pageClip${k}"><rect x="${pg.x}" y="${pg.y}" width="${pg.w}" height="${pg.h}"/></clipPath>
    <rect x="${pg.x}" y="${pg.y}" width="${pg.w}" height="${pg.h}" opacity="0.07"/><g id="page${k}" clip-path="url(#pageClip${k})"></g></g>`;
  root.innerHTML = `<radialGradient id="pagesLight" gradientUnits="userSpaceOnUse" cx="340" cy="330" r="100" gradientTransform="translate(340 330) scale(.85 1.3) translate(-340 -330)">
      <stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#bbb"/><stop offset="1" stop-color="#000"/></radialGradient>
    <mask id="pagesMask" maskUnits="userSpaceOnUse" x="270" y="210" width="140" height="240"><rect x="270" y="210" width="140" height="240" fill="url(#pagesLight)"/></mask>
    <g id="pagesInk" mask="url(#pagesMask)">${PAGES.map(page).join('')}</g>`;
  for (const f of fragments) f.node = null;
}

function fragmentNode(f) {
  const g = document.createElementNS(NS, 'g');
  if (f.mirror) { const pg = PAGES[f.page]; g.setAttribute('transform', `translate(${2 * (pg.x + pg.w / 2)} 0) scale(-1 1)`); }
  f.lines.forEach((line, i) => {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', f.x.toFixed(1)); t.setAttribute('y', (f.y + i * f.size * 1.3).toFixed(1));
    t.setAttribute('font-size', f.size.toFixed(1)); t.setAttribute('font-family', "Georgia, 'Times New Roman', serif");
    t.textContent = line;
    g.append(t);
  });
  return g;
}

function tickPages() {
  const root = $('pages');
  if (!root) return; // not the barrel
  if (lanternText === 'off') { root.replaceChildren(); fragments = []; return; }
  if (!root.firstChild) drawPages(root);
  const now = performance.now();
  if (now >= nextFragmentAt) { addFragment(now); nextFragmentAt = now + EVERY * (0.6 + Math.random() * 0.8); }
  const ink = $('pagesInk');
  ink.setAttribute('fill', mix(INK.warm, INK.cool, cool));
  ink.setAttribute('opacity', (0.5 + 0.5 * Math.max(level, cool * 0.45)).toFixed(2)); // brighter flame, clearer words
  fragments = fragments.filter(f => {
    if (!f.leaving && now - f.born > FADE + f.hold) f.leaving = now;
    const fadeIn = Math.min(1, (now - f.born) / FADE), fadeOut = f.leaving ? 1 - (now - f.leaving) / FADE : 1;
    if (fadeOut <= 0) { f.node?.remove(); return false; }
    f.node ??= $('page' + f.page).appendChild(fragmentNode(f));
    f.node.setAttribute('opacity', (f.peak * Math.min(fadeIn, fadeOut)).toFixed(3));
    return true;
  });
}
setInterval(tickPages, 250);
