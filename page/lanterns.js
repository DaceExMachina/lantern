// The lanterns (three that hang and a candle that stands), landing spots on them, the warm and cool palettes, and seeded
// randomness.

// ---- lantern styles -----------------------------------------------------------------------------------------
// Each style is drawn behind and in front of one shared flame. `flame` places the flame's base and sets its size,
// `light` is where the glow and threads come from, `paper` softens the flame as if it's behind paper, and `body`
// is the surface moths land on: its top and bottom, and its half-width at a given height. `caps` (paper lanterns) are
// the solid top and bottom that the light can't pass: their heights and half-width. `dim` turns the room's light down
// for a lantern that holds some back (pierced brass). `holder` is the edge below its flame that bounds its light (a
// burner cup, a candle's rim), as a height and a half-width. `flameWind` is how far the wind leans its flame (none if absent). `stands` is a lantern on its own foot, which doesn't sway
// and has nothing to hang from; it's the band its stand fills below it, a half-width and the top, from there to the
// window's bottom, which the background's wisps and ghosts keep out of (stale.js). `shadeFromHolder` shades below from the holder's corners instead, as the live flame's base and tip see them (background.js rimShade).
// `scorches` puts its bare flame in moths' reach, so a moth whose session has failing PR checks gets scorched (frame.js).
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
// The Moroccan: polished brass, pierced edge to edge with arabesque lace. Its lace and openings are one mask (#cutouts):
// each panel is cut out whole, then a tile of scrolling brass lace is laid back over it, squeezed sideways on the faces
// that turn away. Its flat faces and onion gores are lit by the angle they face (FLAT, GORES); the small round brass (chain,
// finial, burner cup, tassel) by a warm highlight band shared by three gradients (class sheen, in the lantern's own units,
// given as [x, colour]), which swingLantern slides with the lantern's twist (frame.js).
const SHEEN = (id, stops) => `<linearGradient id="${id}" class="sheen" gradientUnits="userSpaceOnUse" x1="270" x2="410">${
  stops.map(([x, c]) => `<stop offset="${((x - 270) / 140).toFixed(3)}" stop-color="${c}"/>`).join('')}</linearGradient>`;
// The straight and sloping parts (body, frieze, rope and neck bands, shoulder, skirt) are flat polished brass: each face is
// one flat tone from this ramp (dark to lit), chosen by how squarely it faces the light (frame.js), so the shine steps from
// face to face as the lantern twists. The onion dome and drop keep their leaning gradients.
const FACET_TONES = ['#2E1E0A', '#4A3213', '#6C4E1F', '#8A6A32', '#A1844B']; // blended smoothly between steps
// the lighting's fake twist (frame.js): its strength, 0 to freeze it (?twist=, default 3)
let twistGain = Q.has('twist') ? +(Q.get('twist') || 0) : 3;
// the dev panel's flame (dev.js): hold it at a brightness, 0 (idle ember) to 1 (five sessions working), whatever is running,
// and force its colour warm or violet, whatever the sessions say (frame.js)
let fakeFlame = devSlider('Flame', 'flame', 'intensity', 0, 1, 0.05, null, 'Hold the flame at a brightness, from an idle ember to five sessions working, whatever your sessions are doing. Double-click to go back to live', v => { fakeFlame = v; });
let fakeLamp = devSelect('Flame', 'lamp', 'state', ['live', 'warm', 'violet'], 'live', 'Show the lantern warm or violet (a session needs you), whatever your sessions say', v => { fakeLamp = v; });
// the lantern's swing (frame.js): its period in seconds, how damped it is (a ratio, lower rocks longer), how many seconds it
// takes to forget a push the wind holds, and how hard the wind's changes push it; and how many seconds a gust of the
// scene's wind lasts on average (?period=, ?damping=, ?forget=, ?gain=, ?gust=)
const SWAY = { period: 3.8, damping: 0.15, forget: 1.4, gain: 1.45, gust: 3.5 };
const sway = Object.fromEntries(Object.entries(SWAY).map(([k, d]) => [k, Q.has(k) ? +(Q.get(k) || d) : d]));
// how far the wind leans a flame (style.flameWind, frame.js windLean): the candle's in the open, the Moroccan's
// enclosed at about a third of it (?candlewind=, ?moroccanwind=)
// the smoke's plumes (frame.js plumes, background.js plume): how big, how many seconds each bit lasts, and how dense
// (?plumesize=, ?plumelife=, ?plumealpha=)
const PLUME = Object.fromEntries(Object.entries({ size: 1, life: 6, alpha: 0.5 }).map(([k, d]) => [k, Q.has('plume' + k) ? +(Q.get('plume' + k) || d) : d]));
const FLAME_WIND = Object.fromEntries(Object.entries({ candle: 6, moroccan: 2 }).map(([k, d]) => [k, Q.has(k + 'wind') ? +(Q.get(k + 'wind') || d) : d]));
const SHEENS = SHEEN('brassF', [[270, '#281B0A'], [296, '#493313'], [312, '#6C4E1F'], [318, '#896A32'], [325, '#A1844B'], [332, '#896A32'], [340, '#735222'], [356, '#6E4A1A'], [372, '#5A3A14'], [392, '#45290E'], [410, '#3A2410']])
  + SHEEN('brassS', [[270, '#211608'], [284, '#463114'], [292, '#5A431C'], [302, '#3E2B10'], [318, '#5A401C'], [325, '#7D6232'], [332, '#5A401C'], [360, '#4A3010'], [380, '#3E260C'], [410, '#3A2410']])
  + SHEEN('brassE', [[270, '#5A4121'], [310, '#7D6332'], [318, '#90753E'], [324, '#A9915E'], [326, '#B29C6A'], [328, '#A9915E'], [334, '#90753E'], [350, '#7B6232'], [372, '#7A5620'], [400, '#5A3A14'], [410, '#4A2E10']]);
// The onions' gores (left, front, right), each flat across and curved top to bottom: frame.js gives each stop of a gore's
// gradient the tone of a flat face at that gore's angle, tilted as its profile is there, so the whole gore brightens and
// dims with the twist. `profile` is how far the surface tilts up (degrees) at points from the base (0) to the tip (1): the
// dome's bulge turning up to the light above its widest point and steepening again into the tip, the drop turning ever
// further down. `left` and `right` are the side gores' halves of the outline; the front gore covers the middle.
const GORES = { dome: { base: 244, tip: 154, profile: [[0, -25], [0.13, 0], [0.36, 30], [0.51, 45], [0.67, 22], [0.82, -5], [1, -35]],
    left: 'M340 154L340 244L294 244C292.1 227 296.8 212 313.7 198C330.6 184 338.1 174 340 154Z', right: 'M340 154C341.9 174 349.4 184 366.3 198C383.2 212 387.9 227 386 244L340 244Z' },
  bottom: { base: 434, tip: 486, profile: [[0, 0], [0.2, -30], [0.5, -60], [0.75, -60], [1, -45]],
    left: 'M302 434C301 452 314 462 326 470C334 475 338 480 340 486L340 434Z', right: 'M340 486C342 480 346 475 354 470C366 462 379 452 378 434L340 434Z' } };
const GORE = (id, angle, part) => `<linearGradient id="${id}" class="gore" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${part.base}" y2="${part.tip}"
  data-angle="${angle}">${part.profile.map(([o, e]) => `<stop offset="${o}" data-tilt="${e}"/>`).join('')}</linearGradient>`;
