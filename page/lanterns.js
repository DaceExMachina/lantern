// The three lanterns, landing spots on them, the warm and cool palettes, and seeded randomness.

// ---- lantern styles -----------------------------------------------------------------------------------------
// Each style is drawn behind and in front of one shared flame. `flame` places the flame's base and sets its size,
// `light` is where the glow and threads come from, `paper` softens the flame as if it's behind paper, and `body`
// is the surface moths land on: its top and bottom, and its half-width at a given height. `caps` (paper lanterns) are
// the solid top and bottom that the light can't pass: their heights and half-width. `dim` turns the room's light down
// for a lantern that holds some back (pierced brass), and `holder` is the burner cup under its flame.
// Its solid horizontal brass is tagged class band: each throws a soft, wide shadow in the room (frame.js).
// The halo looks like a wide tongue (46 by 118) blurred by 7, faked without a blur, which WebKit would re-run every frame:
// two soft ellipses in its colour, a body and a tip, their fades fitted to that blur where it shows past the outer tongue.
// Behind paper, the tongues are softened; the halo is soft already.
const HALO_FADE = (id, stops) => `<radialGradient id="${id}">${stops.map(([o, a]) => `<stop offset="${o}" stop-color="currentColor" stop-opacity="${a}"/>`).join('')}</radialGradient>`;
const FLAME = paper => `<g id="flame"><g id="fHalo" opacity="0.8">
  ${HALO_FADE('haloBody', [[0.4, 0.96], [0.55, 0.77], [0.7, 0.36], [0.8, 0.13], [0.9, 0.03], [1, 0]])}<ellipse cx="340" cy="346" rx="49" ry="69" fill="url(#haloBody)"/>
  ${HALO_FADE('haloTip', [[0, 0.94], [0.2, 0.82], [0.4, 0.57], [0.55, 0.33], [0.7, 0.13], [0.8, 0.05], [1, 0]])}<ellipse cx="340" cy="304" rx="26.5" ry="49" fill="url(#haloTip)"/></g>
  <g ${paper ? 'filter="url(#behindPaper)"' : ''}><g id="tongues"><path id="fOuter"/><path id="fMid"/><path id="fCore"/><ellipse id="fBase" cx="340" cy="384" rx="10" ry="5" opacity="0.55"/></g></g></g>
  <g id="sparks"></g>`;
const MOCK = (svg, dy = 0) => `<g transform="translate(112 ${20 + dy}) scale(2.4)">${svg}</g>`; // drawn on the mockup's 190-wide tile, centred on 340; dy nudges it down
const PAPER_GRAD = cy => `<defs><radialGradient id="pg" cy="${cy}" r=".65"><stop class="paperStop" offset="0" stop-opacity=".9"/><stop class="paperStop" offset="1" stop-opacity="0"/></radialGradient></defs>`;
// The Moroccan: satin brass in flat tones (the front faces lit, the side faces a step darker), pierced edge to edge with
// arabesque lace. Its lace and openings are one mask (#cutouts): each panel is cut out whole, then a tile of scrolling
// brass lace is laid back over it, squeezed sideways on the faces that turn away.
const BRASS = { front: '#B8893A', side: '#86612A', lit: '#E0BC6A', rim: '#A47C38' };
// a six-sided onion dome rising to the finial, sitting just proud of the frieze
const DOME = 'M340 154C341.9 174 349.4 184 366.3 198C383.2 212 387.9 227 386 244L294 244C292.1 227 296.8 212 313.7 198C330.6 184 338.1 174 340 154Z';
// underneath, a smaller inverted dome ending in a drop, so the lamp reads as hanging (and still top-heavy)
const BOTTOM = 'M302 434C301 452 314 462 326 470C334 475 338 480 340 486C342 480 346 475 354 470C366 462 379 452 378 434Z';
// between the body and that: a short pierced skirt sloping in and a neck band, shorter and simpler than the shoulder and frieze up
// top. The whole lower part lets light through; only the burner cup under the flame shades the floor.
const SKIRT = 'M277 413H403L380 428H300Z', SKIRT_F = 'M308.5 413H371.5L360 428H320Z';
const HALF_X = 'translate(340 0) scale(.5 1) translate(-340 0)'; // the front segment of a six-sided shape spans half its width
const SHOULDER = 'M295 260H385L403 285H277Z', SHOULDER_F = 'M317.5 260H362.5L371.5 285H308.5Z';
const MOROCCAN_SHAPE = `<path d="${DOME}"/><path d="${BOTTOM}"/><path d="M295 244h90v16h-90Z${SHOULDER}M277 285h126v128h-126Z${SKIRT}M300 428h80v6h-80Z"/>`;
const LACE = (clip, squeeze = 1, k = 1) => `<g clip-path="url(#${clip})"><rect x="200" y="100" width="280" height="420"/>
  <rect x="0" y="0" width="680" height="800" fill="url(#lace)" transform="translate(340 0) scale(${squeeze * k} ${k}) translate(-340 0)"/></g>`;
