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
// The Moroccan: polished brass (the front faces lit, the side faces a step darker), pierced edge to edge with
// arabesque lace (ids sheen-* are the brass gradients, kept apart from the lace clips' ids). Its lace and openings are one mask (#cutouts): each panel is cut out whole, then a tile of scrolling
// brass lace is laid back over it, squeezed sideways on the faces that turn away.
// The brass reads as metal through contrast: dark reflected mid-tones, a tight warm highlight left of centre where a fixed
// light catches it, and deep warm shadow on the right. The highlight is one band shared by three gradients (class
// sheen, in the lantern's own units, given as [x, colour]): faces, side faces, and the lit edges, chain and finial, whose
// narrow white peak glints as an edge passes under it. swingLantern slides them all with the lantern's twist (frame.js).
const TAPERS = [['dome', 244, 154, 154], ['bottom', 434, 486, 486]];
const SHEEN = (id, stops) => `<linearGradient id="${id}" class="sheen" gradientUnits="userSpaceOnUse" x1="270" x2="410">${
  stops.map(([x, c]) => `<stop offset="${((x - 270) / 140).toFixed(3)}" stop-color="${c}"/>`).join('')}</linearGradient>`;
// The straight and sloping parts (body, frieze, rope and neck bands, shoulder, skirt) are flat polished brass: each face is
// one flat tone from this ramp (dark to lit), chosen by how squarely it faces the light (frame.js), so the shine steps from
// face to face as the lantern twists. The onion dome and drop keep their leaning gradients.
const FACET_TONES = ['#2E1E0A', '#4A3213', '#6C4E1F', '#8A6A32', '#A1844B']; // blended smoothly between steps
// the lighting's fake twist (frame.js): its strength, 0 to freeze it (?twist=, default 3)
let twistGain = Q.has('twist') ? +(Q.get('twist') || 0) : 3;
// How the onions are lit, while Dace compares (?onion=, d by default): d, each gore flat across and curved top to bottom, its
// tone along its profile; a, each gore lit as its own curved panel with a band across it; b, the side gores flat, darkening
// toward the tip; c, one sliding band across the whole onion. ponytail: the losers get deleted.
const ONION = ['a', 'b', 'c', 'd'].includes(Q.get('onion') || '') ? Q.get('onion') : 'd';
// ?dev: a small panel, top left, to tune the twist by eye (applies at once and is kept in the URL),
// and to switch the onions' lighting (reloads, as the drawing is built from it).
if (Q.has('dev')) {
  const panel = document.createElement('div'), query = (k, v) => {
    const q = new URLSearchParams(location.search); if (v === null) q.delete(k); else q.set(k, v); return `?${q}`;
  };
  panel.style.cssText = 'position: fixed; top: 12px; left: 12px; z-index: 10; width: 190px; padding: 6px 14px; background: rgba(30, 24, 46, .96);'
    + 'border: 1px solid #4A3B68; border-radius: 10px; color: #D8CCE6; font: 12.5px/1.5 Georgia, serif; box-shadow: 0 8px 28px rgba(0, 0, 0, .45)';
  // each row is one label, its click area the row's full width and height, meeting the next row's
  const row = (text, attrs) => {
    const label = document.createElement('label'), input = Object.assign(document.createElement('input'), attrs);
    label.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 5px 0; cursor: pointer';
    label.append(...(attrs.type === 'range' ? [text, input] : [input, text])); panel.append(label);
    return input;
  };
  const onion = row('onion', { value: ONION });
  onion.replaceWith(Object.assign(document.createElement('select'), { innerHTML: '<option value="d">d: profile</option><option value="a">a: per gore</option><option value="b">b: flat sides</option><option value="c">c: one band</option>',
    value: ONION, onchange: e => { location.search = query('onion', e.target.value); } }));
  const on = row('twist', { type: 'checkbox', checked: twistGain > 0 });
  const gain = row('strength', { type: 'range', min: 0, max: 5, step: 0.1, value: twistGain || 3 });
  gain.style.flex = '1';
  on.onchange = gain.oninput = () => {
    twistGain = on.checked ? +gain.value : 0;
    history.replaceState(null, '', query('twist', twistGain === 3 ? null : String(twistGain)));
  };
  document.body.append(panel);
}
const SHEENS = SHEEN('brassF', [[270, '#281B0A'], [296, '#493313'], [312, '#6C4E1F'], [318, '#896A32'], [325, '#A1844B'], [332, '#896A32'], [340, '#735222'], [356, '#6E4A1A'], [372, '#5A3A14'], [392, '#45290E'], [410, '#3A2410']])
  + SHEEN('brassS', [[270, '#211608'], [284, '#463114'], [292, '#5A431C'], [302, '#3E2B10'], [318, '#5A401C'], [325, '#7D6232'], [332, '#5A401C'], [360, '#4A3010'], [380, '#3E260C'], [410, '#3A2410']])
  + SHEEN('brassE', [[270, '#5A4121'], [310, '#7D6332'], [318, '#90753E'], [324, '#A9915E'], [326, '#B29C6A'], [328, '#A9915E'], [334, '#90753E'], [350, '#7B6232'], [372, '#7A5620'], [400, '#5A3A14'], [410, '#4A2E10']])
  // Onion option c: the band leans in toward the narrow end, as it would on a cone: each onion's faces, side faces and edges
  // get their own gradient (class taper) inheriting the stops by href, leaned each frame so the band runs from where it sits
  // at the wide edge (`base`) to the middle at the tip (`apex`), with a narrow bright ellipse along it toward the narrow
  // `end` (radial, class taper too). frame.js sets them.
  + TAPERS.map(([id, base, apex, end]) => ['F', 'S', 'E'].map(k =>
    `<linearGradient id="sheen-${id}-${k}" class="taper" href="#brass${k}" data-base="${base}" data-apex="${apex}"/>`).join('')
    + (end ? `<radialGradient id="sheen-${id}-R" class="taper" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" data-base="${base}" data-apex="${apex}" data-end="${end}">`
      + `<stop offset="0" stop-color="#E8C88A" stop-opacity=".7"/><stop offset=".5" stop-color="#C9A058" stop-opacity=".25"/><stop offset="1" stop-color="#C9A058" stop-opacity="0"/></radialGradient>` : '')).join('');
