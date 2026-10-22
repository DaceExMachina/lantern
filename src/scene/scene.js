// The scene's fixed geometry: element lookup, the moth wing shapes and their 3D flapping, home spots, and fitting the view to the window.

export const NS = 'http://www.w3.org/2000/svg';
/** @type {(id: string) => any} */ // elements are looked up by id; checking each as HTMLElement would just be casts
export const $ = id => document.getElementById(id);
// A second display's screensaver (?ambient): the lantern's light and the drifting dust, with no lantern, moths, fireflies
// or wisps made there at all.
export const Q = new URLSearchParams(location.search);
export const AMBIENT = Q.has('ambient');
// POST a JSON body to the server (settings, focus, snooze, and the rest)
export const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
// FLAME_STRETCH: the most a flame stretches past its height (frame.js stepFlame)
export const CX = 340, CY = 330, FLAME_BASE = 388, FLAME_STRETCH = 1.15;
// the original two-petal moth, split into its wings as absolute quadratic curves from the joint at 0,0
export const WING_UP = [[0, 0], [-14, -12], [-2, -18], [6, -14], [0, 0]];
export const WING_SIDE = [[0, 0], [12, -14], [18, -4], [14, 6], [0, 0]];
// both wings hinge on the body axis, the line between them (they point at about -96° and -12.5°)
const AXIS = -54.4 * Math.PI / 180, AU = [Math.cos(AXIS), Math.sin(AXIS)], AN = [-Math.sin(AXIS), Math.cos(AXIS)];
const EYE = 40; // viewer distance in moth units: smaller means stronger perspective
// How far a wing tip can reach from the moth's position, per unit of size, with the perspective (see wing3d): w·EYE/√(EYE² − w²),
// w the wing point furthest from the joint
export const WING_REACH = (w => w * EYE / Math.sqrt(EYE * EYE - w * w))(Math.max(...[...WING_UP, ...WING_SIDE].map(([x, y]) => Math.hypot(x, y))));

