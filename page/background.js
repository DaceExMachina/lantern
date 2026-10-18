// The background drawn on the GPU: rings, glow, the light in the air with moths' shadows in it, and dust (WebGL), plus
// the light carried across onto other displays.

// ---- background on the GPU ------------------------------------------------------------------------------
// The full-screen layer (background, glow rings, soft glow, the light and its shadows, dust) is drawn by a WebGL shader on a canvas
// behind the SVG, so the GPU fills those millions of pixels and the SVG only redraws the lantern, threads and moths.
const gl = $('bg').getContext('webgl', { alpha: false, antialias: false });
function program(vert, frag) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vert], [gl.FRAGMENT_SHADER, frag]]) {
    const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    gl.attachShader(p, sh);
  }
  gl.linkProgram(p);
  const u = {}; // uniform locations by name
  for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) { const n = gl.getActiveUniform(p, i).name; u[n] = gl.getUniformLocation(p, n); }
  return { p, u };
}
// Scene coordinates (the SVG viewBox, y down) for each pixel, then the same layers the SVG drew, back to front.
const SHADOWS_MAX = 24; // moths that can cast a shadow at once (sessions, agents and ghosts)
const BG = program(`attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }`, `
precision highp float;
uniform vec2 uRes; uniform vec4 uBox; uniform vec3 uBg; uniform float uAmbient;
uniform vec2 uRingC; uniform vec3 uRingR, uRing0, uRing1, uRing2; uniform float uRingA;
uniform vec2 uGlowC; uniform float uGlowR, uGlowA; uniform vec3 uGlowCol;
uniform vec2 uLightC, uCaps; uniform float uLightScale, uAirA, uLightR, uSway;
uniform vec4 uMoth[${SHADOWS_MAX}]; uniform int uMoths;
uniform vec2 uBandO; uniform vec2 uBand[8]; uniform int uBands; // ?brass: each solid band's slope from the flame, and its spread
// how much light the shadow's outer band and its core take away (subtle: plenty of light still gets round a moth)
const float OUTER = 0.3, CORE = 0.6, SPIKE = 0.22; // SPIKE: a landed moth's, fainter still
const float BAND = 0.06; // how deep a band's shadow gets at its middle: a gentle dip in the glow, never a line
const float CAPS = 0.3; // how much light the caps' fans hold back (the glow still shows through)
void main() {
  vec2 p = uBox.xy + vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uRes * uBox.zw;
  float px = uBox.z / uRes.x; // scene units per pixel, for soft edges
  // Moth shadows: how much of the light (a small disc around the flame) each moth hides, seen from this pixel. Right
  // behind a moth that's the whole light; further out the moth covers less of it. Drawn cel-shaded, in two flat tones
  // with crisp edges: a dark core while it hides most of the light, a paler band while it hides some, then nothing.
  // Each moth is x, y, radius and how dark it can get.
  float lit = 1.0;
  for (int i = 0; i < ${SHADOWS_MAX}; i++) {
    if (i >= uMoths) break;
    vec4 m = uMoth[i];
    vec2 dm = m.xy - p, dl = uLightC - p;
    float ll = length(dl), along = dot(dm, dl) / ll; // how far toward the light the moth is, from here
    if (along > ll) continue; // the moth is beyond the light
    float lm = max(length(dm), 0.001);
    // close to the lantern even more of its light gets round a moth: there the light acts bigger and the shadow is fainter still
    float near = 1.0 - smoothstep(70.0, 210.0, length(m.xy - uLightC) / uLightScale);
    float am = min(m.z / lm, 2.0), al = uLightR * (1.0 + 1.5 * near) / ll, sep = abs(dm.x * dl.y - dm.y * dl.x) / (lm * ll);
    float cover = min(1.0, am * am / (al * al)) * smoothstep(am + al, abs(am - al), sep) * smoothstep(-0.5 * m.z, 0.5 * m.z, along);
    float edge = 0.03 + 0.05 * near; // softer still up close
    float shade = (1.0 - 0.75 * near) * (OUTER * smoothstep(0.2 - edge, 0.2 + edge, cover) + (CORE - OUTER) * smoothstep(0.6 - edge, 0.6 + edge, cover));
    // The closer a moth is to the lantern, the bigger the lit paper behind it looks next to the moth, so its full
    // shadow narrows to a point sooner (where the moth and the light look the same size) and only a soft spike shows:
    // a moth sitting on the paper is the far end of that, and one out at its home keeps the shadow above.
    float close = 1.0 - smoothstep(120.0, 260.0, length(m.xy - uLightC) / uLightScale), al0 = uLightR / ll;
    float spike = SPIKE * smoothstep(-0.4 * am * close, (0.1 + 0.7 * close) * am, am - al0 - sep) * smoothstep(-0.5 * m.z, 0.5 * m.z, along);
    lit *= 1.0 - m.w * mix(shade, spike, close);
  }
  // the solid caps of a paper lantern: no light leaves through its top or bottom, so above and below it a fan stays
  // darker: one shadow, about as wide as the cap seen from the flame, with a soft edge; turned with the lantern's sway
  vec2 q = p - uLightC, lq = vec2(q.x * cos(uSway) + q.y * sin(uSway), -q.x * sin(uSway) + q.y * cos(uSway));
  float capR = lq.y < 0.0 ? uCaps.x : uCaps.y, slope = abs(lq.x) / max(abs(lq.y), 0.001);
  float open = 1.0 - CAPS * step(0.001, capR) * smoothstep(capR * 0.8 + 0.05, capR * 0.8 - 0.05, slope); // no cap, no fan
  // a band of solid brass, thin beside a big flame, throws mostly penumbra: a soft bell of shadow over the slopes it covers
  vec2 bq = p - uBandO;
  float tb = (-bq.x * sin(uSway) + bq.y * cos(uSway)) / max(abs(bq.x * cos(uSway) + bq.y * sin(uSway)), 0.001);
  for (int i = 0; i < 8; i++) {
    if (i >= uBands) break;
    float k = (tb - uBand[i].x) / uBand[i].y;
    open *= 1.0 - BAND * exp(-k * k);
  }
  vec3 col = uBg;
  if (uAmbient < 0.5) {
    // glow rings: three nested discs, shown together at one opacity
    float d = length(p - uRingC);
    vec3 ring = mix(mix(uRing0, uRing1, smoothstep(px, -px, d - uRingR.y)), uRing2, smoothstep(px, -px, d - uRingR.z));
    col = mix(col, ring, smoothstep(px, -px, d - uRingR.x) * uRingA * lit * open);
    // soft glow: radial gradient, 0.85 at the centre, 0.3 at 45%, gone at the edge
    float g = length(p - uGlowC) / uGlowR;
    float ga = g < 0.45 ? mix(0.85, 0.3, g / 0.45) : mix(0.3, 0.0, clamp((g - 0.45) / 0.55, 0.0, 1.0));
    col = mix(col, uGlowCol, ga * uGlowA * lit * open);
  }
  if (uAirA > 0.0) {
    // the light in the air: one soft glow from the flame fading out over a long tail (long enough to carry on to a
    // display beside this one, where it's drawn from a light that's off its edge)
    float x = clamp(length(p - uLightC) / uLightScale / 700.0, 0.0, 1.0);
    col = mix(col, uGlowCol, 0.55 * (1.0 - x) * (1.0 - x) * uAirA * lit * open);
  }
  gl_FragColor = vec4(col, 1.0);
}`);
// dust: soft points, positions worked out in JS each frame
const DUST = program(`
attribute vec4 a; uniform vec4 uBox; uniform vec2 uRes; varying float vA;
void main() {
  gl_Position = vec4((a.x - uBox.x) / uBox.z * 2.0 - 1.0, 1.0 - (a.y - uBox.y) / uBox.w * 2.0, 0.0, 1.0);
  gl_PointSize = a.z * 2.0 * uRes.x / uBox.z + 1.0; vA = a.w;
}`, `
precision mediump float; uniform vec3 uCol; varying float vA;
void main() { float d = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(uCol, vA * smoothstep(1.0, 0.6, d)); }`);
const quad = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
const dustBuf = gl.createBuffer(), dustData = new Float32Array(60 * 4);
const rgb = c => hex(c).map(v => v / 255);