const GORE_DEFS = Object.entries(GORES).map(([k, g]) => GORE(`gore-${k}-F`, 0, g) + GORE(`gore-${k}-L`, -60, g) + GORE(`gore-${k}-R`, 60, g)).join('');
// an onion: its two side gores and its front gore (squeezed to half width, as the front segment of a six-sided shape is)
const ONION_FILL = (k, d) => `<path d="${GORES[k].left}" fill="url(#gore-${k}-L)"/><path d="${GORES[k].right}" fill="url(#gore-${k}-R)"/><path d="${d}" fill="url(#gore-${k}-F)" transform="${HALF_X}"/>`;
const BRASS = { front: 'url(#brassF)', side: 'url(#brassS)', lit: 'url(#brassE)', rim: 'url(#brassS)' };
// a six-sided onion dome rising to the finial, sitting just proud of the frieze
const DOME = 'M340 154C341.9 174 349.4 184 366.3 198C383.2 212 387.9 227 386 244L294 244C292.1 227 296.8 212 313.7 198C330.6 184 338.1 174 340 154Z';
// underneath, a smaller inverted dome ending in a drop, so the lamp reads as hanging (and still top-heavy)
const BOTTOM = 'M302 434C301 452 314 462 326 470C334 475 338 480 340 486C342 480 346 475 354 470C366 462 379 452 378 434Z';
// between the body and that: a short pierced skirt sloping in and a neck band, shorter and simpler than the shoulder and frieze up
// top. The whole lower part lets light through; only the burner cup under the flame shades the floor.
const SKIRT = 'M277 413H403L380 428H300Z', SKIRT_F = 'M308.5 413H371.5L360 428H320Z';
// a straight hexagonal panel `h` tall from y, `half` wide either side with its front face `front` either side; a `band`
// one is also a solid band that throws a shadow (class band)
// one `lift` lighter (or darker, below 0), as its edges are
const PANEL = (half, front, y, h, band = false, lift = 0) => {
  const r = (x0, x1, more) => `<path ${more} d="M${x0} ${y}H${x1}v${h}H${x0}Z"/>`;
  return (band ? r(340 - half, 340 + half, 'class="band" fill="none"') : '')
    + r(340 - half, 340 - front, FLAT(-60, lift)) + r(340 - front, 340 + front, FLAT(0, lift)) + r(340 + front, 340 + half, FLAT(60, lift));
};
// A flat part's paint: one tone by the angle round the lantern it faces and its `lift` (frame.js shades every [data-facet]
// each frame). A sloping face (shoulder, skirt) also tilts up (or down, below 0) by `tilt` degrees.
const FLAT = (angle, lift = 0, paint = 'fill', tilt = 0) => `data-facet="${angle}" data-lift="${lift}" data-paint="${paint}"${tilt ? ` data-tilt="${tilt}"` : ''}`;
// The shoulder and skirt are flat-faced too (only the onion dome and drop are round): three sloping faces each, tilted up 36
// degrees and down 57, and their corner edges. `faces` are [path, angle]; strokes are their corner edges, a little lit.
const SLOPED = (faces, tilt, paint = 'fill') => faces.map(([d, a]) => `<path d="${d}" ${FLAT(a, paint === 'stroke' ? 0.15 : 0, paint, tilt)}/>`).join('');
const HALF_X = 'translate(340 0) scale(.5 1) translate(-340 0)'; // the front segment of a six-sided shape spans half its width
const SHOULDER = 'M295 260H385L403 285H277Z', SHOULDER_F = 'M317.5 260H362.5L371.5 285H308.5Z';
const MOROCCAN_SHAPE = `<path d="${DOME}"/><path d="${BOTTOM}"/><path d="M295 244h90v16h-90Z${SHOULDER}M277 285h126v128h-126Z${SKIRT}M300 428h80v6h-80Z"/>`;
// A regular hexagon's side faces turn 60 degrees away, so their lace shows at half width (squeeze); a slanted one (on the
// shoulder and skirt) is also sheared along its slope, `shear` units across per unit down, about height y0.
const LACE = (clip, squeeze = 1, k = 1, shear = 0, y0 = 0) => `<g clip-path="url(#${clip})"><rect x="200" y="100" width="280" height="420"/>
  <rect x="0" y="0" width="680" height="800" fill="url(#lace)" transform="matrix(1 0 ${shear} 1 ${-shear * y0} 0) translate(340 0) scale(${squeeze * k} ${k}) translate(-340 0)"/></g>`;
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
  return `${PANEL(half, front, y, 5, true)}<path d="${twist}" stroke="#4A3A16" stroke-width="1"/>`;
};
const LACE_TILE = (id, stroke) => `<pattern id="${id}" width="10" height="12" patternUnits="userSpaceOnUse" x="0" y="2"><g fill="none" stroke="${stroke}" stroke-width="1.3">
    <path d="M0 0C0 3 5 3 5 6C5 9 10 9 10 12M10 0C10 3 5 3 5 6C5 9 0 9 0 12"/><circle cx="0" cy="6" r="1.3"/><circle cx="10" cy="6" r="1.3"/>
    <path d="M5 -1.8Q6.3 0 5 1.8Q3.7 0 5 -1.8ZM5 10.2Q6.3 12 5 13.8Q3.7 12 5 10.2Z"/><path d="M2.2 6Q3.4 4.6 2.6 3.4M7.8 6Q6.6 7.4 7.4 8.6"/></g></pattern>`;
// The room reflected as a darker band across the body's middle, held level with the window (#horizon, frame.js), and the
// flame's warm bounce on the lace nearest it (#bounce, class paperLit, so lightPaper colours and flickers it).
const MOROCCAN_LIGHT_DEFS = `<linearGradient id="horizon" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="290" y2="408">
    <stop offset="0" stop-color="#FFE0A0" stop-opacity=".04"/><stop offset=".38" stop-color="#140A02" stop-opacity=".2"/><stop offset=".5" stop-color="#140A02" stop-opacity=".25"/>
    <stop offset=".62" stop-color="#140A02" stop-opacity=".2"/><stop offset="1" stop-color="#FFE0A0" stop-opacity=".04"/></linearGradient>
  <radialGradient id="bounce" class="paperLit" gradientUnits="userSpaceOnUse" cx="340" cy="372" r="64"><stop offset="0" stop-color="currentColor" stop-opacity=".55"/>
    <stop offset=".6" stop-color="currentColor" stop-opacity=".2"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient>`;
// where each part's lace sits: inset from its edges, the side faces' own clips separate from the front ones
const LACE_CLIPS = `  <clipPath id="domeSide"><path d="${DOME}" transform="translate(340 244) scale(.9 .88) translate(-340 -244)"/></clipPath>
  <clipPath id="domeFront"><path d="${DOME}" transform="translate(340 244) scale(.4 .88) translate(-340 -244)"/></clipPath>
  <clipPath id="bottomSide"><path d="${BOTTOM}" transform="translate(340 434) scale(.88 .8) translate(-340 -434)"/></clipPath>
  <clipPath id="bottomFront"><path d="${BOTTOM}" transform="translate(340 434) scale(.4 .8) translate(-340 -434)"/></clipPath>
  <clipPath id="skirtL"><path d="M281 416H307L317 425H302Z"/></clipPath><clipPath id="skirtR"><path d="M399 416H373L363 425H378Z"/></clipPath>
  <clipPath id="skirtF"><path d="M312 416H368L358 425H322Z"/></clipPath>
  <clipPath id="shoulderL"><path d="M298 263L315 263L308 282L282 282Z"/></clipPath><clipPath id="shoulderR"><path d="M382 263L365 263L372 282L398 282Z"/></clipPath>
  <clipPath id="shoulderF"><path d="M320 263L360 263L367 282L313 282Z"/></clipPath>
  <clipPath id="faceL"><path d="M281 294h24v110h-24Z"/></clipPath><clipPath id="faceR"><path d="M375 294h24v110h-24Z"/></clipPath><clipPath id="faceF"><path d="M313 294h54v110h-54Z"/></clipPath>`;
// The pierced design as a mask (white keeps brass): each lace panel cut out whole and its lace laid back, and the frieze's
// windows; `k` scales the lace and windows (the far wall's, further away).
const CUTOUTS = (id, k = 1) => `<mask id="${id}" maskUnits="userSpaceOnUse" x="260" y="120" width="160" height="380"><rect x="260" y="120" width="160" height="380" fill="#fff"/>
    ${LACE('domeSide', 0.55, 0.7 * k)}${LACE('domeFront', 1, 0.7 * k)}
    <path d="M299 248h6v8h-6ZM308 248h6v8h-6ZM323 248h9v8h-9ZM335.5 248h9v8h-9ZM348 248h9v8h-9ZM366 248h6v8h-6ZM375 248h6v8h-6Z" transform="translate(340 252) scale(${k}) translate(-340 -252)"/>
    ${LACE('shoulderL', 0.5, 0.8 * k, -0.54, 272.5)}${LACE('shoulderR', 0.5, 0.8 * k, 0.54, 272.5)}${LACE('shoulderF', 1, 0.8 * k)}
    ${LACE('faceL', 0.5, k)}${LACE('faceR', 0.5, k)}${LACE('faceF', 1, k)}${LACE('skirtL', 0.5, 0.8 * k, 1.15, 420.5)}${LACE('skirtR', 0.5, 0.8 * k, -1.15, 420.5)}${LACE('skirtF', 1, 0.8 * k)}
    ${LACE('bottomSide', 0.55, 0.7 * k)}${LACE('bottomFront', 1, 0.7 * k)}</mask>`;
