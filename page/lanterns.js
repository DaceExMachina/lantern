// The three lanterns, landing spots on them, the warm and cool palettes, and seeded randomness.

// ---- lantern styles -----------------------------------------------------------------------------------------
// Each style is drawn behind and in front of one shared flame. `flame` places the flame's base and sets its size,
// `light` is where the glow and threads come from, `paper` softens the flame as if it's behind paper, and `body`
// is the surface moths land on: its top and bottom, and its half-width at a given height. `caps` (paper lanterns) are
// the solid top and bottom that the light can't pass: their heights and half-width. `dim` turns the room's light down
// for a lantern that holds some back (pierced brass), and `holder` is the burner cup under its flame.
// Its solid horizontal brass is tagged class band: each throws a soft, wide shadow in the room (frame.js).
const FLAME = `<g id="flame"><path id="fHalo" filter="url(#soft)" opacity="0.8"/><path id="fOuter"/><path id="fMid"/><path id="fCore"/>
  <ellipse id="fBase" cx="340" cy="384" rx="10" ry="5" opacity="0.55"/></g><g id="sparks"></g>`;
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
// the Odawara barrel: a straight cylinder on 19 close wires, bowed from the flame's height like its drums
const ODAWARA = SUNKEN(340, _y => 60, Array.from({ length: 20 }, (_, i) => 216 + 229 * i / 19), 1.2, y => 120 * (y - 350) / 1350);
// the chōchin, in its mockup units: round, its wires wider apart and bowing away from the middle, so it sinks in less
const CHOCHIN = SUNKEN(95, y => 52 * Math.sqrt(Math.max(0, 1 - ((y - 122) / 48) ** 2)), [74, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170], 0.35, y => 0.115 * (y - 122));
const STYLES = {
  barrel: {
    name: 'Book-page barrel', flame: [340, 388, 1], light: [340, 350], paper: true, ribbon: [340, 470], caps: [216, 445, 63],
    body: { top: 216, bottom: 445, half: _y => 60 }, // a straight cylinder
    back: `<path d="M340 20 L340 136.6" stroke="#C9B49C" stroke-width="2"/>
    <defs><clipPath id="bodyClip"><path d="${ODAWARA.outline}"/></clipPath></defs>
    <path id="paperShape" d="${ODAWARA.outline}" fill="url(#paperShade)"/>
    <rect id="paperGlow" x="270" y="200" width="140" height="260" fill="url(#paperGrad)" clip-path="url(#bodyClip)"/>
    <path id="paperTint" d="${ODAWARA.outline}"/>`,
    // built like an Odawara lantern, seen from the flame's height: every horizontal edge (wires, drums) bows up above the
    // flame and down below it. The paper sinks in a little between wires (scalloped edge, a darker band mid-gap).
    front: `<path d="${ODAWARA.outline}" fill="#F2DCC0" opacity="0.2"/>
    <g fill="#A27C58" opacity="0.13" clip-path="url(#bodyClip)">${ODAWARA.bands}</g>
    <g fill="none" stroke="#B48C66" stroke-width="1" opacity="0.75">${ODAWARA.wires}</g>
    <!-- the drums: black lacquer, cel-shaded (a lit side, a dark side, a dark lip where they grip the paper, an ink
         outline), with a narrower step on the outer end; the faces toward the paper catch the flame -->
    <path d="M290 192Q340 180.3 390 192V199Q340 187.81 290 199Z" fill="#3B2A24"/><path d="M362 187.28L369 188.12L376 189.18L383 190.48L390 192L390 199L383 197.54L376 196.31L369 195.29L362 194.49Z" fill="#1F1512"/><path d="M290 192Q340 180.3 390 192V199Q340 187.81 290 199Z" fill="none" stroke="#0E0907" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M277 198Q340 183.81 403 198V218Q340 205.68 277 218Z" fill="#3B2A24"/><path d="M367.72 192.28L376.54 193.29L385.36 194.58L394.18 196.15L403 198L403 218L394.18 216.4L385.36 215.03L376.54 213.91L367.72 213.03Z" fill="#1F1512"/><path d="M277 214.8Q340 202.18 403 214.8V218Q340 205.68 277 218Z" fill="#140D0B"/><path d="M277 198Q340 183.81 403 198V218Q340 205.68 277 218Z" fill="none" stroke="#0E0907" stroke-width="1.2" stroke-linejoin="round"/><path class="paperLit" d="M280 219.3Q340 207.68 400 219.3" fill="none" stroke="currentColor" stroke-width="1.4"/>
    <!-- the bail: a stiff wire arch pinned to the drum on each side, with a loop on top for the string --><path d="M279.5 208C279.5 166 304 147 340 147C376 147 400.5 166 400.5 208" fill="none" stroke="#1A1410" stroke-width="4.6" stroke-linecap="round"/><path d="M279.5 208C279.5 166 304 147 340 147" fill="none" stroke="#8A847C" stroke-width="2.6"/><path d="M340 147C376 147 400.5 166 400.5 208" fill="none" stroke="#5A544E" stroke-width="2.6"/><path d="M281 196C283 170 304 151.6 330 148.6" fill="none" stroke="#D8D2C8" stroke-width="0.9" stroke-linecap="round"/><circle cx="340" cy="141" r="3.4" fill="none" stroke="#1A1410" stroke-width="3.2"/><circle cx="340" cy="141" r="3.4" fill="none" stroke="#8A847C" stroke-width="1.4"/><circle cx="279.5" cy="208" r="2.6" fill="#8A847C" stroke="#1A1410" stroke-width="1"/><circle cx="400.5" cy="208" r="2.6" fill="#5A544E" stroke="#1A1410" stroke-width="1"/>
    <path id="ribbonBack" fill="#641E1E"/><path id="ribbonFront" fill="#9A3430"/><path id="ribbonEdge" fill="none" stroke="#3E1C12" stroke-width="0.8" stroke-linejoin="round"/><!-- the bookmark (see drawRibbon), tied inside the bottom step -->
    <path d="M290 466Q340 474.59 390 466V473Q340 482.11 290 473Z" fill="#3B2A24"/><path d="M362 469.46L369 468.85L376 468.07L383 467.12L390 466L390 473L383 474.19L376 475.19L369 476.02L362 476.67Z" fill="#1F1512"/><path d="M290 466Q340 474.59 390 466V473Q340 482.11 290 473Z" fill="none" stroke="#0E0907" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M277 443Q340 451.68 403 443V467Q340 477.92 277 467Z" fill="#3B2A24"/><path d="M367.72 446.5L376.54 445.88L385.36 445.09L394.18 444.13L403 443L403 467L394.18 468.42L385.36 469.63L376.54 470.62L367.72 471.4Z" fill="#1F1512"/><path d="M277 443Q340 451.68 403 443V446.2Q340 455.18 277 446.2Z" fill="#140D0B"/><path d="M277 443Q340 451.68 403 443V467Q340 477.92 277 467Z" fill="none" stroke="#0E0907" stroke-width="1.2" stroke-linejoin="round"/><path class="paperLit" d="M280 441.7Q340 449.85 400 441.7" fill="none" stroke="currentColor" stroke-width="1.4"/>`,
  },
  chochin: {
    name: 'Round chōchin', flame: [340, 379, 0.95], light: [340, 336], paper: true, tassel: [95, 178.5], caps: [218, 441, 46], // pivot in the drawing's own units
    body: { top: 240, bottom: 422, half: y => 124.8 * Math.sqrt(Math.max(0, 1 - ((y - 330.8) / 115.2) ** 2)) }, // centred on the glow rings (y 330)
    // the caps' faces that turn toward the paper catch the flame (class paperLit, coloured each frame), drawn behind it
    back: MOCK(`${PAPER_GRAD('.6')}<path d="M95 -7.5V57.6" stroke="#C9B49C" stroke-width="0.8"/>
      <ellipse class="paperLit" cx="95" cy="74" rx="18.6" ry="2" fill="currentColor"/><ellipse class="paperLit" cx="95" cy="168" rx="18.6" ry="2" fill="currentColor"/>
      <defs><clipPath id="bodyClip"><path d="${CHOCHIN.outline}"/></clipPath></defs><path d="${CHOCHIN.outline}" fill="#F3ECE2"/><path id="paperGlow" d="${CHOCHIN.outline}" fill="url(#pg)"/>
      <path id="paperTint" d="${CHOCHIN.outline}"/>`, 18),
    front: MOCK(`<path d="${CHOCHIN.outline}" fill="#F3ECE2" opacity="0.22"/>
      <g fill="#A8967E" opacity="0.08" clip-path="url(#bodyClip)">${CHOCHIN.bands}</g><!-- the paper sinks in a little between wires -->
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
