// The lantern's pose as it swings, and (with ?lantern3d) the round chōchin as a real 3D object: its profile spun round
// the vertical axis, cel-shaded with a dark outline and lit from inside by the flame, on a small WebGL canvas that
// sits between the background and the SVG.

// ---- the pose ---------------------------------------------------------------------------------------------------
// Scene axes: x right, y down, z toward the viewer. The lantern hangs from (340, top, 0) and turns about it: yaw spins
// it on its string, pitch tips its bottom toward the viewer, roll is the sideways sway. Seen with perspective from
// EYE_Z in front of the lantern's middle, so a point on the surface's centre plane (z 0) never moves with it.
const EYE_Z = 700;
const POSE = { m: [1, 0, 0, 0, 1, 0, 0, 0, 1], top: 20, yaw: 0 }; // m: rotation, row-major
const mul3 = (a, b) => a.map((_, i) => { const r = Math.floor(i / 3), c = i % 3; return a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]; });
function setPose(yaw, pitch, roll, top) {
  const [cy, sy, cp, sp, cr, sr] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch), Math.cos(roll), Math.sin(roll)];
  POSE.m = mul3(mul3([cr, -sr, 0, sr, cr, 0, 0, 0, 1], [1, 0, 0, 0, cp, -sp, 0, sp, cp]), [cy, 0, sy, 0, 1, 0, -sy, 0, cy]);
  POSE.top = top; POSE.yaw = yaw;
}
/** @type {(v: number[]) => number[]} */
const turn = v => { const m = POSE.m; return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]; };
// A point on the lantern, as it hangs at rest, to where it shows in the scene.
/** @type {(p: number[]) => [number, number]} */
function place([x, y, z = 0]) {
  const [wx, wy, wz] = turn([x - 340, y - POSE.top, z]), k = EYE_Z / (EYE_Z - wz);
  return [340 + wx * k, 330 + (wy + POSE.top - 330) * k];
}
// The flame sits on the lantern's centre plane, so one affine transform that matches place() there carries it along.
function planeMatrix() {
  const [o, x, y] = [place([340, 330]), place([440, 330]), place([340, 430])];
  const a = (x[0] - o[0]) / 100, b = (x[1] - o[1]) / 100, c = (y[0] - o[0]) / 100, d = (y[1] - o[1]) / 100;
  return `matrix(${[a, b, c, d, o[0] - a * 340 - c * 330, o[1] - b * 340 - d * 330].map(v => v.toFixed(4)).join(' ')})`;
}

// ---- the 3D chōchin ---------------------------------------------------------------------------------------------
const L3D = new URLSearchParams(location.search).has('lantern3d');
const lantern3dOn = () => L3D && style === STYLES.chochin;
// Only the flame stays SVG (carried by the pose, seen as a faint glow through the paper); the string and tassel are
// part of the 3D scene, so the paper and caps hide whatever part of them is behind.
const CHOCHIN_3D = { paper: true, back: '', front: '' };
// The paper is STYLES.chochin's body (so moths land on what's drawn); the black caps are short cylinders. Scene units.
const CAP = { r: 45.6, top: [196.4, 218], bottom: [441.2, 462.8], bevel: 3 };
// The tassel, measured down from where it hangs on the bottom cap: a short cord, a bead, a binding, and the fringe
const TASSEL = { cord: 22, bead: [28, 6.2], band: [33, 38, 3.8], fringe: [37, 70, 3.6, 9.5] };
// the part of the scene the canvas covers: x, top (the window's top, set by fitLantern3d), width, height. It reaches
// past the tassel's tip by enough that a full swing, tipped toward you (so a little bigger), never meets its edge.
const BOX = [170, 0, 340, 0], BOX_BOTTOM = CAP.bottom[1] + TASSEL.fringe[1] + 40;
const RIBS = 14, SEAM = 0.07, PERCHES = 16; // bamboo hoops between the caps; the paper's seam, a little way round to the right

const gl3 = L3D ? $('lantern3d').getContext('webgl2', { antialias: true, premultipliedAlpha: true }) : null;
let L3 = null; // the program and meshes, built on first use

