// The lanterns (three that hang and a candle that stands), landing spots on them, the warm and cool palettes, and seeded
// randomness.

import { live } from './live';
import { $, FLAME_BASE, byId, nth, FLAME_STRETCH, Q, RING, SIZE, VIEW, WING_REACH, ringAt, stretch, unit } from './scene';
import { devSelect, devSlider } from '../dev';
import type { Point, Session, Style, Surface } from '../types';
import type { Vec3 } from '../types';

// ---- lantern styles -----------------------------------------------------------------------------------------
// Each style is drawn behind and in front of one shared flame, with `inside` (if any) just in front of the flame; the flame
// and `inside` slide together as #inside (frame.ts farSlide). `flame` places the flame's base and sets its size,
// `light` is where the glow and threads come from, `paper` puts `back` behind the flame (the rest of a lantern is all in
// front of it) and softens the flame as if it's seen through paper (background.ts FLAME), and `body`
// is the surface moths land on: its top and bottom, and its half-width at a given height. `caps` (paper lanterns) are
// the solid top and bottom that the light can't pass: their heights and half-width. `dim` turns the room's light down
// for a lantern that holds some back (pierced brass). `holder` is the edge below its flame that bounds its light (a
// burner cup, a candle's rim), as a height and a half-width. `flameWind` is how far the wind leans its flame (none if absent). `stands` is a lantern on its own foot, which doesn't sway
// and has nothing to hang from; it's the band its stand fills below it, a half-width and the top, from there to the
// window's bottom, which the background's wisps and ghosts keep out of (stale.ts). `shadeFromHolder` shades below from the holder's corners instead, as the live flame's base and tip see them (background.ts rimShade).
// `shine` is a bare flame lighting its holder, and lists the grapes it glints on (frame.ts drawShine).
// `heat` is the hot air rising off it, which shimmers what's behind it and lifts the dust (frame.ts drawHeat): where it
// leaves, `at` in the lantern's own units (swinging with it), or its bare flame's tip without one, and how strong at full flame.
// `scorches` puts its bare flame in moths' reach, so a moth whose session has failing PR checks gets scorched (frame.ts).
// Its solid horizontal brass is tagged class band: each throws a soft, wide shadow in the room (frame.ts).
const MOCK = (svg: string, dy = 0) => `<g transform="translate(112 ${20 + dy}) scale(2.4)">${svg}</g>`; // drawn on the mockup's 190-wide tile, centred on 340; dy nudges it down
const PAPER_GRAD = (cy: string) => `<defs><radialGradient id="pg" cy="${cy}" r=".65"><stop class="paperStop" offset="0" stop-opacity=".9"/><stop class="paperStop" offset="1" stop-opacity="0"/></radialGradient></defs>`;
// The Moroccan: polished brass, pierced edge to edge with arabesque lace. Its lace and openings are one mask (#cutouts):
// each panel is cut out whole, then a tile of scrolling brass lace is laid back over it, squeezed sideways on the faces
// that turn away. Its flat faces and onion gores are lit by the angle they face (FLAT, GORES); the small round brass (chain,
// finial, burner cup, tassel) by a warm highlight band shared by three gradients (class sheen, in the lantern's own units,
// given as [x, colour]), which swingLantern slides with the lantern's twist (frame.ts).
const SHEEN = (id: string, stops: [number, string][]) => `<linearGradient id="${id}" class="sheen" gradientUnits="userSpaceOnUse" x1="270" x2="410">${
  stops.map(([x, c]) => `<stop offset="${((x - 270) / 140).toFixed(3)}" stop-color="${c}"/>`).join('')}</linearGradient>`;