// The far wall, drawn by the background's WebGL under the SVG (background.js drawFarWall), baked here once into a
// texture: red its brass, the same pierced design part for part (the same cutouts: windows under the frieze, lace elsewhere,
// side faces foreshortened) at 0.92 scale for distance, green the lantern's outline it stays inside. 4 texels a unit.
const FAR_WALL_SVG = (fill, k) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="250 140 180 360" width="720" height="1440">
  <defs>${LACE_TILE('lace', '#fff')}${LACE_CLIPS}${CUTOUTS('cutouts', k)}</defs><g fill="${fill}"${k ? ' mask="url(#cutouts)"' : ''}>${MOROCCAN_SHAPE}</g></svg>`);
function bakeFarWall() {
  if (!style.farWall || farWallTex) return;
  const c = document.createElement('canvas'), g = c.getContext('2d'), brass = new Image(), outline = new Image();
  c.width = 720; c.height = 1440;
  let n = 0;
  brass.onload = outline.onload = () => {
    if (++n < 2 || !g) return;
    g.drawImage(brass, 0, 0); g.globalCompositeOperation = 'lighter'; g.drawImage(outline, 0, 0);
    setFarWall(c);
  };
  brass.src = FAR_WALL_SVG('#f00', 0.92); outline.src = FAR_WALL_SVG('#0f0', 0);
}
const MOROCCAN_DEFS = `${SHEENS}${GORE_DEFS}${MOROCCAN_LIGHT_DEFS}${LACE_TILE('lace', '#fff')}
${LACE_CLIPS}${CUTOUTS('cutouts')}`;
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
// A string's hash, for seeding.
const hash = str => [...String(str)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
// Random-looking numbers that every window agrees on: seeded from a session's id, so the lantern in the toolbelt,
// the Dock app and the screensaver all put a moth in the same place, and the candle's vine grows the same (mulberry32).
const seeded = seed => () => {
  let t = seed = (seed + 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
// The pillar candle is an ivory pillar on a bronze altar candlestick wound with a grapevine. It stands on its own foot
// instead of hanging (style.stands), and is drawn seen from its light's height by the barrel's rule. An edge d below
// that sags d / 1350 of its half-width at the front, so the rim, just under the flame, is edge-on and the drip pan and
// foot are seen from above. The pillar's numbers place the flame, the light, the shade and the wax moths land on: its
// middle, half-width, crown (the rim, at its mean height), bottom (hidden in the pan, 200 below the rim), the pan's rim,
// and the eye.
const PILLAR = { cx: 340, r: 50, rim: 275 };
PILLAR.bottom = PILLAR.rim + 200;
PILLAR.dish = PILLAR.rim + 186;
PILLAR.eye = PILLAR.rim - 18; // the flame's core: where the light comes from, and the drawing's eye height
PILLAR.flame = [PILLAR.cx, PILLAR.rim - 2, 0.8]; // the shared flame, standing on the crown
// Moths land clear of the bare flame. At full size and stretched tallest by its wobble (96 by 1.08, drawFlame), the outer
// tongue dips 0.04 of its height below its base (flamePath's bottom curve), in the flame's own units.
const FLAME_DIP = 0.04 * 96 * 1.08;
// How far a landed moth's wings reach from its perch on screen. The wing point furthest from the joint, at r, swells with
// perspective to at most r·EYE/√(EYE² − r²) (wing3d), at the largest moth.
const MOTH_REACH = (r => r * EYE / Math.sqrt(EYE * EYE - r * r))(Math.max(...[...WING_UP, ...WING_SIDE].map(([x, y]) => Math.hypot(x, y))))
  * Math.max(...Object.values(SIZE));
const FLAME_CLEARANCE = 10; // the gap kept between a landed moth's wings and the flame at its fullest
const HOP = 16; // how high a restless landed moth hops off its spot (mothTarget)
// Landing spots run from 0.5 - PERCH_SPREAD to 0.5 + PERCH_SPREAD of the way down a body (pickPerch); perchTop is the
// top a body ending at `bottom` needs for its highest spot to sit at `y`.
const PERCH_SPREAD = 0.44;
function perchTop(y, bottom) { return (y - (0.5 - PERCH_SPREAD) * bottom) / (0.5 + PERCH_SPREAD); }
LACQUER.candle = { cx: PILLAR.cx, bow: y => 2 * (y - PILLAR.eye) / 1350, side: 0.44, lit: '#5C3520', dark: '#36190B', ink: '#140903', line: 1.2,
  lip: [0, '#140903'], rim: [0, 0, 0] }; // the candlestick's carved dark wood (its brass fittings are CANDLE's BRASS)
// The marble pedestal the candlestick stands on is a round slab, `depth` deep with its top at `top`, on a fluted column
// `column` either side of the middle that runs down to the window's bottom edge, its veins and vine fading into it from
// fade[0] to fade[1]. The
// candlestick's foot stands on it, under a stem STEM tall between the pan's neck and the foot's collar.
// The candlestick is drawn in its own units, its pan at `dish`, its stem from the pan's neck at `neck` down to the foot's
// collar at `collar` and its foot on a slab at `slab`, and placed from there (CANDLE's stick).
const DRAWN = { dish: 426, neck: 460, collar: 518, slab: 549 };
const STEM = 41;
const PEDESTAL = { top: PILLAR.dish + (DRAWN.neck - DRAWN.dish) + STEM + (DRAWN.slab - DRAWN.collar), r: 112, depth: 14, column: 85 };
PEDESTAL.fade = [PEDESTAL.top + 41, PEDESTAL.top + 191];
PEDESTAL.split = PEDESTAL.top + 70; // where the vine's trunk, coming up the front of the column, splits into its branches
const CANDLE = (() => {
  const K = LACQUER.candle, cx = PILLAR.cx, n = v => +v.toFixed(2), pt = (/** @type {number[]} */ [x, y]) => `${n(x)} ${n(y)}`;
  // the brass fittings, in the Moroccan's brass tones (its SHEENs), flat and cel-shaded, with a crisp highlight GILT
  const BRASS_K = { ...K, lit: '#90753E', dark: '#5A401C', ink: '#2A1A08' }, GILT = '#B29C6A';
  const sag = (y, h) => h * K.bow(y) / 2; // how far down an edge `h` wide either side dips at its front
  // The candlestick placed from its drawn units (DRAWN): the pan and all on it under the pillar, the foot and all on it on
  // the pedestal, and the stem between, scaled about the middle to STEM tall, so a part keeps its shape.
  const k = STEM / (DRAWN.collar - DRAWN.neck);
  const stick = (/** @type {number[]} */ [x, y]) => /** @type {[number, number]} */ (y <= DRAWN.neck ? [x, y + PILLAR.dish - DRAWN.dish]
    : y >= DRAWN.collar ? [x, y + PEDESTAL.top - DRAWN.slab] : [cx + (x - cx) * k, PILLAR.dish + DRAWN.neck - DRAWN.dish + (y - DRAWN.neck) * k]);
  const Y = y => stick([cx, y])[1];
  const on = d => d.replace(/(-?[\d.]+) (-?[\d.]+)/g, (_, x, y) => pt(stick([+x, +y]))); // a path of x y pairs, placed
  const WAX = ['#EADBC0', '#CDB894'], DRIP = { lit: ['#F2E6CF', '#CDB690'], dark: ['#D9C6A2', '#B9A27C'] }; // lit, dark side
  // a turned bronze part from its profile, [y, half-width] top to bottom. It closes with its bottom edge's front arc and
  // its top edge's back arc (seen from above), or with `bowl` its top edge's front arc, as a pan's bowl hangs under its rim;
  // flat lit, darker from K.side of the way out, in an ink outline: wood (`kit` K) with a hint of grain down it, brass with a
  // crisp highlight down its lit side
  const turned = (id, prof, bowl = false, kit = K) => {
    const [y0, h0] = prof[0], [y1, h1] = prof[prof.length - 1];
    const d = `M${prof.map(([y, h]) => pt([cx - h, y])).join('L')}Q${cx} ${n(y1 + 2 * sag(y1, h1))} ${n(cx + h1)} ${n(y1)}`
      + `L${[...prof].reverse().map(([y, h]) => pt([cx + h, y])).join('L')}Q${cx} ${n(y0 + (bowl ? 2 : -2) * sag(y0, h0))} ${n(cx - h0)} ${n(y0)}Z`;
    const edge = prof.map(([y, h]) => pt([cx + K.side * h, y + sag(y, h) * (1 - K.side ** 2)]));
    const down = f => `M${prof.map(([y, h]) => pt([cx + f * h, y + sag(y, h) * (1 - f * f)])).join('L')}`; // a line down it, f of the way out
    const lines = kit === K ? `<path d="${down(-0.62)}${down(-0.3)}${down(0.12)}" fill="none" stroke="#3E2010" stroke-width=".6" opacity=".7" clip-path="url(#${id})"/>`
      : `<path d="${down(-0.6)}" fill="none" stroke="${GILT}" stroke-width="1.1" stroke-linecap="round" clip-path="url(#${id})"/>`;
    return `<clipPath id="${id}"><path d="${d}"/></clipPath><path d="${d}" fill="${kit.lit}"/>`
      + `<path d="M${edge.join('L')}L${cx + 100} ${n(y1 + 30)}V${n(y0 - 30)}Z" fill="${kit.dark}" clip-path="url(#${id})"/>`
      + lines + `<path d="${d}" fill="none" stroke="${kit.ink}" stroke-width="${kit.line}" stroke-linejoin="round"/>`;
  };
  const profile = (y0, y1, half, steps = 12) => Array.from({ length: steps + 1 }, (_, i) => { const y = y0 + (y1 - y0) * i / steps; return [y, half(y)]; });
  // gilt beads along an edge's front arc (y, `h` either side), from x0 to x1, nudged `dy` off it
  const beads = (y, h, x0, x1, count, r, dy) => `<g fill="${GILT}" stroke="${BRASS_K.ink}" stroke-width=".6">${Array.from({ length: count }, (_, i) => {
    const x = x0 + (x1 - x0) * i / (count - 1), f = (x - cx) / h;
    return `<circle cx="${n(x)}" cy="${n(y + sag(y, h) * (1 - f * f) + dy)}" r="${r}"/>`;
  }).join('')}</g>`;
  // a curve through points, rounding each corner between them
  const smooth = ps => `M${pt(ps[0])}${ps.slice(1, -1).map((p, i) => `Q${pt(p)} ${pt([(p[0] + ps[i + 2][0]) / 2, (p[1] + ps[i + 2][1]) / 2])}`).join('')}L${pt(ps[ps.length - 1])}`;
  // the crown's back wall, ragged and melted round at the shoulders; its front wall runs a unit below (the lip)
  // (each point is across the pillar from -1 to 1, and up from the rim)
  const { r: R, rim } = PILLAR, side = cx + K.side * R; // the pillar's half-width and rim, and where its dark side starts
  const CROWN = [[-1, 9.5], [-1, -1], [-0.6, -2.2], [-0.24, -1], [0.24, -0.8], [0.6, -1.6], [1, -1], [1, 20]] // the left starts where smooth() ends the right's curve, so the shoulders mirror
    .map(([u, dy]) => [cx + u * R, rim + dy]);
  const PILLAR_D = `${smooth(CROWN)}V${PILLAR.bottom}H${cx - R}Z`;
  // drips from the crown: [middle, width, where it ends, and where a second bulge sits on the way down], each ending in a
  // bulb 1.3 times its width; the main one runs out of the notch. Each middle is across the pillar from -1 to 1, and the
  // drops are below the rim.
  const DRIPS = [[-0.78, 6, 76], [-0.5, 4.5, 22], [-0.2, 5.5, 48], [0.18, 4, 16], [0.56, 8, 98, 60], [0.8, 5, 56]]
    .map(([u, w, e, bulge]) => [cx + u * R, w, rim + e, ...bulge ? [rim + bulge] : []]);
  const NOTCH = DRIPS[4][0]; // the main drip's middle
  const dripD = (/** @type {number[]} */ [c, w, e, bulge]) => {
    const r = 0.65 * w, y = n(e - r - Math.sqrt(r * r - w * w / 4)), b = n(0.6 * w);
    return `M${n(c - w / 2)} ${rim}V${y}A${n(r)} ${n(r)} 0 1 0 ${n(c + w / 2)} ${y}V${rim}Z` + (bulge ? `M${n(c - b)} ${bulge}a${b} ${b} 0 1 0 ${2 * b} 0a${b} ${b} 0 1 0 ${-2 * b} 0Z` : '');
  };
  const drips = DRIPS.map(d => {
    const [lit, dark] = d[0] > side ? DRIP.dark : DRIP.lit, r = 0.65 * d[1];
    return `<path d="${dripD(d)}" fill="${lit}"/><rect x="${n(d[0] + d[1] / 6)}" y="${rim}" width="${n(r + 1 - d[1] / 6)}" height="${d[2] - rim + 1}" fill="${dark}" clip-path="url(#cdDrips)"/>`;
  }).join('');
  // a purple grape, its lower right in shadow, a pale bloom where the light catches it
  const GRAPE = `<g id="cdGrape"><circle r="5" fill="#5E3470"/><path d="M4.7 -1.71A5 5 0 0 1 -2.5 4.33A8 8 0 0 0 4.7 -1.71Z" fill="#3B1F48"/>
    <circle cx="-1.8" cy="-1.8" r="1.5" fill="#A27DBE"/><circle r="5" fill="none" stroke="#1A0E20" stroke-width=".7"/></g>`;
  const GRAPES = /** @type {number[][]} */ ([]); // every grape drawn, for their glints
  const grapes = ps => ps.map(([x, y]) => (GRAPES.push([n(x), n(y)]), `<use href="#cdGrape" x="${n(x)}" y="${n(y)}"/>`)).join('');
  // the glints on the grapes from the `from`th drawn on, in their order (frame.js drawShine)
  const grapeGlints = from => GRAPES.slice(from).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1" opacity="0"/>`).join('');
  // a hex-packed bunch, in rows of `rows` grapes 9.6 apart, 8.4 down, from (x, y), each row `lean` further over; a row the
  // same parity as the one above shifts half a grape so they nest
  const bunch = (x, y, rows, lean) => {
    let shift = -2.4;
    return rows.flatMap((count, i) => {
      if (i && count % 2 === rows[i - 1] % 2) shift = -shift;
      return Array.from({ length: count }, (_, j) => [x + lean * i + shift + 9.6 * (j - (count - 1) / 2), y + 8.4 * i]);
    });
  };
  // a vine leaf of five pointed lobes, the middle longest: stem at (x, y), `w` across, pointing `deg` from straight up;
  // lit on its left half, three veins from the stem to the main tips
  const EDGE = [[[0.3, -0.02], [0.5, -0.22]], [[0.3, -0.26], [0.22, -0.36]], [[0.4, -0.44], [0.44, -0.66]], [[0.26, -0.62], [0.14, -0.66]], [[0.14, -0.86], [0, -1]]];
  const leaf = (x, y, w, deg) => {
    const a = deg * Math.PI / 180, at = ([u, v]) => pt([x + w * (u * Math.cos(a) - v * Math.sin(a)), y + w * (u * Math.sin(a) + v * Math.cos(a))]);
    const half = side => `M${at([0, 0])}${EDGE.map(([c, p]) => `Q${at([side * c[0], c[1]])} ${at([side * p[0], p[1]])}`).join('')}Z`;
    return `<path d="${half(-1)}" fill="#5E6B33"/><path d="${half(1)}" fill="#3D4721"/>`
      + `<path d="M${at([0, 0])}L${at([0, -0.92])}M${at([0, 0])}L${at([0.38, -0.6])}M${at([0, 0])}L${at([-0.38, -0.6])}" fill="none" stroke="#283016" stroke-width=".7"/>`
      + `<path d="${half(-1)}${half(1)}" fill="none" stroke="#1A200D" stroke-width=".8" stroke-linejoin="round"/>`;
  };
  const vine = d => `<path d="${d}" fill="none" stroke="#4A4424" stroke-width="1.6" stroke-linecap="round"/>`; // the holder's, thin
  // the pedestal's old vine, thick, in an ink outline
  const VINE = '#5B5129', VINE_INK = '#1F1A0C';
  const thick = d => `<path d="${d}" fill="none" stroke="${VINE_INK}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<path d="${d}" fill="none" stroke="${VINE}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
  // where the flame glints on the brass while it stands straight: on the pan's rim either side and its
  // pan's bead row (x, y, rx, ry)
  const GLINTS = [[300, 431, 16, 3.2], [376, 431, 10, 2.4], [366, 437, 8, 1.6]]
    .map(([x, y, rx, ry]) => [...stick([x, y]).map(n), rx, ry]);
  const knopEdge = x => n(474 + 11 * Math.sqrt(1 - ((x - cx) / 25) ** 2) - 1);
  // the pedestal, by the candlestick's rule, in cool marble lit from the left, its right side in shade as the wax is
  const P = PEDESTAL, left = cx - P.r, slabY = P.top + P.depth, col = P.column, FOOT = 74; // the foot's half-width
  const MARBLE = { ...K, lit: '#CFC9D8', dark: '#8A8396', ink: '#2A2333' };
  // a colour fading out down the column
  const fade = (id, colour, a = 1) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${P.fade[0]}" y2="${P.fade[1]}">`
    + `<stop offset="0" stop-color="${colour}" stop-opacity="${a}"/><stop offset="1" stop-color="${colour}" stop-opacity="0"/></linearGradient>`;
  // every rim of the pedestal is a true ellipse at the slab top's tilt: its depth is T of its width
  const T = sag(P.top, P.r) / P.r, rimRy = r => n(r * T);
  // the point `th` radians round the column from the front (positive to the right), `R` from its middle, at height y
  const round = (R, th, y) => /** @type {[number, number]} */ ([cx + R * Math.sin(th), y + R * T * Math.cos(th)]);
  // ---- the grapevine: an old woody trunk winding up the column and over the slab, branching out in front of the stone
  // and arcing back, every leaf, tendril and bunch on it. Seeded, so every window grows the same vine.
  const VINE_LIT = '#80733C';
  // a woody limb along `pts`, `ws[i]` wide at each, gnarled by `rand` (knots and thin stretches): filled, inked along its
  // two sides only (so a branch drawn from inside its trunk joins it with no line across), lit along its left. Standing off
  // the stone, it also lays a soft shadow `shadow` below it on the column.
  const limb = (pts, ws, rand, shadow = 0) => {
    let g = 0;
    const L = [], R = [];
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
      g = 0.7 * g + 0.3 * (2 * rand() - 1) + (rand() < 0.05 ? 0.7 : 0); // now and then a knot
      const w = ws[i] * Math.max(0.6, 1 + 0.45 * g) / 2;
      L.push([p[0] + dy / d * w, p[1] - dx / d * w]); R.push([p[0] - dy / d * w, p[1] + dx / d * w]);
    });
    const left = L[0][0] < R[0][0] ? L : R, // the left as it starts, so a longer limb doesn't change it
      d = `M${[...L, ...[...R].reverse()].map(pt).join('L')}Z`;
    return (shadow ? `<path d="${d}" fill="#241C30" opacity=".22" transform="translate(${n(shadow * 0.3)} ${n(shadow)})" clip-path="url(#cdColClip)"/>` : '')
      + `<path d="${d}" fill="${VINE}"/><path d="M${L.map(pt).join('L')}M${R.map(pt).join('L')}" fill="none" stroke="${VINE_INK}" stroke-width=".9" stroke-linejoin="round" stroke-linecap="round"/>`
      + (pts.length > 2 ? `<path d="M${left.slice(1, -1).map(pt).join('L')}" fill="none" stroke="${VINE_LIT}" stroke-width=".7" stroke-linecap="round"/>` : '');
  };
  // a shoot from `p`, `steps` steps of `len` heading `a` (radians, y down), turning by `curl` a step and more as it goes
  // (`tighten`), kinked a little by `rand`: its points, start included
  const shoot = (p, a, steps, len, curl, tighten, rand) => {
    const pts = [p];
    for (let i = 0; i < steps; i++) {
      a += curl * (1 + tighten * i) + (rand() - 0.5) * 0.35;
      const [x, y] = pts[pts.length - 1];
      pts.push([x + Math.cos(a) * len, y + Math.sin(a) * len]);
    }
    return { pts, a };
  };
  // something that flutters in the wind about `p` (frame.js drawLeaves), `k` as much as a mid-sized leaf
  const flutter = (p, k, svg) => `<g class="cdLeaf" data-at="${pt(p)}" data-k="${n(k)}">${svg}</g>`;
  // a curling tendril from `p`, heading `a`, coiling `side` (1 or -1)
  const tendril = (p, a, side, rand) => flutter(p, 0.4, `<path d="M${shoot(p, a, 14, 2.2, side * 0.18, 0.12, rand).pts.map(pt).join('L')}" fill="none" stroke="${VINE}" stroke-width=".9" stroke-linecap="round"/>`);
  // a grape leaf on a stalk from `p`, `w` across, pointing `deg` from straight up
  const leafOn = (p, w, deg) => {
    const a = deg * Math.PI / 180, q = [p[0] + Math.sin(a) * w * 0.25, p[1] - Math.cos(a) * w * 0.25];
    return flutter(p, 20 / w, `<path d="M${pt(p)}L${pt(q)}" fill="none" stroke="${VINE}" stroke-width="1.2" stroke-linecap="round"/>${leaf(q[0], q[1], w, deg)}`); // smaller leaves more
  };
  // a tapering bunch hanging (or lying) from its stalk at `p`, its axis `deg` from straight down, rows of grapes from the
  // stalk out; `put` draws the grapes (grapes() for those with glints, or plain uses on the column, which is redrawn)
  const cluster = (p, deg, rows, put) => {
    const a = deg * Math.PI / 180, top = [p[0] - Math.sin(a) * 9, p[1] + Math.cos(a) * 9];
    const ps = bunch(0, 0, rows, 0).map(([x, y]) => [top[0] + x * Math.cos(a) - y * Math.sin(a), top[1] + x * Math.sin(a) + y * Math.cos(a)]);
    return `<path d="M${pt(p)}Q${pt([p[0] + 3, (p[1] + top[1]) / 2])} ${pt(top)}" fill="none" stroke="${VINE_INK}" stroke-width="2.2" stroke-linecap="round"/>`
      + `<path d="M${pt(p)}Q${pt([p[0] + 3, (p[1] + top[1]) / 2])} ${pt(top)}" fill="none" stroke="${VINE}" stroke-width="1.3" stroke-linecap="round"/>`
      + put(ps.sort((u, v) => u[1] - v[1]));
  };
  const useGrapes = ps => ps.map(([x, y]) => `<use href="#cdGrape" x="${n(x)}" y="${n(y)}"/>`).join('');
  // what grows off a shoot's end: a leaf, a tendril, or now and then a bunch
  const tip = (end, a, rand, put) => {
    const k = rand();
    return k < 0.45 ? leafOn(end, 15 + 10 * rand(), a * 180 / Math.PI + 90 + (rand() - 0.5) * 50)
      : k < 0.8 ? tendril(end, a, rand() < 0.5 ? 1 : -1, rand) : cluster(end, (rand() - 0.5) * 30, [3, 3, 2, 2, 1], put);
  };
  const climbEnd = -1.25, climbTop = P.fade[0] + 6, climbR = col + 2; // where the trunk leaves the column for the slab
  const climbAt = round(climbR, climbEnd, climbTop);
  // points along a quadratic curve from a (excluded) by c to b
  const quad = (a, c, b, k = 8) => Array.from({ length: k }, (_, i) => { const t = (i + 1) / k, u = 1 - t; return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]; });
  // The vine is laid out from the split (PEDESTAL.split) up in fixed places, the same at every window size: there the
  // trunk divides into a limb up to the slab (on over it to the foot), one round the column and behind it, and two that arc
  // out in front of the stone and curl back, with leaves, tendrils and a bunch. Only the trunk below the split depends on
  // the window: it runs down the front of the column from the split, drawn top-down, so a taller window adds trunk below.
  const SPLIT = [cx - 8, P.split];
  const vineTop = (() => {
    const rand = seeded(hash('candle:vine:top')), twigs = [];
    // a limb from the split, flared where it leaves the trunk, `w0` to `w1` wide
    const branch = (pts, w0, w1, shadow = 6) => limb(pts, pts.map((_, j) => w1 + (w0 - w1) * (1 - j / (pts.length - 1)) + Math.max(0, 3 - j) * 1.4), rand, shadow);
    const up = [SPLIT, ...quad(SPLIT, [cx - 64, P.split - 2], climbAt, 10)];
    const wrap = [];
    for (let th = -0.1; Math.cos(th) > -0.05; th += 0.08) wrap.push(round(climbR + 3, th, P.split - (climbR + 3) * T - th * 14));
    const right = shoot(SPLIT, -0.35, 22, 3.2, -0.085, 0.01, rand), left = shoot(SPLIT, Math.PI + 0.45, 16, 3.2, 0.11, 0.02, rand);
    const twig = shoot(wrap[9], -0.9, 10, 3, -0.12, 0.03, rand);
    const out = branch(wrap, 6, 3) + branch(left.pts, 5, 1.4) + branch(right.pts, 5.5, 1.4) + branch(up, 7, 5, 4) + branch(twig.pts, 3, 1.2);
    twigs.push(cluster(right.pts[right.pts.length - 1], 10, [3, 3, 2, 2, 1], useGrapes), tendril(left.pts[left.pts.length - 1], left.a, 1, rand),
      tendril(twig.pts[twig.pts.length - 1], twig.a, -1, rand), leafOn(right.pts[8], 20, 35), leafOn(right.pts[15], 15, -20), leafOn(left.pts[7], 18, -70),
      leafOn(up[4], 22, -40), leafOn(up[8], 16, 20), leafOn(wrap[4], 17, 150), leafOn(wrap[14], 21, 70), leafOn(twig.pts[5], 13, -10),
      cluster(wrap[6], -6, [3, 3, 2, 1], useGrapes), tendril(wrap[17] || wrap[wrap.length - 1], 0.3, 1, rand));
    return out + twigs.join('');
  })();
  // the trunk below the split, wandering a little as it runs down the front of the column past `bottom`, thickening
  const trunk = bottom => {
    const rand = seeded(hash('candle:vine:trunk')), pts = [], ws = [];
    let x = SPLIT[0], dx = 0;
    for (let y = SPLIT[1], i = 0; y < bottom + 20; y += 4, i++) {
      pts.push([x, y]); ws.push(9 + Math.min(7, i * 0.2));
      dx = 0.8 * dx + (rand() - 0.5) * 1.4; x = Math.max(SPLIT[0] - 18, Math.min(SPLIT[0] + 18, x + dx));
    }
    return limb(pts, ws, seeded(hash('candle:vine:bark')), 4); // its own stream, so a longer trunk keeps its top's knots
  };
  // the fluted column, solid down to `bottom` (the window's bottom edge, so it never ends in mid-air; drawHang redraws
  // it), the vine up it from below the edge
  const column = bottom => `<clipPath id="cdColClip"><path d="M${cx - col} ${slabY}V${bottom}H${cx + col}V${slabY}Z"/></clipPath>
    <path d="M${cx - col} ${slabY}V${bottom}H${cx + col}V${slabY}Z" fill="${MARBLE.lit}"/>
    <path d="M${n(cx + K.side * col)} ${slabY}V${bottom}H${cx + col}V${slabY}Z" fill="${MARBLE.dark}"/>
    <path d="${[-4, -3, -2, -1, 0, 1, 2, 3, 4].map(k => `M${n(cx + col * Math.sin(k * Math.PI / 10))} ${slabY}V${bottom}`).join('')}" fill="none" stroke="#8E869B" stroke-opacity=".6" stroke-width=".8"/>
    <path d="M${cx - col} ${slabY}V${bottom}M${cx + col} ${slabY}V${bottom}" fill="none" stroke="${MARBLE.ink}" stroke-width="${K.line}"/>
    <path d="M${cx - 68} ${P.fade[0] + 4}q14 12 6 26t18 30M${cx + 12} ${P.fade[0]}q-8 14 6 22t-4 34M${cx + 54} ${P.fade[0] + 6}q10 10 2 22" fill="none" stroke="url(#cdColLine)" stroke-width=".7"/>
    ${trunk(bottom)}${vineTop}`;
  // the slab: a band between its top rim and its bottom rim's front, lit from the left, in an ink outline
  const slabD = `M${left} ${P.top}V${slabY}A${P.r} ${rimRy(P.r)} 0 0 0 ${cx + P.r} ${slabY}V${P.top}Z`;
  // over the slab's edge and across its top to the foot, where the holder's thin vine takes over
  const edgeAt = [left + 2, P.top + 31], over = [climbAt, ...quad(climbAt, [left + 4, P.top + 49], edgeAt), ...quad(edgeAt, [left + 2, P.top + 13], [left + 28, P.top + 9]),
    ...quad([left + 28, P.top + 9], [left + 56, P.top + 5], [left + 72, P.top + 1])];
  const overRand = seeded(hash('candle:vine:over'));
  const overVine = limb(over, over.map((_, i) => 5 - 3 * i / over.length), overRand)
    + (s => limb(s.pts, s.pts.map((_, j) => 2.4 - 1.4 * j / s.pts.length), overRand) + tendril(s.pts[s.pts.length - 1], s.a, 1, overRand))(shoot(over[12], -2.2, 9, 3, 0.16, 0.05, overRand))
    + leafOn(over[7], 24, -75) + leafOn(over[17], 19, -20) + leafOn(over[21], 15, 40);
  // its own group (class cdPedestal), so nothing else drawn below the slab's top can pass for it
  const pedestal = `<g class="cdPedestal"><g id="cdColumn">${column(P.fade[1])}</g>
    <clipPath id="cdSlab"><path d="${slabD}"/></clipPath><path d="${slabD}" fill="${MARBLE.lit}"/>
    <rect x="${n(cx + K.side * P.r)}" y="${P.top - 30}" width="${P.r}" height="${P.depth + 60}" fill="${MARBLE.dark}" clip-path="url(#cdSlab)"/>
    <path d="${slabD}" fill="none" stroke="${MARBLE.ink}" stroke-width="${K.line}" stroke-linejoin="round"/>
    <ellipse cx="${cx}" cy="${P.top}" rx="${P.r}" ry="${rimRy(P.r)}" fill="#E2DDE8" stroke="${MARBLE.ink}" stroke-width="${K.line}"/>
    <ellipse id="cdWarm" cx="${cx}" cy="${P.top}" rx="${P.r}" ry="${rimRy(P.r)}" fill="url(#cdWarmG)" opacity="0"/><!-- the slab's top, warmed round the foot by the flame -->
    <path d="M${left + 12} ${P.top + 10}q26 7 42 0t36 7q20 2 26 -2M${left + 158} ${P.top + 16}q16 -2 40 -7" fill="none" stroke="#968DA4" stroke-width=".7" opacity=".6"/><!-- the slab -->
    <ellipse id="cdFootShadow" cx="${cx}" cy="${P.top - 5}" rx="${FOOT}" ry="${rimRy(FOOT)}" fill="#2B2238" opacity=".35"/><!-- the foot's shadow on it -->
    ${cluster(edgeAt, 8, [4, 4, 3, 3, 2, 1], grapes)}${overVine}${leafOn(edgeAt, 12, 150)}
    <!-- the vine, up the column, over the slab's edge and across it to the foot, a bunch hanging off it at the edge -->
    <g id="cdPedestalGlints">${grapeGlints(0)}</g></g>`;
  const onPedestal = GRAPES.length; // the grapes drawn so far are the pedestal's bunch
  // on up the foot and round the baluster to the vine already on the candlestick
  const climb = `${vine(`M${left + 72} ${P.top + 1}${on('Q318 540 330 532Q352 524 352 512Q352 500 334 498Q322 494 330 486Q338 478 352 478')}`)}
    ${flutter(stick([326, 534]), 0.6, leaf(...stick([326, 534]), 19, -40))}${flutter(stick([354, 506]), 0.6, leaf(...stick([354, 506]), 18, 70))}${flutter(stick([330, 490]), 0.6, leaf(...stick([330, 490]), 17, -70))}`;
  // the knop, placed in the scene (its gadroons are drawn in DRAWN units and placed with on)
  const knop = { cy: Y(474), rx: 25 * k, ry: 11 * k };
  const back = `<defs><clipPath id="cdWax"><path d="${PILLAR_D}"/><path d="${DRIPS.map(dripD).join('')}"/></clipPath>
      <clipPath id="cdDrips"><path d="${DRIPS.map(dripD).join('')}"/></clipPath><clipPath id="cdKnop"><ellipse cx="${cx}" cy="${n(knop.cy)}" rx="${n(knop.rx)}" ry="${n(knop.ry)}"/></clipPath>
      <linearGradient id="cdGlow" x1="0" x2="0" y1="0" y2="1"><stop class="paperStop" offset="0" stop-opacity=".85"/><stop class="paperStop" offset=".35" stop-opacity=".45"/>
      <stop class="paperStop" offset="1" stop-opacity="0"/></linearGradient>${GRAPE}
      <radialGradient id="cdWarmG" cx="${cx}" cy="${P.top - 3}" r="110" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="currentColor" stop-opacity=".55"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient>
      <radialGradient id="cdGlint"><stop offset="0" stop-color="#E6D3A0"/><stop offset=".55" stop-color="#C9B07A" stop-opacity=".8"/><stop offset="1" stop-color="#C9B07A" stop-opacity="0"/></radialGradient>
      <radialGradient id="cdPool" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="#FFF8EC"/><stop offset=".7" stop-color="#F3E5C8"/><stop offset="1" stop-color="#D9C6A2"/></radialGradient>
      <filter id="cdSoft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter>
      ${fade('cdColLine', '#8E869B', 0.6)}</defs>
    ${pedestal}
    ${DRUM(BRASS_K, Y(543), FOOT, 8)}${beads(Y(551), FOOT, 272, 408, 17, 1.9, -2.6)}
    ${turned('cdFoot', profile(Y(523), Y(543), y => { const u = (y - Y(523)) / 20; return 20 + 50 * u * u * (3 - 2 * u); }))}<!-- the domed foot, an ogee -->
    ${DRUM(BRASS_K, Y(518), 18, 5)}
    ${turned('cdBaluster', profile(489, 518, y => y < 504 ? 10 + 7 * Math.sin((y - 489) / 15 * Math.PI / 2) : 11 + 6 * Math.cos((y - 504) / 14 * Math.PI / 2), 16).map(([y, h]) => [Y(y), h * k]))}
    ${DRUM(BRASS_K, Y(485), 10 * k, 4 * k)}
    <ellipse cx="${cx}" cy="${n(knop.cy)}" rx="${n(knop.rx)}" ry="${n(knop.ry)}" fill="${K.lit}"/><rect x="${n(cx + K.side * knop.rx)}" y="${n(Y(462))}" width="30" height="${n(24 * k)}" fill="${K.dark}" clip-path="url(#cdKnop)"/>
    <ellipse cx="${cx}" cy="${n(knop.cy)}" rx="${n(knop.rx)}" ry="${n(knop.ry)}" fill="none" stroke="${K.ink}" stroke-width="${K.line}"/>
<!-- the knop, carved in gadroons underneath -->
    <path d="${on([324, 332, 340, 348, 356].map(x => `M${x} 476.5Q${n(x + (x - cx) * 0.08)} ${n((476.5 + knopEdge(x)) / 2)} ${n(x + (x - cx) * 0.04)} ${knopEdge(x)}`).join(''))}" fill="none" stroke="${K.dark}" stroke-width=".8"/>
    ${DRUM(BRASS_K, Y(452), 14, 8)}
    <ellipse cx="${cx}" cy="${PILLAR.dish}" rx="84" ry="${n(sag(PILLAR.dish, 84))}" fill="${GILT}" stroke="${BRASS_K.ink}" stroke-width="${K.line}"/>
    <ellipse cx="${cx}" cy="${PILLAR.dish}" rx="78" ry="${n(sag(PILLAR.dish, 78))}" fill="#24140A"/><!-- the pan, its inside in the pillar's shadow -->
    <path d="${PILLAR_D}" fill="${WAX[0]}"/><rect x="${n(side)}" y="${rim - 10}" width="${n(cx + R + 2 - side)}" height="${PILLAR.bottom - rim + 10}" fill="${WAX[1]}" clip-path="url(#cdWax)"/>
    ${drips}
    <rect id="paperGlow" x="${cx - R - 4}" y="${rim - 4}" width="${2 * R + 8}" height="86" fill="url(#cdGlow)" clip-path="url(#cdWax)"/><!-- lit from within, under the rim -->
    <path d="${smooth(CROWN.map(([x, y]) => [x, y + 1]))}" fill="none" stroke="#D8C5A2" stroke-width="1"/>
    ${(notch => `<path class="paperLit" d="${notch(-0.6)}Z" fill="currentColor"/><!-- the notch the main drip spilled from, its far wall lit -->
    <path d="${notch(0)}" fill="none" stroke="#D8C5A2" stroke-width="1"/>`)(dy => `M${n(NOTCH - 11)} ${n(rim + dy)}C${n(NOTCH - 10.5)} ${n(rim + 3.5)} ${n(NOTCH - 8)} ${n(rim + 3.5)} ${n(NOTCH)} ${n(rim + 3.5)}S${n(NOTCH + 10.5)} ${n(rim + 3.5)} ${n(NOTCH + 11)} ${n(rim + dy)}`)}
    ${[-1, 1].map(u => { const x = cx + u * (R + 3.5), y = PILLAR.dish, fill = (u < 0 ? DRIP.lit : DRIP.dark)[0]; // a drip pooled in the pan at each side
      return `<path d="M${x - 5.5} ${y + 10}C${x - 6} ${y + 4} ${x - 3.5} ${y + 1.5} ${x} ${n(y + 1.2)}C${x + 3.5} ${y + 1} ${x + 6} ${y + 4} ${x + 5.5} ${y + 10}Z" fill="${fill}"/>`; }).join('')}
    ${turned('cdBowl', profile(PILLAR.dish, Y(452), y => 30 + 54 * Math.sqrt(Math.max(0, 1 - ((y - PILLAR.dish) / 26) ** 2))), true, BRASS_K)}<!-- the brass drip pan -->
    <path d="M256 ${PILLAR.dish}Q${cx} ${n(PILLAR.dish + 2 * sag(PILLAR.dish, 84))} 424 ${PILLAR.dish}L418 ${PILLAR.dish}Q${cx} ${n(PILLAR.dish + 2 * sag(PILLAR.dish, 78))} 262 ${PILLAR.dish}Z" fill="${GILT}" stroke="${BRASS_K.ink}" stroke-width="${K.line}" stroke-linejoin="round"/>
    ${beads(PILLAR.dish, 81, 262, 418, 13, 2.2, 0)}
    ${vine(on('M306 452Q330 470 362 476'))}${vine(on('M326 494Q342 500 354 514'))}<!-- the vine, where it winds across the front -->
    ${flutter(stick([318, 472]), 0.6, leaf(...stick([318, 472]), 15, -75))}
    <path d="${on('M362 476Q370 478 375 474Q378 470 375 468Q372 468 373 471')}" fill="none" stroke="#5E6A34" stroke-width="1" stroke-linecap="round"/>
    ${cluster([400, P.top - 8], -72, [4, 4, 3, 3, 2, 1], grapes)}${leafOn([400, P.top - 8], 14, -35)}<!-- a full bunch lying on the slab by the foot -->
    ${climb}
    <g id="cdGlints">${GLINTS.map(([x, y, rx, ry]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="url(#cdGlint)" opacity="0"/>`).join('')}</g>
    <g id="cdGrapeGlints">${grapeGlints(onPedestal)}</g><!-- the flame's shine (frame.js drawShine) -->
    <ellipse cx="${cx}" cy="${rim + 1.2}" rx="40" ry="2.6" fill="url(#cdPool)"/><ellipse id="cdPoolGlint" cx="${cx}" cy="${rim + 1.4}" rx="3" ry=".9" opacity="0" filter="url(#cdSoft)"/><!-- the molten pool -->`;
  // the wick, over the flame's base so the flame burns round it, its tip an ember
  const front = `<path d="M${cx} ${rim}V${rim - 7}Q${cx} ${n(rim - 10.4)} ${cx + 2.5} ${rim - 11.5}" fill="none" stroke="#1C1612" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M${n(cx + 0.6)} ${n(rim - 9.4)}Q${n(cx + 1.2)} ${rim - 11} ${cx + 2.5} ${rim - 11.5}" fill="none" stroke="#B8461E" stroke-width="2.4" stroke-linecap="round"/>`;
  return { back, front, column, brass: BRASS_K, glints: GLINTS, grapes: GRAPES };
})();
// a hairline bevel catching the light along the top and left of each frame, pillar and band
const MOROCCAN_EDGES = `<g fill="none" stroke="${BRASS.lit}" stroke-width=".7"><path d="M313.2 404V294.2h53.6M281.2 404V294.2h23.6M375.2 404V294.2h23.6
  M306.9 290v118M369.9 290v118M275.9 290v118M277 285.4h126M277 408.4h126M277 413.4h126M300 428.3h80M295 244.4h90"/></g>`;