// ---- geometry: each part is { data, idx }, 11 floats a vertex: position, normal, grow, u, v ------------------------
// `grow` is the direction the outline shell pushes each vertex out, mitred so the shell sits the same distance off
// every face. A surface of revolution about x = cx, z = 0 from a profile of [r, y, v] points, top to bottom (v runs
// along it, for the ribs). Smooth profiles share one normal per point; flat ones keep a hard edge at every point.
function lathe(profile, smooth, around = 96, cx = 340) {
  const segN = profile.slice(1).map(([r1, y1], i) => { const [r0, y0] = profile[i], l = Math.hypot(r1 - r0, y1 - y0); return [(y1 - y0) / l, -(r1 - r0) / l]; });
  const grow = profile.map((_, i) => {
    const a = segN[Math.max(0, i - 1)], b = segN[Math.min(segN.length - 1, i)], k = 1 + a[0] * b[0] + a[1] * b[1];
    return [(a[0] + b[0]) / k, (a[1] + b[1]) / k];
  });
  const rings = smooth ? profile.map((p, i) => { const l = Math.hypot(...grow[i]); return [p, [grow[i][0] / l, grow[i][1] / l], grow[i]]; })
    : segN.flatMap((n, i) => [[profile[i], n, grow[i]], [profile[i + 1], n, grow[i + 1]]]);
  const data = [], idx = [], row = around + 1;
  for (const [[r, y, v = 0], [nr, ny], [gr, gy]] of rings) for (let j = 0; j <= around; j++) {
    const a = 2 * Math.PI * j / around, s = Math.sin(a), c = Math.cos(a); // j 0 faces the viewer
    data.push(cx + r * s, y, r * c, nr * s, ny, nr * c, gr * s, gy, gr * c, j / around, v);
  }
  for (let i = 0; i + 1 < rings.length; i += smooth ? 1 : 2) for (let j = 0; j < around; j++) {
    const a = i * row + j, b = a + row;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return { data, idx };
}
// A ball (or a squashed one, `squash` < 1) of radius r centred on (340, y).
const ball = (y, r, squash = 1) => lathe(Array.from({ length: 13 }, (_, i) => { const a = Math.PI * i / 12; return [r * Math.sin(a), y - r * squash * Math.cos(a)]; }), true, 24);
const merge = (...parts) => parts.reduce((m, p) => { const base = m.data.length / 11; m.data.push(...p.data); m.idx.push(...p.idx.map(i => i + base)); return m; }, { data: [], idx: [] });
function upload({ data, idx }) {
  const vao = gl3.createVertexArray(); gl3.bindVertexArray(vao);
  const vb = gl3.createBuffer(), ib = gl3.createBuffer();
  gl3.bindBuffer(gl3.ARRAY_BUFFER, vb); gl3.bufferData(gl3.ARRAY_BUFFER, new Float32Array(data), gl3.STATIC_DRAW);
  [3, 3, 3, 2].reduce((at, n, loc) => { gl3.enableVertexAttribArray(loc); gl3.vertexAttribPointer(loc, n, gl3.FLOAT, false, 44, at * 4); return at + n; }, 0);
  gl3.bindBuffer(gl3.ELEMENT_ARRAY_BUFFER, ib); gl3.bufferData(gl3.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl3.STATIC_DRAW);
  return { vao, count: idx.length, free: () => { gl3.deleteVertexArray(vao); gl3.deleteBuffer(vb); gl3.deleteBuffer(ib); } };
}

// The tassel, hanging from the bottom cap at (340, CAP.bottom[1]), in a few chunky forms to match the caps: a short
// dark cord, a gold bead, a gold binding, and the fringe as one tapered cone, grooved into tufts, flaring at its tip.
function tasselParts() {
  const y0 = CAP.bottom[1], { cord, bead, band, fringe: [f0, f1, fr0, fr1] } = TASSEL;
  const gold = merge(ball(y0 + bead[0], bead[1]), lathe([[0, y0 + band[0]], [band[2], y0 + band[0]], [band[2], y0 + band[1]], [0, y0 + band[1]]], false, 24),
    lathe([[0, y0 + f0, 1], [fr0, y0 + f0, 1], [fr0 + (fr1 - fr0) * 0.45, y0 + f0 + (f1 - f0) * 0.6, 1], [fr1, y0 + f1 - 2, 1], [fr1 - 2, y0 + f1, 1], [0, y0 + f1, 1]], false, 24)); // v 1: the fringe
  return { cord: upload(lathe([[1.2, y0 - 4], [1.2, y0 + cord + 2]], false, 10)), gold: upload(gold) };
}

function build3d() {
  // Every part goes through one transform: w = uTo + uM (p - uFrom). The lantern turns about where it hangs (uFrom =
  // uTo = that point); the tassel hangs from the bottom cap's point in the scene with its own swing.
  const vs = `#version 300 es
layout(location = 0) in vec3 aPos; layout(location = 1) in vec3 aNrm; layout(location = 2) in vec3 aGrow; layout(location = 3) in vec2 aUV;
uniform mat3 uM; uniform vec3 uFrom, uTo; uniform float uGrow; uniform vec4 uBox;
out vec3 vLocal, vN, vView, vWorld; out vec2 vUV;
void main() {
  vec3 w = uTo + uM * (aPos + aGrow * uGrow - uFrom);
  float iw = (${EYE_Z.toFixed(1)} - w.z) / ${EYE_Z.toFixed(1)}; // 1 / perspective scale, so the GPU divides it in
  vec2 p = vec2(340.0, 330.0) + (w.xy - vec2(340.0, 330.0)) / iw, ndc = (p - uBox.xy) / uBox.zw * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, -w.z / 400.0, 1.0) * iw;
  vLocal = aPos; vN = aNrm; vUV = aUV; vWorld = w;
  vView = transpose(uM) * (vec3(340.0, 330.0, ${EYE_Z.toFixed(1)}) - w); // toward the viewer, in the part's own axes
}`;
  // The paper's light is how much of the flame shines through it toward you: brighter close to the flame and where
  // the paper faces you, dimmer where you look across it near the edges. It ramps smoothly from the dusky edge tone
  // through the paper's colour to the flame's core, with the ribs and the seam as thin darker lines on top.
  const fs = `#version 300 es
precision highp float;
in vec3 vLocal, vN, vView, vWorld; in vec2 vUV;
uniform int uMat; uniform mat3 uM; uniform vec3 uFlame, uGlowW, uColor; uniform float uBright, uLine;
uniform vec3 uHot, uMid, uShade, uRib, uInk, uCapDark, uCapLit, uCapShine, uBounce;
uniform vec4 uPerch[${PERCHES}]; uniform int uPerches; // landed moths: where each sits on the paper, and its size
out vec4 o;
float band(float x, float t) { float a = fwidth(x) * 0.7; return smoothstep(t - a, t + a, x); }
float line(float x) { float d = abs(fract(x + 0.5) - 0.5) / max(fwidth(x), 1e-5); return 1.0 - smoothstep(uLine * 0.5, uLine * 0.5 + 1.0, d); }
void main() {
  if (uMat == 2) { o = vec4(uInk, 1.0); return; }
  vec3 N = normalize(vN), V = normalize(vView);
  if (uMat == 0) {
    float d = length(vLocal - uFlame) / 110.0, through = uBright * pow(d, -2.5) * (0.35 + 0.65 * max(dot(N, V), 0.0));
    vec3 c = mix(mix(uShade, uMid, smoothstep(0.1, 0.95, through)), uHot, smoothstep(0.6, 1.7, through));
    c = mix(c, uRib, 0.55 * line(vUV.y * ${RIBS.toFixed(1)}));
    c = mix(c, uRib, 0.4 * line(vUV.x - ${SEAM}));
    // a faint soft shadow where each landed moth touches the paper, so it rests on it rather than hovering
    float touch = 0.0;
    for (int i = 0; i < ${PERCHES}; i++) {
      if (i >= uPerches) break;
      vec4 q = uPerch[i];
      touch = max(touch, (1.0 - smoothstep(0.0, 8.0 * q.w, length(vLocal - q.xyz))) * min(1.0, q.w));
    }
    c = mix(c, uShade * 0.75, 0.4 * touch);
    o = vec4(c, 1.0);
    return;
  }
  vec3 Nw = uM * N, L = normalize(vec3(-0.45, -0.6, 0.66)), H = normalize(L + normalize(uM * V));
  if (uMat == 1) {
    // black lacquer caps, cel-shaded: lit and shadowed sides, a hard shine, and the faces turned to the paper catch its glow
    vec3 c = mix(uCapDark, uCapLit, band(dot(Nw, L), 0.3));
    c = mix(c, uCapShine, band(dot(Nw, H), 0.985));
    c = mix(c, uBounce, band(dot(N, normalize(vec3(340.0, 330.0, 0.0) - vLocal)), 0.6));
    o = vec4(c, 1.0);
  } else {
    // string and tassel, cel-shaded the same way in their own colour: a shadowed and a lit side, a small hard shine,
    // and the side facing the lantern warmed by its glow
    vec3 c = mix(uColor * 0.55, uColor, band(dot(Nw, L), 0.1));
    c = mix(c, mix(uColor, vec3(1.0), 0.6), 0.6 * band(dot(Nw, H), 0.97));
    c = mix(c, c * 0.6 + uBounce * 0.9, 0.5 * band(dot(Nw, normalize(uGlowW - vWorld)), 0.55));
    if (vUV.y > 0.5) c = mix(c, uColor * 0.45, 0.6 * line(vUV.x * 8.0)); // the fringe: a few broad tufts, grooved between
    o = vec4(c, 1.0);
  }
}`;
  const p = gl3.createProgram();
  for (const [type, src] of [[gl3.VERTEX_SHADER, vs], [gl3.FRAGMENT_SHADER, fs]]) {
    const sh = gl3.createShader(type); gl3.shaderSource(sh, src); gl3.compileShader(sh);
    if (!gl3.getShaderParameter(sh, gl3.COMPILE_STATUS)) throw new Error(gl3.getShaderInfoLog(sh));
    gl3.attachShader(p, sh);
  }
  gl3.linkProgram(p);
  const u = {};
  for (let i = 0; i < gl3.getProgramParameter(p, gl3.ACTIVE_UNIFORMS); i++) { const n = gl3.getActiveUniform(p, i).name; u[n] = gl3.getUniformLocation(p, n); }
  // the paper: the body's ellipse from where it meets the top cap to where it meets the bottom one
  const { half } = STYLES.chochin.body, cy = 330.8, ry = 115.2, rx = half(cy);
  const th0 = Math.acos((cy - CAP.top[1]) / ry), th1 = Math.acos((cy - CAP.bottom[0]) / ry);
  const paper = Array.from({ length: 65 }, (_, i) => { const th = th0 + (th1 - th0) * i / 64; return [rx * Math.sin(th), cy - ry * Math.cos(th), i / 64]; });
  /** @type {(ys: number[]) => number[][]} */
  const cap = ([y0, y1]) => { const { r, bevel: b } = CAP; return [[0, y0, 0], [r - b, y0, 0], [r, y0 + b, 0], [r, y1 - b, 0], [r - b, y1, 0], [0, y1, 0]]; };
  // the silhouette, for hiding threads and ghosts behind the lantern: down the right side and back up the left
  const side = [...cap(CAP.top).slice(1, 5), ...paper.filter((_, i) => i % 4 === 0), ...cap(CAP.bottom).slice(1, 5)].map(([r, y]) => [r, y]);
  return { p, u, paper: upload(lathe(paper, true)), caps: upload(merge(lathe(cap(CAP.top), false), lathe(cap(CAP.bottom), false))),
    knot: upload(ball(CAP.top[0], 4.2, 0.7)), // where the string goes into the top cap
    ...tasselParts(), string: null, stringTop: NaN,
    outline: [...side.map(([r, y]) => [340 + r, y]), ...side.reverse().map(([r, y]) => [340 - r, y])] };
}

// Where a moth's landing spot sits on the round paper: its spot as seen head on (x, y), pushed out to the surface.
/** @type {(p: number[]) => [number, number, number]} */
const perchPoint = ([x, y]) => [x, y, Math.sqrt(Math.max(0, STYLES.chochin.body.half(y) ** 2 - (x - 340) ** 2))];
// Where it shows with the lantern at rest: for hover areas, which hold still while the lantern swings.
/** @type {(p: number[]) => [number, number]} */
const atRest = ([x, y, z]) => { const k = EYE_Z / (EYE_Z - z); return [340 + (x - 340) * k, 330 + (y - 330) * k]; };

// The caps' dark fans in the background (background.js) are set by the lantern's axis and how wide each cap looks
// from the light. Here both come from the caps' real projected edges, so the fans stay on them as it tips and twists.
function capFans3d() {
  const light = place(STYLES.chochin.light), [ax, ay] = place([340, CAP.top[1]]), [bx, by] = place([340, CAP.bottom[0]]);
  const fan = y => { const a = place([340 - CAP.r, y]), b = place([340 + CAP.r, y]), c = place([340, y]);
    return Math.hypot(b[0] - a[0], b[1] - a[1]) / 2 / Math.hypot(c[0] - light[0], c[1] - light[1]); };
  return { sway: Math.atan2(ax - bx, by - ay), caps: [fan(CAP.top[1]), fan(CAP.bottom[0])] };
}

// The tassel is a pendulum of its own on the bottom cap: gravity keeps it hanging down while the lantern tips, and
// the cap's sideways acceleration makes it lag behind and swing a little; a faint breeze keeps it from ever settling.
const SWING = { a: 0, w: 0, x: null, vx: 0, ax: 0 }; // the tassel's angle (radians, bottom toward +x), its speed, the cap's x motion
function swingTassel(dt, s) {
  const [bx] = place([340, CAP.bottom[1]]), t = SWING, L = 40, g = 9 * L; // about 3 rad/s natural swing, a short cord
  if (t.x !== null && dt > 0) {
    const vx = (bx - t.x) / dt;
    t.ax += ((vx - t.vx) / dt - t.ax) * Math.min(1, dt * 8); // smoothed, so frame-time jitter doesn't kick it
    t.vx = vx;
    const breeze = 0.5 * Math.sin(s * 1.3) + 0.3 * Math.sin(s * 2.9 + 1);
    t.w += (-(g / L) * Math.sin(t.a) - (t.ax / L) * Math.cos(t.a) - 1.2 * t.w + breeze) * dt;
    t.a += t.w * dt;
  }
  t.x = bx;
}

// Show or hide the canvas with the lantern style; behind it, threads and ghosts are clipped to the lantern's outline.
// The canvas never takes the pointer, so hover areas over the lantern still work.
function showLantern3d() {
  if (!L3D) return;
  const on = lantern3dOn();
  $('lantern3d').style.visibility = on ? '' : 'hidden';
  $('lantern3d').style.pointerEvents = 'none';
  $('hang').style.display = on ? 'none' : ''; // the 3D string replaces it
  for (const id of ['threads', 'stale']) on ? $(id).setAttribute('clip-path', 'url(#offLantern)') : $(id).removeAttribute('clip-path');
}
// Keep the canvas over BOX, from the window's top down past the tassel, at the screen's pixel density (fitView calls
// this; the SVG scales scene units uniformly).
function fitLantern3d(width) {
  if (!L3D) return;
  const [x, y, w] = VIEW.box, k = width / w, c = $('lantern3d'), dpr = devicePixelRatio || 1;
  BOX[1] = y; BOX[3] = BOX_BOTTOM - y;
  Object.assign(c.style, { inset: 'auto', left: `${(BOX[0] - x) * k}px`, top: '0px', width: `${BOX[2] * k}px`, height: `${BOX[3] * k}px` });
  c.width = Math.round(BOX[2] * k * dpr); c.height = Math.round(BOX[3] * k * dpr);
  L3D_PX = BOX[2] / c.width; // scene units per device pixel, for the outline's width
}
let L3D_PX = 0.5;

// One frame: the lantern in its current pose, in the scene's current light. `size` is how big the flame burns (0.3
// to 1), `bright` the paper's light with flicker and pulse, `cool` how far toward violet everything has turned.
function drawLantern3d({ paper, core, size, bright, cool }) {
  L3 ??= build3d();
  const g = gl3, { u } = L3, rgb = c => hex(c).map(v => v / 255), top = POSE.top, px = L3D_PX * (devicePixelRatio || 1);
  if (L3.stringTop !== top) { // the string runs from the top of the window into the top cap
    L3.string?.free();
    L3.string = upload(lathe([[1.1, top - 12], [1.1, CAP.top[0] + 3]], false, 10)); L3.stringTop = top;
  }
  g.viewport(0, 0, g.drawingBufferWidth, g.drawingBufferHeight);
  g.clearColor(0, 0, 0, 0); g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT);
  g.enable(g.DEPTH_TEST); g.enable(g.CULL_FACE);
  g.useProgram(L3.p);
  g.uniform4fv(u.uBox, BOX);
  g.uniform3f(u.uFlame, 340, 379, 0); g.uniform1f(u.uBright, bright);
  g.uniform1f(u.uLine, 1.1 * (devicePixelRatio || 1)); // ribs and seam about a CSS pixel wide, in device pixels
  // tones: the paper's cream takes on the flame's colour the brighter it burns, deepening toward dusk at the edges
  const mid = mix('#F3ECE2', paper, 0.4 + 0.45 * size), shade = mix(paper, mix('#7A2E48', '#2E2A70', cool), 0.5 - 0.15 * size);
  const tones = { uHot: mix(core, paper, 0.12), uMid: mid, uShade: shade, uRib: mix(shade, '#3A1E2C', 0.4),
    uInk: mix('#2A1A1C', '#1C1A34', cool), uCapDark: '#22171A', uCapLit: '#44302F', uCapShine: mix('#A07A62', core, 0.25), uBounce: mix('#22171A', paper, 0.5 * size) };
  for (const [k, c] of Object.entries(tones)) g.uniform3fv(u[k], rgb(c));
  const landed = [...moths.values()].filter(m => m.wasLanded && m.perch && !m.leaving).slice(0, PERCHES);
  g.uniform4fv(u['uPerch[0]'], new Float32Array(PERCHES * 4).map((_, i) => { const m = landed[i >> 2]; return !m ? 0 : i % 4 < 3 ? perchPoint(m.perch)[i % 4] : (m.fold || 0) * m.size; }));
  g.uniform1i(u.uPerches, landed.length);
  // where things sit in the scene before perspective: the lantern turns about where it hangs, the tassel hangs from
  // the bottom cap's point there, turned with the lantern's twist and swung by its own pendulum
  const pivot = [340, top, 0], world = p => turn([p[0] - 340, p[1] - top, p[2] || 0]).map((v, i) => v + pivot[i]);
  g.uniform3fv(u.uGlowW, world([340, 336, 0]));
  const cols = m => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]; // GL wants columns
  const ca = Math.cos(-SWING.a), sa = Math.sin(-SWING.a), cy = Math.cos(POSE.yaw), sy = Math.sin(POSE.yaw);
  const frames = {
    lantern: [cols(POSE.m), pivot, pivot],
    tassel: [cols(mul3([ca, -sa, 0, sa, ca, 0, 0, 0, 1], [cy, 0, sy, 0, 1, 0, -sy, 0, cy])), [340, CAP.bottom[1], 0], world([340, CAP.bottom[1], 0])],
  };
  // [mesh, material, frame, outline width in CSS px, colour]: paper 0, caps 1, the rest 3 in their own colour
  const parts = [[L3.paper, 0, 'lantern', 1.6], [L3.caps, 1, 'lantern', 1.6], [L3.knot, 3, 'lantern', 0.9, '#2A1E1E'],
    [L3.string, 3, 'lantern', 0.6, '#C9B49C'], [L3.cord, 3, 'tassel', 1.0, '#3A2626'], [L3.gold, 3, 'tassel', 1.4, '#D9AE52']];
  for (const ink of [false, true]) { // the surfaces, then the outline: the back faces of a slightly bigger shell, in ink
    g.cullFace(ink ? g.FRONT : g.BACK);
    for (const [mesh, mat, f, w, col] of parts) {
      const [m, from, to] = frames[f];
      g.uniformMatrix3fv(u.uM, false, m); g.uniform3fv(u.uFrom, from); g.uniform3fv(u.uTo, to);
      g.uniform1i(u.uMat, ink ? 2 : mat); g.uniform1f(u.uGrow, ink ? w * px : 0);
      if (col) g.uniform3fv(u.uColor, rgb(col));
      g.bindVertexArray(mesh.vao); g.drawElements(g.TRIANGLES, mesh.count, g.UNSIGNED_SHORT, 0);
    }
  }
  // the clip that hides threads and ghosts behind the lantern follows its outline as it swings
  put($('offLanternPath'), 'd', 'M-9999 -9999H9999V9999H-9999Z M' + L3.outline.map(p => place(p).map(v => v.toFixed(1)).join(' ')).join('L') + 'Z');
}