// The onions' gores (frame.js lights them): for each onion its base and tip heights and tilt (up for the dome, down for the
// drop), and its gores' halves of the outline; `wide` is the front gore's half-width at the base, in its own (HALF_X) units.
// `profile` is option d's: how far its surface tilts up (degrees) at points from base (0) to tip (1), the dome's bulge
// turning up to the light above its widest point and steepening again into the tip, the drop turning ever further down.
const GORES = { dome: { base: 244, tip: 154, tilt: 30, profile: [[0, -10], [0.13, 0], [0.36, 20], [0.51, 30], [0.67, 15], [0.82, 0], [1, -15]], wide: 46, left: 'M340 154L340 244L294 244C292.1 227 296.8 212 313.7 198C330.6 184 338.1 174 340 154Z',
    right: 'M340 154C341.9 174 349.4 184 366.3 198C383.2 212 387.9 227 386 244L340 244Z', sides: [305.5, 374.5, 11.5] },
  bottom: { base: 434, tip: 486, tilt: -30, profile: [[0, 0], [0.2, -15], [0.5, -30], [0.75, -30], [1, -20]], wide: 38, left: 'M302 434C301 452 314 462 326 470C334 475 338 480 340 486L340 434Z',
    right: 'M340 486C342 480 346 475 354 470C366 462 379 452 378 434L340 434Z', sides: [311.5, 368.5, 9.5] } };
