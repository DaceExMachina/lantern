// The three lanterns, landing spots on them, the warm and cool palettes, and seeded randomness.

// ---- lantern styles -----------------------------------------------------------------------------------------
// Each style is drawn behind and in front of one shared flame. `flame` places the flame's base and sets its size,
// `light` is where the glow and threads come from, `paper` softens the flame as if it's behind paper, and `body`
// is the surface moths land on: its top and bottom, and its half-width at a given height. `caps` (paper lanterns) are
// the solid top and bottom that the light can't pass: their heights and half-width. `dim` turns the room's light down
// for a lantern that holds some back (pierced brass), and `shimmer` is how strongly its openings texture that light.
const FLAME = `<g id="flame"><path id="fHalo" filter="url(#soft)" opacity="0.8"/><path id="fOuter"/><path id="fMid"/><path id="fCore"/>
  <ellipse id="fBase" cx="340" cy="384" rx="10" ry="5" opacity="0.55"/></g><g id="sparks"></g>`;
const MOCK = (svg, dy = 0) => `<g transform="translate(112 ${20 + dy}) scale(2.4)">${svg}</g>`; // drawn on the mockup's 190-wide tile, centred on 340; dy nudges it down
const PAPER_GRAD = cy => `<defs><radialGradient id="pg" cy="${cy}" r=".65"><stop class="paperStop" offset="0" stop-opacity=".9"/><stop class="paperStop" offset="1" stop-opacity="0"/></radialGradient></defs>`;
// The Moroccan: satin brass in flat tones (the front faces lit, the side faces a step darker), pierced edge to edge with
// arabesque lace. Its lace and openings are one mask (#cutouts): each panel is cut out whole, then a tile of scrolling
// brass lace is laid back over it, squeezed sideways on the faces that turn away.
const BRASS = { front: '#B8893A', side: '#86612A', lit: '#E0BC6A', rim: '#A47C38' };
const DOME = 'M340 152C342 172 350 182 368 196C386 210 391 225 389 242L291 242C289 225 294 210 312 196C330 182 338 172 340 152Z';
const HALF_X = 'translate(340 0) scale(.5 1) translate(-340 0)'; // the front segment of a six-sided shape spans half its width
const MOROCCAN_SHAPE = `<path d="${DOME}"/><path d="M290 242h100v12h-100ZM290 254L390 254L406 276L274 276ZM274 276h132v145h-132Z"/>`;
const LACE = (clip, squeeze = 1, k = 1) => `<g clip-path="url(#${clip})"><rect x="200" y="100" width="280" height="360"/>
  <rect x="200" y="100" width="280" height="360" fill="url(#lace)" transform="translate(340 0) scale(${squeeze * k} ${k}) translate(-340 0)"/></g>`;
