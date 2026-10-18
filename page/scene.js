// The scene's fixed geometry: element lookup, the moth wing shapes and their 3D flapping, home spots, and fitting the view to the window.

const NS = 'http://www.w3.org/2000/svg';
/** @type {(id: string) => any} */ // elements are looked up by id; checking each as HTMLElement would just be casts
const $ = id => document.getElementById(id);
// A second display's screensaver (?ambient): the lantern's light and the drifting wisps, with no lantern, moths or
// fireflies made there at all.
const AMBIENT = new URLSearchParams(location.search).has('ambient');
const CX = 340, CY = 330, FLAME_BASE = 388;
// the original two-petal moth, split into its wings as absolute quadratic curves from the joint at 0,0
const WING_UP = [[0, 0], [-14, -12], [-2, -18], [6, -14], [0, 0]];
const WING_SIDE = [[0, 0], [12, -14], [18, -4], [14, 6], [0, 0]];
// both wings hinge on the body axis, the line between them (they point at about -96° and -12.5°)
const AXIS = -54.4 * Math.PI / 180, AU = [Math.cos(AXIS), Math.sin(AXIS)], AN = [-Math.sin(AXIS), Math.cos(AXIS)];
const EYE = 40; // viewer distance in moth units: smaller means stronger perspective

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
  return Object.assign(flat, { depth: depth / pts.length }); // how near the viewer it is, to draw the nearer wing on top
}
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
// widens with each wingbeat, plus how dark it can get. x, y, tilt (degrees) and scale are the moth's own transform.
function caster(x, y, tilt, scale, pts, dark) {
  const xs = pts.map(p => p[0] - 2), ys = pts.map(p => p[1] - 6); // the wings' offset from the moth's position
  const lx = (Math.min(...xs) + Math.max(...xs)) / 2, ly = (Math.min(...ys) + Math.max(...ys)) / 2, a = tilt * Math.PI / 180;
  const r = (Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys)) / 4;
  return [x + (lx * Math.cos(a) - ly * Math.sin(a)) * scale, y + (lx * Math.sin(a) + ly * Math.cos(a)) * scale, r * scale, dark];
}
const pathOf = p => { const f = ([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`; return `M${f(p[0])}Q${f(p[1])} ${f(p[2])}Q${f(p[3])} ${f(p[4])}Z`; };
// big moths for sessions, medium for supervisor agents, small for plain subagents
const SIZE = { session: 1.4, supervisor: 0.9, subagent: 0.55 };
// where session moths live, clear of the lantern; each session keeps its spot and wanders around it
const HOMES = [[150,170],[530,160],[115,390],[565,385],[190,550],[490,555],[245,85],[435,85]];
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
  const canvas = $('bg'), dpr = devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  canvas.style.borderRadius = `${16 * width / w}px`; // the scene's rounded corners (none in the screensaver)
  VIEW.top = y;
  $('hang')?.setAttribute('d', `M340 ${y - 2}V22`); // the string runs from the top of the window to where each lantern's own string starts
}
