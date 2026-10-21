// The scene's fixed geometry: element lookup, the moth wing shapes and their 3D flapping, home spots, and fitting the view to the window.

const NS = 'http://www.w3.org/2000/svg';
/** @type {(id: string) => any} */ // elements are looked up by id; checking each as HTMLElement would just be casts
const $ = id => document.getElementById(id);
// A second display's screensaver (?ambient): the lantern's light and the drifting dust, with no lantern, moths, fireflies
// or wisps made there at all.
const Q = new URLSearchParams(location.search);
const AMBIENT = Q.has('ambient');
// POST a JSON body to the server (settings, focus, snooze, and the rest)
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const CX = 340, CY = 330, FLAME_BASE = 388;
// the original two-petal moth, split into its wings as absolute quadratic curves from the joint at 0,0
const WING_UP = [[0, 0], [-14, -12], [-2, -18], [6, -14], [0, 0]];
const WING_SIDE = [[0, 0], [12, -14], [18, -4], [14, 6], [0, 0]];
// both wings hinge on the body axis, the line between them (they point at about -96° and -12.5°)
const AXIS = -54.4 * Math.PI / 180, AU = [Math.cos(AXIS), Math.sin(AXIS)], AN = [-Math.sin(AXIS), Math.cos(AXIS)];
const EYE = 40; // viewer distance in moth units: smaller means stronger perspective
// How far a wing tip can reach from the moth's position, per unit of size, with the perspective (see wing3d): w·EYE/√(EYE² − w²),
// w the wing point furthest from the joint
const WING_REACH = (w => w * EYE / Math.sqrt(EYE * EYE - w * w))(Math.max(...[...WING_UP, ...WING_SIDE].map(([x, y]) => Math.hypot(x, y))));

// The one wing model, in 3D (scene axes: x right, y down, z toward the viewer). A wing's 2D outline (along the body
// AU, across it AN) is placed on a frame of directions: T along the body, N the way a folded wing stands (out of the
// surface the moth rests on, or toward the viewer in flight), and B = N x T sideways. `open` is the wing's angle from
// N: 0 is folded upright, 90 degrees spread flat along B. `sweep` tips it along the body as it rises. Projected with
// perspective, so a tip swells as it comes closer while the joint stays put.
const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const unit = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const lerp3 = (u, v, t) => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t, u[2] + (v[2] - u[2]) * t];
function wing3d(pts, T, N, open, sweep = 0) {
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
const facesFlame = (normal, dx, dy) => (Math.sign(normal[2]) * (normal[0] * dx + normal[1] * dy) > 0 ? 1 : 0);
// Paint a moth's two wings with the nearer one on top (the DOM order is the paint order).
function wingsInDepthOrder(a, aPts, b, bPts) {
  const front = aPts.depth > bPts.depth ? a : b;
  if (front.parentNode.lastChild !== front) front.parentNode.appendChild(front);
}
// In flight the body lies along AU and the wings spread across the screen, lifting toward the viewer; `roll` turns
// the whole moth around its body axis: 0 is seen from above, 90 degrees fully side-on.
const flightFrame = roll => ({ T: [AU[0], AU[1], 0], N: [AN[0] * Math.sin(roll), AN[1] * Math.sin(roll), Math.cos(roll)] });
function flapWing(pts, lift, sweep, roll = 0) { const f = flightFrame(roll); return wing3d(pts, f.T, f.N, Math.PI / 2 - lift, sweep); }
// What a moth's shadow needs: the middle of its wings in the scene and how far they reach, so the shadow narrows and
// widens with each wingbeat. x, y, tilt (degrees) and scale are the moth's own transform.
function caster(x, y, tilt, scale, pts) {
  const xs = pts.map(p => p[0] - 2), ys = pts.map(p => p[1] - 6); // the wings' offset from the moth's position
  const lx = (Math.min(...xs) + Math.max(...xs)) / 2, ly = (Math.min(...ys) + Math.max(...ys)) / 2, a = tilt * Math.PI / 180;
  const r = (Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys)) / 4;
  return [x + (lx * Math.cos(a) - ly * Math.sin(a)) * scale, y + (lx * Math.sin(a) + ly * Math.cos(a)) * scale, r * scale];
}
const pathOf = p => { const f = ([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`; return `M${f(p[0])}Q${f(p[1])} ${f(p[2])}Q${f(p[3])} ${f(p[4])}Z`; };
// big moths for sessions, medium for supervisor agents, small for plain subagents
const SIZE = { session: 1.4, supervisor: 0.9, subagent: 0.55 };
// Session moths' homes (state.js sync hands them out): n spots spread evenly round an oval about the lantern, clear of
// every lantern's body. It leaves out the arc at the bottom within 150 to either side of the middle, where the candle's
// stand is, and the one at the top within 60, where the string or chain hangs. The i-th, clockwise from the bottom left;
// a moth doubling up on a taken spot (`layer` 1, 2...) sits a little further in, and half a spot round. Each session wanders around its home.
function ringHome(i, n, layer = 0) {
  const k = 1 - 0.18 * layer, low = Math.asin(Math.min(1, 150 / 225 / k)), high = Math.asin(60 / 225 / k), side = Math.PI - low - high; // the arc each side
  let a = (i + 0.5 + layer / 2) * 2 * side / n; // a second layer sits between two spots, so no two share a direction
  if (a > side) a += 2 * high; // over the top
  return [340 + 225 * k * Math.cos(Math.PI / 2 + low + a), 320 + 235 * k * Math.sin(Math.PI / 2 + low + a)];
}
const EDGES = [[20,80],[660,140],[30,600],[660,560],[340,-20],[-20,330],[700,330]];

// The scene is designed on a 600x600 square around the lantern. To fill any window shape, the visible area grows
// wider or taller (the lantern keeps its size), and positions laid out on the square stretch with it.
const VIEW = { kx: 1, ky: 1, top: 20 }; // top: where the lantern hangs from, the visible area's top edge
/** @type {(p: number[]) => [number, number]} */
const stretch = ([x, y]) => [340 + (x - 340) * VIEW.kx, 320 + (y - 320) * VIEW.ky];
function fitView() {
  const svg = document.querySelector('svg'), { width, height } = svg.getBoundingClientRect();
  if (!width || !height) return;
  VIEW.kx = Math.max(1, width / height); VIEW.ky = Math.max(1, height / width);
  const w = 600 * VIEW.kx, h = 600 * VIEW.ky, x = 340 - w / 2, y = 320 - h / 2;
  svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  VIEW.box = [x, y, w, h];
  VIEW.px = width / w; // CSS pixels per unit
  const canvas = $('bg'), k = (devicePixelRatio || 1) * bgScale; // background.js
  canvas.width = Math.round(width * k); canvas.height = Math.round(height * k);
  VIEW.top = y;
  drawHang(); // the string or chain runs from the top of the window down to the lantern
  bakeCutouts(); // the Moroccan's lace, at the new size (lanterns.js)
}
