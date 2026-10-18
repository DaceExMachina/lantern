// The lantern's pose as it swings, and (with ?lantern3d) the round chōchin as a real 3D object: its profile spun round
// the vertical axis, cel-shaded with a dark outline and lit from inside by the flame, on a small WebGL canvas that
// sits between the background and the SVG.

// ---- the pose ---------------------------------------------------------------------------------------------------
// Scene axes: x right, y down, z toward the viewer. The lantern hangs from (340, top, 0) and turns about it: yaw spins
// it on its string, pitch tips its bottom toward the viewer, roll is the sideways sway. Seen with perspective from
// EYE_Z in front of the lantern's middle, so a point on the surface's centre plane (z 0) never moves with it.
const EYE_Z = 700;
const POSE = { m: [1, 0, 0, 0, 1, 0, 0, 0, 1], top: 20 }; // m: rotation, row-major
const mul3 = (a, b) => a.map((_, i) => { const r = Math.floor(i / 3), c = i % 3; return a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]; });
function setPose(yaw, pitch, roll, top) {
  const [cy, sy, cp, sp, cr, sr] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch), Math.cos(roll), Math.sin(roll)];
  POSE.m = mul3(mul3([cr, -sr, 0, sr, cr, 0, 0, 0, 1], [1, 0, 0, 0, cp, -sp, 0, sp, cp]), [cy, 0, sy, 0, 1, 0, -sy, 0, cy]);
  POSE.top = top;
}
/** @type {(v: number[]) => number[]} */
const turn = v => { const m = POSE.m; return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]; };
// A point on the lantern, as it hangs at rest, to where it shows in the scene.
/** @type {(p: number[]) => [number, number]} */
function place([x, y, z = 0]) {
  const [wx, wy, wz] = turn([x - 340, y - POSE.top, z]), k = EYE_Z / (EYE_Z - wz);
  return [340 + wx * k, 330 + (wy + POSE.top - 330) * k];
}
// The SVG parts that hang with the lantern (string, flame, tassel) all sit near its centre plane, so one affine
// transform that matches place() there carries them along.
function planeMatrix() {
  const [o, x, y] = [place([340, 330]), place([440, 330]), place([340, 430])];
  const a = (x[0] - o[0]) / 100, b = (x[1] - o[1]) / 100, c = (y[0] - o[0]) / 100, d = (y[1] - o[1]) / 100;
  return `matrix(${[a, b, c, d, o[0] - a * 340 - c * 330, o[1] - b * 340 - d * 330].map(v => v.toFixed(4)).join(' ')})`;
}

// ---- the 3D chōchin ---------------------------------------------------------------------------------------------
const L3D = new URLSearchParams(location.search).has('lantern3d');
const lantern3dOn = () => L3D && style === STYLES.chochin;
// What stays SVG: the string down to the top cap, and the tassel (in the drawing's own units, like STYLES.chochin).
const CHOCHIN_3D = {
  paper: true,
  back: MOCK(`<path d="M95 -7.5V66" stroke="#C9B49C" stroke-width="0.8"/>`, 18),
  front: MOCK(`<g id="tassel"><path d="M95 177V194" stroke="#2A1E1E" stroke-width="1"/><circle cx="95" cy="196" r="2.6" fill="#D9AE52"/>
    <path d="M93.5 198L92 210M95 198V212M96.5 198L98 210" stroke="#D9AE52" stroke-width="0.6"/></g>`, 18),
};
// The paper is STYLES.chochin's body (so moths land on what's drawn); the black caps are short cylinders. Scene units.
const CAP = { r: 45.6, top: [196.4, 218], bottom: [441.2, 462.8], bevel: 3 };
const BOX = [190, 178, 300, 300]; // the part of the scene the canvas covers: the lantern and its swing, scene units
const RIBS = 14, SEAM = 0.07; // bamboo hoops between the caps; the paper's seam, a little way round to the right

const gl3 = L3D ? $('lantern3d').getContext('webgl2', { antialias: true, premultipliedAlpha: true }) : null;
let L3 = null; // the program and meshes, built on first use