const ROPE = y => `<path d="M272 ${y}h136v5h-136Z" fill="${BRASS.side}"/><path d="M305 ${y}h70v5h-70Z" fill="${BRASS.front}"/><path d="M272 ${y}h136v5h-136Z" fill="url(#rope)"/>`;
const MOROCCAN_DEFS = `<pattern id="lace" width="10" height="12" patternUnits="userSpaceOnUse" x="0" y="2"><g fill="none" stroke="#fff" stroke-width="1.3">
    <path d="M0 0C0 3 5 3 5 6C5 9 10 9 10 12M10 0C10 3 5 3 5 6C5 9 0 9 0 12"/><circle cx="0" cy="6" r="1.3"/><circle cx="10" cy="6" r="1.3"/>
    <path d="M5 -1.8Q6.3 0 5 1.8Q3.7 0 5 -1.8ZM5 10.2Q6.3 12 5 13.8Q3.7 12 5 10.2Z"/><path d="M2.2 6Q3.4 4.6 2.6 3.4M7.8 6Q6.6 7.4 7.4 8.6"/></g></pattern>
  <pattern id="rope" width="3" height="5" patternUnits="userSpaceOnUse"><path d="M-1.5 5L1 0M1.5 5L4 0" stroke="#5A3A12" stroke-width="1"/></pattern>
  <radialGradient id="mg" gradientUnits="userSpaceOnUse" cx="340" cy="346" r="150"><stop class="paperStop" offset="0" stop-opacity=".8"/><stop class="paperStop" offset="1" stop-opacity=".3"/></radialGradient>
  <clipPath id="domeSide"><path d="${DOME}" transform="translate(340 242) scale(.9 .88) translate(-340 -242)"/></clipPath>
  <clipPath id="domeFront"><path d="${DOME}" transform="translate(340 242) scale(.4 .88) translate(-340 -242)"/></clipPath>
  <clipPath id="shoulderL"><path d="M292 257L312 257L305 273L280 273Z"/></clipPath><clipPath id="shoulderR"><path d="M388 257L368 257L375 273L400 273Z"/></clipPath>
  <clipPath id="shoulderF"><path d="M318 257L362 257L369 273L311 273Z"/></clipPath>
  <clipPath id="faceL"><path d="M278 285h25v122h-25Z"/></clipPath><clipPath id="faceR"><path d="M377 285h25v122h-25Z"/></clipPath><clipPath id="faceF"><path d="M311 285h58v122h-58Z"/></clipPath>
  <mask id="cutouts" maskUnits="userSpaceOnUse" x="260" y="120" width="160" height="320"><rect x="260" y="120" width="160" height="320" fill="#fff"/>
    ${LACE('domeSide', 0.55, 0.7)}${LACE('domeFront', 1, 0.7)}
    <path d="M294 245.5h4v5h-4ZM301 245.5h4v5h-4ZM308 245.5h4v5h-4ZM319 245.5h5v5h-5ZM328 245.5h5v5h-5ZM337 245.5h6v5h-6ZM347 245.5h5v5h-5ZM356 245.5h5v5h-5ZM368 245.5h4v5h-4ZM375 245.5h4v5h-4ZM382 245.5h4v5h-4Z"/>
    ${LACE('shoulderL', 0.5, 0.8)}${LACE('shoulderR', 0.5, 0.8)}${LACE('shoulderF', 1, 0.8)}
    ${LACE('faceL', 0.5)}${LACE('faceR', 0.5)}${LACE('faceF')}</mask>`;
