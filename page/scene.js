// The scene's fixed geometry: element lookup, the moth wing shapes and their 3D flapping, home spots, and fitting the view to the window.

const NS = 'http://www.w3.org/2000/svg';
/** @type {(id: string) => any} */ // elements are looked up by id; checking each as HTMLElement would just be casts
const $ = id => document.getElementById(id);
const CX = 340, CY = 330, FLAME_BASE = 388;
// the original two-petal moth, split into its wings as absolute quadratic curves from the joint at 0,0
const WING_UP = [[0, 0], [-14, -12], [-2, -18], [6, -14], [0, 0]];
const WING_SIDE = [[0, 0], [12, -14], [18, -4], [14, 6], [0, 0]];
// both wings hinge on the body axis, the line between them (they point at about -96° and -12.5°)
const AXIS = -54.4 * Math.PI / 180, AU = [Math.cos(AXIS), Math.sin(AXIS)], AN = [-Math.sin(AXIS), Math.cos(AXIS)];
const EYE = 40; // viewer distance in moth units: smaller means stronger perspective

// Flap a wing up toward the viewer by `lift` radians around the body axis, sweep it forward a little as it rises,
// and project it with perspective so the tip swells as it comes closer while the joint stays put.
// `roll` turns the whole moth around its body axis: 0 is seen from above, ±90° is fully side-on,
// where both wings overlap and swing toward and away from the viewer.
function flapWing(pts, lift, sweep, roll = 0) {
  return pts.map(([x, y]) => {
    const a = x * AU[0] + y * AU[1], r = x * AN[0] + y * AN[1];
    const z = Math.abs(r) * Math.sin(lift), r2 = r * Math.cos(lift), a2 = a + sweep * z;
    const across = r2 * Math.cos(roll) + z * Math.sin(roll), depth = z * Math.cos(roll) - r2 * Math.sin(roll), k = EYE / (EYE - depth);
    return [(a2 * AU[0] + across * AN[0]) * k, (a2 * AU[1] + across * AN[1]) * k];
  });
}
// Landed, the wings fold together straight up, so from the side we see a single wing standing off the lantern
// with the joint against the paper: the upper petal turned to point along `deg`.
const UP_TIP = -96.3;
function foldedWing(deg, scale, squash = 1) {
  const a = -UP_TIP * Math.PI / 180, b = deg * Math.PI / 180;
  return WING_UP.map(([x, y]) => {
    // lay the petal along +x, shorten it (foreshortening), then turn it to point along `deg`
    const u = (x * Math.cos(a) - y * Math.sin(a)) * squash * scale, v = (x * Math.sin(a) + y * Math.cos(a)) * scale;
    return [u * Math.cos(b) - v * Math.sin(b), u * Math.sin(b) + v * Math.cos(b)];
  });
}
const mixPts = (a, b, t) => a.map(([x, y], i) => [x + (b[i][0] - x) * t, y + (b[i][1] - y) * t]);
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