// The straight and sloping parts (body, frieze, rope and neck bands, shoulder, skirt) are flat polished brass: each face is
// one flat tone from this ramp (dark to lit), chosen by how squarely it faces the light (frame.ts), so the shine steps from
// face to face as the lantern twists. The onion dome and drop keep their leaning gradients.
export const FACET_TONES = ['#2E1E0A', '#4A3213', '#6C4E1F', '#8A6A32', '#A1844B']; // blended smoothly between steps
// the dev panel's flame (dev.ts): hold it at a brightness, 0 (idle ember) to 1 (five sessions working), whatever is running,
// and force its colour warm or violet, whatever the sessions say (frame.ts)
export let fakeFlame = devSlider('Flame', 'flame', 'intensity', 0, 1, 0.05, null, 'Hold the flame at a brightness, from an idle ember to five sessions working, whatever your sessions are doing. Double-click to go back to live', v => { fakeFlame = v; });
export let fakeLamp = devSelect('Flame', 'lamp', 'state', ['live', 'warm', 'violet'], 'live', 'Show the lantern warm or violet (a session needs you), whatever your sessions say', v => { fakeLamp = v; });
// a paper lantern's flame, seen through its paper: how soft its tongues' edges are, in scene units (background.ts FLAME), and
// how far the wind leans it (in place of style.flameWind, frame.ts stepFlame), the paper sheltering it from most of what leans the candle's (6)
export let paperSoft = devSlider('Flame', 'papersoft', 'softness', 0, 20, 0.5, 9, 'How soft a paper lantern\'s flame looks through its paper', v => { paperSoft = v; });
export let paperWind = devSlider('Flame', 'paperwind', 'wind', 0, 6, 0.1, 1, 'How far the wind leans a paper lantern\'s flame (the candle\'s leans 6, the Moroccan\'s 2)', v => { paperWind = v; });
export let paperBounce = devSlider('Flame', 'paperbounce', 'paper bounce (higher = bouncier)', 0, 1, 0.05, 0.6, 'How much a paper lantern\'s flame bobs in height and kicks when the lantern swings (the candle\'s and the Moroccan\'s are 1; the light follows it)', v => { paperBounce = v; });
export let flickerFollow = devSlider('Flame', 'flicker', 'flicker', 0, 1.5, 0.05, 0.8, 'How much the light brightens and dims as the flame stretches and shrinks (0: steady)', v => { flickerFollow = v; });
// the lantern's swing (frame.ts): its period in seconds, how damped it is (a ratio, lower rocks longer), how many seconds it
// takes to forget a push the wind holds, and how hard the wind's changes push it; and how many seconds a gust of the
// scene's wind lasts on average (?period=, ?damping=, ?forget=, ?gain=, ?gust=)
const SWAY = { period: 3.8, damping: 0.15, forget: 1.4, gain: 1.45, gust: 3.5 };
const swayParam = (k: keyof typeof SWAY) => { const v = Q.get(k); return v === null ? SWAY[k] : +(v || SWAY[k]); };
export const sway = { period: swayParam('period'), damping: swayParam('damping'), forget: swayParam('forget'), gain: swayParam('gain'), gust: swayParam('gust') };
// One wind for the scene, in the sway's degrees: the dust, ribbon and fireflies feel it as it blows, the lantern swings
// with it a moment later (its tassel and knot tail LAG seconds behind). Smooth noise in time: every sway.gust seconds on
// average a new strength and side, eased between, mostly mild (the power of 1.5) so the strong gusts stand out from
// calmer spells, with a faster, fainter flutter on top. Pseudo-random from the clock alone, so every window and the
// snapshots agree; scaled to the strength of the two steady sines it replaced (an RMS of about 1.17).
const rnd = (x: number) => { const v = Math.sin(x * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const knot = (i: number) => { const u = 2 * rnd(i) - 1; return Math.sign(u) * Math.abs(u) ** 1.5; };
// the knots sit at whole numbers nudged up to a quarter either way, so a gust lasts half to one and a half times the average
const knotAt = (i: number) => i + (rnd(i + 0.17) - 0.5) * 0.5;
const noise = (x: number) => {
  let i = Math.floor(x);
  if (x < knotAt(i)) i--; else if (x >= knotAt(i + 1)) i++;
  const f = (x - knotAt(i)) / (knotAt(i + 1) - knotAt(i));
  return knot(i) + (knot(i + 1) - knot(i)) * f * f * (3 - 2 * f);
};
export const GUST = (s: number) => (noise(s / sway.gust) + noise(s / sway.gust * 3.1 + 50) * 0.25) * 2.6, LAG = 0.6;
const SHEENS = SHEEN('brassF', [[270, '#281B0A'], [296, '#493313'], [312, '#6C4E1F'], [318, '#896A32'], [325, '#A1844B'], [332, '#896A32'], [340, '#735222'], [356, '#6E4A1A'], [372, '#5A3A14'], [392, '#45290E'], [410, '#3A2410']])
  + SHEEN('brassS', [[270, '#211608'], [284, '#463114'], [292, '#5A431C'], [302, '#3E2B10'], [318, '#5A401C'], [325, '#7D6232'], [332, '#5A401C'], [360, '#4A3010'], [380, '#3E260C'], [410, '#3A2410']])
  + SHEEN('brassE', [[270, '#5A4121'], [310, '#7D6332'], [318, '#90753E'], [324, '#A9915E'], [326, '#B29C6A'], [328, '#A9915E'], [334, '#90753E'], [350, '#7B6232'], [372, '#7A5620'], [400, '#5A3A14'], [410, '#4A2E10']]);
// The onions' gores (left, front, right), each flat across and curved top to bottom: frame.ts gives each stop of a gore's
// gradient the tone of a flat face at that gore's angle, tilted as its profile is there, so the whole gore brightens and
// dims with the twist. `profile` is how far the surface tilts up (degrees) at points from the base (0) to the tip (1): the
// dome's bulge turning up to the light above its widest point and steepening again into the tip, the drop turning ever
// further down. `left` and `right` are the side gores' halves of the outline; the front gore covers the middle.
interface Gore { base: number; tip: number; profile: Point[]; left: string; right: string }
const GORES: Record<'dome' | 'bottom', Gore> = { dome: { base: 244, tip: 154, profile: [[0, -25], [0.13, 0], [0.36, 30], [0.51, 45], [0.67, 22], [0.82, -5], [1, -35]],
    left: 'M340 154L340 244L294 244C292.1 227 296.8 212 313.7 198C330.6 184 338.1 174 340 154Z', right: 'M340 154C341.9 174 349.4 184 366.3 198C383.2 212 387.9 227 386 244L340 244Z' },
  bottom: { base: 434, tip: 486, profile: [[0, 0], [0.2, -30], [0.5, -60], [0.75, -60], [1, -45]],
    left: 'M302 434C301 452 314 462 326 470C334 475 338 480 340 486L340 434Z', right: 'M340 486C342 480 346 475 354 470C366 462 379 452 378 434L340 434Z' } };
const GORE = (id: string, angle: number, part: Gore) => `<linearGradient id="${id}" class="gore" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${part.base}" y2="${part.tip}"
  data-angle="${angle}">${part.profile.map(([o, e]) => `<stop offset="${o}" data-tilt="${e}"/>`).join('')}</linearGradient>`;
const GORE_DEFS = Object.entries(GORES).map(([k, g]) => GORE(`gore-${k}-F`, 0, g) + GORE(`gore-${k}-L`, -60, g) + GORE(`gore-${k}-R`, 60, g)).join('');
// an onion: its two side gores and its front gore (squeezed to half width, as the front segment of a six-sided shape is)
const ONION_FILL = (k: keyof typeof GORES, d: string) => `<path d="${GORES[k].left}" fill="url(#gore-${k}-L)"/><path d="${GORES[k].right}" fill="url(#gore-${k}-R)"/><path d="${d}" fill="url(#gore-${k}-F)" transform="${HALF_X}"/>`;
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
const PANEL = (half: number, front: number, y: number, h: number, band = false, lift = 0) => {
  const r = (x0: number, x1: number, more: string) => `<path ${more} d="M${x0} ${y}H${x1}v${h}H${x0}Z"/>`;
  return (band ? r(340 - half, 340 + half, 'class="band" fill="none"') : '')
    + r(340 - half, 340 - front, FLAT(-60, lift)) + r(340 - front, 340 + front, FLAT(0, lift)) + r(340 + front, 340 + half, FLAT(60, lift));
};
// A flat part's paint: one tone by the angle round the lantern it faces and its `lift` (frame.ts shades every [data-facet]
// each frame). A sloping face (shoulder, skirt) also tilts up (or down, below 0) by `tilt` degrees.
const FLAT = (angle: number, lift = 0, paint = 'fill', tilt = 0) => `data-facet="${angle}" data-lift="${lift}" data-paint="${paint}"${tilt ? ` data-tilt="${tilt}"` : ''}`;
// The shoulder and skirt are flat-faced too (only the onion dome and drop are round): three sloping faces each, tilted up 36
// degrees and down 57, and their corner edges. `faces` are [path, angle]; strokes are their corner edges, a little lit.
const SLOPED = (faces: [string, number][], tilt: number, paint = 'fill') => faces.map(([d, a]) => `<path d="${d}" ${FLAT(a, paint === 'stroke' ? 0.15 : 0, paint, tilt)}/>`).join('');
const HALF_X = 'translate(340 0) scale(.5 1) translate(-340 0)'; // the front segment of a six-sided shape spans half its width
const SHOULDER = 'M295 260H385L403 285H277Z', SHOULDER_F = 'M317.5 260H362.5L371.5 285H308.5Z';
const MOROCCAN_SHAPE = `<path d="${DOME}"/><path d="${BOTTOM}"/><path d="M295 244h90v16h-90Z${SHOULDER}M277 285h126v128h-126Z${SKIRT}M300 428h80v6h-80Z"/>`;
// A regular hexagon's side faces turn 60 degrees away, so their lace shows at half width (squeeze); a slanted one (on the
// shoulder and skirt) is also sheared along its slope, `shear` units across per unit down, about height y0.
const LACE = (clip: string, squeeze = 1, k = 1, shear = 0, y0 = 0) => `<g clip-path="url(#${clip})"><rect x="200" y="100" width="280" height="420"/>
  <rect x="0" y="0" width="680" height="800" fill="url(#lace)" transform="matrix(1 0 ${shear} 1 ${-shear * y0} 0) translate(340 0) scale(${squeeze * k} ${k}) translate(-340 0)"/></g>`;
// a rope-twist rim at height y, `half` wide either side, its front face `front` wide either side
// The twist's stripes are spaced along the true way round the hexagon, so they carry on across each corner and crowd to half
// spacing on the side faces, which turn away (half their width shows).
const ROPE = (y: number, half = 63, front = half / 2) => {
  const at = (u: number) => Math.abs(u) <= front ? u : Math.sign(u) * (front + (Math.abs(u) - front) / 2), end = 3 * front; // true distance → x
  let twist = '';
  for (let u = -end; u <= end + 2.5; u += 3) {
    const lo = Math.max(-end, u - 2.5), hi = Math.min(end, u); // each stripe leans 2.5 over the rim's 5
    twist += `M${(340 + at(lo)).toFixed(2)} ${y + 5 - (lo - u + 2.5) * 2}L${(340 + at(hi)).toFixed(2)} ${y + (u - hi) * 2}`;
  }
  return `${PANEL(half, front, y, 5, true)}<path d="${twist}" stroke="#4A3A16" stroke-width="1"/>`;
};
const LACE_TILE = (id: string, stroke: string) => `<pattern id="${id}" width="10" height="12" patternUnits="userSpaceOnUse" x="0" y="2"><g fill="none" stroke="${stroke}" stroke-width="1.3">
    <path d="M0 0C0 3 5 3 5 6C5 9 10 9 10 12M10 0C10 3 5 3 5 6C5 9 0 9 0 12"/><circle cx="0" cy="6" r="1.3"/><circle cx="10" cy="6" r="1.3"/>
    <path d="M5 -1.8Q6.3 0 5 1.8Q3.7 0 5 -1.8ZM5 10.2Q6.3 12 5 13.8Q3.7 12 5 10.2Z"/><path d="M2.2 6Q3.4 4.6 2.6 3.4M7.8 6Q6.6 7.4 7.4 8.6"/></g></pattern>`;
// The room reflected as a darker band across the body's middle, held level with the window (#horizon, frame.ts), and the
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
const CUTOUTS = (id: string, k = 1) => `<mask id="${id}" maskUnits="userSpaceOnUse" x="260" y="120" width="160" height="380"><rect x="260" y="120" width="160" height="380" fill="#fff"/>
    ${LACE('domeSide', 0.55, 0.7 * k)}${LACE('domeFront', 1, 0.7 * k)}
    <path d="M299 248h6v8h-6ZM308 248h6v8h-6ZM323 248h9v8h-9ZM335.5 248h9v8h-9ZM348 248h9v8h-9ZM366 248h6v8h-6ZM375 248h6v8h-6Z" transform="translate(340 252) scale(${k}) translate(-340 -252)"/>
    ${LACE('shoulderL', 0.5, 0.8 * k, -0.54, 272.5)}${LACE('shoulderR', 0.5, 0.8 * k, 0.54, 272.5)}${LACE('shoulderF', 1, 0.8 * k)}
    ${LACE('faceL', 0.5, k)}${LACE('faceR', 0.5, k)}${LACE('faceF', 1, k)}${LACE('skirtL', 0.5, 0.8 * k, 1.15, 420.5)}${LACE('skirtR', 0.5, 0.8 * k, -1.15, 420.5)}${LACE('skirtF', 1, 0.8 * k)}
    ${LACE('bottomSide', 0.55, 0.7 * k)}${LACE('bottomFront', 1, 0.7 * k)}</mask>`;
// The far wall, drawn by the background's WebGL under the SVG (background.ts drawFarWall), baked here once into a
// texture: red its brass, the same pierced design part for part (the same cutouts: windows under the frieze, lace elsewhere,
// side faces foreshortened) at 0.92 scale for distance, green the lantern's outline it stays inside. 4 texels a unit.
const FAR_WALL_SVG = (fill: string, k: number) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="250 140 180 360" width="720" height="1440">
  <defs>${LACE_TILE('lace', '#fff')}${LACE_CLIPS}${CUTOUTS('cutouts', k)}</defs><g fill="${fill}"${k ? ' mask="url(#cutouts)"' : ''}>${MOROCCAN_SHAPE}</g></svg>`);
function bakeFarWall() {
  if (!style.farWall || live.farWall) return;
  const c = document.createElement('canvas'), g = c.getContext('2d'), brass = new Image(), outline = new Image();
  c.width = 720; c.height = 1440;
  let n = 0;
  brass.onload = outline.onload = () => {
    if (++n < 2 || !g) return;
    g.drawImage(brass, 0, 0); g.globalCompositeOperation = 'lighter'; g.drawImage(outline, 0, 0);
    live.farWall = c; // background.ts uploads it
  };
  brass.src = FAR_WALL_SVG('#f00', 0.92); outline.src = FAR_WALL_SVG('#0f0', 0);
}
// The front's pierced design (#cutouts in MOROCCAN_DEFS) baked into a picture, the brass opaque and the holes clear, and
// used as an alpha mask in its place. The lantern sways, so it repaints every frame, and WebKit redraws a vector mask and
// turns it into luminance each time: about a third of the GPU process's CPU on the Moroccan at 2560x1440. It's baked at
// the screen's pixels per unit. A resize only rescales the picture on show; once the window settles it's baked again at the
// new size (if that's off by 10% or more), and swapped in only when decoded, so the lace never blinks to the vector mask.
// Until the first bake is ready the vector mask stands in.
const cutouts = { k: 0, want: 0, pic: '' };
let cutoutsMask: SVGMaskElement | null = null, cutoutsTimer: ReturnType<typeof setTimeout> | undefined;
export function bakeCutouts() {
  const m = byId('cutouts', SVGMaskElement), px = VIEW.px;
  if (!m || !px) return; // not the Moroccan, or not laid out yet
  const show = (m: SVGMaskElement) => { cutoutsMask = m; m.style.maskType = 'alpha'; m.innerHTML = `<image href="${cutouts.pic}" x="260" y="120" width="160" height="380" preserveAspectRatio="none"/>`; };
  if (cutouts.pic && m !== cutoutsMask) show(m); // a fresh mask (a style switch): the picture we have, at once
  clearTimeout(cutoutsTimer);
  const bake = async () => {
    const k = px * (devicePixelRatio || 1); // device pixels a unit
    if (Math.abs(k / cutouts.k - 1) < 0.1) return;
    cutouts.want = k; // the newest size asked for
    const c = document.createElement('canvas'), img = new Image(), pic = new Image();
    c.width = Math.ceil(160 * k); c.height = Math.ceil(380 * k);
    img.src = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="260 120 160 380" width="${c.width}" height="${c.height}" preserveAspectRatio="none">
    <defs>${LACE_TILE('lace', '#fff')}${LACE_CLIPS}${CUTOUTS('m')}</defs><rect x="260" y="120" width="160" height="380" fill="#fff" mask="url(#m)"/></svg>`);
    try { await img.decode(); c.getContext('2d')?.drawImage(img, 0, 0); pic.src = c.toDataURL(); await pic.decode(); } catch { return; }
    if (cutouts.want !== k) return; // a newer size is on its way
    cutouts.k = k; cutouts.pic = pic.src; // only once it's baked, so a failed bake tries again at the next resize
    const now = byId('cutouts', SVGMaskElement); // the style may have changed while it baked
    if (now) show(now);
  };
  if (cutouts.pic) cutoutsTimer = setTimeout(bake, 200); else bake(); // the first one at once
}
const MOROCCAN_DEFS = `${SHEENS}${GORE_DEFS}${MOROCCAN_LIGHT_DEFS}${LACE_TILE('lace', '#fff')}
${LACE_CLIPS}${CUTOUTS('cutouts')}`;
// Paper stretched over rib wires sinks in a little between them: its outline scallops in by `dip` between wires, and a flat
// darker band runs through the middle of each gap. `half(y)` is the paper's half-width at height y, `ribs` the wire heights
// from its top edge to its bottom edge, and `bow(y)` how far a wire's front arc bends there (its curve's control offset).
const SUNKEN = (cx: number, half: (y: number) => number, ribs: number[], dip: number, bow: (y: number) => number) => {
  const n = (v: number) => +v.toFixed(2), gaps = ribs.slice(1).map((b, i): Point => [ribs[i] ?? b, b]);
  const arc = (y: number, d: number) => `Q${cx} ${n(y + bow(y))} ${n(cx + d * half(y))} ${n(y)}`; // a wire's front arc, ending on side d
  const side = (a: number, b: number, d: number) => { // down the left (d -1) or up the right (d 1), through the sunken midpoint of the gap
    const [y0, y1] = d < 0 ? [a, b] : [b, a], m = (a + b) / 2, mx = cx + d * (half(m) - dip);
    return `Q${n(2 * mx - cx - d * (half(y0) + half(y1)) / 2)} ${n(m)} ${n(cx + d * half(y1))} ${n(y1)}`;
  };
  const top = ribs[0] ?? 0, bottom = ribs[ribs.length - 1] ?? 0;
  const band = (y0: number, y1: number) => `<path d="M${n(cx - half(y0))} ${n(y0)}${arc(y0, 1)}L${n(cx + half(y1))} ${n(y1)}${arc(y1, -1)}Z"/>`;
  return {
    outline: `M${n(cx - half(top))} ${n(top)}${gaps.map(([a, b]) => side(a, b, -1)).join('')}${arc(bottom, 1)}`
      + `${gaps.reverse().map(([a, b]) => side(a, b, 1)).join('')}${arc(top, -1)}Z`,
    bands: gaps.map(([a, b]) => band(a + 0.32 * (b - a), b - 0.32 * (b - a))).join(''),
    wires: ribs.slice(1, -1).map(y => `<path d="M${n(cx - half(y))} ${n(y)}${arc(y, 1)}"/>`).join(''),
  };
};
// A paper lantern's paper (style.surface), so whatever is printed on it (pages.ts) follows the same curves, in the units
// it's drawn in: its middle `cx`, its top and bottom, its wires `ribs`, each wire's front bow `bow(y)` (as in SUNKEN), its
// half-width `half(y)` and widest `r`, the gap between wires its type is sized for and how many `lines` share it (on
// the chōchin, with its wires twice as far apart, a little larger than the barrel's), how many blocks of words it
// shows at once (`shown`), and the ellipse its words are read
// by, centred just above the flame. A round one also has `cy` and `ry`, the centre and vertical radius of its curve.
// the Odawara barrel: a straight cylinder on 20 close wires (top and bottom edges included), each bowed from the flame's
// height like its drums. `cap` is the half-width of the lacquer drums where they grip the paper.
const BARREL_RIBS = Array.from({ length: 20 }, (_, i) => 216 + (445 - 216) * i / 19);
const BARREL: Omit<Surface, 'outline'> & { cap: number } = { cx: 340, r: 60, cap: 63, top: 216, bottom: 445, bow: y => 120 * (y - 350) / 1350, half: () => 60,
  light: { cx: 340, cy: 340, rx: 88, ry: 165 }, ribs: BARREL_RIBS, gap: (BARREL_RIBS[1] ?? 0) - (BARREL_RIBS[0] ?? 0), lines: 2, shown: 8 };