const STYLES = {
  barrel: {
    name: 'Book-page barrel', flame: [340, 388, 1], light: [340, 350], paper: true, tassel: [340, 462], caps: [216, 445, 50],
    body: { top: 216, bottom: 445, half: y => { const t = (y - 216) / 229; return 50 + 80 * t * (1 - t); } },
    back: `<path d="M340 20 L340 193" stroke="#C9B49C" stroke-width="2"/>
    <circle cx="340" cy="196" r="4" fill="none" stroke="#A8876A" stroke-width="1.6"/>
    <path id="paperShape" d="M290 216 Q250 330 290 445 L390 445 Q430 330 390 216 Z" fill="url(#paperShade)"/>
    <rect id="paperGlow" x="250" y="216" width="180" height="230" fill="url(#paperGrad)" clip-path="url(#bodyClip)"/>
    <path id="paperTint" d="M290 216 Q250 330 290 445 L390 445 Q430 330 390 216 Z"/>`,
    front: `<path d="M290 216 Q250 330 290 445 L390 445 Q430 330 390 216 Z" fill="#F2DCC0" opacity="0.2"/>
    <g fill="none" stroke="#C9A684" stroke-width="0.9" opacity="0.5"><path d="M284.1 234.3Q340 239.3 395.9 234.3"/><path d="M276.3 266.4Q340 271.4 403.7 266.4"/><path d="M271.6 298.4Q340 303.4 408.4 298.4"/><path d="M270.0 330.5Q340 335.5 410.0 330.5"/><path d="M271.6 362.6Q340 367.6 408.4 362.6"/><path d="M276.3 394.6Q340 399.6 403.7 394.6"/><path d="M284.1 426.7Q340 431.7 395.9 426.7"/></g>
    <g fill="none" stroke="#C8A07A" stroke-width="1.6" opacity="0.85"><path d="M302 216 Q274 330 302 445"/><path d="M321 216 Q309 330 321 445"/><path d="M340 216 L340 445"/><path d="M359 216 Q371 330 359 445"/><path d="M378 216 Q406 330 378 445"/></g>
    <g fill="none" stroke="#FFF4E4" stroke-width="0.8" opacity="0.55" transform="translate(1.6 0)"><path d="M302 216 Q274 330 302 445"/><path d="M321 216 Q309 330 321 445"/><path d="M340 216 L340 445"/><path d="M359 216 Q371 330 359 445"/><path d="M378 216 Q406 330 378 445"/></g>
    <g stroke="#B99572" stroke-width="1.3" opacity="0.8">
      <path d="M275 260 L305 262"/><path d="M272 275 L307 277"/><path d="M270 290 L300 291"/>
      <path d="M375 380 L405 378"/><path d="M373 395 L408 393"/><path d="M376 410 L400 408"/>
      <path d="M347 250 L355 250"/><path d="M347 262 L356 262"/>
    </g>
    <rect x="313" y="199" width="54" height="18" rx="4" fill="url(#capGrad)"/>
    <path d="M317 203.5 H363" stroke="#C47A55" stroke-width="1" opacity="0.7"/>
    <path d="M313 213 H367" stroke="#5E2E1E" stroke-width="1" opacity="0.5"/>
    <rect x="313" y="444" width="54" height="16" rx="4" fill="url(#capGrad)"/>
    <path d="M317 448 H363" stroke="#C47A55" stroke-width="1" opacity="0.7"/>
    <g id="tassel">
      <path d="M340 460 V466" stroke="#8A4A32" stroke-width="2"/>
      <circle cx="340" cy="469" r="3.8" fill="#9C5536"/>
      <rect x="336" y="474" width="8" height="4" rx="1.5" fill="#B0694A"/>
      <g stroke="#8A4A32" stroke-width="1.3" stroke-linecap="round">
        <path d="M338 478 L333 500"/><path d="M339 478 L337 503"/><path d="M340 478 L340 505"/><path d="M341 478 L343 503"/><path d="M342 478 L347 500"/>
      </g>
    </g>`,
  },
  chochin: {
    name: 'Round chōchin', flame: [340, 379, 0.95], light: [340, 336], paper: true, tassel: [95, 178.5], caps: [218, 441, 46], // pivot in the drawing's own units
    body: { top: 240, bottom: 422, half: y => 124.8 * Math.sqrt(Math.max(0, 1 - ((y - 330.8) / 115.2) ** 2)) }, // centred on the glow rings (y 330)
    // the caps' faces that turn toward the paper catch the flame (class paperLit, coloured each frame), drawn behind it
    back: MOCK(`${PAPER_GRAD('.6')}<path d="M95 -7.5V57.6" stroke="#C9B49C" stroke-width="0.8"/>
      <ellipse class="paperLit" cx="95" cy="74" rx="18.6" ry="2" fill="currentColor"/><ellipse class="paperLit" cx="95" cy="168" rx="18.6" ry="2" fill="currentColor"/>
      <ellipse cx="95" cy="122" rx="52" ry="48" fill="#F3ECE2"/><ellipse id="paperGlow" cx="95" cy="122" rx="52" ry="48" fill="url(#pg)"/>
      <ellipse id="paperTint" cx="95" cy="122" rx="52" ry="48"/>`, 18),
    front: MOCK(`<ellipse cx="95" cy="122" rx="52" ry="48" fill="#F3ECE2" opacity="0.22"/>
      <g fill="none" stroke="#C9BBA8" opacity="0.9"><path d="M70.1 79.9Q95 75.3 119.9 79.8" stroke-width="0.45"/><path d="M56.5 90.2Q95 86.5 133.5 89.8" stroke-width="0.6"/><path d="M49.1 99.8Q95 97.5 140.9 99.8" stroke-width="0.45"/><path d="M45.0 109.8Q95 109.1 145.0 110.0" stroke-width="0.45"/><path d="M43.3 120.3Q95 120.1 146.7 120.1" stroke-width="0.45"/><path d="M44.0 130.0Q95 131.6 146.0 129.9" stroke-width="0.45"/><path d="M47.1 140.0Q95 142.3 142.9 139.8" stroke-width="0.6"/><path d="M53.1 149.8Q95 153.9 136.9 149.9" stroke-width="0.45"/><path d="M63.5 159.8Q95 164.6 126.5 160.0" stroke-width="0.45"/></g><!-- ribs seen head on: straight through the middle, bowing away above and below, each a little uneven -->
      <path d="M101.6 74L106.8 80 113.2 90 116.7 100 118.6 110 119.4 120 119.1 130 117.6 140 114.8 150 109.9 160 101.6 170" fill="none" stroke="#C9BBA8" stroke-width="0.4" stroke-linejoin="round" opacity="0.6"/><!-- the seam, a little way round the side so it curves like a meridian -->
      <!-- the caps: lacquered drums, cel-shaded. Their edges bow like the ribs; flat tones (lit lacquer and a dark side), a
           dark lip for their thickness, and an ink outline -->
      <path d="M95 63.3V64.6" stroke="#2A1E1E" stroke-width="1.4"/><ellipse cx="95" cy="60.4" rx="2.4" ry="2.9" fill="none" stroke="#B8935A" stroke-width="0.8"/><path d="M93.3 59.2Q93.6 58 94.6 57.6" fill="none" stroke="#F0D9A6" stroke-width="0.4" stroke-linecap="round"/>
      <path d="M76 66.5Q95 62.5 114 66.5V74Q95 70 76 74Z" fill="#46302F"/><path d="M103.0 64.85L105.8 65.14L108.5 65.51L111.2 65.96L114.0 66.50L114.0 74.00L111.2 73.46L108.5 73.01L105.8 72.64L103.0 72.35Z" fill="#22171A"/><path d="M76 72.6Q95 68.6 114 72.6V74Q95 70 76 74Z" fill="#1A1012"/>
      <path d="M76 66.5Q95 62.5 114 66.5V74Q95 70 76 74Z" fill="none" stroke="#140C0E" stroke-width="0.55" stroke-linejoin="round"/>
      <path class="paperLit" d="M77.5 74.4Q95 70.5 112.5 74.4" fill="none" stroke="currentColor" stroke-width="0.6"/>
      <path d="M76 168Q95 172 114 168V176.5Q95 180.5 76 176.5Z" fill="#46302F"/><path d="M103.0 169.65L105.8 169.36L108.5 168.99L111.2 168.54L114.0 168.00L114.0 176.50L111.2 177.04L108.5 177.49L105.8 177.86L103.0 178.15Z" fill="#22171A"/><path d="M76 168Q95 172 114 168V169.4Q95 173.4 76 169.4Z" fill="#1A1012"/>
      <path d="M76 168Q95 172 114 168V176.5Q95 180.5 76 176.5Z" fill="none" stroke="#140C0E" stroke-width="0.55" stroke-linejoin="round"/>
      <path class="paperLit" d="M77.5 167.6Q95 171.5 112.5 167.6" fill="none" stroke="currentColor" stroke-width="0.6"/>
      <g id="tassel"><path d="M95 178.5V193" stroke="#3A2626" stroke-width="1.1"/>
        <circle cx="95" cy="195.4" r="2.7" fill="#D9AE52"/><path d="M96.4 193.1A2.7 2.7 0 0 1 95 198.1 3.6 3.6 0 0 0 96.4 193.1Z" fill="#A87A2E"/><circle cx="95" cy="195.4" r="2.7" fill="none" stroke="#6E4A1C" stroke-width="0.35"/>
        <rect x="93" y="197.6" width="4" height="1.8" rx="0.5" fill="#C29440" stroke="#6E4A1C" stroke-width="0.3"/>
        <path d="M93.3 199.4L91.4 210.8Q95 212.6 98.6 210.8L96.7 199.4Z" fill="#D9AE52"/><path d="M95.9 199.4L97.2 211.4Q98 211.2 98.6 210.8L96.7 199.4Z" fill="#A87A2E"/>
        <path d="M93.3 199.4L91.4 210.8Q95 212.6 98.6 210.8L96.7 199.4Z" fill="none" stroke="#6E4A1C" stroke-width="0.35" stroke-linejoin="round"/></g>`, 18),
  },
  moroccan: {
    chain: 121, // its chain of links runs from here up past the top of the window (see drawHang)
    name: 'Brass Moroccan', flame: [340, 394, 0.9], light: [340, 346], dim: 0.6, shimmer: 0.4,
    // a hexagonal prism seen face-on (front face ±33, side faces out to ±66), under a flared shoulder from ±50
    body: { top: 256, bottom: 416, half: y => y < 276 ? 50 + Math.max(0, y - 254) / 22 * 16 : 66 },
    back: `<defs>${MOROCCAN_DEFS}</defs>${PAPER_GRAD('.55')}
      <g fill="#24160A">${MOROCCAN_SHAPE}</g><g fill="url(#mg)">${MOROCCAN_SHAPE}</g>
      <ellipse id="paperGlow" cx="340" cy="340" rx="72" ry="90" fill="url(#pg)"/>`,
    front: `<circle cx="340" cy="130" r="4" fill="none" stroke="#D9B464" stroke-width="1.8"/>
      <path d="M338.6 134h2.8v20h-2.8Z" fill="#B8893A"/><ellipse cx="340" cy="140" rx="3" ry="2.4" fill="#D9B464"/><ellipse cx="340" cy="147" rx="4.4" ry="3" fill="#B8893A"/><ellipse cx="340" cy="152.5" rx="2.6" ry="1.8" fill="#D9B464"/>
      <g mask="url(#cutouts)">
        <path d="${DOME}" fill="${BRASS.side}"/><path d="${DOME}" fill="${BRASS.front}" transform="${HALF_X}"/>
        <path d="M290 242h100v12h-100Z" fill="${BRASS.side}"/><path d="M315 242h50v12h-50Z" fill="${BRASS.front}"/>
        <path d="M290 254L390 254L406 276L274 276Z" fill="${BRASS.side}"/><path d="M315 254L365 254L373 276L307 276Z" fill="${BRASS.front}"/>
        <path d="M274 281h132v130h-132Z" fill="${BRASS.side}"/><path d="M307 281h66v130h-66Z" fill="${BRASS.front}"/>
      </g>
      <g fill="none" stroke-linejoin="round">
        <path d="${DOME}" stroke="${BRASS.rim}" stroke-width="2"/><path d="${DOME}" stroke="${BRASS.lit}" stroke-width="2.6" transform="${HALF_X}"/>
        <path d="M290 242.5h100M290 253.5h100M315 242v12M365 242v12" stroke="${BRASS.lit}" stroke-width="1.4"/>
        <path d="M315 254L307 276M365 254L373 276M290 254L274 276M390 254L406 276" stroke="${BRASS.lit}" stroke-width="1.6"/>
        <path d="M309.5 283.5h61v125h-61ZM276.5 283.5h28v125h-28ZM375.5 283.5h28v125h-28Z" stroke="${BRASS.rim}" stroke-width="1.2"/>
      </g>
      <path d="M305 279h4v134h-4ZM371 279h4v134h-4Z" fill="${BRASS.lit}"/><path d="M272.5 279h3v134h-3ZM404.5 279h3v134h-3Z" fill="${BRASS.rim}"/>
      ${ROPE(276)}${ROPE(411)}
      <path d="M278 417h124l-4 4h-116Z" fill="${BRASS.side}"/><path d="M309 417h62l-1 4h-60Z" fill="${BRASS.front}"/>`,
  },
};
// which lantern is shared by every window (Dock app, iTerm panel, screensaver): the server keeps it in settings.json
let style = STYLES.barrel;
// The hanging line from the top of the window down to where the lantern's own drawing starts: a string, or for the Moroccan
// its chain, link after link (alternating face-on and edge-on) all the way up. Redrawn when the window's top moves.
function drawHang() {
  const h = $('hang');
  if (!h) return;
  if (!style.chain) return h.setAttribute('d', `M340 ${VIEW.top - 2}V22`);
  let links = '';
  for (let y = style.chain, k = 0; y > VIEW.top - 10; y -= 9, k++)
    links += `<ellipse cx="340" cy="${y}" rx="${k % 2 ? 3.2 : 2.2}" ry="${k % 2 ? 4 : 5}"/>`;
  h.innerHTML = links;
}
function applyStyle(key) {
  style = STYLES[key] || STYLES.barrel;
  const [fx, fy, fk] = style.flame;
  $('lantern').innerHTML = (style.chain ? '<g id="hang" fill="none" stroke="#B8873A" stroke-width="1.4"></g>' : '<path id="hang" stroke="#C9B49C" stroke-width="2"/>') + style.back
    + `<g ${style.paper ? 'filter="url(#behindPaper)"' : ''} transform="translate(${fx} ${fy}) scale(${fk}) translate(-340 -${FLAME_BASE})">${FLAME}</g>`
    + style.front;
  drawHang();
  for (const m of moths.values()) m.wasLanded = false; // landed moths find new spots on the new lantern
  $('style').value = key;
}