// a gore's gradient: option d's run down its profile, option a's band (centred on 0, frame.js places and leans it), or a
// flat side gore's fade toward the tip
const GORE = (id, angle, part, cx, hw) => ONION === 'd' ? `<linearGradient id="${id}" class="gore" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${part.base}" y2="${part.tip}"
  data-angle="${angle}" data-profile="1">${part.profile.map(([o, e]) => `<stop offset="${o}" data-tilt="${e}"/>`).join('')}</linearGradient>` : cx ? `<linearGradient id="${id}" class="gore" gradientUnits="userSpaceOnUse" x1="${-2.4 * hw}" x2="${2.4 * hw}"
  data-angle="${angle}" data-base="${part.base}" data-tip="${part.tip}" data-tilt="${part.tilt}" data-cx="${cx}" data-hw="${hw}">${[0, 0.3, 0.5, 0.7, 1].map(o => `<stop offset="${o}"/>`).join('')}</linearGradient>`
  : `<linearGradient id="${id}" class="gore" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${part.base}" y2="${part.tip}" data-angle="${angle}" data-tilt="${part.tilt}"><stop offset="0"/><stop offset="1"/></linearGradient>`;
const GORE_DEFS = ONION === 'c' ? '' : Object.entries(GORES).map(([k, g]) => GORE(`gore-${k}-F`, 0, g, 340, g.wide)
  + GORE(`gore-${k}-L`, -60, g, ONION === 'a' && g.sides[0], g.sides[2]) + GORE(`gore-${k}-R`, 60, g, ONION === 'a' && g.sides[1], g.sides[2])).join('');
// an onion's fill: its two side gores and its front gore (squeezed to half width), or option c's one sliding band
const ONION_FILL = (k, d) => ONION === 'c' ? `<path d="${d}" fill="url(#sheen-${k}-S)"/><path d="${d}" fill="url(#sheen-${k}-F)" transform="${HALF_X}"/>`
  : `<path d="${GORES[k].left}" fill="url(#gore-${k}-L)"/><path d="${GORES[k].right}" fill="url(#gore-${k}-R)"/><path d="${d}" fill="url(#gore-${k}-F)" transform="${HALF_X}"/>`;
// an onion's outline and gore edges: the sliding band's (option c), or the front gore's own light
const ONION_EDGE = (k, which) => ONION === 'c' ? `url(#sheen-${k}-${which})` : `url(#gore-${k}-F)`;
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
  return `${PANEL(half, front, y, 5, true)}<path d="${twist}" stroke="#3E3A16" stroke-width="1"/>`;
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
// a hairline bevel catching the light along the top and left of each frame, pillar and band
const MOROCCAN_EDGES = `<g fill="none" stroke="${BRASS.lit}" stroke-width=".7"><path d="M313.2 404V294.2h53.6M281.2 404V294.2h23.6M375.2 404V294.2h23.6
  M306.9 290v118M369.9 290v118M275.9 290v118M277 285.4h126M277 408.4h126M277 413.4h126M300 428.3h80M295 244.4h90"/></g>`;