// a rope-twist rim at height y, `half` wide either side, its front face `front` wide either side
// The twist's stripes are spaced along the true way round the hexagon, so they carry on across each corner and crowd to half
// spacing on the side faces, which turn away (half their width shows).
const ROPE = (y, half = 63, front = half / 2) => {
  const at = u => Math.abs(u) <= front ? u : Math.sign(u) * (front + (Math.abs(u) - front) / 2), end = 3 * front; // true distance → x
  let twist = '';
  for (let u = -end; u <= end + 2.5; u += 3) {
    const lo = Math.max(-end, u - 2.5), hi = Math.min(end, u); // each stripe leans 2.5 over the rim's 5
    twist += `M${(340 + at(lo)).toFixed(2)} ${y + 5 - (lo - u + 2.5) * 2}L${(340 + at(hi)).toFixed(2)} ${y + (u - hi) * 2}`;
  }
  return `<path class="band" d="M${340 - half} ${y}h${2 * half}v5h-${2 * half}Z" fill="${BRASS.side}"/>
  <path d="M${340 - front} ${y}h${2 * front}v5h-${2 * front}Z" fill="${BRASS.front}"/><path d="${twist}" stroke="#5A3A12" stroke-width="1"/>`;
};
const MOROCCAN_DEFS = `<pattern id="lace" width="10" height="12" patternUnits="userSpaceOnUse" x="0" y="2"><g fill="none" stroke="#fff" stroke-width="1.3">
    <path d="M0 0C0 3 5 3 5 6C5 9 10 9 10 12M10 0C10 3 5 3 5 6C5 9 0 9 0 12"/><circle cx="0" cy="6" r="1.3"/><circle cx="10" cy="6" r="1.3"/>
    <path d="M5 -1.8Q6.3 0 5 1.8Q3.7 0 5 -1.8ZM5 10.2Q6.3 12 5 13.8Q3.7 12 5 10.2Z"/><path d="M2.2 6Q3.4 4.6 2.6 3.4M7.8 6Q6.6 7.4 7.4 8.6"/></g></pattern>
  <radialGradient id="mg" gradientUnits="userSpaceOnUse" cx="340" cy="348" r="160"><stop class="paperStop" offset="0" stop-opacity=".8"/><stop class="paperStop" offset="1" stop-opacity=".3"/></radialGradient>
  <clipPath id="domeSide"><path d="${DOME}" transform="translate(340 244) scale(.9 .88) translate(-340 -244)"/></clipPath>
  <clipPath id="domeFront"><path d="${DOME}" transform="translate(340 244) scale(.4 .88) translate(-340 -244)"/></clipPath>
  <clipPath id="bottomSide"><path d="${BOTTOM}" transform="translate(340 434) scale(.88 .8) translate(-340 -434)"/></clipPath>
  <clipPath id="bottomFront"><path d="${BOTTOM}" transform="translate(340 434) scale(.4 .8) translate(-340 -434)"/></clipPath>
  <clipPath id="skirtL"><path d="M281 416H307L317 425H302Z"/></clipPath><clipPath id="skirtR"><path d="M399 416H373L363 425H378Z"/></clipPath>
  <clipPath id="skirtF"><path d="M312 416H368L358 425H322Z"/></clipPath>
  <clipPath id="shoulderL"><path d="M298 263L315 263L308 282L282 282Z"/></clipPath><clipPath id="shoulderR"><path d="M382 263L365 263L372 282L398 282Z"/></clipPath>
  <clipPath id="shoulderF"><path d="M320 263L360 263L367 282L313 282Z"/></clipPath>
  <clipPath id="faceL"><path d="M281 294h24v110h-24Z"/></clipPath><clipPath id="faceR"><path d="M375 294h24v110h-24Z"/></clipPath><clipPath id="faceF"><path d="M313 294h54v110h-54Z"/></clipPath>
  <mask id="cutouts" maskUnits="userSpaceOnUse" x="260" y="120" width="160" height="380"><rect x="260" y="120" width="160" height="380" fill="#fff"/>
    ${LACE('domeSide', 0.55, 0.7)}${LACE('domeFront', 1, 0.7)}
    <path d="M299 248h6v8h-6ZM308 248h6v8h-6ZM323 248h9v8h-9ZM335.5 248h9v8h-9ZM348 248h9v8h-9ZM366 248h6v8h-6ZM375 248h6v8h-6Z"/>
    ${LACE('shoulderL', 0.5, 0.8)}${LACE('shoulderR', 0.5, 0.8)}${LACE('shoulderF', 1, 0.8)}
    ${LACE('faceL', 0.5)}${LACE('faceR', 0.5)}${LACE('faceF')}${LACE('skirtL', 0.5, 0.8)}${LACE('skirtR', 0.5, 0.8)}${LACE('skirtF', 1, 0.8)}${LACE('bottomSide', 0.55, 0.7)}${LACE('bottomFront', 1, 0.7)}</mask>`;