// The one wing model, in 3D (scene axes: x right, y down, z toward the viewer). A wing's 2D outline (along the body
// AU, across it AN) is placed on a frame of directions: T along the body, N the way a folded wing stands (out of the
// surface the moth rests on, or toward the viewer in flight), and B = N x T sideways. `open` is the wing's angle from
// N: 0 is folded upright, 90 degrees spread flat along B. `sweep` tips it along the body as it rises. Projected with
// perspective, so a tip swells as it comes closer while the joint stays put.
export const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
export const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
export const unit = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
export const lerp3 = (u, v, t) => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t, u[2] + (v[2] - u[2]) * t];
export function wing3d(pts, T, N, open, sweep = 0) {
  const B = cross(N, T), c = Math.cos(open), sn = Math.sin(open);
  let depth = 0;
  const flat = pts.map(([x, y]) => {
    const a = x * AU[0] + y * AU[1], r = x * AN[0] + y * AN[1], up = Math.abs(r) * c, out = r * sn, a2 = a + sweep * up;
    const px = T[0] * a2 + N[0] * up + B[0] * out, py = T[1] * a2 + N[1] * up + B[1] * out, pz = T[2] * a2 + N[2] * up + B[2] * out;
    const k = EYE / (EYE - pz);
    depth += pz;
    return [px * k, py * k];
  });
  // The wing is flat: it holds T and the way its outline points out from the body, so its normal is their cross product.
  const side = Math.sign(pts.reduce((sum, [x, y]) => sum + x * AN[0] + y * AN[1], 0));
  const normal = unit(cross(T, [N[0] * c + B[0] * sn * side, N[1] * c + B[1] * sn * side, N[2] * c + B[2] * sn * side]));
  return Object.assign(flat, { depth: depth / pts.length, normal }); // depth: how near the viewer, to draw the nearer wing on top
}
// How a wing catches the flame (dx, dy: the flame from the moth, in the moth's own axes): 1 when the face we see is
// toward the flame, 0 when the flame is behind the wing.
export const facesFlame = (normal, dx, dy) => (Math.sign(normal[2]) * (normal[0] * dx + normal[1] * dy) > 0 ? 1 : 0);
// Paint a moth's two wings with the nearer one on top (the DOM order is the paint order).
export function wingsInDepthOrder(a, aPts, b, bPts) {
  const front = aPts.depth > bPts.depth ? a : b;
  if (front.parentNode.lastChild !== front) front.parentNode.appendChild(front);
}
// In flight the body lies along AU and the wings spread across the screen, lifting toward the viewer; `roll` turns
// the whole moth around its body axis: 0 is seen from above, 90 degrees fully side-on.
export const flightFrame = roll => ({ T: [AU[0], AU[1], 0], N: [AN[0] * Math.sin(roll), AN[1] * Math.sin(roll), Math.cos(roll)] });
export function flapWing(pts, lift, sweep, roll = 0) { const f = flightFrame(roll); return wing3d(pts, f.T, f.N, Math.PI / 2 - lift, sweep); }
// What a moth's shadow needs: the middle of its wings in the scene and how far they reach, so the shadow narrows and
// widens with each wingbeat. x, y, tilt (degrees) and scale are the moth's own transform.
export function caster(x, y, tilt, scale, pts) {
  const xs = pts.map(p => p[0] - 2), ys = pts.map(p => p[1] - 6); // the wings' offset from the moth's position
  const lx = (Math.min(...xs) + Math.max(...xs)) / 2, ly = (Math.min(...ys) + Math.max(...ys)) / 2, a = tilt * Math.PI / 180;
  const r = (Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys)) / 4;
  return [x + (lx * Math.cos(a) - ly * Math.sin(a)) * scale, y + (lx * Math.sin(a) + ly * Math.cos(a)) * scale, r * scale];
}
export const pathOf = p => { const f = ([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`; return `M${f(p[0])}Q${f(p[1])} ${f(p[2])}Q${f(p[3])} ${f(p[4])}Z`; };
// big moths for sessions, medium for supervisor agents, small for plain subagents
export const SIZE = { session: 1.4, supervisor: 0.9, subagent: 0.55 };
// Session moths' homes (state.js sync hands them out): n spots spread evenly round an oval about the lantern, clear of
// every lantern's body. It leaves out the arc at the bottom within 150 to either side of the middle, where the candle's
// stand is, and the one at the top within 60, where the string or chain hangs. The i-th, clockwise from the bottom left;
// a moth doubling up on a taken spot (`layer` 1, 2...) sits a little further in, and half a spot round. Each session wanders around its home.
export function ringHome(i, n, layer = 0) {
  const k = 1 - 0.18 * layer, [low, high] = ringGaps(k), side = Math.PI - low - high; // the arc each side
  let a = (i + 0.5 + layer / 2) * 2 * side / n; // a second layer sits between two spots, so no two share a direction
  if (a > side) a += 2 * high; // over the top
  return ringPoint(Math.PI / 2 + low + a, k);
}
// The oval homes sit on (on the 600x600 square): the point at angle `a` on a ring k of the way out, and a point's
// [angle, how far out] (1 on the ring itself).
export const RING = { x: 340, y: 320, rx: 225, ry: 235 };
export const ringPoint = (a, k = 1) => [RING.x + RING.rx * k * Math.cos(a), RING.y + RING.ry * k * Math.sin(a)];
export const ringPolar = ([x, y]) => { const p = (x - RING.x) / RING.rx, q = (y - RING.y) / RING.ry; return [Math.atan2(q, p), Math.hypot(p, q)]; };
// The gaps at the bottom and top of a ring k of the way out, as angles from straight down and straight up.
const ringGaps = k => [Math.asin(Math.min(1, 150 / RING.rx / k)), Math.asin(60 / RING.rx / k)];
// The point on the ring `u` of the way round its side (`side` -1 the left, 1 the right), from the bottom gap (0) to the
// top one (1).
export function ringAt(u, side) {
  const [low, high] = ringGaps(1);
  return ringPoint(Math.PI / 2 - side * (low + u * (Math.PI - low - high))); // from straight down, round toward `side`
}
export const EDGES = [[20,80],[660,140],[30,600],[660,560],[340,-20],[-20,330],[700,330]];

// How far either side of its middle a lantern's drawing reaches (the widest, the candle's vine, to about 140, the
// chōchin to 125), with room for the barrel's ribbon blowing about: its layer is this wide (index.html #lanternLayer).
export const LANTERN_SPAN = 200;

// The scene is designed on a 600x600 square around the lantern. To fill any window shape, the visible area grows
// wider or taller (the lantern keeps its size), and positions laid out on the square stretch with it.
export const VIEW = { kx: 1, ky: 1, top: 20 }; // top: where the lantern hangs from, the visible area's top edge
/** @type {(p: number[]) => [number, number]} */
export const stretch = ([x, y]) => [340 + (x - 340) * VIEW.kx, 320 + (y - 320) * VIEW.ky];

// A scorched moth's smoke trail (frame.js smoke, background.js trailSmoke): the seconds it's left over, a point on its path
// every `every` seconds or `apart` units flown, whichever comes first, `most` of them, and the Ss it curls into along its
// length (their size and length, in scene units). Up to SMOKERS moths smoke at once (frame.js scorchStep), and
// TRAIL_POINTS holds all their trails: each one's points, the last where the smoke stops following, one joined to the
// moth, and one parting it from the next.
export const TRAIL = { secs: 1.5, every: 0.25, apart: 12, most: 12, s: 9, length: 70 }, SMOKERS = 6;
export const TRAIL_POINTS = SMOKERS * (TRAIL.most + 3);
export const PLUMES = 1 + SMOKERS; // plumes of smoke drawn at once: the flame's, and each smoking moth's singe (frame.js smoke, background.js plume)
// The smoke's plumes (frame.js smoke, background.js plume): how big, how many seconds each bit lasts, and how dense, and
// its colour, a pale warm grey. The flame's lanes (frame.js smokeAt): one plume a `slot` seconds, let go somewhere in its
// first `window`, once the flame burns at `from`. How many seconds a plume takes to let go: the flame's, and a singe's.
export const PLUME = { size: 1, life: 6, alpha: 0.5 }, SMOKE_COL = '#B4A8B4';
export const SMOKE = [{ slot: 90, window: 30, from: 0 }, { slot: 25, window: 10, from: 0.5 }, { slot: 12, window: 3, from: 0.8 }];
export const SMOKE_REL = 3, SINGE_REL = 0.8;

// The column of hot air rising off a lantern (style.heat; frame.js heatAt, and heat() in background.js's shaders): its half-width at the
// tip and how much wider it gets per unit up, the rise over which it fades in above the tip, the heights between which it
// fades out, and how far it bends what's seen through it (across, and half that up), all in scene units.
export const HEAT_COLUMN = { half: 18, widen: 0.12, start: 12, fade: [120, 220], bend: 1.25 };
// How many links the flame's spine has, from its base up to its tip (frame.js stepFlame, background.js spineX).
export const CHAIN = 6;
// a number as a GLSL float, exactly (a whole number gets its .0; any other already has a point or an exponent)
export const glf = v => Number.isInteger(v) ? v.toFixed(1) : String(v);