const ODAWARA = SUNKEN(BARREL.cx, BARREL.half, BARREL.ribs, 1.2, BARREL.bow);
// the chōchin, in its mockup units: round (a little wider than tall), its wires wider apart and bowing away from the
// middle, so it sinks in less
const BALL: Omit<Surface, 'outline'> & { cy: number, ry: number } = { cx: 95, cy: 122, r: 52, ry: 48, top: 74, bottom: 170, gap: 10, lines: 3, shown: 10, bow: y => 0.115 * (y - 122),
  ribs: [74, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170], light: { cx: 95, cy: 120, rx: 76, ry: 69 },
  half: y => 52 * Math.sqrt(Math.max(0, 1 - ((y - 122) / 48) ** 2)) };
const CHOCHIN = SUNKEN(BALL.cx, BALL.half, BALL.ribs, 0.35, BALL.bow);
// A lacquered drum (the barrel's ends, the chōchin's caps), cel-shaded in flat tones: lit lacquer with a darker side on
// the right, and an ink outline. Where it grips the paper (`paper` 1 for paper below it, -1 above, 0 for neither) it has a
// dark lip, and a rim facing the paper that catches the flame (class paperLit, coloured each frame). Its top edge is at y,
// and its edges bow like the wires, seen from the flame's height: `kit.bow(y)` per unit of half-width.
// A kit is one lantern's lacquer: its centre, bow, where the dark side starts (a share of the half-width), colours, the
// outline's weight, the lip's height and colour, and the rim's inset, gap from the drum, and weight.
interface Lacquer {
  cx: number; bow: (y: number) => number; side: number; lit: string; dark: string; ink: string; line: number;
  lip: [number, string]; rim: [number, number, number];
}
const LACQUER: Record<'barrel' | 'chochin', Lacquer> = {
  barrel: { cx: BARREL.cx, bow: y => BARREL.bow(y) / BARREL.r, side: 0.44, lit: '#3B2A24', dark: '#1F1512', ink: '#0E0907', line: 1.2,
    lip: [3.2, '#140D0B'], rim: [3, 1.3, 1.4] },
  chochin: { cx: 95, bow: y => (y < 122 ? -4 : 4) / 19, side: 8 / 19, lit: '#46302F', dark: '#22171A', ink: '#140C0E', line: 0.55,
    lip: [1.4, '#1A1012'], rim: [1.5, 0.4, 0.6] },
};
const DRUM = (kit: Lacquer, y: number, half: number, height: number, paper = 0) => {
  const { cx, bow, lip: [lipH, lipFill], rim: [inset, gap, rimW] } = kit, n = (v: number) => +v.toFixed(2), bottom = y + height;
  const arc = (y: number, h: number, d: number) => `Q${cx} ${n(y + h * bow(y))} ${n(cx + d * h)} ${n(y)}`; // an edge's front arc, ending on side d
  const band = (a: number, b: number) => `M${n(cx - half)} ${n(a)}${arc(a, half, 1)}V${n(b)}${arc(b, half, -1)}Z`;
  const on = (y: number, f: number) => `${n(cx + f * half)} ${n(y + half * bow(y) * (1 - f * f) / 2)}`; // f of the way out along that arc
  const fs = [0, 1, 2, 3, 4].map(i => kit.side + (1 - kit.side) * i / 4), rimY = paper > 0 ? bottom + gap : y - gap;
  return `<path d="${band(y, bottom)}" fill="${kit.lit}"/>` + (kit.dark === 'none' ? '' : `<path d="M${[...fs.map(f => on(y, f)), ...fs.reverse().map(f => on(bottom, f))].join('L')}Z" fill="${kit.dark}"/>`)
    + (paper ? `<path d="${paper > 0 ? band(bottom - lipH, bottom) : band(y, y + lipH)}" fill="${lipFill}"/>` : '')
    + `<path d="${band(y, bottom)}" fill="none" stroke="${kit.ink}" stroke-width="${kit.line}" stroke-linejoin="round"/>`
    + (paper ? `<path class="paperLit" d="M${n(cx - half + inset)} ${n(rimY)}${arc(rimY, half - inset, 1)}" fill="none" stroke="currentColor" stroke-width="${rimW}"/>` : '');
};
// A string's hash, for seeding.
export const hash = (str: string | undefined) => [...String(str)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
// Random-looking numbers that every window agrees on: seeded from a session's id, so the lantern in the toolbelt,
// the Dock app and the screensaver all put a moth in the same place, and the candle's vine grows the same (mulberry32).
export const seeded = (seed: number) => () => {
  let t = seed = (seed + 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
// The pillar candle is an ivory pillar on a bronze altar candlestick wound with a grapevine. It stands on its own foot
// instead of hanging (style.stands), and is drawn seen from its light's height by the barrel's rule. An edge d below
// that sags d / 1350 of its half-width at the front, so the rim, just under the flame, is edge-on and the drip pan and
// foot are seen from above. makeCandle draws it, and gives its style (STYLES.candle) with the numbers it was drawn from;
// the tests draw it at other numbers too: the pillar's half-width `r` and crown `rim`, the stem's height `stem`, and the
// drawing's neck `neck`.
export const HOP = 16; // how high a restless landed moth hops off its spot (mothTarget)
// Landing spots run from 0.5 - PERCH_SPREAD to 0.5 + PERCH_SPREAD of the way down a body (perchAt).
export const PERCH_SPREAD = 0.44;
export function makeCandle({ r: R = 50, rim = 275, stem: STEM = 41, neck = 460 } = {}) {
  // The pillar's numbers place the flame, the light, the shade and the wax moths land on: its middle, half-width, crown
  // (the rim, at its mean height), bottom (hidden in the pan, 200 below the rim), the pan's rim, the eye (the flame's
  // core: where the light comes from, and the drawing's eye height) and the shared flame, standing on the crown.
  const PILLAR = { cx: 340, r: R, rim, bottom: rim + 200, dish: rim + 186, eye: rim - 18, flame: [340, rim - 2, 0.8] satisfies Style['flame'] };
  // The candlestick is drawn in its own units, its pan at `dish`, its stem from the pan's neck at `neck` down to the foot's
  // collar at `collar` and its foot on a slab at `slab`, and placed from there (stick, below).
  const DRAWN = { dish: 426, neck, collar: 518, slab: 549 };
  // The marble pedestal the candlestick stands on is a round slab, `depth` deep with its top at `top`, on a fluted column
  // `column` either side of the middle that runs down to the window's bottom edge. The candlestick's foot stands on it,
  // under a stem STEM tall between the pan's neck and the foot's collar.
  // The vine (vineTop): its trunk is laid out from `anchor` up, curving across the front of the column to `split`, where it
  // divides into its branches; below `anchor` it runs on down as far as the window goes (the split shows 151 below the
  // slab's bottom edge, five times the 30 it first sat).
  const top = PILLAR.dish + (DRAWN.neck - DRAWN.dish) + STEM + (DRAWN.slab - DRAWN.collar), split = top + 172;
  const PEDESTAL = { top, r: 112, depth: 14, column: 85, split, anchor: split + 200 };
  // bronze, shaded across each curve by one gradient lit by the flame (frame.ts drawShine)
  const K: Lacquer = { cx: PILLAR.cx, bow: y => 2 * (y - PILLAR.eye) / 1350, side: 0.44, lit: 'url(#cdBronze)', dark: 'none', ink: '#160A03', line: 1.2,
    lip: [0, '#160A03'], rim: [0, 0, 0] };
  const cx = PILLAR.cx, n = (v: number) => +v.toFixed(2), pt = ([x, y]: Point) => `${n(x)} ${n(y)}`;
  const GILT = '#B57A40'; // the pan's lip, catching the light
  const sag = (y: number, h: number) => h * K.bow(y) / 2; // how far down an edge `h` wide either side dips at its front
  // The candlestick placed from its drawn units (DRAWN): the pan and all on it under the pillar, the foot and all on it on
  // the pedestal, and the stem between, scaled about the middle to STEM tall, so a part keeps its shape.
  const k = STEM / (DRAWN.collar - DRAWN.neck);
  const stick = ([x, y]: Point): Point => y <= DRAWN.neck ? [x, y + PILLAR.dish - DRAWN.dish]
    : y >= DRAWN.collar ? [x, y + PEDESTAL.top - DRAWN.slab] : [cx + (x - cx) * k, PILLAR.dish + DRAWN.neck - DRAWN.dish + (y - DRAWN.neck) * k];
  const Y = (y: number) => stick([cx, y])[1];
  const WAX = ['#EADBC0', '#CDB894'], DRIP = { lit: ['#F2E6CF', '#CDB690'], dark: ['#D9C6A2', '#B9A27C'] }; // lit, dark side
  // a turned bronze part from its profile, [y, half-width] top to bottom. It closes with its bottom edge's front arc and
  // its top edge's back arc (seen from above), or with `bowl` its top edge's front arc, as a pan's bowl hangs under its rim;
  // in the bronze (or `fill`), in an ink outline
  const turned = (id: string, prof: Point[], bowl = false, fill = K.lit) => {
    const [y0, h0] = nth(prof, 0), [y1, h1] = nth(prof, prof.length - 1);
    const d = `M${prof.map(([y, h]) => pt([cx - h, y])).join('L')}Q${cx} ${n(y1 + 2 * sag(y1, h1))} ${n(cx + h1)} ${n(y1)}`
      + `L${[...prof].reverse().map(([y, h]) => pt([cx + h, y])).join('L')}Q${cx} ${n(y0 + (bowl ? 2 : -2) * sag(y0, h0))} ${n(cx - h0)} ${n(y0)}Z`;
    return `<path id="${id}" d="${d}" fill="${fill}" stroke="${K.ink}" stroke-width="${K.line}" stroke-linejoin="round"/>`;
  };
  // a plain ring, `height` tall and `h` either side, its top face showing, with its rim's front edge inked
  const ring = (id: string, y: number, h: number, height: number) => turned(id, [[y, h], [y + height, h]])
    + `<path d="M${n(cx - h)} ${n(y)}Q${cx} ${n(y + 2 * sag(y, h))} ${n(cx + h)} ${n(y)}" fill="none" stroke="${K.ink}" stroke-width="${K.line}"/>`;
  const profile = (y0: number, y1: number, half: (y: number) => number, steps = 12) => Array.from({ length: steps + 1 }, (_, i): Point => { const y = y0 + (y1 - y0) * i / steps; return [y, half(y)]; });
  // a curve through points, rounding each corner between them
  const smooth = (ps: Point[]) => `M${pt(nth(ps, 0))}${ps.slice(1, -1).map((p, i) => { const q = nth(ps, i + 2); return `Q${pt(p)} ${pt([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2])}`; }).join('')}L${pt(nth(ps, ps.length - 1))}`;
  // the crown's back wall, ragged and melted round at the shoulders; its front wall runs a unit below (the lip)
  // (each point is across the pillar from -1 to 1, and up from the rim)
  const side = cx + K.side * R; // where the pillar's dark side starts
  const CROWN = ([[-1, 9.5], [-1, -1], [-0.6, -2.2], [-0.24, -1], [0.24, -0.8], [0.6, -1.6], [1, -1], [1, 20] // the left starts where smooth() ends the right's curve, so the shoulders mirror
    ] satisfies Point[]).map(([u, dy]): Point => [cx + u * R, rim + dy]);
  const PILLAR_D = `${smooth(CROWN)}V${PILLAR.bottom}H${cx - R}Z`;
  // drips from the crown: [middle, width, where it ends, and where a second bulge sits on the way down], each ending in a
  // bulb 1.3 times its width; the main one runs out of the notch. Each middle is across the pillar from -1 to 1, and the
  // drops are below the rim.
  type Drip = [middle: number, width: number, end: number, bulge?: number];
  const DRIPS = ([[-0.78, 6, 76], [-0.5, 4.5, 22], [-0.2, 5.5, 48], [0.18, 4, 16], [0.56, 8, 98, 60], [0.8, 5, 56]] satisfies Drip[])
    .map(([u, w, e, bulge]): Drip => bulge ? [cx + u * R, w, rim + e, rim + bulge] : [cx + u * R, w, rim + e]);
  const NOTCH = nth(DRIPS, 4)[0]; // the main drip's middle
  const dripD = ([c, w, e, bulge]: Drip) => {
    const r = 0.65 * w, y = n(e - r - Math.sqrt(r * r - w * w / 4)), b = n(0.6 * w);
    return `M${n(c - w / 2)} ${rim}V${y}A${n(r)} ${n(r)} 0 1 0 ${n(c + w / 2)} ${y}V${rim}Z` + (bulge ? `M${n(c - b)} ${bulge}a${b} ${b} 0 1 0 ${2 * b} 0a${b} ${b} 0 1 0 ${-2 * b} 0Z` : '');
  };
  const drips = DRIPS.map(d => {
    const [lit, dark] = d[0] > side ? DRIP.dark : DRIP.lit, r = 0.65 * d[1];
    return `<path d="${dripD(d)}" fill="${lit}"/><rect x="${n(d[0] + d[1] / 6)}" y="${rim}" width="${n(r + 1 - d[1] / 6)}" height="${d[2] - rim + 1}" fill="${dark}" clip-path="url(#cdDrips)"/>`;
  }).join('');
  // grapes in three shades, light to dark (cdGrape0 to 2): a little oval, rounded by a radial gradient lit from above with
  // a dark rim, in a soft outline, the lighter two dusted with a faint bloom
  const GRAPE = [['#8A5AA4', '#5A3274', '#2A1436'], ['#74468E', '#48285E', '#22102C'], ['#5C3474', '#381E4A', '#1A0B22']].map(([lit, mid, rim], i) =>
    `<radialGradient id="cdGrapeG${i}" cx=".42" cy=".3" r=".75"><stop offset="0" stop-color="${lit}"/><stop offset=".55" stop-color="${mid}"/><stop offset="1" stop-color="${rim}"/></radialGradient>`
    + `<g id="cdGrape${i}"><ellipse cx="0" cy="0" rx="4.7" ry="5.3" fill="url(#cdGrapeG${i})" stroke="#1A0E20" stroke-width=".5" stroke-opacity=".8"/>`
    + (i < 2 ? '<ellipse transform="translate(-1.2 -1.8)" cx="0" cy="0" rx="2.6" ry="2" fill="#E8E0F2" opacity=".14"/>' : '') + '</g>').join('');
  // a bunch's grapes, back to front (the higher first): those at its back and bottom darker, with a little seeded variety,
  // each 0.9 to 1.1 times the size; `glints` keeps where each is, for their glints
  const grapeUses = (ps: Point[], glints = false) => ps.map(([x, y], i) => {
    const r = seeded(hash(`${n(x)} ${n(y)}`)), shade = Math.max(0, Math.min(2, Math.floor(3 * i / ps.length + r() - 0.5)));
    if (glints) GRAPES.push([n(x), n(y)]);
    return `<use href="#cdGrape${shade}" x="${n(x)}" y="${n(y)}" transform="translate(${n(x)} ${n(y)}) scale(${n(0.9 + 0.2 * r())}) translate(${n(-x)} ${n(-y)})"/>`;
  }).join('');
  const GRAPES: Point[] = []; // every grape drawn with a glint, for their glints
  // the glints on the grapes from the `from`th drawn on, in their order (frame.ts drawShine)
  const grapeGlints = (from: number) => GRAPES.slice(from).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1" opacity="0"/>`).join('');
  // a hex-packed bunch, in rows of `rows` grapes 9.6 apart, 8.4 down, from (x, y), each row `lean` further over; a row the
  // same parity as the one above shifts half a grape so they nest
  const bunch = (x: number, y: number, rows: number[], lean: number) => {
    let shift = -2.4;
    return rows.flatMap((count, i) => {
      if (i && count % 2 === nth(rows, i - 1) % 2) shift = -shift;
      return Array.from({ length: count }, (_, j): Point => [x + lean * i + shift + 9.6 * (j - (count - 1) / 2), y + 8.4 * i]);
    });
  };
  // a vine leaf of five pointed lobes, the middle longest: stem at (x, y), `w` across, pointing `deg` from straight up;
  // lit on its left half, three veins from the stem to the main tips
  const EDGE: [Point, Point][] = [[[0.3, -0.02], [0.5, -0.22]], [[0.3, -0.26], [0.22, -0.36]], [[0.4, -0.44], [0.44, -0.66]], [[0.26, -0.62], [0.14, -0.66]], [[0.14, -0.86], [0, -1]]];
  const leaf = (x: number, y: number, w: number, deg: number) => {
    const a = deg * Math.PI / 180, at = ([u, v]: Point) => pt([x + w * (u * Math.cos(a) - v * Math.sin(a)), y + w * (u * Math.sin(a) + v * Math.cos(a))]);
    const half = (side: number) => `M${at([0, 0])}${EDGE.map(([c, p]) => `Q${at([side * c[0], c[1]])} ${at([side * p[0], p[1]])}`).join('')}Z`;
    return `<path d="${half(-1)}" fill="#5E6B33"/><path d="${half(1)}" fill="#3D4721"/>`
      + `<path d="M${at([0, 0])}L${at([0, -0.92])}M${at([0, 0])}L${at([0.38, -0.6])}M${at([0, 0])}L${at([-0.38, -0.6])}" fill="none" stroke="#283016" stroke-width=".7"/>`
      + `<path d="${half(-1)}${half(1)}" fill="none" stroke="#1A200D" stroke-width=".8" stroke-linejoin="round"/>`;
  };
  // the pedestal's old vine, thick, in an ink outline
  const VINE = '#5B5129', VINE_INK = '#1F1A0C';
  // the pedestal, by the candlestick's rule, in cool marble lit from the left, its right side in shade as the wax is
  const P = PEDESTAL, left = cx - P.r, slabY = P.top + P.depth, col = P.column, FOOT = 74; // the foot's half-width
  // the domed foot's half-width at drawn height yd, an ogee from the collar's width (20) out to its base ring's (FOOT)
  const dome = (yd: number) => 20 + (FOOT - 20) * ((u: number) => u * u * (3 - 2 * u))((yd - 523) / 20);
  const MARBLE = { ...K, lit: '#CFC9D8', dark: '#8A8396', ink: '#2A2333' };
  // every rim of the pedestal is a true ellipse at the slab top's tilt: its depth is T of its width
  const T = sag(P.top, P.r) / P.r, rimRy = (r: number) => n(r * T);
  // the point `th` radians round the column from the front (positive to the right), `R` from its middle, at height y
  const round = (R: number, th: number, y: number): Point => [cx + R * Math.sin(th), y + R * T * Math.cos(th)];
  // ---- the grapevine: an old woody trunk winding up the column and over the slab, branching out in front of the stone
  // and arcing back, every leaf, tendril and bunch on it. Seeded, so every window grows the same vine.
  const VINE_LIT = '#80733C';
  // a woody limb along `pts`, `ws[i]` wide at each, gnarled by `rand` (knots and thin stretches): filled, inked along its
  // two sides only (so a branch drawn from inside its trunk joins it with no line across), lit along its left. Standing off
  // the stone, it also lays a soft shadow `shadow` below it on the column.
  const limb = (pts: Point[], ws: number[], rand: () => number, shadow = 0) => {
    let g = 0;
    const L: Point[] = [], R: Point[] = [];
    pts.forEach((p, i) => {
      const a = nth(pts, Math.max(0, i - 1)), b = nth(pts, Math.min(pts.length - 1, i + 1)), dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
      g = 0.7 * g + 0.3 * (2 * rand() - 1) + (rand() < 0.05 ? 0.7 : 0); // now and then a knot
      const w = nth(ws, i) * Math.max(0.6, 1 + 0.45 * g) / 2;
      L.push([p[0] + dy / d * w, p[1] - dx / d * w]); R.push([p[0] - dy / d * w, p[1] + dx / d * w]);
    });
    const left = nth(L, 0)[0] < nth(R, 0)[0] ? L : R, // the left as it starts, so a longer limb doesn't change it
      d = `M${[...L, ...[...R].reverse()].map(pt).join('L')}Z`;
    return (shadow ? `<path d="${d}" fill="#241C30" opacity=".22" transform="translate(${n(shadow * 0.3)} ${n(shadow)})" clip-path="url(#cdColClip)"/>` : '')
      + `<path d="${d}" fill="${VINE}"/><path d="M${L.map(pt).join('L')}M${R.map(pt).join('L')}" fill="none" stroke="${VINE_INK}" stroke-width=".9" stroke-linejoin="round" stroke-linecap="round"/>`
      + (pts.length > 2 ? `<path d="M${left.slice(1, -1).map(pt).join('L')}" fill="none" stroke="${VINE_LIT}" stroke-width=".7" stroke-linecap="round"/>` : '');
  };
  // a shoot from `p`, `steps` steps of `len` heading `a` (radians, y down), turning by `curl` a step and more as it goes
  // (`tighten`), kinked a little by `rand`: its points, start included
  const shoot = (p: Point, a: number, steps: number, len: number, curl: number, tighten: number, rand: () => number) => {
    const pts = [p];
    for (let i = 0; i < steps; i++) {
      a += curl * (1 + tighten * i) + (rand() - 0.5) * 0.35;
      const [x, y] = nth(pts, pts.length - 1);
      pts.push([x + Math.cos(a) * len, y + Math.sin(a) * len]);
    }
    return { pts, a };
  };
  // something that flutters in the wind about `p` (frame.ts drawLeaves), `k` as much as a mid-sized leaf
  // `low` and `deg` (where it points, from straight up) are a leaf's (leafOn)
  const flutter = (p: Point, k: number, svg: string, low = -1, deg = 0) => `<g class="cdLeaf" data-at="${pt(p)}" data-k="${n(k)}" data-deg="${n(deg)}"${low < 0 ? '' : ` data-low="${low}"`}>${svg}</g>`;
  // a curling tendril from `p`, heading `a`, coiling `side` (1 or -1)
  const tendril = (p: Point, a: number, side: number, rand: () => number) => flutter(p, 0.4, `<path d="M${shoot(p, a, 14, 2.2, side * 0.18, 0.12, rand).pts.map(pt).join('L')}" fill="none" stroke="${VINE}" stroke-width=".9" stroke-linecap="round"/>`);
  // a grape leaf on a stalk from `p`, `w` across, pointing `deg` from straight up. It's drawn at `w` and grown as it
  // flutters (frame.ts drawLeaves), the more the lower it hangs: `low`, 0 down to the vine's split, 1 from 300 below
  const leafOn = (p: Point, w: number, deg: number) => {
    const a = deg * Math.PI / 180, q: Point = [p[0] + Math.sin(a) * w * 0.25, p[1] - Math.cos(a) * w * 0.25];
    return flutter(p, 20 / w, `<path d="M${pt(p)}L${pt(q)}" fill="none" stroke="${VINE}" stroke-width="1.2" stroke-linecap="round"/>${leaf(q[0], q[1], w, deg)}`, // smaller leaves more
      n(Math.min(1, Math.max(0, (p[1] - P.split) / 300))), deg);
  };
  // a tapering bunch hanging (or lying) from its stalk at `p`, its axis `deg` from straight down, rows of grapes from the
  // stalk out; `glints` for grapes with glints (not on the column, which is redrawn)
  const cluster = (p: Point, deg: number, rows: number[], glints = false) => {
    const a = deg * Math.PI / 180, top: Point = [p[0] - Math.sin(a) * 9, p[1] + Math.cos(a) * 9];
    const ps = bunch(0, 0, rows, 0).map(([x, y]): Point => [top[0] + x * Math.cos(a) - y * Math.sin(a), top[1] + x * Math.sin(a) + y * Math.cos(a)]);
    return `<path d="M${pt(p)}Q${pt([p[0] + 3, (p[1] + top[1]) / 2])} ${pt(top)}" fill="none" stroke="${VINE_INK}" stroke-width="2.2" stroke-linecap="round"/>`
      + `<path d="M${pt(p)}Q${pt([p[0] + 3, (p[1] + top[1]) / 2])} ${pt(top)}" fill="none" stroke="${VINE}" stroke-width="1.3" stroke-linecap="round"/>`
      + grapeUses(ps.sort((u, v) => u[1] - v[1]), glints);
  };
  const climbEnd = -1.25, climbTop = P.top + 47, climbR = col + 2; // where the trunk leaves the column for the slab
  const climbAt = round(climbR, climbEnd, climbTop);
  // points along a quadratic curve from a (excluded) by c to b
  const quad = (a: Point, c: Point, b: Point, k = 8) => Array.from({ length: k }, (_, i): Point => { const t = (i + 1) / k, u = 1 - t; return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]; });
  // The vine from PEDESTAL.anchor up is laid out in fixed places, the same at every window size: the trunk curves
  // gnarled partway round the front of the column, thin shoots with leaves and tendrils coming off it, to the split, where
  // it divides into a limb up to the slab (on over it to the foot), one round the column and behind it, and two that arc
  // out in front of the stone and curl back, with leaves, tendrils and bunches. Only the trunk below the anchor depends on
  // the window: it runs on down the column, drawn top-down, so a taller window adds trunk below.
  // the trunk's curve, from the anchor (u 0) to the split (u 1): its distance off the column's axis, angle round it, height
  const stemAt = (u: number): Vec3 => [climbR + 8 + 5 * Math.sin(u * 9), -0.75 + 1.2 * u + 0.2 * Math.sin(u * 13), P.anchor + (P.split - P.anchor) * u];
  const stem = Array.from({ length: 51 }, (_, i) => round(...stemAt(i / 50))), SPLIT = nth(stem, 50);
  // every side branch drawn, for the tests: its name, points and where its leaves grow
  const BRANCHES: { name: string, pts: Point[], leaves: Point[] }[] = [];
  const vineTop = (() => {
    const rand = seeded(hash('candle:vine:top')), limbs: string[] = [], twigs: string[] = [], behind: string[] = [];
    // A limb winding round the column (points, which are in front, widths): all of it drawn behind the column, which hides
    // what's behind it so it shows only round its edges, and its turns in front drawn again over the column, so it comes
    // out from behind the column's edge rather than starting in the air. Its knots are baked into its widths, so the two
    // layers coincide. Its turns in front, for leaves.
    const roundAbout = (pts: Point[], fronts: boolean[], ws: number[], r: () => number) => {
      let g = 0;
      const gw = ws.map(w => { g = 0.7 * g + 0.3 * (2 * r() - 1) + (r() < 0.05 ? 0.7 : 0); return w * Math.max(0.6, 1 + 0.45 * g); }), even = () => 0.5;
      behind.push(limb(pts, gw, even));
      const runs: number[][] = [];
      fronts.forEach((f, i) => { if (f && !fronts[i - 1]) runs.push([]); if (f) runs[runs.length - 1]?.push(i); });
      return runs.filter(run => run.length > 3).map(run => {
        const idx = [...new Set([Math.max(0, nth(run, 0) - 1), ...run, Math.min(pts.length - 1, nth(run, run.length - 1) + 1)])]; // meeting the layer behind
        limbs.push(limb(idx.map(i => nth(pts, i)), idx.map(i => nth(gw, i)), even));
        return run.map(i => nth(pts, i));
      });
    };
    const flare = (n: number, w0: number, w1: number) => Array.from({ length: n }, (_, j) => w1 + (w0 - w1) * (1 - j / (n - 1)) + Math.max(0, 3 - j) * 1.4);
    // a limb from the split, flared where it leaves what it grows from, `w0` to `w1` wide
    const branch = (pts: Point[], w0: number, w1: number, shadow = 6, r = rand) => limb(pts, pts.map((_, j) => w1 + (w0 - w1) * (1 - j / (pts.length - 1)) + Math.max(0, 3 - j) * 1.4), r, shadow);
    // `leaves` leaves spread along `pts` by fraction (from 0.3 to 0.95 of the way), alternating sides, angled off its
    // heading, about `w` across; where they grow
    const leavesAlong = (pts: Point[], leaves: number, w: number, r: () => number) => {
      const at: Point[] = [], last = pts.length - 1;
      for (let j = 0; j < leaves; j++) {
        const i = Math.max(1, Math.round((0.3 + 0.65 * (leaves > 1 ? j / (leaves - 1) : 0.5)) * last)), [u, v] = [nth(pts, i - 1), nth(pts, Math.min(last, i + 1))];
        const heading = Math.atan2(v[1] - u[1], v[0] - u[0]) * 180 / Math.PI + 90;
        twigs.push(leafOn(nth(pts, i), w + 5 * r(), heading + (j % 2 ? 1 : -1) * (50 + 30 * r())));
        at.push(nth(pts, i));
      }
      return at;
    };
    // A side branch named `name`, from `p` heading `a`, `steps` long, curling `curl` a step, `w0` wide where it starts, on its
    // own seeded stream (so adding one reshapes no other). Its `leaves` spread along it, a bunch hangs from it `bunch` of
    // the way along (if any), and a tendril curls off its end.
    const sprout = (name: string, p: Point, a: number, steps: number, curl: number, w0: number, leaves: number, bunch = 0) => {
      const r = seeded(hash(`candle:vine:${name}`)), { pts, a: end } = shoot(p, a, steps, 3.3, curl, 0.015, r), last = pts.length - 1;
      limbs.push(branch(pts, w0, Math.max(1, w0 * 0.28), w0 > 3 ? 6 : 4, r));
      BRANCHES.push({ name, pts, leaves: leavesAlong(pts, leaves, w0 > 3 ? 15 : 12, r) });
      if (bunch) twigs.push(cluster(nth(pts, Math.round(bunch * last)), (r() - 0.5) * 16, [3, 3, 2, 2, 1]));
      twigs.push(tendril(nth(pts, last), end, curl > 0 ? 1 : -1, r));
    };
    // up to where the vine climbs over the slab (climbAt), wandering; round the column both ways at the split
    const up = Array.from({ length: 31 }, (_, j): Point => { const u = j / 30; return [SPLIT[0] + (climbAt[0] - SPLIT[0]) * u + 22 * Math.sin(u * Math.PI) + 6 * Math.sin(u * 10), SPLIT[1] + (climbAt[1] - SPLIT[1]) * u]; });
    // round the column both ways from the split, on round behind it (lying on the stone, so no shadow off it)
    const [R1, th1] = stemAt(1), ths = (to: number, step: number) => Array.from({ length: Math.floor(Math.abs(to - th1) / 0.08) + 1 }, (_, i) => th1 + step * i);
    const wrapThs = ths(Math.PI, 0.08), wrap2Ths = ths(-Math.PI, -0.08);
    const [wrap = []] = roundAbout(wrapThs.map(th => round(R1, th, P.split - (th - th1) * 14)), wrapThs.map(th => Math.cos(th) > 0), flare(wrapThs.length, 6, 2), rand);
    const [wrap2 = []] = roundAbout(wrap2Ths.map(th => round(R1, th, P.split - (th1 - th) * 18)), wrap2Ths.map(th => Math.cos(th) > 0), flare(wrap2Ths.length, 5, 2), rand);
    limbs.push(branch(up, 8, 5, 4));
    twigs.push(leafOn(nth(up, 3), 18, 60), leafOn(nth(up, 7), 22, -40), leafOn(nth(up, 15), 18, 50), leafOn(nth(up, 23), 16, -30), leafOn(nth(up, 27), 14, -50), tendril(nth(up, 19), 0.2, 1, rand),
      cluster(nth(wrap, Math.min(5, wrap.length - 1)), -6, [3, 3, 2, 1]));
    BRANCHES.push({ name: 'wrap', pts: wrap, leaves: leavesAlong(wrap, 3, 15, rand) }, { name: 'wrap2', pts: wrap2, leaves: leavesAlong(wrap2, 4, 15, rand) });
    // thin shoots off the trunk below the split
    ([[9, 1], [21, -1], [34, 1], [43, -1]] satisfies Point[]).forEach(([i, side], j) => sprout(`stem${j}`, nth(stem, i), side > 0 ? -0.6 : Math.PI + 0.6, 8 + (i % 4), -side * 0.13, 2.6, 2));
    // the branches at the split, and two big ones off the climbing limb, one each way, arcing up and round
    sprout('right', SPLIT, -0.35, 22, -0.085, 5.5, 3, 0.9);
    sprout('left', SPLIT, Math.PI + 0.45, 18, 0.1, 5, 3);
    sprout('high', SPLIT, -1.15, 20, 0.07, 5, 3);
    sprout('upR', nth(up, 20), -0.2, 16, -0.11, 4, 3);
    sprout('upL', nth(up, 10), Math.PI + 0.15, 22, 0.09, 5, 4, 0.3);
    // the big right branch, off the climbing limb round the column to the right and on round it nearly twice, each turn in
    // front higher than the last, the last just under the slab; only its turns in front show, each with leaves along it,
    // a bunch on the first
    (() => {
      const r = seeded(hash('candle:vine:bigR')), R = col + 6, [x0, y0] = nth(up, 10), th0 = Math.asin(Math.max(-1, Math.min(1, (x0 - cx) / R)));
      const turn = 2 * Math.PI * 1.85, base = y0 - R * T * Math.cos(th0), top = P.top + 30, us = Array.from({ length: 201 }, (_, i) => i / 200);
      const runs = roundAbout(us.map(u => round(R + 3 * Math.sin(u * 17), th0 + turn * u, base + (top - base) * u)), us.map(u => Math.cos(th0 + turn * u) > 0), us.map(u => 5 - 3.4 * u), r);
      runs.forEach((pts, j) => {
        BRANCHES.push({ name: `bigR${j}`, pts, leaves: leavesAlong(pts, Math.max(3, Math.round(pts.length / 9)), 15, r) });
        if (!j) twigs.push(cluster(nth(pts, Math.round(0.3 * (pts.length - 1))), 0, [3, 3, 2, 2, 1]));
        else twigs.push(tendril(nth(pts, pts.length - 1), -2.6, -1, r));
      });
    })();
    return { back: behind.join(''), front: limbs.join('') + twigs.join('') };
  })();
  // The trunk as one limb, from the split down through the anchor (the fixed curve, stem) and on down the front of the column
  // past `bottom`, wandering a little and thickening. Below the anchor it sets off the way the curve was heading. Its
  // knots run from the split down on their own stream, so a longer trunk keeps the ones above.
  const trunkLine = (bottom: number) => {
    const rand = seeded(hash('candle:vine:trunk')), pts = [...stem].reverse().slice(0, -1), ws = pts.map((_, i) => 10 + 4 * i / 50);
    const below: Point[] = [], s0 = nth(stem, 0), s1 = nth(stem, 1);
    let [x] = s0, dx = (s0[0] - s1[0]) * 4 / (s0[1] - s1[1]); // the curve's slope, carried on down
    for (let y = s0[1], i = 0; y < bottom + 20; y += 4, i++) {
      below.push([x, y]); ws.push(14 + Math.min(4, i * 0.1));
      x += dx;
      dx = 0.85 * dx + (rand() - 0.5) * 1.4 + (s0[0] - x) * 0.03; // easing back toward where it set off, wandering
    }
    return { pts: [...pts, ...below], ws, below };
  };
  const trunk = (bottom: number) => {
    const { pts: line, ws, below: pts } = trunkLine(bottom); // the fixed curve always, however little shows below it
    // now and then a thin leafy shoot off it, one chance in each 60 of trunk, seeded by which 60 it is, so a taller window
    // adds shoots below and never moves one above
    let shoots = '';
    for (let k = 0; (k + 1) * 15 < pts.length; k++) {
      const r = seeded(hash(`candle:vine:shoot:${k}`)), side = k % 2 ? 1 : -1;
      shoots += leafOn(nth(pts, k * 15 + 7), 14, -side * 70); // a leaf on the trunk itself every stretch
      if (r() > 0.6) continue;
      const s = shoot(nth(pts, k * 15 + 3 + Math.floor(r() * 9)), side > 0 ? -0.7 : Math.PI + 0.7, 6 + Math.floor(r() * 5), 3, -side * 0.12, 0.03, r);
      shoots += limb(s.pts, s.pts.map((_, j) => 2.4 - 1.4 * j / s.pts.length), r, 4) + leafOn(nth(s.pts, 3), 12 + 6 * r(), side * (45 + 40 * r()))
        + (r() < 0.5 ? tendril(nth(s.pts, s.pts.length - 1), s.a, -side, r) : leafOn(nth(s.pts, s.pts.length - 1), 10 + 5 * r(), side * 15));
    }
    return `<g id="cdTrunk">${limb(line, ws, seeded(hash('candle:vine:bark')), 5)}</g>` + shoots;
  };
  // the fluted column, solid down to `bottom` (the window's bottom edge, so it never ends in mid-air; drawHang redraws
  // it), the vine up it from below the edge
  const column = (bottom: number) => `<clipPath id="cdColClip"><path d="M${cx - col} ${slabY}V${bottom}H${cx + col}V${slabY}Z"/></clipPath>
    ${vineTop.back}<!-- the vine's turns behind the column -->
    <path d="M${cx - col} ${slabY}V${bottom}H${cx + col}V${slabY}Z" fill="${MARBLE.lit}"/>
    <path d="M${n(cx + K.side * col)} ${slabY}V${bottom}H${cx + col}V${slabY}Z" fill="${MARBLE.dark}"/>
    <path d="${[-4, -3, -2, -1, 0, 1, 2, 3, 4].map(k => `M${n(cx + col * Math.sin(k * Math.PI / 10))} ${slabY}V${bottom}`).join('')}" fill="none" stroke="#8E869B" stroke-opacity=".6" stroke-width=".8"/>
    <path d="M${cx - col} ${slabY}V${bottom}M${cx + col} ${slabY}V${bottom}" fill="none" stroke="${MARBLE.ink}" stroke-width="${K.line}"/>
    ${trunk(bottom)}${vineTop.front}`;
  // the slab: a band between its top rim and its bottom rim's front, lit from the left, in an ink outline
  const slabD = `M${left} ${P.top}V${slabY}A${P.r} ${rimRy(P.r)} 0 0 0 ${cx + P.r} ${slabY}V${P.top}Z`;
  // The vine on the candlestick: the same limb, on from the slab, winding up round the foot, collar, baluster and knop to
  // under the pan, just off each part's surface (its half-width at drawn height yd, `girth`). Its back turns are drawn
  // before the candlestick, behind it, and its front ones after, over it.
  const girth = (yd: number) => yd >= 543 ? FOOT : yd >= 523 ? dome(yd) : yd >= 518 ? 20
    : yd >= 489 ? k * (yd < 504 ? 10 + 7 * Math.sin((yd - 489) / 15 * Math.PI / 2) : 11 + 6 * Math.cos((yd - 504) / 14 * Math.PI / 2))
    : yd >= 485 ? 10 * k : yd >= 463 ? Math.max(10, 25 * Math.sqrt(Math.max(0, 1 - ((yd - 474) / 11) ** 2))) * k : 14;
  const holder = Array.from({ length: 121 }, (_, i) => {
    const u = i / 120, yd = 547 - 89 * u, th = -0.95 + u * 1.7 * 2 * Math.PI, h = girth(yd) + 1.8;
    return { p: [cx + h * Math.sin(th), Y(yd) + sag(Y(yd), h) * Math.cos(th)] satisfies Point, front: Math.cos(th) > 0, i };
  });
  const holderVine = (() => {
    const rand = seeded(hash('candle:vine:holder')), runs = { back: '', front: '' };
    let first = nth(holder, 0), run = [first];
    for (const q of holder.slice(1)) {
      if (q.front === first.front) { run.push(q); continue; }
      run.push(q); // overlapping one point, so the turns meet at the sides
      runs[first.front ? 'front' : 'back'] += limb(run.map(r => r.p), run.map(r => 2.8 - 1.4 * r.i / 120), rand);
      run = [first = q];
    }
    runs[first.front ? 'front' : 'back'] += limb(run.map(r => r.p), run.map(r => 2.8 - 1.4 * r.i / 120), rand);
    const fronts = holder.filter(q => q.front);
    runs.front += [18, 47, 71, 96].map((i, j) => leafOn(nth(holder, i).p, 15 - j, (j % 2 ? 1 : -1) * 70)).join('') + tendril(nth(fronts, fronts.length - 1).p, -1.2, 1, rand); // off its last turn in front
    return runs;
  })();
  // over the slab's edge and across its top to the foot, where it goes on up the candlestick
  const edgeAt: Point = [left + 2, P.top + 31], over = [climbAt, ...quad(climbAt, [left + 4, P.top + 49], edgeAt), ...quad(edgeAt, [left + 2, P.top + 13], [left + 28, P.top + 9]),
    ...quad([left + 28, P.top + 9], [left + 56, P.top + 8], nth(holder, 0).p)];
  const overRand = seeded(hash('candle:vine:over'));
  const overVine = limb(over, over.map((_, i) => 5 - 3 * i / over.length), overRand)
    + ((s: { pts: Point[], a: number }) => limb(s.pts, s.pts.map((_, j) => 2.4 - 1.4 * j / s.pts.length), overRand) + tendril(nth(s.pts, s.pts.length - 1), s.a, 1, overRand))(shoot(nth(over, 12), -2.2, 9, 3, 0.16, 0.05, overRand))
    + leafOn(nth(over, 7), 24, -75) + leafOn(nth(over, 17), 19, -20) + leafOn(nth(over, 21), 15, 40);
  // its own group (class cdPedestal), so nothing else drawn below the slab's top can pass for it
  const pedestal = `<g class="cdPedestal"><g id="cdColumn">${column(P.anchor)}</g>
    <clipPath id="cdSlab"><path d="${slabD}"/></clipPath><path d="${slabD}" fill="${MARBLE.lit}"/>
    <rect x="${n(cx + K.side * P.r)}" y="${P.top - 30}" width="${P.r}" height="${P.depth + 60}" fill="${MARBLE.dark}" clip-path="url(#cdSlab)"/>
    <path d="${slabD}" fill="none" stroke="${MARBLE.ink}" stroke-width="${K.line}" stroke-linejoin="round"/>
    <ellipse cx="${cx}" cy="${P.top}" rx="${P.r}" ry="${rimRy(P.r)}" fill="#E2DDE8" stroke="${MARBLE.ink}" stroke-width="${K.line}"/>
    <ellipse id="cdWarm" cx="${cx}" cy="${P.top}" rx="${P.r}" ry="${rimRy(P.r)}" fill="url(#cdWarmG)" opacity="0"/><!-- the slab's top, warmed round the foot by the flame -->
    <ellipse id="cdFootShadow" cx="${cx}" cy="${P.top - 5}" rx="${FOOT}" ry="${rimRy(FOOT)}" fill="#2B2238" opacity=".35"/><!-- the foot's shadow on it -->
    <g id="cdPencil" transform="translate(${pt(nth(over, 17))}) rotate(13) scale(.8)"></g><!-- Jerrett's pencil (pencil.ts), under the vine -->
    ${cluster(edgeAt, 8, [4, 4, 3, 3, 2, 1], true)}${overVine}${leafOn(edgeAt, 12, 150)}
    <!-- the vine, up the column, over the slab's edge and across it to the foot, a bunch hanging off it at the edge -->
    <g id="cdPedestalGlints">${grapeGlints(0)}</g></g>`;
  const onPedestal = GRAPES.length; // the grapes drawn so far are the pedestal's bunch
  // the knop, placed in the scene
  const knop = { cy: Y(474), rx: 25 * k, ry: 11 * k };
  const back = `<defs><clipPath id="cdWax"><path d="${PILLAR_D}"/><path d="${DRIPS.map(dripD).join('')}"/></clipPath>
      <clipPath id="cdDrips"><path d="${DRIPS.map(dripD).join('')}"/></clipPath>
      <linearGradient id="cdGlow" x1="0" x2="0" y1="0" y2="1"><stop class="paperStop" offset="0" stop-opacity=".85"/><stop class="paperStop" offset=".35" stop-opacity=".45"/>
      <stop class="paperStop" offset="1" stop-opacity="0"/></linearGradient>${GRAPE}
      <radialGradient id="cdWarmG" cx="${cx}" cy="${P.top - 3}" r="110" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="currentColor" stop-opacity=".55"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient>
      <linearGradient id="cdBronze">${[[0, '#21140A'], [0.15, '#3D2412'], [0.34, '#6E4220'], [0.44, '#B7885A'], [0.56, '#6E4220'], [0.78, '#3D2412'], [1, '#21140A']]
        .map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient><!-- across each part's curve: dark edges, a highlight the flame lights (frame.ts drawShine) -->
      <linearGradient id="cdBronzeDome" href="#cdBronze" gradientUnits="userSpaceOnUse" x1="${cx - FOOT}" y1="${n(Y(523) - 30)}" x2="${cx + FOOT}" y2="${n(Y(543) + 30)}"/><!-- the same, slanting across the domed foot's upturned slope -->
      <radialGradient id="cdPool" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="#FFF8EC"/><stop offset=".7" stop-color="#F3E5C8"/><stop offset="1" stop-color="#D9C6A2"/></radialGradient>
      <filter id="cdSoft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter></defs>
    ${pedestal}${holderVine.back}<!-- the vine's back turns, behind the candlestick -->
    ${ring('cdBase', Y(543), FOOT, 8)}
    ${turned('cdFoot', profile(Y(523), Y(543), y => dome(y - Y(523) + 523)), false, 'url(#cdBronzeDome)')}<!-- the domed foot, an ogee -->
    ${ring('cdCollar', Y(518), 20, 5)}
    ${turned('cdBaluster', profile(489, 518, y => y < 504 ? 10 + 7 * Math.sin((y - 489) / 15 * Math.PI / 2) : 11 + 6 * Math.cos((y - 504) / 14 * Math.PI / 2), 16).map(([y, h]) => [Y(y), h * k]))}
    ${ring('cdStemRing', Y(485), 10 * k, 4 * k)}
    <ellipse id="cdKnop" cx="${cx}" cy="${n(knop.cy)}" rx="${n(knop.rx)}" ry="${n(knop.ry)}" fill="${K.lit}"/>
    <ellipse cx="${cx}" cy="${n(knop.cy)}" rx="${n(knop.rx)}" ry="${n(knop.ry)}" fill="none" stroke="${K.ink}" stroke-width="${K.line}"/>
<!-- the knop -->
    ${ring('cdNeck', Y(452), 14, Y(463) - Y(452))}<!-- down to the knop's top -->
    <ellipse cx="${cx}" cy="${PILLAR.dish}" rx="84" ry="${n(sag(PILLAR.dish, 84))}" fill="${GILT}" stroke="${K.ink}" stroke-width="${K.line}"/>
    <ellipse cx="${cx}" cy="${PILLAR.dish}" rx="78" ry="${n(sag(PILLAR.dish, 78))}" fill="#24140A"/><!-- the pan, its inside in the pillar's shadow -->
    <path d="${PILLAR_D}" fill="${WAX[0]}"/><rect x="${n(side)}" y="${rim - 10}" width="${n(cx + R + 2 - side)}" height="${PILLAR.bottom - rim + 10}" fill="${WAX[1]}" clip-path="url(#cdWax)"/>
    ${drips}
    <rect id="paperGlow" x="${cx - R - 4}" y="${rim - 4}" width="${2 * R + 8}" height="86" fill="url(#cdGlow)" clip-path="url(#cdWax)"/><!-- lit from within, under the rim -->
    <path d="${smooth(CROWN.map(([x, y]) => [x, y + 1]))}" fill="none" stroke="#D8C5A2" stroke-width="1"/>
    ${((notch: (dy: number) => string) => `<path class="paperLit" d="${notch(-0.6)}Z" fill="currentColor"/><!-- the notch the main drip spilled from, its far wall lit -->
    <path d="${notch(0)}" fill="none" stroke="#D8C5A2" stroke-width="1"/>`)((dy: number) => `M${n(NOTCH - 11)} ${n(rim + dy)}C${n(NOTCH - 10.5)} ${n(rim + 3.5)} ${n(NOTCH - 8)} ${n(rim + 3.5)} ${n(NOTCH)} ${n(rim + 3.5)}S${n(NOTCH + 10.5)} ${n(rim + 3.5)} ${n(NOTCH + 11)} ${n(rim + dy)}`)}
    ${[-1, 1].map(u => { const x = cx + u * (R + 3.5), y = PILLAR.dish, fill = (u < 0 ? DRIP.lit : DRIP.dark)[0]; // a drip pooled in the pan at each side
      return `<path d="M${x - 5.5} ${y + 10}C${x - 6} ${y + 4} ${x - 3.5} ${y + 1.5} ${x} ${n(y + 1.2)}C${x + 3.5} ${y + 1} ${x + 6} ${y + 4} ${x + 5.5} ${y + 10}Z" fill="${fill}"/>`; }).join('')}
    ${turned('cdBowl', profile(PILLAR.dish, Y(452), y => 30 + 54 * Math.sqrt(Math.max(0, 1 - ((y - PILLAR.dish) / 26) ** 2))), true)}<!-- the drip pan -->
    <path d="M256 ${PILLAR.dish}Q${cx} ${n(PILLAR.dish + 2 * sag(PILLAR.dish, 84))} 424 ${PILLAR.dish}L418 ${PILLAR.dish}Q${cx} ${n(PILLAR.dish + 2 * sag(PILLAR.dish, 78))} 262 ${PILLAR.dish}Z" fill="${GILT}" stroke="${K.ink}" stroke-width="${K.line}" stroke-linejoin="round"/>
    ${cluster([400, P.top - 8], -72, [4, 4, 3, 3, 2, 1], true)}${leafOn([400, P.top - 8], 14, -35)}<!-- a full bunch lying on the slab by the foot -->
    ${holderVine.front}<!-- the vine's front turns on the candlestick -->
    <g id="cdGrapeGlints">${grapeGlints(onPedestal)}</g><!-- the flame's shine (frame.ts drawShine) -->
    <ellipse cx="${cx}" cy="${rim + 1.2}" rx="40" ry="2.6" fill="url(#cdPool)"/><ellipse id="cdPoolGlint" cx="${cx}" cy="${rim + 1.4}" rx="3" ry=".9" opacity="0" filter="url(#cdSoft)"/><!-- the molten pool -->`;
  // the wick, over the flame's base so the flame burns round it, its tip an ember
  const front = `<path d="M${cx} ${rim}V${rim - 7}Q${cx} ${n(rim - 10.4)} ${cx + 2.5} ${rim - 11.5}" fill="none" stroke="#1C1612" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M${n(cx + 0.6)} ${n(rim - 9.4)}Q${n(cx + 1.2)} ${rim - 11} ${cx + 2.5} ${rim - 11.5}" fill="none" stroke="#B8461E" stroke-width="2.4" stroke-linecap="round"/>`;
  // Moths land clear of the bare flame. At full size and stretched its tallest (96 by FLAME_STRETCH, frame.ts stepFlame), the
  // outer tongue dips 0.04 of its height below its base (background.ts flameHalf), in the flame's own units. A landed moth's
  // wings reach from its perch on screen at most WING_REACH at the largest moth. So the wax's highest landing spot is a hop, that reach and 10 clear below the flame, and the body
  // starts where perchAt's highest spot (0.5 - PERCH_SPREAD of the way down) lands there.
  const reach = WING_REACH * Math.max(...Object.values(SIZE));
  const highest = PILLAR.flame[1] + 0.04 * 96 * FLAME_STRETCH * PILLAR.flame[2] + HOP + reach + 10, waxBottom = PILLAR.dish - 8;
  const candle = {
    name: 'Pillar candle', stands: { half: PEDESTAL.r, top: PILLAR.dish }, paper: false, scorches: true, // a bare flame, standing on the crown
    flame: PILLAR.flame, light: [PILLAR.cx, PILLAR.eye], flameWind: 6, // in the open, the wind leans it hard (frame.ts stepFlame)
    holder: [PILLAR.rim, PILLAR.r], shadeFromHolder: true, // seen from the flame the rim is the widest thing below it, so its corners cast the shadow
    // the wax alone, a straight cylinder
    body: { top: (highest - (0.5 - PERCH_SPREAD) * waxBottom) / (0.5 + PERCH_SPREAD), bottom: waxBottom, half: () => PILLAR.r },
    back, front, shine: GRAPES, heat: { k: 1 }, // its bare flame shines on the brass, the pool, the grapes and the marble (drawShine)
    column, // the column is redrawn to the window's bottom (drawHang)
  } satisfies Style;
  return { ...candle, trunkLine, branches: BRANCHES, pillar: PILLAR, pedestal: PEDESTAL, drawn: DRAWN, stem: STEM, lacquer: K }; // and its numbers, for the tests
}
// a hairline bevel catching the light along the top and left of each frame, pillar and band
const MOROCCAN_EDGES = `<g fill="none" stroke="${BRASS.lit}" stroke-width=".7"><path d="M313.2 404V294.2h53.6M281.2 404V294.2h23.6M375.2 404V294.2h23.6
  M306.9 290v118M369.9 290v118M275.9 290v118M277 285.4h126M277 408.4h126M277 413.4h126M300 428.3h80M295 244.4h90"/></g>`;
// a darker, dulled gold, with a hint of green, in the recesses (inside the frames, under the bands, round the frieze windows),
// and rivets at the frame corners sunk in a ring of it
const MOROCCAN_PATINA = `<g fill="none" stroke="#4A3B18" stroke-opacity=".6"><path d="M314 295h52v108h-52ZM282 295h22v108h-22ZM376 295h22v108h-22Z" stroke-width="1.4"/>
  <path d="M277 290.8h126M277 407.2h126M277 414h126" stroke-width="1.2"/><path d="M299 248h6v8h-6ZM308 248h6v8h-6ZM323 248h9v8h-9ZM335.5 248h9v8h-9ZM348 248h9v8h-9ZM366 248h6v8h-6ZM375 248h6v8h-6Z"/></g>
  ${[312.5, 367.5, 280.5, 305.5, 374.5, 399.5].flatMap(x => [293.5, 404.5].map(y => `<circle cx="${x}" cy="${y}" r="1.9" fill="#4A3B18" opacity=".5"/><circle cx="${x}" cy="${y}" r="1" fill="${BRASS.lit}"/>`)).join('')}`;
export const STYLES = {
  barrel: {
    name: 'Book-page barrel', flame: [340, 388, 1], light: [340, 350], paper: true, flameWind: paperWind, ribbon: [340, 470], knot: [341, 139], caps: [BARREL.top, BARREL.bottom, BARREL.cap],
    surface: { ...BARREL, outline: ODAWARA.outline }, body: { top: BARREL.top, bottom: BARREL.bottom, half: BARREL.half }, // a straight cylinder
    back: `<path d="M340 20 L340 136.6" stroke="#C9B49C" stroke-width="2"/>
    <defs><clipPath id="bodyClip"><path d="${ODAWARA.outline}"/></clipPath></defs>
    <path id="paperShape" d="${ODAWARA.outline}" fill="url(#paperShade)"/>
    <rect id="paperGlow" x="270" y="200" width="140" height="260" fill="url(#paperGrad)" clip-path="url(#bodyClip)"/>
    <path id="paperTint" d="${ODAWARA.outline}"/>
    <g id="pages" clip-path="url(#bodyClip)"></g>`, // session text printed on the paper (pages.ts)
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
    name: 'Round chōchin', flame: [340, 379, 0.95], light: [340, 336], paper: true, flameWind: paperWind, tassel: [95, 178.5], knot: [95.4, 56.5], caps: [221, 441, 46], // pivot in the drawing's own units
    surface: { ...BALL, outline: CHOCHIN.outline },
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
    name: 'Brass Moroccan', flame: [340, 398, 0.9], light: [340, 348], dim: 0.6, flameWind: 2, // enclosed, the wind leans it about a third as hard as the candle's
    tassel: [340, 486], heat: { at: [340, 190], k: 0.5 }, // out through the dome's piercings, gentler than over the candle's bare flame
    holder: [404, 6], // the burner cup under the flame, the height of its bottom and the half-width of its mouth; it throws a narrow fan of shadow straight down
    // a hexagonal prism seen face-on (front face ±31.5, side faces out to ±63), under a shoulder flaring out from ±45
    body: { top: 262, bottom: 462, half: y => y < 285 ? 45 + Math.max(0, y - 260) / 25 * 18 : y < 413 ? 63 : y < 428 ? 63 - (y - 413) / 15 * 23
      : y < 434 ? 40 : 38 * (1 - ((y - 434) / 54) ** 2) },
    back: `<defs>${MOROCCAN_DEFS}</defs>${PAPER_GRAD('.55')}
<!-- its inside is the far wall, drawn by the background (bakeFarWall); the air's glow kept to half, so the lit wall shows through it -->
      <g opacity=".5"><ellipse id="paperGlow" cx="340" cy="335" rx="72" ry="95" fill="url(#pg)"/></g>`,
    inside: `<path d="M334 399h12l-2 5h-8Z" fill="${BRASS.side}"/><ellipse cx="340" cy="399" rx="6" ry="1.4" fill="${BRASS.lit}"/><path d="M338.8 404h2.4v4h-2.4Z" fill="${BRASS.side}"/>`, // the burner cup
    front: `<circle cx="340" cy="132" r="4" fill="none" stroke="${BRASS.lit}" stroke-width="1.8"/>
      <path d="M338.6 136h2.8v20h-2.8Z" fill="${BRASS.front}"/><ellipse cx="340" cy="142" rx="3" ry="2.4" fill="${BRASS.lit}"/><ellipse cx="340" cy="149" rx="4.4" ry="3" fill="${BRASS.front}"/><ellipse cx="340" cy="154.5" rx="2.6" ry="1.8" fill="${BRASS.lit}"/>
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
  candle: makeCandle(),
} satisfies Record<string, Style>;
export const isStyleKey = (key: string): key is keyof typeof STYLES => Object.hasOwn(STYLES, key);
// The bookmark's colours, picked in the settings menu (settings.ribbon): front, back and edge.
export const RIBBONS = {
  cerulean: ['#4385B1', '#29567A', '#0D2A44'], madder: ['#A8433A', '#712A25', '#36110E'], ochre: ['#C08A2E', '#82601F', '#3B280A'],
  moss: ['#6E8B3F', '#4A5E29', '#1E2A0E'], plum: ['#7E4B8C', '#55325F', '#25132B'], ink: ['#46526E', '#2C344A', '#0F131D'],
} satisfies Record<string, [front: string, back: string, edge: string]>;
export const isRibbon = (name: string): name is keyof typeof RIBBONS => Object.hasOwn(RIBBONS, name);
export function paintRibbon(name: string | undefined) {
  const key = name !== undefined && isRibbon(name) ? name : 'cerulean', [front, back, edge] = RIBBONS[key], root = document.documentElement.style;
  root.setProperty('--ribbonFront', front); root.setProperty('--ribbonBack', back); root.setProperty('--ribbonEdge', edge);
}
// which lantern is shared by every window (Dock app, iTerm panel, screensaver): the server keeps it in settings.json
export let style: Style = STYLES.barrel;
// The hanging line from the top of the window down to where the lantern's own drawing starts: a string, or for the Moroccan
// its chain, link after link (alternating face-on and edge-on) all the way up. Redrawn when the window's top moves. A
// standing lantern has none; its pedestal's column runs down to the window's bottom edge instead.
export function drawHang() {
  const h = byId('hang', SVGElement);
  const column = style.stands && byId('cdColumn', SVGGElement);
  live.cdLeaves = null; // drawLeaves finds them again
  if (column && style.column) column.innerHTML = style.column(VIEW.box ? VIEW.box[1] + VIEW.box[3] : 620);
  if (!h) return;
  if (!style.chain) return h.setAttribute('d', `M340 ${VIEW.top - 2}V22`);
  let links = '';
  for (let y = style.chain, k = 0; y > VIEW.top - 10; y -= 9, k++)
    links += `<ellipse cx="340" cy="${y}" rx="${k % 2 ? 3.2 : 2.2}" ry="${k % 2 ? 4 : 5}"/>`;
  h.innerHTML = links;
}
export function applyStyle(key: string) {
  style = isStyleKey(key) ? STYLES[key] : STYLES.barrel;
  const [fx, fy, fk] = style.flame;
  const back = (style.stands ? '' : style.chain ? `<g id="hang" fill="none" stroke="${BRASS.lit}" stroke-width="1.4"></g>`
    : '<path id="hang" stroke="#C9B49C" stroke-width="2"/>') + style.back;
  const front = `<g id="inside"><g transform="translate(${fx} ${fy}) scale(${fk}) translate(-340 -${FLAME_BASE})"><g id="sparks"></g></g>${style.inside || ''}</g>`
    + style.front;
  $('lanternPaper', SVGGElement).innerHTML = style.paper ? back : '';
  $('lantern', SVGGElement).innerHTML = style.paper ? front : back + front;
  drawHang();
  bakeFarWall(); bakeCutouts();
  for (const m of live.moths.values()) m.wasLanded = false; // landed moths find new spots on the new lantern
}

// Where a moth landed for the session whose home is at `home` (on the 600x600 square, as ringHome gives it) sits on the
// lantern, hanging at rest: `along` (0 to 1) of the way out the part of its line that's on the paper, from a quarter of
// the way to the end. Each side has a family of lines, one for each point u of the way round the ring (ringAt), from
// the paper's inner edge (a third of the way out from the middle) to that point on the ring, starting that far up the
// paper: the one to the bottom of the ring from near the bottom of the paper, the one to the top from near the top.
// They never cross each other, and a home's line is the one it lies on, so the moths spread up and down the paper in
// the order their homes go round, and with the lantern at rest no two dotted lines cross: not even a home on a ring
// further in (past 16 sessions), whose line is part of the one through it. (Swaying, see threadEnds.) ponytail: an
// inner-ring home's line can run within a unit of an outer neighbour's, so past 16 sessions two lines can overlap and
// cross as the lantern sways; space the inner ring's homes if that starts to matter. Starts keep an eighth of the
// paper's height in from its top and bottom (STARTS), so every line has room on the paper. The two sides never meet (no home sits above or below the
// middle third, ringHome). Spots stay within PERCH_SPREAD of the middle height, and out of the middle third of the
// lantern, where closed wings would point nearly straight at you and thin to a sliver. Returns [x, y, normal]: where
// it sits in the lantern's own frame, and the surface's outward direction there. Worked out at rest, a spot stays put
// on the paper as the lantern sways, and its moth rides it.
const STARTS = 0.75;
export function perchAt(home: Point, along: number): [x: number, y: number, normal: Vec3] {
  const { top, bottom, half } = style.body, mid = (top + bottom) / 2, spread = (bottom - top) * PERCH_SPREAD, [hx, hy] = stretch(home);
  const side = hx < 340 ? -1 : 1, start = (u: number): Point => { const y = mid + STARTS * spread * (1 - 2 * u); return [340 + side * half(y) / 3, y]; };
  // which side of the family's line u the home is on (+ or -), and so which one it's on: halve in on where that flips
  const across = (u: number) => { const [ax, ay] = start(u), [rx, ry] = stretch(ringAt(u, side)); return Math.sign((rx - ax) * (hy - ay) - (ry - ay) * (hx - ax)); };
  let lo = 0, hi = 1;
  const below = across(0);
  if (across(1) === below) lo = hi = home[1] < RING.y ? 1 : 0; // past either end (gliding through a gap): that end's line
  for (let i = 0; i < 20 && hi > lo; i++) { const u = (lo + hi) / 2; if (across(u) === below) lo = u; else hi = u; }
  const [ox, oy] = start((lo + hi) / 2), len = Math.hypot(hx - ox, hy - oy), ux = (hx - ox) / len, uy = (hy - oy) / len;
  const on = (t: number) => { const y = oy + uy * t, out = Math.abs(ox + ux * t - 340); return Math.abs(y - mid) <= spread && out >= half(y) / 3 && out <= half(y); };
  let end = 0;
  // Walk the line a unit at a time (a few hundred steps at most), then halve in on its exact end. The spot is redone every
  // frame as its home glides, so an end rounded to a whole unit would make a landed moth jump as the line tips over it.
  while (on(end + 1)) end++;
  for (let step = 0.5; step > 1e-3; step /= 2) if (on(end + step)) end += step;
  const t = end * (0.25 + 0.75 * along), x = ox + ux * t, y = oy + uy * t;
  // the surface's true outward normal in 3D (x right, y down, z toward the viewer): round the side by `sin`, tipped
  // up or down by how the lantern bulges at this height
  const sin = Math.min(1, Math.abs(x - 340) / half(y)), slope = (half(y + 1) - half(y - 1)) / 2;
  return [x, y, unit([side * sin, -slope, Math.sqrt(1 - sin * sin)])];
}

// warm = everyone busy, cool = someone needs me; everything crossfades between the two
export const WARM = { halo: '#FF9F45', outer: '#F7913F', mid: '#FFC266', core: '#FFF4D6', base: '#6C8CFF', glow: '#F7B267',
  paper: '#FFB85C', thread: '#E8B48A', rings: ['#3A3050', '#4A3B58', '#6A4A58'] };
export const COOL = { halo: '#8C6CFF', outer: '#7A63F0', mid: '#9FB6FF', core: '#F0F2FF', base: '#D2B4FF', glow: '#9D7CF5',
  paper: '#A99BFF', thread: '#B6A6F5', rings: ['#2E2E58', '#3A3A6E', '#4E4A86'] };
export const MOTH_IDLE = '#E9DCF0', MOTH_CALL = '#7B5CFF', MOTH_SINGED = '#8C8494'; // singed: the turn ended in an API error
// An idle session's moth resting on the lantern: a touch of the calling violet (frame.ts eases it 0.15 of the way), then
// backlit against the paper. Mostly grey: mix(mix(MOTH_IDLE, MOTH_CALL, 0.15), '#2B2440', 0.45).
export const MOTH_RESTING = '#8B7FA2';

// A faint tint per project (from its folder name), nudged a little per session so two sessions in one repo still differ.
export function tintFor(s: Session) {
  const hue = (hash((s.cwd ?? '').split('/').filter(Boolean).pop()) % 360 + (hash(s.id) % 29) - 14 + 360) % 360;
  const l = 0.72, a = 0.55 * Math.min(l, 1 - l), f = (n: number) => { const k = (n + hue / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

export const hex = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
export const mix = (a: string, b: string, t: number) => '#' + hex(a).map((v, i) => Math.round(v + (nth(hex(b), i) - v) * t).toString(16).padStart(2, '0')).join('');
// cheap smooth noise: a few sines at unrelated frequencies
export const wobble = (s: number, k: number) => Math.sin(s * 2.3 + k) * 0.6 + Math.sin(s * 5.1 + k * 1.7) * 0.3 + Math.sin(s * 11.7 + k * 0.6) * 0.1;