// Paper stretched over rib wires sinks in a little between them: its outline scallops in by `dip` between wires, and a flat
// darker band runs through the middle of each gap. `half(y)` is the paper's half-width at height y, `ribs` the wire heights
// from its top edge to its bottom edge, and `bow(y)` how far a wire's front arc bends there (its curve's control offset).
const SUNKEN = (cx, half, ribs, dip, bow) => {
  const n = v => +v.toFixed(2), gaps = ribs.slice(1).map((b, i) => [ribs[i], b]);
  const arc = (y, d) => `Q${cx} ${n(y + bow(y))} ${n(cx + d * half(y))} ${n(y)}`; // a wire's front arc, ending on side d
  const side = (a, b, d) => { // down the left (d -1) or up the right (d 1), through the sunken midpoint of the gap
    const [y0, y1] = d < 0 ? [a, b] : [b, a], m = (a + b) / 2, mx = cx + d * (half(m) - dip);
    return `Q${n(2 * mx - cx - d * (half(y0) + half(y1)) / 2)} ${n(m)} ${n(cx + d * half(y1))} ${n(y1)}`;
  };
  const top = ribs[0], bottom = ribs[ribs.length - 1];
  const band = (y0, y1) => `<path d="M${n(cx - half(y0))} ${n(y0)}${arc(y0, 1)}L${n(cx + half(y1))} ${n(y1)}${arc(y1, -1)}Z"/>`;
  return {
    outline: `M${n(cx - half(top))} ${n(top)}${gaps.map(([a, b]) => side(a, b, -1)).join('')}${arc(bottom, 1)}`
      + `${gaps.reverse().map(([a, b]) => side(a, b, 1)).join('')}${arc(top, -1)}Z`,
    bands: gaps.map(([a, b]) => band(a + 0.32 * (b - a), b - 0.32 * (b - a))).join(''),
    wires: ribs.slice(1, -1).map(y => `<path d="M${n(cx - half(y))} ${n(y)}${arc(y, 1)}"/>`).join(''),
  };
};
// A paper lantern's paper (style.surface), so whatever is printed on it (pages.js) follows the same curves, in the units
// it's drawn in: its middle `cx`, its top and bottom, its wires `ribs`, each wire's front bow `bow(y)` (as in SUNKEN), its
// half-width `half(y)` and widest `r`, the gap between wires its type is sized for and how many `lines` share it (on
// the chōchin, with its wires twice as far apart, a little larger than the barrel's), how many blocks of words it
// shows at once (`shown`), and the ellipse its words are read
// by, centred just above the flame. A round one also has `cy` and `ry`, the centre and vertical radius of its curve.
// the Odawara barrel: a straight cylinder on 20 close wires (top and bottom edges included), each bowed from the flame's
// height like its drums. `cap` is the half-width of the lacquer drums where they grip the paper.
const BARREL = { cx: 340, r: 60, cap: 63, top: 216, bottom: 445, bow: y => 120 * (y - 350) / 1350, half: _y => BARREL.r,
  light: { cx: 340, cy: 340, rx: 88, ry: 165 } };