// faintly olive darkening in the recesses (inside the frames, under the bands, round the frieze windows),
// and rivets at the frame corners sunk in a ring of it
const MOROCCAN_PATINA = `<g fill="none" stroke="#3A3818" stroke-opacity=".6"><path d="M314 295h52v108h-52ZM282 295h22v108h-22ZM376 295h22v108h-22Z" stroke-width="1.4"/>
  <path d="M277 290.8h126M277 407.2h126M277 414h126" stroke-width="1.2"/><path d="M299 248h6v8h-6ZM308 248h6v8h-6ZM323 248h9v8h-9ZM335.5 248h9v8h-9ZM348 248h9v8h-9ZM366 248h6v8h-6ZM375 248h6v8h-6Z"/></g>
  ${[312.5, 367.5, 280.5, 305.5, 374.5, 399.5].flatMap(x => [293.5, 404.5].map(y => `<circle cx="${x}" cy="${y}" r="1.9" fill="#3A3818" opacity=".5"/><circle cx="${x}" cy="${y}" r="1" fill="${BRASS.lit}"/>`)).join('')}`;
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
    name: 'Brass Moroccan', flame: [340, 398, 0.9], light: [340, 348], dim: 0.6, tassel: [340, 486],
    holder: [404, 6], // the burner cup under the flame: its bottom and half-width; it throws a narrow fan of shadow straight down
    // a hexagonal prism seen face-on (front face ±31.5, side faces out to ±63), under a shoulder flaring out from ±45
    body: { top: 262, bottom: 462, half: y => y < 285 ? 45 + Math.max(0, y - 260) / 25 * 18 : y < 413 ? 63 : y < 428 ? 63 - (y - 413) / 15 * 23
      : y < 434 ? 40 : 38 * (1 - ((y - 434) / 54) ** 2) },
    back: `<defs>${MOROCCAN_DEFS}</defs>${PAPER_GRAD('.55')}
<!-- its inside is the far wall, drawn by the background (bakeFarWall) -->
      
      <ellipse id="paperGlow" cx="340" cy="335" rx="72" ry="95" fill="url(#pg)"/>`,
    front: `<circle cx="340" cy="132" r="4" fill="none" stroke="${BRASS.lit}" stroke-width="1.8"/>
      <path d="M338.6 136h2.8v20h-2.8Z" fill="${BRASS.front}"/><ellipse cx="340" cy="142" rx="3" ry="2.4" fill="${BRASS.lit}"/><ellipse cx="340" cy="149" rx="4.4" ry="3" fill="${BRASS.front}"/><ellipse cx="340" cy="154.5" rx="2.6" ry="1.8" fill="${BRASS.lit}"/>
      <path d="M334 399h12l-2 5h-8Z" fill="${BRASS.side}"/><ellipse cx="340" cy="399" rx="6" ry="1.4" fill="${BRASS.lit}"/><path d="M338.8 404h2.4v4h-2.4Z" fill="${BRASS.side}"/>
      <g mask="url(#cutouts)">
        ${ONION_FILL('bottom', BOTTOM)}
        ${ONION_FILL('dome', DOME)}
        ${PANEL(45, 22.5, 244, 16)}
        ${SLOPED([['M295 260H317.5L308.5 285H277Z', -60], [SHOULDER_F, 0], ['M362.5 260H385L403 285H371.5Z', 60]], 36)}
        ${PANEL(63, 31.5, 290, 118)}
        ${ONION === 'c' ? `<path d="${DOME}" fill="url(#sheen-dome-R)"/><path d="${BOTTOM}" fill="url(#sheen-bottom-R)"/>` : ''}
        <path d="M277 290h126v118h-126Z" fill="url(#horizon)"/><path class="paperLit" d="M277 290h126v118h-126Z" fill="url(#bounce)"/>
      </g>
      <g fill="none" stroke-linejoin="round">
        <path d="${DOME}" stroke="${ONION_EDGE('dome', 'S')}" stroke-width="2"/><path d="${DOME}" stroke="${ONION_EDGE('dome', 'E')}" stroke-width="2.6" transform="${HALF_X}"/>
        <path d="M317.5 244v16" ${FLAT(-30, 0.15, 'stroke')} stroke-width="1.6"/><path d="M362.5 244v16" ${FLAT(30, 0.15, 'stroke')} stroke-width="1.6"/>
        <path d="${BOTTOM}" stroke="${ONION_EDGE('bottom', 'S')}" stroke-width="1.6"/><path d="${BOTTOM}" stroke="${ONION_EDGE('bottom', 'E')}" stroke-width="2" transform="${HALF_X}"/>
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
  $('lantern').innerHTML = (style.chain ? `<g id="hang" fill="none" stroke="${BRASS.lit}" stroke-width="1.4"></g>` : '<path id="hang" stroke="#C9B49C" stroke-width="2"/>') + style.back
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