// A surface of revolution from a profile of [r, y, v] points, top to bottom (v runs along it, for the ribs). Smooth
// profiles share one normal per point; flat ones keep a hard edge at every point. `grow` is the direction the outline
// shell pushes each vertex out, mitred so the shell sits the same distance off every face.
function lathe(profile, smooth, around = 96) {
  const segN = profile.slice(1).map(([r1, y1], i) => { const [r0, y0] = profile[i], l = Math.hypot(r1 - r0, y1 - y0); return [(y1 - y0) / l, -(r1 - r0) / l]; });
  const grow = profile.map((_, i) => {
    const a = segN[Math.max(0, i - 1)], b = segN[Math.min(segN.length - 1, i)], k = 1 + a[0] * b[0] + a[1] * b[1];
    return [(a[0] + b[0]) / k, (a[1] + b[1]) / k];
  });
  const rings = smooth ? profile.map((p, i) => { const l = Math.hypot(...grow[i]); return [p, [grow[i][0] / l, grow[i][1] / l], grow[i]]; })
    : segN.flatMap((n, i) => [[profile[i], n, grow[i]], [profile[i + 1], n, grow[i + 1]]]);
  const data = [], idx = [], row = around + 1;
  for (const [[r, y, v], [nr, ny], [gr, gy]] of rings) for (let j = 0; j <= around; j++) {
    const a = 2 * Math.PI * j / around, s = Math.sin(a), c = Math.cos(a); // j 0 faces the viewer
    data.push(340 + r * s, y, r * c, nr * s, ny, nr * c, gr * s, gy, gr * c, j / around, v);
  }
  for (let i = 0; i + 1 < rings.length; i += smooth ? 1 : 2) for (let j = 0; j < around; j++) {
    const a = i * row + j, b = a + row;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const vao = gl3.createVertexArray(); gl3.bindVertexArray(vao);
  gl3.bindBuffer(gl3.ARRAY_BUFFER, gl3.createBuffer()); gl3.bufferData(gl3.ARRAY_BUFFER, new Float32Array(data), gl3.STATIC_DRAW);
  [3, 3, 3, 2].reduce((at, n, loc) => { gl3.enableVertexAttribArray(loc); gl3.vertexAttribPointer(loc, n, gl3.FLOAT, false, 44, at * 4); return at + n; }, 0);
  gl3.bindBuffer(gl3.ELEMENT_ARRAY_BUFFER, gl3.createBuffer()); gl3.bufferData(gl3.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl3.STATIC_DRAW);
  return { vao, count: idx.length };
}

function build3d() {
  const vs = `#version 300 es
layout(location = 0) in vec3 aPos; layout(location = 1) in vec3 aNrm; layout(location = 2) in vec3 aGrow; layout(location = 3) in vec2 aUV;
uniform mat3 uM; uniform float uTop, uGrow; uniform vec4 uBox;
out vec3 vLocal, vN, vView; out vec2 vUV;
void main() {
  vec3 pivot = vec3(340.0, uTop, 0.0), w = pivot + uM * (aPos + aGrow * uGrow - pivot);
  float iw = (${EYE_Z.toFixed(1)} - w.z) / ${EYE_Z.toFixed(1)}; // 1 / perspective scale, so the GPU divides it in
  vec2 p = vec2(340.0, 330.0) + (w.xy - vec2(340.0, 330.0)) / iw, ndc = (p - uBox.xy) / uBox.zw * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, -w.z / 400.0, 1.0) * iw;
  vLocal = aPos; vN = aNrm; vUV = aUV;
  vView = transpose(uM) * (vec3(340.0, 330.0, ${EYE_Z.toFixed(1)}) - w); // toward the viewer, in the lantern's own axes
}`;
  // Cel-shaded: every tone is a flat colour with a crisp, antialiased edge. The paper's light is how much of the
  // flame shines through it toward you: brighter close to the flame and where the paper faces you, dimmer where you
  // look across it near the edges. Three bands of that, with the ribs and the seam as thin darker lines on top.
  const fs = `#version 300 es
precision highp float;
in vec3 vLocal, vN, vView; in vec2 vUV;
uniform int uMat; uniform mat3 uM; uniform vec3 uFlame; uniform float uBright, uLine;
uniform vec3 uHot, uMid, uShade, uRib, uInk, uCapDark, uCapLit, uCapShine, uBounce;
out vec4 o;
float band(float x, float t) { float a = fwidth(x) * 0.7; return smoothstep(t - a, t + a, x); }
float line(float x) { float d = abs(fract(x + 0.5) - 0.5) / max(fwidth(x), 1e-5); return 1.0 - smoothstep(uLine * 0.5, uLine * 0.5 + 1.0, d); }
void main() {
  if (uMat == 2) { o = vec4(uInk, 1.0); return; }
  vec3 N = normalize(vN), V = normalize(vView);
  if (uMat == 0) {
    float d = length(vLocal - uFlame) / 110.0, through = uBright / (d * d * d) * (0.2 + 0.8 * max(dot(N, V), 0.0));
    vec3 c = mix(mix(uShade, uMid, band(through, 0.32)), uHot, band(through, 1.05));
    c = mix(c, uRib, 0.55 * line(vUV.y * ${RIBS.toFixed(1)}));
    c = mix(c, uRib, 0.4 * line(vUV.x - ${SEAM}));
    o = vec4(c, 1.0);
  } else {
    // black lacquer caps: lit and shadowed sides, a hard shine, and the faces turned to the paper catch its glow
    vec3 Nw = uM * N, L = normalize(vec3(-0.45, -0.6, 0.66)), H = normalize(L + normalize(uM * V));
    vec3 c = mix(uCapDark, uCapLit, band(dot(Nw, L), 0.3));
    c = mix(c, uCapShine, band(dot(Nw, H), 0.985));
    c = mix(c, uBounce, band(dot(N, normalize(vec3(340.0, 330.0, 0.0) - vLocal)), 0.6));
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
  return { p, u, paper: lathe(paper, true), caps: [lathe(cap(CAP.top), false), lathe(cap(CAP.bottom), false)],
    outline: [...side.map(([r, y]) => [340 + r, y]), ...side.reverse().map(([r, y]) => [340 - r, y])] };
}

// Show or hide the canvas with the lantern style; behind it, threads and ghosts are clipped to the lantern's outline.
function showLantern3d() {
  if (!L3D) return;
  const on = lantern3dOn();
  $('lantern3d').style.visibility = on ? '' : 'hidden';
  for (const id of ['threads', 'stale']) on ? $(id).setAttribute('clip-path', 'url(#offLantern)') : $(id).removeAttribute('clip-path');
}
// Keep the canvas over BOX, at the screen's pixel density (fitView calls this; the SVG scales scene units uniformly).
function fitLantern3d(width) {
  if (!L3D) return;
  const [x, y, w] = VIEW.box, k = width / w, c = $('lantern3d'), dpr = devicePixelRatio || 1;
  Object.assign(c.style, { inset: 'auto', left: `${(BOX[0] - x) * k}px`, top: `${(BOX[1] - y) * k}px`, width: `${BOX[2] * k}px`, height: `${BOX[3] * k}px` });
  c.width = Math.round(BOX[2] * k * dpr); c.height = Math.round(BOX[3] * k * dpr);
  L3D_PX = BOX[2] / c.width; // scene units per device pixel, for the outline's width
}
let L3D_PX = 0.5;

// One frame: the lantern in its current pose, in the scene's current light. `size` is how big the flame burns (0.3
// to 1), `bright` the paper's light with flicker and pulse, `cool` how far toward violet everything has turned.
function drawLantern3d({ paper, core, size, bright, cool }) {
  L3 ??= build3d();
  const g = gl3, { u } = L3, rgb = c => hex(c).map(v => v / 255);
  g.viewport(0, 0, g.drawingBufferWidth, g.drawingBufferHeight);
  g.clearColor(0, 0, 0, 0); g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT);
  g.enable(g.DEPTH_TEST); g.enable(g.CULL_FACE);
  g.useProgram(L3.p);
  const m = POSE.m;
  g.uniformMatrix3fv(u.uM, false, [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]); // GL wants columns
  g.uniform1f(u.uTop, POSE.top); g.uniform4fv(u.uBox, BOX);
  g.uniform3f(u.uFlame, 340, 379, 0); g.uniform1f(u.uBright, bright);
  g.uniform1f(u.uLine, 1.1 * (devicePixelRatio || 1)); // ribs and seam about a CSS pixel wide, in device pixels
  // tones: the paper's cream takes on the flame's colour the brighter it burns, deepening toward dusk at the edges
  const mid = mix('#F3ECE2', paper, 0.4 + 0.45 * size), shade = mix(paper, mix('#7A2E48', '#2E2A70', cool), 0.5 - 0.15 * size);
  const tones = { uHot: mix(core, paper, 0.12), uMid: mid, uShade: shade, uRib: mix(shade, '#3A1E2C', 0.4),
    uInk: mix('#1A1016', '#14122A', cool), uCapDark: '#22171A', uCapLit: '#44302F', uCapShine: mix('#A07A62', core, 0.25), uBounce: mix('#22171A', paper, 0.5 * size) };
  for (const [k, c] of Object.entries(tones)) g.uniform3fv(u[k], rgb(c));
  const draw = (mat, grow, cull) => {
    g.uniform1i(u.uMat, mat); g.uniform1f(u.uGrow, grow); g.cullFace(cull);
    for (const mesh of mat === 0 ? [L3.paper] : mat === 1 ? L3.caps : [L3.paper, ...L3.caps]) { g.bindVertexArray(mesh.vao); g.drawElements(g.TRIANGLES, mesh.count, g.UNSIGNED_SHORT, 0); }
  };
  draw(0, 0, g.BACK); draw(1, 0, g.BACK);
  draw(2, 2.4 * L3D_PX * (devicePixelRatio || 1), g.FRONT); // the outline: the back faces of a slightly bigger shell, in ink
  // the clip that hides threads and ghosts behind the lantern follows its outline as it swings
  put($('offLanternPath'), 'd', 'M-9999 -9999H9999V9999H-9999Z M' + L3.outline.map(p => place(p).map(v => v.toFixed(1)).join(' ')).join('L') + 'Z');
}