// a darker, dulled gold, with a hint of green, in the recesses (inside the frames, under the bands, round the frieze windows),
// and rivets at the frame corners sunk in a ring of it
const MOROCCAN_PATINA = `<g fill="none" stroke="#4A3B18" stroke-opacity=".6"><path d="M314 295h52v108h-52ZM282 295h22v108h-22ZM376 295h22v108h-22Z" stroke-width="1.4"/>
  <path d="M277 290.8h126M277 407.2h126M277 414h126" stroke-width="1.2"/><path d="M299 248h6v8h-6ZM308 248h6v8h-6ZM323 248h9v8h-9ZM335.5 248h9v8h-9ZM348 248h9v8h-9ZM366 248h6v8h-6ZM375 248h6v8h-6Z"/></g>
  ${[312.5, 367.5, 280.5, 305.5, 374.5, 399.5].flatMap(x => [293.5, 404.5].map(y => `<circle cx="${x}" cy="${y}" r="1.9" fill="#4A3B18" opacity=".5"/><circle cx="${x}" cy="${y}" r="1" fill="${BRASS.lit}"/>`)).join('')}`;
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
    <!-- the bail: a stiff wire arch pinned to the drum on each side, with a crook bent into its top so it sits on a hook without sliding --><path d="M279.5 208C279.5 167 302 147.5 333.5 147.5C334.5 140.5 345.5 140.5 346.5 147.5C378 147.5 400.5 167 400.5 208" fill="none" stroke="#1A1410" stroke-width="4.6" stroke-linecap="round"/><path d="M279.5 208C279.5 167 302 147.5 333.5 147.5C334 144 337 142.25 340 142.25" fill="none" stroke="#8A847C" stroke-width="2.6"/><path d="M340 142.25C343 142.25 346 144 346.5 147.5C378 147.5 400.5 167 400.5 208" fill="none" stroke="#5A544E" stroke-width="2.6"/><!-- the string is tied on: one wrap round the crook, a knot, and a loose tail --><ellipse cx="340" cy="142.4" rx="2" ry="3.6" fill="none" stroke="#C9B49C" stroke-width="1.5"/><g id="knotTail"><path d="M341 139Q345.2 143 344 150.5" fill="none" stroke="#C9B49C" stroke-width="1.4" stroke-linecap="round"/></g><circle cx="340" cy="138.4" r="1.9" fill="#C9B49C" stroke="#7E6C56" stroke-width="0.6"/><circle cx="279.5" cy="208" r="2.6" fill="#8A847C" stroke="#1A1410" stroke-width="1"/><circle cx="400.5" cy="208" r="2.6" fill="#5A544E" stroke="#1A1410" stroke-width="1"/>
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
    chain: 123, farWall: true, // its far wall shows through the holes (bakeFarWall); its chain of links runs from here up past the top of the window (see drawHang)
    name: 'Brass Moroccan', flame: [340, 398, 0.9], light: [340, 348], dim: 0.6, flameWind: FLAME_WIND.moroccan, tassel: [340, 486],
    holder: [404, 6], // the burner cup under the flame, the height of its bottom and the half-width of its mouth; it throws a narrow fan of shadow straight down
    // a hexagonal prism seen face-on (front face ±31.5, side faces out to ±63), under a shoulder flaring out from ±45
    body: { top: 262, bottom: 462, half: y => y < 285 ? 45 + Math.max(0, y - 260) / 25 * 18 : y < 413 ? 63 : y < 428 ? 63 - (y - 413) / 15 * 23
      : y < 434 ? 40 : 38 * (1 - ((y - 434) / 54) ** 2) },
    back: `<defs>${MOROCCAN_DEFS}</defs>${PAPER_GRAD('.55')}
<!-- its inside is the far wall, drawn by the background (bakeFarWall); the air's glow kept to half, so the lit wall shows through it -->
      <g opacity=".5"><ellipse id="paperGlow" cx="340" cy="335" rx="72" ry="95" fill="url(#pg)"/></g>`,
    front: `<circle cx="340" cy="132" r="4" fill="none" stroke="${BRASS.lit}" stroke-width="1.8"/>
      <path d="M338.6 136h2.8v20h-2.8Z" fill="${BRASS.front}"/><ellipse cx="340" cy="142" rx="3" ry="2.4" fill="${BRASS.lit}"/><ellipse cx="340" cy="149" rx="4.4" ry="3" fill="${BRASS.front}"/><ellipse cx="340" cy="154.5" rx="2.6" ry="1.8" fill="${BRASS.lit}"/>
      <path d="M334 399h12l-2 5h-8Z" fill="${BRASS.side}"/><ellipse cx="340" cy="399" rx="6" ry="1.4" fill="${BRASS.lit}"/><path d="M338.8 404h2.4v4h-2.4Z" fill="${BRASS.side}"/>
      <g mask="url(#cutouts)">
        ${ONION_FILL('bottom', BOTTOM)}
        ${ONION_FILL('dome', DOME)}
        ${PANEL(45, 22.5, 244, 16)}
        ${SLOPED([['M295 260H317.5L308.5 285H277Z', -60], [SHOULDER_F, 0], ['M362.5 260H385L403 285H371.5Z', 60]], 36)}
        ${PANEL(63, 31.5, 290, 118)}
        <path d="M277 290h126v118h-126Z" fill="url(#horizon)"/><path class="paperLit" d="M277 290h126v118h-126Z" fill="url(#bounce)"/>
      </g>
      <g fill="none" stroke-linejoin="round">
        <path d="${DOME}" stroke="url(#gore-dome-F)" stroke-width="2"/><path d="${DOME}" stroke="url(#gore-dome-F)" stroke-width="2.6" transform="${HALF_X}"/>
        <path d="M317.5 244v16" ${FLAT(-30, 0.15, 'stroke')} stroke-width="1.6"/><path d="M362.5 244v16" ${FLAT(30, 0.15, 'stroke')} stroke-width="1.6"/>
        <path d="${BOTTOM}" stroke="url(#gore-bottom-F)" stroke-width="1.6"/><path d="${BOTTOM}" stroke="url(#gore-bottom-F)" stroke-width="2" transform="${HALF_X}"/>
        <g stroke-width="1.6">${SLOPED([['M317.5 260L308.5 285', -30], ['M362.5 260L371.5 285', 30], ['M295 260L277 285', -90], ['M385 260L403 285', 90]], 36, 'stroke')}</g>
        <path d="M312.5 293.5h55v111h-55Z" ${FLAT(0, -0.25, 'stroke')} stroke-width="1.2"/><path d="M280.5 293.5h25v111h-25Z" ${FLAT(-60, -0.25, 'stroke')} stroke-width="1.2"/>
        <path d="M374.5 293.5h25v111h-25Z" ${FLAT(60, -0.25, 'stroke')} stroke-width="1.2"/>
      </g>
      <path d="M306.5 290h4v118h-4Z" ${FLAT(-30, 0.15)}/><path d="M369.5 290h4v118h-4Z" ${FLAT(30, 0.15)}/>
      <path d="M275.5 290h3v118h-3Z" ${FLAT(-90)}/><path d="M401.5 290h3v118h-3Z" ${FLAT(90)}/>
      <path d="M306.5 290h4v118h-4ZM369.5 290h4v118h-4ZM275.5 290h3v118h-3ZM401.5 290h3v118h-3Z" fill="url(#horizon)"/>
      ${ROPE(285)}${ROPE(408)}
      <g mask="url(#cutouts)">${SLOPED([['M277 413H308.5L320 428H300Z', -60], [SKIRT_F, 0], ['M371.5 413H403L380 428H360Z', 60]], -57)}</g>
      <g stroke-width="1.4">${SLOPED([['M308.5 413L320 428', -30], ['M371.5 413L360 428', 30]], -57, 'stroke')}</g>
      ${PANEL(40, 20, 428, 6, true)}
      ${PANEL(40, 20, 428, 1.2, false, 0.2)}${PANEL(40, 20, 432.8, 1.2, false, 0.2)}
      ${PANEL(45, 22.5, 243.2, 2.6, true, 0.2)}${PANEL(45, 22.5, 258.2, 2.6, true, 0.2)}
      ${MOROCCAN_PATINA}${MOROCCAN_EDGES}
      <g id="tassel"><path d="M338.8 485h2.4v4h-2.4Z" fill="${BRASS.side}"/><ellipse cx="340" cy="492" rx="3.6" ry="3" fill="${BRASS.lit}"/>
        <ellipse cx="340" cy="498" rx="2.4" ry="2" fill="${BRASS.side}"/><path d="M338 500L340 510L342 500Z" fill="${BRASS.lit}"/></g>`,
  },
  candle: {
    name: 'Pillar candle', stands: { half: PEDESTAL.r, top: PILLAR.dish }, paper: false, scorches: true, // a bare flame, standing on the crown
    flame: PILLAR.flame, light: [PILLAR.cx, PILLAR.eye], flameWind: FLAME_WIND.candle,
    holder: [PILLAR.rim, PILLAR.r], shadeFromHolder: true, // seen from the flame the rim is the widest thing below it, so its corners cast the shadow
    // the wax alone, a straight cylinder, its highest landing spot a hop, a moth's reach and the clearance below the flame
    body: { top: perchTop(PILLAR.flame[1] + FLAME_DIP * PILLAR.flame[2] + HOP + MOTH_REACH + FLAME_CLEARANCE, PILLAR.dish - 8), bottom: PILLAR.dish - 8,
      half: () => PILLAR.r },
    back: CANDLE.back, front: CANDLE.front, shine: CANDLE, // its bare flame shines on the brass, the pool, the grapes and the marble (drawShine)
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
// its chain, link after link (alternating face-on and edge-on) all the way up. Redrawn when the window's top moves. A
// standing lantern has none; its pedestal's column runs down to the window's bottom edge instead.
let cdLeaves = /** @type {Element[] | null} */ (null); // the candle's fluttering leaves, found by frame.js drawLeaves
function drawHang() {
  const h = $('hang');
  const column = style.stands && $('cdColumn');
  cdLeaves = null; // drawLeaves finds them again
  if (column) column.innerHTML = CANDLE.column(VIEW.box ? VIEW.box[1] + VIEW.box[3] : 620);
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
  $('lantern').innerHTML = (style.stands ? '' : style.chain ? `<g id="hang" fill="none" stroke="${BRASS.lit}" stroke-width="1.4"></g>`
    : '<path id="hang" stroke="#C9B49C" stroke-width="2"/>') + style.back
    + `<g transform="translate(${fx} ${fy}) scale(${fk}) translate(-340 -${FLAME_BASE})">${FLAME(style.paper)}</g>`
    + style.front;
  drawHang();
  bakeFarWall();
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
  const y = top + (bottom - top) * (0.5 + PERCH_SPREAD * Math.sin(a) * depth);
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
function tintFor(s) {
  const hue = (hash(s.cwd.split('/').filter(Boolean).pop()) % 360 + (hash(s.id) % 29) - 14 + 360) % 360;
  const l = 0.72, a = 0.55 * Math.min(l, 1 - l), f = n => { const k = (n + hue / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
// cheap smooth noise: a few sines at unrelated frequencies
const wobble = (s, k) => Math.sin(s * 2.3 + k) * 0.6 + Math.sin(s * 5.1 + k * 1.7) * 0.3 + Math.sin(s * 11.7 + k * 0.6) * 0.1;