const dust = Array.from({ length: 34 }, () => ({ a: Math.random() * 6.28, d: 40 + Math.random() * 230, w: (Math.random() - 0.5) * 0.12,
  ph: Math.random() * 10, r: 0.7 + Math.random() * 1.2 }));
// a fainter, wider ring of specks out in the dark, beyond the glow
const farDust = Array.from({ length: 26 }, () => ({ a: Math.random() * 6.28, d: 230 + Math.random() * 110, w: (Math.random() - 0.5) * 0.08,
  ph: Math.random() * 10, r: 0.6 + Math.random() * 0.9 }));

// On a second display (the screensaver's ambient view) the lantern is on another screen. The screensaver passes both
// screens' frames (global points, y up), so its light can carry on from where the lantern's light is, off this screen's edge.
const REMOTE = (() => {
  const q = new URLSearchParams(location.search), f = k => q.get(k)?.split(',').map(Number);
  const L = f('lantern'), S = f('self');
  return L?.length === 4 && S?.length === 4 && ![...L, ...S].some(isNaN) ? { L, S } : null;
})();
function remoteLight() {
  const { L: [lx, ly, lw, lh], S: [sx, sy, sw, sh] } = REMOTE;
  // the lantern display's view, worked out the same way fitView does it there
  const kx = Math.max(1, lw / lh), ky = Math.max(1, lh / lw), vw = 600 * kx, vh = 600 * ky, vx = 340 - vw / 2, vy = 320 - vh / 2;
  const gx = lx + (style.light[0] - vx) / vw * lw, gyUp = ly + lh - (style.light[1] - vy) / vh * lh; // the light, in global points
  const ax = gx - sx, ay = sy + sh - gyUp; // ...and in this screen's pixels (y down)
  const [bx, by, bw, bh] = VIEW.box;
  return { c: [bx + ax / sw * bw, by + ay / sh * bh], scale: Math.max(kx, ky) * (bw / sw) / (vw / lw) };
}

