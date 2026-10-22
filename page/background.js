// The background drawn on the GPU: rings, glow, the light in the air with moths' shadows in it, dust and the fireflies' light (WebGL), plus
// the light carried across onto other displays.

// ---- background on the GPU ------------------------------------------------------------------------------
// The full-screen layer (background, glow rings, soft glow, the light and its shadows, dust, the fireflies' light) is drawn by a WebGL shader on a canvas
// behind the SVG, so the GPU fills those millions of pixels and the SVG only redraws the lantern, threads and moths.
const gl = $('bg').getContext('webgl', { alpha: false, antialias: false });
// Everything on it is soft (glow, smoke, dust, the shimmer), so it's drawn at this share of the screen's resolution and
// the browser scales it up: at 0.6 that's about a third of the pixels and of the GPU time, and it looks the same, the
// far wall's lace included (below 0.5 that starts to soften). fitView sizes it.
const bgScale = 0.6;
// The flame has a canvas of its own, between the lantern's back paper and the rest (index.html), so a WebGL of its own.
const fgl = $('flame').getContext('webgl', { antialias: false });
// A GPU reset (sleep, a display change, the GPU process restarting) loses a context and every shader and buffer on it.
// Asking for it back (preventDefault) and reloading once it's restored rebuilds them all from scratch.
for (const c of [$('bg'), $('flame')]) {
  c.addEventListener('webglcontextlost', e => e.preventDefault());
  c.addEventListener('webglcontextrestored', () => location.reload());
}
function program(vert, frag, ctx = gl) {
  const p = ctx.createProgram();
  for (const [type, src] of [[ctx.VERTEX_SHADER, vert], [ctx.FRAGMENT_SHADER, frag]]) {
    const sh = ctx.createShader(type); ctx.shaderSource(sh, src); ctx.compileShader(sh);
    if (!ctx.getShaderParameter(sh, ctx.COMPILE_STATUS)) throw new Error(ctx.getShaderInfoLog(sh));
    ctx.attachShader(p, sh);
  }
  ctx.linkProgram(p);
  const u = {}; // uniform locations by name
  for (let i = 0; i < ctx.getProgramParameter(p, ctx.ACTIVE_UNIFORMS); i++) { const n = ctx.getActiveUniform(p, i).name; u[n] = ctx.getUniformLocation(p, n); }
  return { p, u };
}
// Scene coordinates (the SVG viewBox, y down) for each pixel, then the same layers the SVG drew, back to front.
const SHADOWS_MAX = 24; // moths that can cast a shadow at once (sessions and agents)
// How much of the flame's light reaches a point (1 = all of it): moths' shadows, the caps' fans and a pierced lantern's bands. Shared by the
// background and the dust, so a speck in shadow dims by exactly what the room around it does.
// The hot air's ripple at p (scene units) and time t, each part -1 to 1, rising as t goes on: heat() bends the room by it
// up the column over the lantern, and the Moroccan's far wall by it inside (FAR_WALL), so the two shimmer alike.
const RIPPLE = `vec2 ripple(vec2 p, float t) {
  return vec2(0.7 * sin(p.y * 0.3 + 5.0 * t) + 0.3 * sin(p.y * 0.71 - p.x * 0.2 + 3.0 * t), 0.5 * sin(p.y * 0.45 + p.x * 0.3 + 4.0 * t));
}`;
const LIGHT = `${RIPPLE}
uniform float uDebug; // ?dustdebug: shade the shadows red, and show which specks they gate
uniform vec2 uLightC, uCaps; uniform float uLightScale, uLightR, uSway;
uniform vec4 uFlame; uniform vec3 uRim; // a standing flame's base and tip, and the rim below it that hides it: centre x, half-width, y (none: 0 wide)
uniform vec2 uGlowC; uniform float uGlowR;
uniform vec3 uMoth[${SHADOWS_MAX}]; uniform int uMoths;
uniform vec2 uBandO; uniform vec2 uBand[8]; uniform int uBands; // a pierced lantern's solid bands: each one's slope from the flame, and its spread
// how much light the shadow's outer band and its core take away (subtle: plenty of light still gets round a moth)
const float OUTER = 0.3, CORE = 0.6, SPIKE = 0.22; // SPIKE: a landed moth's, fainter still
// the bands' shadows: how deep one gets at its middle right beside the lantern, and how wide (× the band and flame's size)
const float BAND_PEAK = 0.2, BAND_SPREAD = 0.7;
const float CAPS = 0.3; // how much light the caps' fans hold back (the glow still shows through)
uniform vec4 uHeat; // the hot air rising off the lantern (frame.js heat): where it leaves, how strong (0 for none), and the time
// How far the hot air bends what's seen through it at p, up to HEAT_COLUMN.bend across and half that up: a ripple rising up
// the column (state.js HEAT_COLUMN) from where it leaves. frame.js heatAt weighs the same column, so change the two together.
// The half-width never drops under 1, so smoothstep's edges never meet or cross (undefined in GLSL ES 1.00).
vec2 heat(vec2 p) {
  if (uHeat.z <= 0.0) return vec2(0.0);
  float up = uHeat.y - p.y, wide = max(1.0, ${glf(HEAT_COLUMN.half)} + ${glf(HEAT_COLUMN.widen)} * up), t = uHeat.w; // wide: the column's half-width here
  float k = uHeat.z * smoothstep(0.0, ${glf(HEAT_COLUMN.start)}, up) * (1.0 - smoothstep(${glf(HEAT_COLUMN.fade[0])}, ${glf(HEAT_COLUMN.fade[1])}, up))
    * (1.0 - smoothstep(0.7 * wide, wide, abs(p.x - uHeat.x)));
  return ${glf(HEAT_COLUMN.bend)} * k * ripple(p, t);
}
// the soft glow round the lantern: a radial gradient, 0.85 at the centre, 0.3 at 45%, gone at the edge
float glow(vec2 p) {
  float g = length(p - uGlowC) / uGlowR;
  return g < 0.45 ? mix(0.85, 0.3, g / 0.45) : mix(0.3, 0.0, clamp((g - 0.45) / 0.55, 0.0, 1.0));
}
// How much of a standing flame the rim below it hides from (px, py), 0 to 1: the share of the flame, base (0) to tip (1),
// whose ray to the point crosses the rim's height between its corners. Above the rim it hides none. Each ray is taken by
// its slope u (across per unit down), so it crosses the rim at px + u * (py - rim). Outside the line from the flame's base
// through a corner it's all lit, inside the line from its tip all hidden, and between them it fades: straight edges from
// each corner, a penumbra that widens with distance, one solid shadow under the rim, and a taller or leaning flame turns
// them. Scalars only, so the test can run it as JS.
float rimShade(float px, float py) {
  float h = py - uRim.z;
  if (h <= 0.0) return 0.0;
  float bh = py - uFlame.y, bx = uFlame.x - px, dx = uFlame.z - uFlame.x, dy = uFlame.w - uFlame.y;
  float uB = bx / bh, uT = (uFlame.z - px) / (py - uFlame.w); // the rays to the base and the tip
  float lo = max(min(uB, uT), (uRim.x - uRim.y - px) / h), hi = min(max(uB, uT), (uRim.x + uRim.y - px) / h); // the hidden ones
  if (hi < lo) return 0.0;
  // back to the flame: the ray with slope u meets it at t = (u * bh - bx) / (dx + u * dy), exactly 0 and 1 for the base's
  // and the tip's own rays (on the flame's line they're the same ray, and the whole flame is hidden or none of it)
  float tLo = lo == uB ? 0.0 : lo == uT ? 1.0 : (lo * bh - bx) / (dx + lo * dy);
  float tHi = hi == uT ? 1.0 : hi == uB ? 0.0 : (hi * bh - bx) / (dx + hi * dy);
  return smoothstep(0.0, 1.0, abs(tHi - tLo));
}
float light(vec2 p) {
  // Moth shadows: how much of the light (a small disc around the flame) each moth hides, seen from this point. Right
  // behind a moth that's the whole light; further out the moth covers less of it. Drawn cel-shaded, in two flat tones
  // with crisp edges: a dark core while it hides most of the light, a paler band while it hides some, then nothing.
  // Each moth is x, y and radius.
  float lit = 1.0;
  for (int i = 0; i < ${SHADOWS_MAX}; i++) {
    if (i >= uMoths) break;
    vec3 m = uMoth[i];
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
    lit *= 1.0 - mix(shade, spike, close);
  }
  // the solid caps of a paper lantern, or the holder below a flame, let no light out past them, so above and below it a
  // fan stays darker, one shadow about as wide as the cap seen from the flame, with a soft edge, turned with the lantern's
  // sway. A standing flame's rim casts its own shadow instead (rimShade).
  vec2 q = p - uLightC, lq = vec2(q.x * cos(uSway) + q.y * sin(uSway), -q.x * sin(uSway) + q.y * cos(uSway));
  float capR = lq.y < 0.0 ? uCaps.x : uCaps.y, slope = abs(lq.x) / max(abs(lq.y), 0.001);
  float open = 1.0 - CAPS * (uRim.y > 0.0 ? rimShade(p.x, p.y)
    : step(0.001, capR) * smoothstep(capR * 0.8 + 0.05, capR * 0.8 - 0.05, slope)); // no cap, no fan
  // a band of solid brass, thin beside a big flame, throws mostly penumbra: a soft bell of shadow over the slopes it covers,
  // strongest and narrowest beside the lantern, spreading wider and fading out further away (like a moth's, by distance)
  vec2 bq = p - uBandO;
  float tb = (-bq.x * sin(uSway) + bq.y * cos(uSway)) / max(abs(bq.x * cos(uSway) + bq.y * sin(uSway)), 0.001);
  float bd = length(bq) / uLightScale, spread = 1.0 + bd / 90.0, fade = 1.0 - smoothstep(70.0, 330.0, bd);
  for (int i = 0; i < 8; i++) {
    if (i >= uBands) break;
    float k = (tb - uBand[i].x) / (uBand[i].y * BAND_SPREAD * spread);
    open *= 1.0 - BAND_PEAK * fade * exp(-k * k);
  }
  return lit * open;
}`;
const BG = program(`attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }`, `
precision highp float;
uniform vec2 uRes; uniform vec4 uBox; uniform vec3 uBg; uniform float uAmbient;
uniform vec2 uRingC; uniform vec3 uRingR, uRing0, uRing1, uRing2; uniform float uRingA;
uniform float uGlowA; uniform vec3 uGlowCol; uniform float uAirA;
uniform vec4 uPlume[${PLUMES}], uPlumeB[${PLUMES}]; uniform vec2 uPlumeBase[${PLUMES}]; uniform int uPlumes; uniform vec3 uSmoke; uniform vec3 uSmokeCol;
uniform vec3 uTrail[${TRAIL_POINTS}]; uniform int uTrailN;
uniform float uDrift[13]; // how far the wind has carried smoke aside, at ages 0 to PLUME.life in twelfths (frame.js smokeDrift)
${LIGHT}
const float RISE = 29.0; // how fast smoke rises, units a second
// the smoke's Ss: how far they swing aside and how tall they are, in scene units; and how fast it spreads out, its width
// growing by this much of itself a second
const float S_SIZE = 21.0, S_LENGTH = 160.0, DISPERSE = 1.55;
// How far a bit of smoke age seconds old has curled aside from where it was let go, in PLUME sizes: into Ss, a slow wave
// along the smoke swelling from nothing to S_SIZE × curl over its first second or so, S_LENGTH tall as it rises. Its now
// is the smoke's own clock, offset by its seed so each one curls differently; the bit was let go at now - age, so the
// wave's phase runs along it and the Ss travel as it rises. Every plume and every scorched moth's trail curls by this, so
// they read as one smoke. Scalars only, so the test can run it as JS.
float smokeBend(float age, float now, float curl) {
  float at = now - age, k = 6.2832 * RISE / S_LENGTH;
  return curl * S_SIZE * min(1.0, age / 1.2) * (sin(at * k - now * 1.3) + 0.4 * sin(at * k * 0.525 + now * 0.7));
}
// How far the wind has carried smoke age seconds old aside since it was let go, in scene units: as far as it's carried
// the dust over that time (frame.js smokeDrift), between uDrift's samples
float smokeDrift(float age) {
  float u = min(age / uSmoke.y, 1.0) * 12.0, d = 0.0;
  for (int i = 0; i < 13; i++) d += uDrift[i] * max(0.0, 1.0 - abs(u - float(i)));
  return d;
}
// How much wider smoke age seconds old has spread than when it was let go, thinner to match (its strength over the
// square root of this)
float spread(float age) { return 1.0 + DISPERSE * age; }
// How thick one plume of smoke (frame.js smoke) is at p: a: where it started, seconds in, its strength; b: its seed, how
// many seconds it was let go over, how much it curls and its drift to one side. uSmoke: size, each bit's life in seconds, and opacity. Every bit rises
// steadily from where it started, so the bit at height h left h / RISE seconds ago: it's there only if it left while the
// plume was being let go, and fades as it ages. The column widens as it rises, and bends and curls (smokeBend).
float plume(vec2 p, vec4 a, vec4 b, vec2 base) {
  // its newest smoke rises from base (the flame's live tip), the rest from where it was let go, eased over its first half second
  vec2 o = mix(base, a.xy, smoothstep(0.0, 0.5, max(a.y - p.y, 0.0) / (uSmoke.x * RISE)));
  float size = uSmoke.x, t = a.z, h = (o.y - p.y) / size, age = max(h, 0.0) / RISE;
  if (h < -3.0 || h > t * RISE + 12.0) return 0.0;
  float x = o.x + smokeDrift(age) + size * (smokeBend(age, t + b.x, b.z) + b.w * h * 0.08);
  float sp = spread(age), d = (p.x - x) / (size * (1.0 + h * 0.09) * sp);
  float k = exp(-d * d) / ((1.0 + h * 0.025) * sqrt(sp)) * a.w
    * smoothstep(t * RISE + 12.0, t * RISE - 6.0, h) // its rising tip
    * smoothstep(t - b.y - 0.5, t - b.y, age) // let go only over its first b.y seconds
    * (1.0 - smoothstep(uSmoke.y * 0.4, uSmoke.y, age)) // each bit fading as it ages
    * smoothstep(-3.0, 3.0, h); // soft where it starts
  return k;
}
// How wide a smoke trail is at a point age seconds old, as a share of its spread width, its head's age head: full while
// its head is on the moth (age 0), and once it has stopped following, narrowing to a point over the head's newest third
// of a second. Scalars only, so the test can run it as JS.
float trailTaper(float age, float head) { return 1.0 - 0.85 * smoothstep(0.0, 0.3, head) * (1.0 - smoothstep(head, head + 0.35, age)); }
// How thick a scorched moth's smoke trail (frame.js smoke) is at p: one soft band along its points, each risen and
// spread as a plume's smoke is (spread), fainter the older it is and gone at the end of its life;
// width, strength and age eased between them, the thickest of the segments near p so their joins don't double up.
// Each point is where it is (frame.js smoke bends and curls it) and its age, each trail's head (its newest) first; an age below 0
// parts one moth's trail from the next. Its head tapers once it leaves the moth (trailTaper) and its tail fades out as it
// ages, so neither end looks cut off.
float trailSmoke(vec2 p) {
  float k = 0.0, size = uSmoke.x, aw = 1.0, head = 0.0;
  vec3 a = vec3(0.0, 0.0, -1.0); // the last point: where it is now, and its strength (-1: none)
  for (int i = 0; i < ${TRAIL_POINTS}; i++) {
    if (i >= uTrailN) break;
    vec3 q = uTrail[i];
    if (a.z < 0.0) head = q.z; // a new trail: this is its head
    float sp = spread(q.z), w = size * 2.4 * sp * trailTaper(q.z, head);
    vec3 b = vec3(q.x, q.y - size * RISE * q.z, 0.6 * (1.0 - q.z / uSmoke.y) / sqrt(sp));
    if (q.z < 0.0) b.z = -1.0;
    if (a.z > 0.0 && b.z > 0.0) {
      vec2 ab = b.xy - a.xy;
      float t = clamp(dot(p - a.xy, ab) / max(dot(ab, ab), 0.001), 0.0, 1.0);
      float d = length(p - a.xy - ab * t) / mix(aw, w, t);
      k = max(k, mix(a.z, b.z, t) * exp(-d * d));
    }
    a = b; aw = w;
  }
  return k;
}
void main() {
  vec2 p = uBox.xy + vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uRes * uBox.zw;
  p += heat(p); // seen through the hot air rising off the lantern
  float px = uBox.z / uRes.x; // scene units per pixel, for soft edges
  float lit = light(p);
  vec3 col = uBg;
  if (uAmbient < 0.5) {
    // glow rings: three nested discs, shown together at one opacity
    float d = length(p - uRingC);
    vec3 ring = mix(mix(uRing0, uRing1, smoothstep(px, -px, d - uRingR.y)), uRing2, smoothstep(px, -px, d - uRingR.z));
    col = mix(col, ring, smoothstep(px, -px, d - uRingR.x) * uRingA * lit);
    col = mix(col, uGlowCol, glow(p) * uGlowA * lit); // the soft glow
  }
  if (uAirA > 0.0) {
    // the light in the air: one soft glow from the flame fading out over a long tail (long enough to carry on to a
    // display beside this one, where it's drawn from a light that's off its edge)
    float x = clamp(length(p - uLightC) / uLightScale / 700.0, 0.0, 1.0);
    col = mix(col, uGlowCol, 0.55 * (1.0 - x) * (1.0 - x) * uAirA * lit);
  }
  float smoke = 0.0;
  for (int i = 0; i < ${PLUMES}; i++) { if (i >= uPlumes) break; smoke += plume(p, uPlume[i], uPlumeB[i], uPlumeBase[i]); }
  if (uTrailN > 1) smoke += trailSmoke(p);
  col = mix(col, uSmokeCol, min(1.0, smoke) * uSmoke.z);
  gl_FragColor = vec4(mix(col, vec3(0.8, 0.1, 0.1), uDebug * 0.6 * (1.0 - lit)), 1.0);
}`);
// dust: soft points, positions worked out in JS each frame. The near specks are lit by the lantern: bright and a little
// bigger where its glow is strong, faint out past it, and in a shadow they fade out (far more steeply than the room dims,
// so a moth's shadow or a cap's fan reads as a gap in the dust)
const DUST_DEBUG = Q.has('dustdebug') ? 1 : 0;
const CATCH = 6; // how steeply: full light keeps a speck, the paler shadows (0.7 of the light) leave about a tenth
const DUST = program(`
attribute vec4 a; uniform vec4 uBox; uniform vec2 uRes; uniform float uNear, uCatch, uDpr; varying float vA, vS, vD;
${LIGHT}
const float DIM = 0.6, LIT = 6.0; // a near speck's brightness out of the glow (about the far specks'), and how much the glow adds
void main() {
  vec2 at = a.xy - heat(a.xy); // seen through the hot air, bent the other way to the room behind it
  gl_Position = vec4((at.x - uBox.x) / uBox.z * 2.0 - 1.0, 1.0 - (at.y - uBox.y) / uBox.w * 2.0, 0.0, 1.0);
  float lit = uNear * glow(a.xy); // the far specks stay a faint, even layer
  gl_PointSize = max(a.z * (1.0 + 2.5 * lit) * uRes.x / uBox.z + 1.0, 1.5 * uDpr); // never under 1.5 CSS px, at any size or scale (uDpr: the canvas's pixels per CSS px)
  vS = pow(light(a.xy), uCatch); vA = a.w * mix(1.0, DIM + LIT * lit, uNear) * mix(vS, 1.0, uDebug); vD = uDebug;
}`, `
precision mediump float; uniform vec3 uCol; varying float vA, vS, vD;
// ?dustdebug: a speck the shadows hold back shows red at full strength instead of fading
void main() { float d = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(mix(uCol, vec3(1.0, 0.15, 0.1), vD * (1.0 - vS)), vA * smoothstep(1.0, 0.6, d)); }`);
// The fireflies and stale wisps (fireflies.js, stale.js): points of light added onto the scene, a white-hot core in a
// bloom of the PR's colour, fading into a wide, more saturated haze that lights the air around it. bloomSprite in
// fireflies.js draws the same falloff for the badge flash, so change the two together.
const FLIES = program(`
attribute vec4 a; attribute vec3 c; uniform vec4 uBox; uniform vec2 uRes; varying float vA; varying vec3 vC;
void main() {
  gl_Position = vec4((a.x - uBox.x) / uBox.z * 2.0 - 1.0, 1.0 - (a.y - uBox.y) / uBox.w * 2.0, 0.0, 1.0);
  gl_PointSize = 2.0 * a.z * uRes.x / uBox.z; vA = a.w; vC = c;
}`, `
precision mediump float; varying float vA; varying vec3 vC;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0, m = max(max(vC.r, vC.g), vC.b), edge = max(0.0, 1.0 - d);
  vec3 deep = clamp(m - (m - vC) * 1.8, 0.0, 1.0);
  // bloom: a hot pinpoint, a tight glow and a wider one, then a long inverse-square tail that fades out by the edge
  float peak = exp(-d * d * 400.0), inner = exp(-d * d * 60.0), wide = exp(-d * d * 10.0), tail = edge * edge / (1.0 + d * d * 150.0);
  // a near-white core, a centre that goes whiter as it swells, the PR's colour further out, then a deeper haze
  float core = exp(-d * d * 1500.0);
  vec3 light = mix(vC, vec3(1.0), 0.85) * 1.6 * core + mix(vC, vec3(1.0), clamp(peak * vA * 1.5, 0.0, 1.0)) * (1.2 * peak + 0.7 * inner) + vC * 0.5 * wide + deep * 0.6 * tail;
  gl_FragColor = vec4(light * vA, 1.0);
}`);
const fliesBuf = gl.createBuffer();
// the fireflies' light over the background and dust (a point bigger than the GPU allows, 511px on a Mac, is drawn at
// that size, so on a canvas over about 2400px wide the widest swells stop growing)
function drawFlies(w, h, box) {
  gl.blendFunc(gl.ONE, gl.ONE); // light adds up
  gl.useProgram(FLIES.p);
  gl.bindBuffer(gl.ARRAY_BUFFER, fliesBuf); gl.bufferData(gl.ARRAY_BUFFER, flyLights, gl.DYNAMIC_DRAW);
  const aa = gl.getAttribLocation(FLIES.p, 'a'), ac = gl.getAttribLocation(FLIES.p, 'c');
  gl.enableVertexAttribArray(aa); gl.vertexAttribPointer(aa, 4, gl.FLOAT, false, 28, 0);
  gl.enableVertexAttribArray(ac); gl.vertexAttribPointer(ac, 3, gl.FLOAT, false, 28, 16);
  gl.uniform4f(FLIES.u.uBox, ...box); gl.uniform2f(FLIES.u.uRes, w, h);
  gl.drawArrays(gl.POINTS, 0, flyLightN);
  gl.disableVertexAttribArray(ac); gl.enableVertexAttribArray(0);
}
// The ghost moths (stale.js): their wings as triangles in one flat, pale colour at each moth's own faint opacity, over
// the fireflies' light as they were over it in the SVG. Two wings crossing show darker, as two see-through wings would.
const GHOSTS = program(`
attribute vec3 a; uniform vec4 uBox; varying float vA;
void main() { gl_Position = vec4((a.x - uBox.x) / uBox.z * 2.0 - 1.0, 1.0 - (a.y - uBox.y) / uBox.w * 2.0, 0.0, 1.0); vA = a.z; }`, `
precision mediump float; uniform vec3 uCol; varying float vA;
void main() { gl_FragColor = vec4(uCol, vA); }`);
const ghostsBuf = gl.createBuffer();
function drawGhosts(box) {
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(GHOSTS.p);
  gl.bindBuffer(gl.ARRAY_BUFFER, ghostsBuf); gl.bufferData(gl.ARRAY_BUFFER, ghostWings, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.uniform4f(GHOSTS.u.uBox, ...box); gl.uniform3fv(GHOSTS.u.uCol, rgb(WISP_TINT));
  gl.drawArrays(gl.TRIANGLES, 0, ghostWingN);
}
const quad = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
const dustBuf = gl.createBuffer();
const rgb = c => hex(c).map(v => v / 255);

// the near specks start just outside the lantern's body, so none of them hide behind it; a second display has no
// lantern, so there both rings fill in to the middle, spread evenly over the area (a square root keeps the centre from crowding)
const ring = (from, to) => AMBIENT ? to * Math.sqrt(Math.random()) : from + Math.random() * (to - from);
const dust = Array.from({ length: 102 }, () => ({ a: Math.random() * 6.28, d: ring(125, 265), w: (Math.random() - 0.5) * 0.12,
  ph: Math.random() * 10, r: 0.7 + Math.random() * 1.2, lift: 0 }));
// a fainter, wider ring of specks out in the dark, beyond the glow
const farDust = Array.from({ length: 78 }, () => ({ a: Math.random() * 6.28, d: ring(230, 340), w: (Math.random() - 0.5) * 0.08,
  ph: Math.random() * 10, r: 0.6 + Math.random() * 0.9, lift: 0 }));
const dustData = new Float32Array((dust.length + farDust.length) * 4);

// On a second display (the screensaver's ambient view) the lantern is on another screen. The screensaver passes both
// screens' frames (global points, y up), so its light can carry on from where the lantern's light is, off this screen's edge.
const REMOTE = (() => {
  const f = k => Q.get(k)?.split(',').map(Number);
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

// the light term's inputs, set on each program that uses LIGHT
function setLight(u, v) {
  gl.uniform1f(u.uDebug, DUST_DEBUG); gl.uniform2f(u.uGlowC, ...v.glowC); gl.uniform1f(u.uGlowR, v.glowR);
  const shadows = v.shadows.slice(0, SHADOWS_MAX);
  gl.uniform2f(u.uLightC, ...v.lightC); gl.uniform1f(u.uLightScale, v.lightScale); gl.uniform1f(u.uLightR, v.lightR);
  gl.uniform2f(u.uCaps, ...v.caps); gl.uniform4f(u.uFlame, ...v.flame); gl.uniform3f(u.uRim, ...v.rim); gl.uniform1f(u.uSway, v.sway); gl.uniform1i(u.uMoths, shadows.length);
  gl.uniform2f(u.uBandO, ...v.bandO); gl.uniform1i(u.uBands, Math.min(8, v.bands.length)); if (v.bands.length) gl.uniform2fv(u['uBand[0]'], v.bands.slice(0, 8).flat());
  if (shadows.length) gl.uniform3fv(u['uMoth[0]'], shadows.flat());
  const h = v.heat; gl.uniform4f(u.uHeat, h?.x ?? 0, h?.y ?? 0, h?.k ?? 0, h?.t ?? 0);
}

// ---- the Moroccan's far wall ------------------------------------------------------------------------------------------
// The inside of the pierced lantern's far wall, seen through its front holes. It lives here, not in the SVG, because this
// canvas is drawn under the SVG: the front lace's real holes reveal it for next to nothing, where the SVG drawing it cost
// 10 to 20 fps at 2560x1440 in WebKit. lanterns.js bakes the wall once into a texture (red: its brass, green: the
// lantern's outline, in the lantern's own units over x 250-430, y 140-500); each frame this draws that rectangle turned
// with the sway about the lantern's pivot, its brass slid across by the twist (slide, in units) and lit by the flame (col,
// brightest round the flame at 348), kept inside the outline. The flame sits at the lantern's middle depth, so it's slid
// half as far (frame.js farSlide). The hot air filling the lantern (uHeat: how far it bends, and its time) ripples the
// brass seen through it, as heat() does the room above: most straight above the flame (base at 398), fading out below
// it and toward the sides, gone 53 either side.
const FAR_WALL = program(`attribute vec2 a; uniform vec4 uBox; uniform vec2 uRes, uPivot; uniform float uSway; varying vec2 vUv, vP;
void main() {
  vUv = a; vP = vec2(250.0, 140.0) + a * vec2(180.0, 360.0);
  vec2 d = vP - uPivot, q = uPivot + vec2(cos(uSway) * d.x - sin(uSway) * d.y, sin(uSway) * d.x + cos(uSway) * d.y);
  vec2 c = (q - uBox.xy) / uBox.zw; gl_Position = vec4(c.x * 2.0 - 1.0, 1.0 - c.y * 2.0, 0.0, 1.0);
}`, `precision mediump float; uniform sampler2D uTex; uniform float uSlide; uniform vec2 uHeat; uniform vec3 uCol, uDark; varying vec2 vUv, vP;
${RIPPLE}
void main() {
  float fx = 340.0 + 0.5 * uSlide; // the flame, at the lantern's middle depth (frame.js farSlide)
  vec2 warp = uHeat.x * smoothstep(420.0, 390.0, vP.y) * (1.0 - smoothstep(16.0, 53.0, abs(vP.x - fx))) * ripple(vP, uHeat.y);
  vec4 back = texture2D(uTex, vUv + (warp - vec2(uSlide, 0.0)) / vec2(180.0, 360.0));
  // where a big sway slides the far wall past the outline, the side wall fills the strip: solid brass a little darker,
  // seen edge on (ponytail: no lace on it, since the front's frames hide all but a few pixels of the strip)
  float side = 1.0 - back.g, brass = (back.r + side) * texture2D(uTex, vUv).g;
  gl_FragColor = vec4(mix(uDark, uCol, mix(0.8, 0.3, clamp(length(vP - vec2(fx, 348.0)) / 160.0, 0.0, 1.0))) * (1.0 - 0.25 * side), brass);
}`);
const farWallQuad = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, farWallQuad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
let farWallTex = /** @type {WebGLTexture | null} */ (null);
function setFarWall(/** @type {HTMLCanvasElement} */ canvas) {
  farWallTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, farWallTex);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
}
function drawFarWall({ slide, col, heat }, w, h, box) {
  if (!farWallTex) return;
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(FAR_WALL.p);
  gl.bindBuffer(gl.ARRAY_BUFFER, farWallQuad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, farWallTex);
  const u = FAR_WALL.u;
  gl.uniform1i(u.uTex, 0); gl.uniform4f(u.uBox, ...box); gl.uniform2f(u.uRes, w, h); gl.uniform2f(u.uPivot, 340, VIEW.top);
  gl.uniform1f(u.uSway, swayAngle * Math.PI / 180); gl.uniform1f(u.uSlide, slide);
  gl.uniform2f(u.uHeat, (heat?.k ?? 0) * HEAT_COLUMN.bend * 1.1, heat?.t ?? 0); // a little stronger than the room above
  gl.uniform3fv(u.uCol, rgb(col)); gl.uniform3fv(u.uDark, rgb('#24160A'));
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// ---- the flame ---------------------------------------------------------------------------------------------------------
// Every lantern's flame (frame.js stepFlame moves it), drawn on its own canvas (fgl) on a quad round it. Layered tongues
// (outer, middle, core, 34, 24 and 13 wide) in a halo, the blue root over them, all in the flame's own units (a unit is
// uBase.z in the scene, x across, y up from its base). Each tongue stands on one spine, frame.js's chain (uSpine: each
// point's offset across, evenly up to the outer tongue's tip uShape.x up, the tip frame.js passes on to the smoke, heat and
// rim shadow). Noise rising up through it licks at its edges and bends its middle (uShape.y, the tip and base stay put),
// and a strong gust (uShape.z) tears at its top half. Behind paper its tongues' edges soften over uSoft scene units.
const FLAME = program(`attribute vec2 a; uniform vec4 uBox; varying vec2 vP;
void main() { vP = a; gl_Position = vec4((a.x - uBox.x) / uBox.z * 2.0 - 1.0, 1.0 - (a.y - uBox.y) / uBox.w * 2.0, 0.0, 1.0); }`, `
precision highp float;
uniform vec4 uBase, uBlue; uniform vec3 uShape; uniform float uSpine[${CHAIN + 1}]; uniform float uPx, uSoft, uAlpha, uBlueA; uniform vec3 uHaloC, uOuterC, uMidC, uCoreC, uBlueC;
varying vec2 vP;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { // smooth value noise, -1 to 1
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return 2.0 * mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y) - 1.0;
}
// A tongue's half-width t of the way up it (0 its base, 1 its tip) as a share of its widest, at 0.3: round below that,
// dipping 0.04 under its base (lanterns.js keeps landed moths clear of it), its shoulders full, and
// coming to a point at the tip.
// Scalars only, so the test can run it as JS.
float flameHalf(float t) {
  if (t <= -0.04 || t >= 1.0) return 0.0;
  if (t < 0.3) { float u = (0.3 - t) / 0.34; return sqrt(1.0 - u * u); }
  float u = (t - 0.3) / 0.7;
  return pow(1.0 - u, 1.1) * (1.0 + 0.9 * u); // full shoulders, a sharp tip
}
// How far across the spine is t of the way up it: a smooth curve (Catmull-Rom) through the chain's points, evenly spaced
// up it, passing through each one: the base's at 0, the tip's at 1.
float spineX(float t) {
  float u = clamp(t, 0.0, 1.0) * ${glf(CHAIN)}, s = min(floor(u), ${glf(CHAIN - 1)}), f = u - s, a = 0.0, b = 0.0, c = 0.0, d = 0.0;
  for (int j = 0; j <= ${CHAIN}; j++) {
    float v = uSpine[j], i = float(j);
    if (i == s - 1.0) a = v; if (i == s) b = v; if (i == s + 1.0) c = v; if (i == s + 2.0) d = v;
  }
  if (s == 0.0) a = 2.0 * b - c; if (s == ${glf(CHAIN - 1)}) d = 2.0 * c - b; // past the ends, carry straight on
  return 0.5 * (2.0 * b + (c - a) * f + (2.0 * a - 5.0 * b + 4.0 * c - d) * f * f + (3.0 * b - a - 3.0 * c + d) * f * f * f);
}
// How much of a tongue w wide and h tall covers q (x from the spine), its edge eased over px (in flame units): a pixel,
// or wider behind paper. Its tip and base fade in over px inside them, so none of it shows where it has no width (above
// its tip, below its base): eased there, the spine's own pixel would show half covered, a thin line straight up off the
// tip. Scalars and q.x, q.y only, so the test can run it as JS.
float tongue(vec2 q, float w, float h, float px) {
  float hw = 0.72 * w * flameHalf(q.y / h);
  return clamp((hw - abs(q.x)) / px + 0.5, 0.0, 1.0) * clamp((h - q.y) / px, 0.0, 1.0) * clamp((q.y + 0.04 * h) / px, 0.0, 1.0);
}
void main() {
  vec2 q = vec2(vP.x - uBase.x, uBase.y - vP.y) / uBase.z;
  float h = uShape.x, time = uBase.w, px = max(uPx, uSoft) / uBase.z, t = clamp(q.y / h, 0.0, 1.0), mid = 4.0 * t * (1.0 - t);
  float n1 = noise(vec2(q.x * 0.09, q.y * 0.06 - time * 3.0)), n2 = noise(vec2(q.x * 0.13 + 7.0, q.y * 0.1 - time * 5.0));
  vec2 root = q; // unbent, for the blue root
  q.x -= spineX(t) + uShape.y * mid * (2.5 * n1 + 0.8 * n2);
  float swell = 1.0 + uShape.y * 0.12 * mid * n2;
  float tear = 1.0 - uShape.z * smoothstep(0.45, 0.9, t) * smoothstep(0.0, 0.5, noise(vec2(q.x * 0.05, q.y * 0.12 - time * 9.0)));
  // the halo: a wide soft body and a tip, a wide tongue (46 by 118) blurred by 7, stretched with the flame
  float k = h / 96.0;
  float body = 0.96 * smoothstep(1.0, 0.4, length((q - vec2(0.0, 42.0 * k)) / vec2(49.0, 69.0 * k)));
  float top = 0.94 * smoothstep(1.0, 0.0, length((q - vec2(0.0, 84.0 * k)) / vec2(26.5, 49.0 * k)));
  vec4 c = vec4(uHaloC, 1.0) * 0.8 * (1.0 - (1.0 - body) * (1.0 - top));
  c = mix(c, vec4(uOuterC, 1.0), tear * tongue(q, 34.0 * swell, h, px));
  c = mix(c, vec4(uMidC, 1.0), tear * tongue(q, 24.0 * swell, h * 0.73 * (1.0 + 0.06 * noise(vec2(time * 1.3, 3.0))), px));
  c = mix(c, vec4(uCoreC, 1.0), tear * tongue(q, 13.0 * swell, h * 0.42 * (1.0 + 0.06 * noise(vec2(time * 1.3, 9.0))), px));
  vec2 b = (root - uBlue.xy) / uBlue.zw;
  c = mix(c, vec4(uBlueC, 1.0), uBlueA * smoothstep(1.0, 0.8, length(b)));
  gl_FragColor = c * uAlpha;
}`, fgl);
const flameQuad = fgl.createBuffer();
// Clears the flame's canvas and draws `fire` (none: just clears it), the flame's base and tip in `flame`.
function drawFlame({ flame: [bx, by, tx, ty], fire: f }) {
  const c = $('flame'), box = VIEW.layer, gl = fgl;
  gl.viewport(0, 0, c.width, c.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  if (!f) return;
  const k = f.scale, h = (by - ty) / k, u = FLAME.u;
  const x0 = bx + (Math.min(...f.spine) - 60) * k, x1 = bx + (Math.max(...f.spine) + 60) * k, y0 = by - h * 1.45 * k, y1 = by + 30 * k;
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // its colours come premultiplied
  gl.useProgram(FLAME.p);
  gl.bindBuffer(gl.ARRAY_BUFFER, flameQuad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([x0, y0, x1, y0, x0, y1, x1, y1]), gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.uniform4f(u.uBox, ...box); gl.uniform1f(u.uPx, box[2] / c.width); gl.uniform1f(u.uSoft, f.soft);
  gl.uniform4f(u.uBase, bx, by, k, f.t); gl.uniform3f(u.uShape, h, f.turb, f.tear); gl.uniform1fv(u['uSpine[0]'], f.spine);
  gl.uniform4f(u.uBlue, ...f.blue.slice(0, 4)); gl.uniform1f(u.uBlueA, f.blue[4]); gl.uniform1f(u.uAlpha, f.alpha);
  ['uHaloC', 'uOuterC', 'uMidC', 'uCoreC', 'uBlueC'].forEach((n, i) => gl.uniform3fv(u[n], rgb(f.cols[i])));
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
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
  gl.uniform1f(u.uAmbient, AMBIENT ? 1 : 0);
  gl.uniform2f(u.uRingC, ...v.ringC); gl.uniform3f(u.uRingR, ...v.ringR); gl.uniform1f(u.uRingA, v.ringA);
  v.ringCol.forEach((col, i) => gl.uniform3fv(u[`uRing${i}`], rgb(col)));
  gl.uniform1f(u.uGlowA, v.glowA); gl.uniform3fv(u.uGlowCol, rgb(v.glowCol));
  gl.uniform1f(u.uAirA, v.airA); setLight(u, v);
  gl.uniform1i(u.uPlumes, v.plumes.length); gl.uniform3f(u.uSmoke, PLUME.size, PLUME.life, PLUME.alpha); gl.uniform3fv(u.uSmokeCol, rgb(SMOKE_COL)); gl.uniform1fv(u['uDrift[0]'], v.drift);
  if (v.plumes.length) {
    gl.uniform4fv(u['uPlume[0]'], v.plumes.flatMap(q => q.slice(0, 4)));
    gl.uniform4fv(u['uPlumeB[0]'], v.plumes.flatMap(q => q.slice(4, 8)));
    gl.uniform2fv(u['uPlumeBase[0]'], v.plumes.flatMap(q => q.slice(8, 10)));
  }
  gl.uniform1i(u.uTrailN, v.trail.length); if (v.trail.length) gl.uniform3fv(u['uTrail[0]'], v.trail.flat());
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  // dust over it
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(DUST.p);
  gl.bindBuffer(gl.ARRAY_BUFFER, dustBuf); gl.bufferData(gl.ARRAY_BUFFER, dustData, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
  gl.uniform4f(DUST.u.uBox, x, y, w, h); gl.uniform2f(DUST.u.uRes, c.width, c.height); gl.uniform1f(DUST.u.uDpr, (devicePixelRatio || 1) * bgScale); gl.uniform3fv(DUST.u.uCol, rgb(v.dustCol));
  setLight(DUST.u, v);
  // the near specks catch the light, except on a second display: there no moths cast shadows, and a lantern's cap
  // fan can cover the whole screen, so gating would leave it nearly empty of dust
  gl.uniform1f(DUST.u.uNear, 1); gl.uniform1f(DUST.u.uCatch, AMBIENT ? 0 : CATCH); gl.drawArrays(gl.POINTS, 0, dust.length);
  gl.uniform1f(DUST.u.uNear, 0); gl.uniform1f(DUST.u.uCatch, 0); gl.drawArrays(gl.POINTS, dust.length, farDust.length);
  if (flyLightN) drawFlies(c.width, c.height, [x, y, w, h]);
  flyLightN = 0;
  if (ghostWingN) drawGhosts([x, y, w, h]);
  ghostWingN = 0;
  if (v.farWall) drawFarWall(v.farWall, c.width, c.height, [x, y, w, h]);
  drawFlame(v);
  // the screensaver reads this to tell the page is really drawing, and reloads it when the count stops going up
  if (!gl.isContextLost()) window.lanternFrames = (window.lanternFrames || 0) + 1;
}