// Somewhere on the lantern's surface: a random height, and a random way round from near the middle to the edge.
// The wing points straight out of the surface; seen from the front its sideways part shrinks toward the middle,
// so moths there show a shorter wing. Returns [x, y, wing angle, wing length].
// The spot sits in the slice of pie facing direction `a` (radians, from the lantern's middle), anywhere from a third
// of the way out to the rim: straight up lands on the upper front, straight out lands toward the edge, so moths whose
// homes sit in different directions never cross paths.
function pickPerch(a = Math.random() * 2 * Math.PI, rand = Math.random) {
  const { top, bottom, half } = style.body, side = Math.cos(a) < 0 ? -1 : 1, depth = 0.35 + rand() * 0.65;
  const y = top + (bottom - top) * (0.5 + 0.44 * Math.sin(a) * depth);
  // how far round the side, from the front: never in the middle third of the lantern, where closed wings would point
  // nearly straight at you and thin to a sliver; squeezed rather than clamped so the slices keep their order
  const MIDDLE = 1 / 3; // the share of the lantern's width (centred) that landing spots stay out of
  const sin = MIDDLE + (1 - MIDDLE) * Math.abs(Math.cos(a)) * depth;
  const slope = (half(y + 1) - half(y - 1)) / 2, len = Math.hypot(1, slope); // how fast the surface bulges at this height
  // the surface's true outward normal in 3D (x right, y down, z toward the viewer): round the side by `sin`, tipped
  // up or down by how the lantern bulges at this height
  const normal = unit([side * sin, -slope, Math.sqrt(1 - sin * sin)]);
  return [340 + side * half(y) * sin, y, normal];
}