function drawBackground(v) {
  if (!VIEW.box) return; // not laid out yet
  const c = $('bg'), [x, y, w, h] = VIEW.box;
  gl.viewport(0, 0, c.width, c.height);
  gl.disable(gl.BLEND);
  gl.useProgram(BG.p);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const u = BG.u;
  gl.uniform2f(u.uRes, c.width, c.height); gl.uniform4f(u.uBox, x, y, w, h); gl.uniform3fv(u.uBg, rgb('#2B2440'));
  gl.uniform1f(u.uAmbient, document.body.classList.contains('ambient') ? 1 : 0);
  gl.uniform2f(u.uRingC, ...v.ringC); gl.uniform3f(u.uRingR, ...v.ringR); gl.uniform1f(u.uRingA, v.ringA);
  v.ringCol.forEach((col, i) => gl.uniform3fv(u[`uRing${i}`], rgb(col)));
  gl.uniform2f(u.uGlowC, ...v.glowC); gl.uniform1f(u.uGlowR, v.glowR); gl.uniform1f(u.uGlowA, v.glowA); gl.uniform3fv(u.uGlowCol, rgb(v.glowCol));
  gl.uniform2f(u.uLightC, ...v.lightC); gl.uniform1f(u.uLightScale, v.lightScale); gl.uniform1f(u.uAirA, v.airA);
  const shadows = v.shadows.slice(0, SHADOWS_MAX);
  gl.uniform1f(u.uLightR, v.lightR); gl.uniform2f(u.uCaps, ...v.caps); gl.uniform1f(u.uSway, v.sway); gl.uniform1i(u.uMoths, shadows.length);
  gl.uniform2f(u.uBandO, ...v.bandO); gl.uniform1i(u.uBands, Math.min(8, v.bands.length)); if (v.bands.length) gl.uniform2fv(u['uBand[0]'], v.bands.slice(0, 8).flat());
  if (shadows.length) gl.uniform4fv(u['uMoth[0]'], shadows.flat());
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  // dust over it
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(DUST.p);
  gl.bindBuffer(gl.ARRAY_BUFFER, dustBuf); gl.bufferData(gl.ARRAY_BUFFER, dustData, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
  gl.uniform4f(DUST.u.uBox, x, y, w, h); gl.uniform2f(DUST.u.uRes, c.width, c.height); gl.uniform3fv(DUST.u.uCol, rgb(v.dustCol));
  gl.drawArrays(gl.POINTS, 0, 60);
}