BARREL.ribs = Array.from({ length: 20 }, (_, i) => BARREL.top + (BARREL.bottom - BARREL.top) * i / 19);
BARREL.gap = BARREL.ribs[1] - BARREL.ribs[0]; BARREL.lines = 2; BARREL.shown = 8;
const ODAWARA = SUNKEN(BARREL.cx, BARREL.half, BARREL.ribs, 1.2, BARREL.bow);
// the chōchin, in its mockup units: round (a little wider than tall), its wires wider apart and bowing away from the
// middle, so it sinks in less
const BALL = { cx: 95, cy: 122, r: 52, ry: 48, top: 74, bottom: 170, gap: 10, lines: 3, shown: 10, bow: y => 0.115 * (y - 122),
  ribs: [74, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170], light: { cx: 95, cy: 120, rx: 76, ry: 69 } };
BALL.half = y => BALL.r * Math.sqrt(Math.max(0, 1 - ((y - BALL.cy) / BALL.ry) ** 2));
const CHOCHIN = SUNKEN(BALL.cx, BALL.half, BALL.ribs, 0.35, BALL.bow);
// A lacquered drum (the barrel's ends, the chōchin's caps), cel-shaded in flat tones: lit lacquer with a darker side on
// the right, and an ink outline. Where it grips the paper (`paper` 1 for paper below it, -1 above, 0 for neither) it has a
// dark lip, and a rim facing the paper that catches the flame (class paperLit, coloured each frame). Its top edge is at y,
// and its edges bow like the wires, seen from the flame's height: `kit.bow(y)` per unit of half-width.
// A kit is one lantern's lacquer: its centre, bow, where the dark side starts (a share of the half-width), colours, the
// outline's weight, the lip's height and colour, and the rim's inset, gap from the drum, and weight.
const LACQUER = {
  barrel: { cx: BARREL.cx, bow: y => BARREL.bow(y) / BARREL.r, side: 0.44, lit: '#3B2A24', dark: '#1F1512', ink: '#0E0907', line: 1.2,
    lip: [3.2, '#140D0B'], rim: [3, 1.3, 1.4] },
  chochin: { cx: 95, bow: y => (y < 122 ? -4 : 4) / 19, side: 8 / 19, lit: '#46302F', dark: '#22171A', ink: '#140C0E', line: 0.55,
    lip: [1.4, '#1A1012'], rim: [1.5, 0.4, 0.6] },
};
const DRUM = (kit, y, half, height, paper = 0) => {
  const { cx, bow, lip: [lipH, lipFill], rim: [inset, gap, rimW] } = kit, n = v => +v.toFixed(2), bottom = y + height;
  const arc = (y, h, d) => `Q${cx} ${n(y + h * bow(y))} ${n(cx + d * h)} ${n(y)}`; // an edge's front arc, ending on side d
  const band = (a, b) => `M${n(cx - half)} ${n(a)}${arc(a, half, 1)}V${n(b)}${arc(b, half, -1)}Z`;
  const on = (y, f) => `${n(cx + f * half)} ${n(y + half * bow(y) * (1 - f * f) / 2)}`; // f of the way out along that arc
  const fs = [0, 1, 2, 3, 4].map(i => kit.side + (1 - kit.side) * i / 4), rimY = paper > 0 ? bottom + gap : y - gap;
  return `<path d="${band(y, bottom)}" fill="${kit.lit}"/><path d="M${[...fs.map(f => on(y, f)), ...fs.reverse().map(f => on(bottom, f))].join('L')}Z" fill="${kit.dark}"/>`
    + (paper ? `<path d="${paper > 0 ? band(bottom - lipH, bottom) : band(y, y + lipH)}" fill="${lipFill}"/>` : '')
    + `<path d="${band(y, bottom)}" fill="none" stroke="${kit.ink}" stroke-width="${kit.line}" stroke-linejoin="round"/>`
    + (paper ? `<path class="paperLit" d="M${n(cx - half + inset)} ${n(rimY)}${arc(rimY, half - inset, 1)}" fill="none" stroke="currentColor" stroke-width="${rimW}"/>` : '');
};
const STYLES = {
  barrel: {
    name: 'Book-page barrel', flame: [340, 388, 1], light: [340, 350], paper: true, ribbon: [340, 470], knot: [341, 139], caps: [BARREL.top, BARREL.bottom, BARREL.cap],
    surface: BARREL, body: { top: BARREL.top, bottom: BARREL.bottom, half: BARREL.half }, // a straight cylinder
    back: `<path d="M340 20 L340 136.6" stroke="#C9B49C" stroke-width="2"/>
    <defs><clipPath id="bodyClip"><path d="${ODAWARA.outline}"/></clipPath></defs>
    <path id="paperShape" d="${ODAWARA.outline}" fill="url(#paperShade)"/>
    <rect id="paperGlow" x="270" y="200" width="140" height="260" fill="url(#paperGrad)" clip-path="url(#bodyClip)"/>
    <path id="paperTint" d="${ODAWARA.outline}"/>
    <g id="pages" clip-path="url(#bodyClip)"></g>`, // session text printed on the paper (pages.js)
    // built like an Odawara lantern, seen from the flame's height: every horizontal edge (wires, drums) bows up above the
    // flame and down below it. The paper sinks in a little between wires (scalloped edge, a darker band mid-gap).
    front: `<path d="${ODAWARA.outline}" fill="#F2DCC0" opacity="0.2"/>
    <g fill="#A27C58" opacity="0.13" clip-path="url(#bodyClip)">${ODAWARA.bands}</g>
    <g fill="none" stroke="#B48C66" stroke-width="1" opacity="0.75">${ODAWARA.wires}</g>
    ${DRUM(LACQUER.barrel, 192, 50, 7)}${DRUM(LACQUER.barrel, 198, BARREL.cap, 20, 1)}<!-- the drums, with a narrower step on the outer end -->
    <!-- the bail: a stiff wire arch pinned to the drum on each side, with a crook bent into its top so it sits on a hook without sliding --><path d="M279.5 208C279.5 167 302 147.5 333.5 147.5C334.5 140.5 345.5 140.5 346.5 147.5C378 147.5 400.5 167 400.5 208" fill="none" stroke="#1A1410" stroke-width="4.6" stroke-linecap="round"/><path d="M279.5 208C279.5 167 302 147.5 333.5 147.5C334 144 337 142.25 340 142.25" fill="none" stroke="#8A847C" stroke-width="2.6"/><path d="M340 142.25C343 142.25 346 144 346.5 147.5C378 147.5 400.5 167 400.5 208" fill="none" stroke="#5A544E" stroke-width="2.6"/><path d="M281 196C283 170 304 151.6 330 148.6" fill="none" stroke="#D8D2C8" stroke-width="0.9" stroke-linecap="round"/><!-- the string is tied on: one wrap round the crook, a knot, and a loose tail --><ellipse cx="340" cy="142.4" rx="2" ry="3.6" fill="none" stroke="#C9B49C" stroke-width="1.5"/><g id="knotTail"><path d="M341 139Q345.2 143 344 150.5" fill="none" stroke="#C9B49C" stroke-width="1.4" stroke-linecap="round"/></g><circle cx="340" cy="138.4" r="1.9" fill="#C9B49C" stroke="#7E6C56" stroke-width="0.6"/><circle cx="279.5" cy="208" r="2.6" fill="#8A847C" stroke="#1A1410" stroke-width="1"/><circle cx="400.5" cy="208" r="2.6" fill="#5A544E" stroke="#1A1410" stroke-width="1"/>
    <path id="ribbonBack" style="fill: var(--ribbonBack, #29567A)"/><path id="ribbonFront" style="fill: var(--ribbonFront, #4385B1)"/><path id="ribbonEdge" fill="none" style="stroke: var(--ribbonEdge, #0D2A44)" stroke-width="0.8" stroke-linejoin="round"/><!-- the bookmark (see drawRibbon), tied inside the bottom step -->
    ${DRUM(LACQUER.barrel, 466, 50, 7)}${DRUM(LACQUER.barrel, 443, BARREL.cap, 24, -1)}`,
  },
  chochin: {
    name: 'Round chōchin', flame: [340, 379, 0.95], light: [340, 336], paper: true, tassel: [95, 178.5], knot: [95.4, 56.5], caps: [221, 441, 46], // pivot in the drawing's own units
    surface: BALL,
    body: { top: 240, bottom: 422, half: y => 124.8 * Math.sqrt(Math.max(0, 1 - ((y - 330.8) / 115.2) ** 2)) }, // centred on the glow rings (y 330)
    // the caps' faces that turn toward the paper catch the flame (class paperLit, coloured each frame), drawn behind it
    back: MOCK(`${PAPER_GRAD('.6')}<path d="M95 -7.5V55.6" stroke="#C9B49C" stroke-width="0.8"/>
      <ellipse class="paperLit" cx="95" cy="74" rx="18.6" ry="2" fill="currentColor"/><ellipse class="paperLit" cx="95" cy="168" rx="18.6" ry="2" fill="currentColor"/>
      <defs><clipPath id="bodyClip"><path d="${CHOCHIN.outline}"/></clipPath></defs><path d="${CHOCHIN.outline}" fill="#F3ECE2"/><path id="paperGlow" d="${CHOCHIN.outline}" fill="url(#pg)"/>
      <path id="paperTint" d="${CHOCHIN.outline}"/><g id="pages" clip-path="url(#bodyClip)"></g>`, 18),
    front: MOCK(`<path d="${CHOCHIN.outline}" fill="#F3ECE2" opacity="0.22"/>
      <g fill="#A8967E" opacity="0.08" clip-path="url(#bodyClip)">${CHOCHIN.bands}</g><!-- the paper sinks in a little between wires -->
      <g fill="none" stroke="#C9BBA8" opacity="0.9"><path d="M70.1 79.9Q95 75.3 119.9 79.8" stroke-width="0.45"/><path d="M56.5 90.2Q95 86.5 133.5 89.8" stroke-width="0.6"/><path d="M49.1 99.8Q95 97.5 140.9 99.8" stroke-width="0.45"/><path d="M45.0 109.8Q95 109.1 145.0 110.0" stroke-width="0.45"/><path d="M43.3 120.3Q95 120.1 146.7 120.1" stroke-width="0.45"/><path d="M44.0 130.0Q95 131.6 146.0 129.9" stroke-width="0.45"/><path d="M47.1 140.0Q95 142.3 142.9 139.8" stroke-width="0.6"/><path d="M53.1 149.8Q95 153.9 136.9 149.9" stroke-width="0.45"/><path d="M63.5 159.8Q95 164.6 126.5 160.0" stroke-width="0.45"/></g><!-- ribs seen head on: straight through the middle, bowing away above and below, each a little uneven -->
      <path d="M101.6 74L106.8 80 113.2 90 116.7 100 118.6 110 119.4 120 119.1 130 117.6 140 114.8 150 109.9 160 101.6 170" fill="none" stroke="#C9BBA8" stroke-width="0.4" stroke-linejoin="round" opacity="0.6" clip-path="url(#bodyClip)"/><!-- the seam, a little way round the side so it curves like a meridian, ending where the paper does -->
      <path d="M95 63.3V66.1" stroke="#2A1E1E" stroke-width="1.4"/><ellipse cx="95" cy="60.4" rx="2.4" ry="2.9" fill="none" stroke="#B8935A" stroke-width="0.8"/><path d="M93.3 59.2Q93.6 58 94.6 57.6" fill="none" stroke="#F0D9A6" stroke-width="0.4" stroke-linecap="round"/><ellipse cx="95" cy="57.7" rx="1.1" ry="0.65" fill="none" stroke="#C9B49C" stroke-width="0.5"/><g id="knotTail"><path d="M95.4 56.5Q97.1 58.2 96.7 61.4" fill="none" stroke="#C9B49C" stroke-width="0.5" stroke-linecap="round"/></g><circle cx="95" cy="56.3" r="0.75" fill="#C9B49C" stroke="#7E6C56" stroke-width="0.25"/><!-- the string tied round the ring -->
      ${DRUM(LACQUER.chochin, 68, 19, 7.5, 1)}${DRUM(LACQUER.chochin, 168, 19, 8.5, -1)}<!-- the caps -->
      <g id="tassel"><path d="M95 178.5V193" stroke="#3A2626" stroke-width="1.1"/>
        <circle cx="95" cy="195.4" r="2.7" fill="#D9AE52"/><path d="M96.4 193.1A2.7 2.7 0 0 1 95 198.1 3.6 3.6 0 0 0 96.4 193.1Z" fill="#A87A2E"/><circle cx="95" cy="195.4" r="2.7" fill="none" stroke="#6E4A1C" stroke-width="0.35"/>
        <rect x="93" y="197.6" width="4" height="1.8" rx="0.5" fill="#C29440" stroke="#6E4A1C" stroke-width="0.3"/>
        <path d="M93.3 199.4L91.4 210.8Q95 212.6 98.6 210.8L96.7 199.4Z" fill="#D9AE52"/><path d="M95.9 199.4L97.2 211.4Q98 211.2 98.6 210.8L96.7 199.4Z" fill="#A87A2E"/>
        <path d="M93.3 199.4L91.4 210.8Q95 212.6 98.6 210.8L96.7 199.4Z" fill="none" stroke="#6E4A1C" stroke-width="0.35" stroke-linejoin="round"/></g>`, 18),
  },
  moroccan: {
    chain: 123, // its chain of links runs from here up past the top of the window (see drawHang)
    name: 'Brass Moroccan', flame: [340, 398, 0.9], light: [340, 348], dim: 0.6, tassel: [340, 486],
    holder: [404, 6], // the burner cup under the flame: its bottom and half-width; it throws a narrow fan of shadow straight down
    // a hexagonal prism seen face-on (front face ±31.5, side faces out to ±63), under a shoulder flaring out from ±45
    body: { top: 262, bottom: 462, half: y => y < 285 ? 45 + Math.max(0, y - 260) / 25 * 18 : y < 413 ? 63 : y < 428 ? 63 - (y - 413) / 15 * 23
      : y < 434 ? 40 : 38 * (1 - ((y - 434) / 54) ** 2) },
    back: `<defs>${MOROCCAN_DEFS}</defs>${PAPER_GRAD('.55')}
      <g fill="#24160A">${MOROCCAN_SHAPE}</g><g fill="url(#mg)">${MOROCCAN_SHAPE}</g>
      <ellipse id="paperGlow" cx="340" cy="335" rx="72" ry="95" fill="url(#pg)"/>`,
    front: `<circle cx="340" cy="132" r="4" fill="none" stroke="#D9B464" stroke-width="1.8"/>
      <path d="M338.6 136h2.8v20h-2.8Z" fill="#B8893A"/><ellipse cx="340" cy="142" rx="3" ry="2.4" fill="#D9B464"/><ellipse cx="340" cy="149" rx="4.4" ry="3" fill="#B8893A"/><ellipse cx="340" cy="154.5" rx="2.6" ry="1.8" fill="#D9B464"/>
      <path d="M334 399h12l-2 5h-8Z" fill="${BRASS.side}"/><ellipse cx="340" cy="399" rx="6" ry="1.4" fill="${BRASS.lit}"/><path d="M338.8 404h2.4v4h-2.4Z" fill="${BRASS.side}"/>
      <g mask="url(#cutouts)">
        <path d="${BOTTOM}" fill="${BRASS.side}"/><path d="${BOTTOM}" fill="${BRASS.front}" transform="${HALF_X}"/>
        <path d="${DOME}" fill="${BRASS.side}"/><path d="${DOME}" fill="${BRASS.front}" transform="${HALF_X}"/>
        <path d="M295 244h90v16h-90Z" fill="${BRASS.side}"/><path d="M317.5 244h45v16h-45Z" fill="${BRASS.front}"/>
        <path d="${SHOULDER}" fill="${BRASS.side}"/><path d="${SHOULDER_F}" fill="${BRASS.front}"/>
        <path d="M277 290h126v118h-126Z" fill="${BRASS.side}"/><path d="M308.5 290h63v118h-63Z" fill="${BRASS.front}"/>
      </g>
      <g fill="none" stroke-linejoin="round">
        <path d="${DOME}" stroke="${BRASS.rim}" stroke-width="2"/><path d="${DOME}" stroke="${BRASS.lit}" stroke-width="2.6" transform="${HALF_X}"/>
        <path d="M317.5 244v16M362.5 244v16" stroke="${BRASS.lit}" stroke-width="1.6"/>
        <path d="${BOTTOM}" stroke="${BRASS.rim}" stroke-width="1.6"/><path d="${BOTTOM}" stroke="${BRASS.lit}" stroke-width="2" transform="${HALF_X}"/>
        <path d="M317.5 260L308.5 285M362.5 260L371.5 285M295 260L277 285M385 260L403 285" stroke="${BRASS.lit}" stroke-width="1.6"/>
        <path d="M312.5 293.5h55v111h-55ZM280.5 293.5h25v111h-25ZM374.5 293.5h25v111h-25Z" stroke="${BRASS.rim}" stroke-width="1.2"/>
      </g>
      <path d="M306.5 290h4v118h-4Z" fill="${BRASS.lit}"/><path d="M369.5 290h4v118h-4Z" fill="${BRASS.lit}"/><path d="M275.5 290h3v118h-3ZM401.5 290h3v118h-3Z" fill="${BRASS.rim}"/>
      ${ROPE(285)}${ROPE(408)}
      <g mask="url(#cutouts)"><path d="${SKIRT}" fill="${BRASS.side}"/><path d="${SKIRT_F}" fill="${BRASS.front}"/></g>
      <path d="M308.5 413L320 428M371.5 413L360 428" stroke="${BRASS.lit}" stroke-width="1.4"/>
      <path class="band" d="M300 428h80v6h-80Z" fill="${BRASS.side}"/><path d="M320 428h40v6h-40Z" fill="${BRASS.front}"/>
      <path d="M300 428.6h80M300 433.4h80" stroke="${BRASS.lit}" stroke-width="1.2"/>
      <path class="band" d="M295 243.2h90v2.6h-90Z" fill="${BRASS.lit}"/><path class="band" d="M295 258.2h90v2.6h-90Z" fill="${BRASS.lit}"/>
      <g id="tassel"><path d="M338.8 485h2.4v4h-2.4Z" fill="${BRASS.side}"/><ellipse cx="340" cy="492" rx="3.6" ry="3" fill="${BRASS.lit}"/>
        <ellipse cx="340" cy="498" rx="2.4" ry="2" fill="${BRASS.side}"/><path d="M338 500L340 510L342 500Z" fill="${BRASS.lit}"/></g>`,
  },
};
// The bookmark's colours, picked in the settings menu (settings.ribbon): front, back and edge.
const RIBBONS = /** @type {Record<string, [string, string, string]>} */ ({
  cerulean: ['#4385B1', '#29567A', '#0D2A44'], madder: ['#A8433A', '#712A25', '#36110E'], ochre: ['#C08A2E', '#82601F', '#3B280A'],
  moss: ['#6E8B3F', '#4A5E29', '#1E2A0E'], plum: ['#7E4B8C', '#55325F', '#25132B'], ink: ['#46526E', '#2C344A', '#0F131D'],
});
function paintRibbon(name) {
  if (!RIBBONS[name]) name = 'cerulean';
  RIBBONS[name].forEach((c, i) => document.documentElement.style.setProperty(['--ribbonFront', '--ribbonBack', '--ribbonEdge'][i], c));
  for (const b of $('ribbons')?.children || []) b.setAttribute('aria-pressed', String(/** @type {HTMLElement} */ (b).dataset.name === name));
}
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
    + `<g transform="translate(${fx} ${fy}) scale(${fk}) translate(-340 -${FLAME_BASE})">${FLAME(style.paper)}</g>`
    + style.front;
  drawHang();
  // only a paper lantern has paper to print on and shows session text; elsewhere the toggle stays put but can't be used
  const text = $('textToggle');
  if (text) {
    text.disabled = !style.surface;
    text.parentElement.classList.toggle('unavailable', !style.surface);
    const row = text.parentElement; row.dataset.title ??= row.title; // its own title, while it's usable
    row.title = style.surface ? row.dataset.title : 'Only the paper lanterns show session text';
  }
  const ribbons = $('ribbons'); // likewise the ribbon colours, on lanterns without one
  if (ribbons) {
    for (const b of ribbons.children) /** @type {HTMLButtonElement} */ (b).disabled = !style.ribbon;
    ribbons.parentElement.classList.toggle('unavailable', !style.ribbon);
    const row = ribbons.parentElement; row.dataset.title ??= row.title;
    row.title = style.ribbon ? row.dataset.title : 'Only the barrel has a ribbon';
  }
  for (const m of moths.values()) m.wasLanded = false; // landed moths find new spots on the new lantern
  $('style').value = key;
}

// Somewhere on the lantern's surface: a random height, and a random way round from near the middle to the edge.
// The wing points straight out of the surface; seen from the front its sideways part shrinks toward the middle,
// so moths there show a shorter wing. Returns [x, y, normal]: where it sits and the surface's outward direction there.
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
// An idle session's moth resting on the lantern: a touch of the calling violet (frame.js eases it 0.15 of the way), then
// backlit against the paper. Mostly grey: mix(mix(MOTH_IDLE, MOTH_CALL, 0.15), '#2B2440', 0.45).
const MOTH_RESTING = '#8B7FA2';

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