// warm = everyone busy, cool = someone needs me; everything crossfades between the two
const WARM = { halo: '#FF9F45', outer: '#F7913F', mid: '#FFC266', core: '#FFF4D6', base: '#6C8CFF', glow: '#F7B267',
  paper: '#FFB85C', thread: '#E8B48A', rings: ['#3A3050', '#4A3B58', '#6A4A58'] };
const COOL = { halo: '#8C6CFF', outer: '#7A63F0', mid: '#9FB6FF', core: '#F0F2FF', base: '#D2B4FF', glow: '#9D7CF5',
  paper: '#A99BFF', thread: '#B6A6F5', rings: ['#2E2E58', '#3A3A6E', '#4E4A86'] };
let pulseIds = 0;
const MOTH_IDLE = '#E9DCF0', MOTH_CALL = '#7B5CFF', MOTH_SINGED = '#8C8494'; // singed: the turn ended in an API error

// A faint tint per project (from its folder name), nudged a little per session so two sessions in one repo still differ.
const hash = str => [...String(str)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
// Random-looking numbers that every window agrees on: seeded from a session's id, so the lantern in the toolbelt,
// the Dock app and the screensaver all put a moth in the same place (mulberry32).
const seeded = seed => () => {
  let t = seed = (seed + 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
function tintFor(s) {
  const hue = (hash(s.cwd.split('/').filter(Boolean).pop()) % 360 + (hash(s.id) % 29) - 14 + 360) % 360;
  const l = 0.72, a = 0.55 * Math.min(l, 1 - l), f = n => { const k = (n + hue / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
// cheap smooth noise: a few sines at unrelated frequencies
const wobble = (s, k) => Math.sin(s * 2.3 + k) * 0.6 + Math.sin(s * 5.1 + k * 1.7) * 0.3 + Math.sin(s * 11.7 + k * 0.6) * 0.1;
