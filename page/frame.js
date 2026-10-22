// The animation: one frame of the lantern, flame, moths, threads and fireflies.

// ---- animation ---------------------------------------------------------------
let level = 0, cool = 0, sparkClock = 0, last = performance.now();
const sparks = [];
// Writing an attribute WebKit already has can still cost a repaint, so the frame loop only writes values that changed.
const put = (el, k, v) => { if (el) { v = String(v); if (el.getAttribute(k) !== v) el.setAttribute(k, v); } };

// How far out along its line toward home (perchAt) a moth sits when it lands, or after the hop in fidget slot `slot`.
// Seeded by the session and the slot alone, so every window puts it in the same spot, and a flying moth's thread
// already knows where it'll land.
const alongFor = (key, slot) => seeded(hash(`${key}:${slot ?? 'land'}`))();

// A pierced lantern's solid bands (class band), measured once per lantern: their middle height, half-height and half-width
/** @type {Element | undefined} */
let firstBand;
let bands = [];
function measureBands() {
  if (!firstBand?.isConnected) {
    const els = [...document.querySelectorAll('#lantern .band')];
    firstBand = els[0];
    bands = els.map(e => { const b = /** @type {SVGGraphicsElement} */ (e).getBBox(); return [b.y + b.height / 2, b.height / 2, b.width / 2]; });
  }
  return bands;
}

// A long ribbon bookmark (style.ribbon: where it's tied, in the lantern's own units). A short chain of points under gravity
// and a light breeze, pinned at the top and held at fixed spacing, so it trails the sway and settles. It twists along its
// length, showing its darker back and narrowing where it turns edge-on. Simulated in the scene, drawn in the lantern.
const BOOKMARK = { n: 13, half: 4.6, gravity: 700, h: 1 / 240, maxSteps: 12, iterations: 4 }; // 4 holds the length within 0.3% even at maxSteps (measured)
// One wind for the scene, in the sway's degrees: the dust, ribbon and fireflies feel it as it blows, the lantern swings
// with it a moment later (its tassel and knot tail LAG seconds behind). Smooth noise in time: every sway.gust seconds on
// average (lanterns.js) a new strength and side, eased between, mostly mild (the power of 1.5) so the strong gusts stand out from
// calmer spells, with a faster, fainter flutter on top. Pseudo-random from the clock alone, so every window and the
// snapshots agree; scaled to the strength of the two steady sines it replaced (an RMS of about 1.17).
const rnd = x => { const v = Math.sin(x * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const knot = i => { const u = 2 * rnd(i) - 1; return Math.sign(u) * Math.abs(u) ** 1.5; };
// the knots sit at whole numbers nudged up to a quarter either way, so a gust lasts half to one and a half times the average
const knotAt = i => i + (rnd(i + 0.17) - 0.5) * 0.5;
const noise = x => {
  let i = Math.floor(x);
  if (x < knotAt(i)) i--; else if (x >= knotAt(i + 1)) i++;
  const f = (x - knotAt(i)) / (knotAt(i + 1) - knotAt(i));
  return knot(i) + (knot(i + 1) - knot(i)) * f * f * (3 - 2 * f);
};
const GUST = s => (noise(s / sway.gust) + noise(s / sway.gust * 3.1 + 50) * 0.25) * 2.6, LAG = 0.6;
// One step of the bookmark's physics, apart from drawing so it can be tested: the chain in `r` trails its knot at (ax, ay),
// heading for `length` long. It runs in fixed steps of BOOKMARK.h, carrying leftover time to the next frame: a step as
// short as a frame can be (two timers firing together) turned the constraint fix-ups into huge speeds and flung it about.
// A long frame runs at most maxSteps and drops the rest. When a resize moves the knot the chain is carried with it, and a
// new length grows in instead of snapping; anything that still goes wrong (not a number, or stretched far past its length)
// hangs it straight from the knot again.
/** @param {{pts?: {x: number, y: number, px: number, py: number, vx: number, vy: number}[], seg?: number, acc?: number}} r */
function stepRibbon(r, ax, ay, length, dt, s) {
  const { n, gravity, h, maxSteps, iterations } = BOOKMARK, target = length / (n - 1);
  const hang = () => { r.seg = target; r.pts = Array.from({ length: n }, (_, i) => ({ x: ax, y: ay + i * target, px: 0, py: 0, vx: 0, vy: 0 })); };
  if (!r.pts || r.seg === undefined) hang();
  const pts = /** @type {NonNullable<typeof r.pts>} */ (r.pts), jx = ax - pts[0].x, jy = ay - pts[0].y;
  if (Math.hypot(jx, jy) > 20) for (const p of pts) { p.x += jx; p.y += jy; }
  const acc = (r.acc || 0) + Math.max(0, dt) || 0, steps = Math.min(maxSteps, Math.floor(acc / h));
  r.acc = steps < maxSteps ? acc - steps * h : 0; // behind even after the most steps: let the rest go
  if (steps === maxSteps && acc > steps * h) { // and carry the chain through the knot's move in that time: a yank at the top ripples down it as a zigzag
    const f = 1 - steps * h / acc, mx = (ax - pts[0].x) * f, my = (ay - pts[0].y) * f;
    for (const p of pts) { p.x += mx; p.y += my; }
  }
  const seg = r.seg = /** @type {number} */ (r.seg) + (target - /** @type {number} */ (r.seg)) * Math.min(1, steps * h);
  const keep = Math.pow(0.5, h); // air drag
  for (let k = 0; k < steps; k++) {
    for (const [i, p] of pts.entries()) {
      p.px = p.x; p.py = p.y;
      if (i === 0) { p.x = ax; p.y = ay; continue; }
      p.vx += (GUST(s) * 70 + Math.sin(s * 2.3 + i * 0.7) * 12) * i / (n - 1) * h; p.vy += gravity * h; // the wind, strongest at the free end
      p.x += p.vx * h; p.y += p.vy * h;
    }
    for (let it = 0; it < iterations; it++) for (let i = 1; i < n; i++) { // the pinned end never moves, so the first link pulls only the second point
      const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, f = (d - seg) / d, wa = i === 1 ? 0 : 0.5;
      a.x += dx * f * wa; a.y += dy * f * wa; b.x -= dx * f * (1 - wa); b.y -= dy * f * (1 - wa);
    }
    for (const p of pts) { p.vx = (p.x - p.px) / h * keep; p.vy = (p.y - p.py) / h * keep; }
  }
  let len = 0;
  for (let i = 1; i < n; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  if (!(len < 1.5 * seg * (n - 1))) hang(); // also catches NaN
}
const bookmark = {};
let bookmarkFor;
function drawRibbon(dt, s) {
  const [ax, ay] = rot(...style.ribbon), { n, half } = BOOKMARK, rad = swayAngle * Math.PI / 180, top = VIEW.top;
  if (bookmarkFor !== style) { bookmarkFor = style; delete bookmark.pts; }
  // long, but never past the bottom of the window: most of the room below the knot, within limits
  const floor = VIEW.box ? VIEW.box[1] + VIEW.box[3] : 620;
  stepRibbon(bookmark, ax, ay, Math.min(260, Math.max(60, (floor - style.ribbon[1]) * 0.85)), dt, s);
  const pts = bookmark.pts;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const P = pts.map(p => [340 + (p.x - 340) * cos + (p.y - top) * sin, top - (p.x - 340) * sin + (p.y - top) * cos]); // into the lantern's units
  // signed half-width: the twist grows down the ribbon (flat where it's tied); past a quarter turn the back shows
  const w = pts.map((p, i) => { const c = Math.cos((2 * Math.sin(s * 0.45 - i * 0.35) + p.vx * 0.015) * i / (n - 1)); return Math.sign(c || 1) * Math.max(half * Math.abs(c), 1.875 / (VIEW.px || 1)); }); // edge-on it still shows the cloth's thickness, ~3.75px
  const L = [], R = [];
  P.forEach(([x, y], i) => {
    const [x0, y0] = P[Math.max(0, i - 1)], [x1, y1] = P[Math.min(n - 1, i + 1)], d = Math.hypot(x1 - x0, y1 - y0) || 1;
    const nx = -(y1 - y0) / d * w[i], ny = (x1 - x0) / d * w[i];
    L.push([x + nx, y + ny]); R.push([x - nx, y - ny]);
  });
  const pt = ([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`, faces = { front: '', back: '' };
  const face = (side, ...ps) => { faces[side > 0 ? 'front' : 'back'] += `M${ps.map(pt).join('L')}Z`; };
  // the end is cut on a long slant: one edge runs to the tip, the other stops about two widths short (steeper than 45°)
  for (let k = n - 1, back = 0; k > 0; k--) {
    const d = Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]) || 1;
    if (back + d < 4 * half) { back += d; continue; }
    const f = (4 * half - back) / d, c = [R[k][0] + (R[k - 1][0] - R[k][0]) * f, R[k][1] + (R[k - 1][1] - R[k][1]) * f];
    for (let j = k; j < n; j++) R[j] = c;
    break;
  }
  for (let i = 0; i < n - 1; i++) {
    if (w[i] * w[i + 1] > 0) face(w[i], L[i], L[i + 1], R[i + 1], R[i]);
    else { // it turns over within this link: split where it's edge-on
      const t = w[i] / (w[i] - w[i + 1]), c = [P[i][0] + (P[i + 1][0] - P[i][0]) * t, P[i][1] + (P[i + 1][1] - P[i][1]) * t];
      face(w[i], L[i], c, R[i]); face(w[i + 1], c, L[i + 1], R[i + 1]);
    }
  }
  put($('ribbonFront'), 'd', faces.front); put($('ribbonBack'), 'd', faces.back);
  put($('ribbonEdge'), 'd', `M${[...L, ...R.reverse()].map(pt).join('L')}Z`);
}

// One frame: the lantern burns brighter the more sessions work and turns violet while one needs me, then each part
// draws itself in turn: the lantern and its flame, the moths one by one, the stale wisps, and the light behind it all.
function frame(t) {
  fitView(); // the scene's size, should it have changed (scene.js)
  const elapsed = (t - last) / 1000, dt = Math.min(0.05, elapsed); last = t;
  const s = t / 1000;
  const working = sessions.filter(x => x.state === 'working' || x.state === 'paused').length; // agents still busy count too
  const calling = fakeLamp === 'live' ? sessions.some(x => x.state === 'waiting' && !x.snoozed) : fakeLamp === 'violet'; // fakeLamp: lanterns.js
  level = fakeFlame ?? level + (Math.min(working, 5) / 5 - level) * dt * 1.5; // 5+ working is "fully lit"; fakeFlame: lanterns.js, ?flame=
  cool += ((calling ? 1 : 0) - cool) * dt * 2;
  // the flame's size (ember-small when idle) and its slow violet pulse (its flicker comes from its own height, stepFlame) while someone needs me
  swingLantern(elapsed, s);
  const flame = stepFlame(dt, s, { size: 0.3 + 0.7 * Math.max(level, cool * 0.45), pulse: 1 - 0.3 * cool * (0.5 + 0.5 * Math.sin(s * 2.4)) });
  // the outer tongue in the scene, for scorched moths to aim at: its middle, half its widest (0.72 of its 34, background.js
  // tongue) and its height
  tongue = style.scorches ? { cx: (flame.base[0] + flame.tip[0]) / 2, half: 0.72 * 34 * flame.size * style.flame[2], height: flame.base[1] - flame.tip[1] } : null;
  drawSparks(dt, s, flame);
  lightPaper(flame);
  drawShine(s, flame);
  drawHeat(s, flame);
  if (style.shine && !AMBIENT) drawLeaves(s); // the second screen hides the lantern, as drawShine does
  if (!AMBIENT) swarm(lanternFlies, new Map(reviews.map(r => [r.url, { ...r, need: 'review' }])), lightAt(), [125, 170], dt);
  for (const [k, m] of moths) {
    const aim = mothTarget(k, m, dt, s);
    if (!aim) continue; // it flew off and is gone
    if (!m.parentId) mothFireflies(m, dt, s);
    if (m.zone) mothZones(m, aim.needsMe);
    mothMove(m, aim, dt, s);
    const [upPts, sidePts] = mothWings(m, aim, dt, s);
    mothColour(m, aim.needsMe, upPts, sidePts, dt);
    mothZs(m, s);
    mothThread(m, dt, s);
  }
  if (!AMBIENT) drawStale(dt, s); // the second screen keeps just the light and the dust
  drawLight(dt, s, flame); // the background last, once every moth has moved, so their shadows fall where they are now
  placeCard();
}

// warm while everyone's busy, cool while someone needs me: every colour crossfades between the two
const pal = k => mix(WARM[k], COOL[k], cool);

// ---- the lantern -------------------------------------------------------------
// The lantern's sway on its string, in degrees. Anything attached to the lantern goes through rot(), which turns a point
// in the lantern's own units with it, about where it hangs from the top of the window.
let swayAngle = 0;
// A fake twist on the chain, in degrees of yaw: the swing alone wouldn't turn the faces to the light, but the brass's lighting
// (face tones, the curved parts' highlight, the far wall's parallax) follows this, trailing the sway with a slow turn of
// its own, never past TWIST_MAX. The drawing itself doesn't turn.
let twist = 0;
// How far the twist slides the Moroccan's far wall across, in units (0 without one; the front stays put). The flame, its
// burner cup and its light sit at the lantern's middle depth, so they slide half as far (#inside, lightAt): they parallax
// between the front and the far wall.
let farSlide = 0;
// where the lantern's light is in the scene this frame, swinging with it and slid to its middle depth
const lightAt = () => rot(style.light[0] + farSlide / 2, style.light[1]);
// The most the twist may turn, in degrees. The target eases into it (tanh) rather than hitting a wall, so a big gust can't
// spin the faces round. TWIST_GAIN is how strongly it follows the sway, and TWIST_RATE how quickly (per second) the twist
// catches up with it: the twist trails the swing by about 0.3 s, its weight, where 1.2 had it a sluggish 0.6 s behind
// (test/page.test.js). Over twenty minutes of normal wind the twist's median is 13, its 90th percentile 32 and its peak 55.
const TWIST_MAX = 60, TWIST_GAIN = 2.4, TWIST_RATE = 3;
// A flat face's tone: how squarely it faces a light 35 degrees to the left as the lantern twists (`angle` round the lantern,
// `tilt` up, the light sitting a little above), squared so the tone moves plainly as it turns, with a low floor so a face
// turned a little away still lifts off the darkest tone as the twist brings it round; blended along FACET_TONES.
function facetTone(angle, tilt = 0) {
  const e = tilt * Math.PI / 180, c = Math.cos((angle + 35 - twist) * Math.PI / 180) * Math.cos(e) + Math.sin(e) * 0.5;
  const u = Math.max(0, Math.min(1, (c + 0.45) / 1.45)), t = u * u * 4, i = Math.min(3, Math.floor(t));
  return mix(FACET_TONES[i], FACET_TONES[i + 1], t - i);
}
/** @returns {[number, number]} */
function rot(px, py, by = swayAngle) { // `by` -swayAngle turns a point in the scene back into the lantern's own frame
  const rad = by * Math.PI / 180, top = VIEW.top;
  return [340 + (px - 340) * Math.cos(rad) - (py - top) * Math.sin(rad), top + (px - 340) * Math.sin(rad) + (py - top) * Math.cos(rad)];
}
// Sway on the string as a damped pendulum, with its tassel, ribbon or knot trailing (sway.period and sway.damping,
// lanterns.js). It's pushed by how the wind (GUST) is changing rather than by the wind itself: GUST less an average that
// follows it sway.forget seconds behind, so a lean the wind holds fades away and the lantern swings back past the middle
// before the breeze turns, rocking near its own period instead of hanging out to one side. It swings from the top of the
// window, with the push scaled so the lantern moves sideways as much as it would hung at y=20. A standing lantern
// (style.stands) holds still at 0, so rot() leaves everything where it's drawn; the pendulum keeps going under it, so a
// hanging lantern picked afterwards picks up the swing where the wind has it.
const swing = { a: NaN, v: 0, wind: 0 };
function swingLantern(elapsed, s) {
  const w = 2 * Math.PI / sway.period, dt = Math.min(0.05, elapsed), top = VIEW.top, sl = s - LAG;
  if (!(swing.a === swing.a)) { swing.a = swing.v = 0; swing.wind = GUST(s); } // first frame (or a NaN): start hanging still
  swing.wind += (GUST(s) - swing.wind) * Math.min(1, dt / sway.forget);
  const push = -(GUST(s) - swing.wind) * sway.gain * 310 / (330 - top);
  swing.v += (w * w * (push - swing.a) - 2 * sway.damping * w * swing.v) * dt; swing.a += swing.v * dt;
  swayAngle = style.stands ? 0 : swing.a;
  for (const layer of [$('lanternBack'), $('lanternLayer')]) layer.style.transform = `rotate(${swayAngle.toFixed(3)}deg)`; // about where it hangs from (index.html)
  twist += (TWIST_MAX * Math.tanh((swayAngle * 7 + Math.sin(s * 0.23) * 4) * TWIST_GAIN / TWIST_MAX) - twist) * dt * TWIST_RATE;
  farSlide = style.farWall ? -twist * 0.2 : 0;
  put($('inside'), 'transform', `translate(${(farSlide / 2).toFixed(2)} 0)`);
  // the brass highlight rests at x 319, a third of the way from the middle toward the lit left edge (its stops sit at 325, lanterns.js
  // SHEEN), and slides 1.75 units per degree of twist around that, staying within 288 to 350; half-unit steps so put() skips
  // frames that wouldn't show it
  const dx = Math.round(twist * 3.5) / 2 - 6;
  document.querySelectorAll('.sheen').forEach(g => put(g, 'gradientTransform', `translate(${dx} 0)`));
  // the flat parts (lanterns.js FLAT): one tone each by the angle they face (facetTone), lifted toward white (an edge) or
  // black (a rim); put() skips any whose rounded colour hasn't changed
  document.querySelectorAll('[data-facet]').forEach(n => {
    const { facet, lift, paint, tilt } = /** @type {SVGElement} */ (n).dataset, tone = facetTone(+facet, +(tilt || 0));
    put(n, paint || 'fill', +lift ? mix(tone, +lift > 0 ? '#ffffff' : '#000000', Math.abs(+lift)) : tone);
  });
  // the onions' gores (lanterns.js GORES): down each gore's profile, every stop the tone of a flat face at its angle and tilt
  document.querySelectorAll('.gore').forEach(g => {
    const angle = +(/** @type {SVGElement} */ (g).dataset.angle || 0);
    for (const n of g.children) put(n, 'stop-color', facetTone(angle, +(/** @type {SVGElement} */ (n).dataset.tilt || 0)));
  });
  // the room's horizon (#horizon) stays level with the window, turned back against the lantern's swing
  put($('horizon'), 'gradientTransform', `rotate(${(-swayAngle).toFixed(2)} 340 ${top.toFixed(1)})`);
  if (style.tassel) put($('tassel'), 'transform', `rotate(${(-Math.sin(sl * 0.7 - 0.9) * 2.6 - Math.sin(sl * 1.9 - 1.2) * 0.8).toFixed(2)} ${style.tassel[0]} ${style.tassel[1]})`);
  if (style.ribbon) drawRibbon(elapsed, s); // the real time: it caps its own steps, and needs to know what it skipped
  if (style.knot) put($('knotTail'), 'transform', `rotate(${(-Math.sin(sl * 0.7 - 0.5) * 5 - Math.sin(sl * 2.1) * 1.5).toFixed(2)} ${style.knot[0]} ${style.knot[1]})`); // the string's loose tail
}

// ---- the flame ---------------------------------------------------------------------------------------------------
// The flame is drawn by a shader (background.js FLAME) on its own canvas between the lantern's back paper and the rest
// (index.html), so the SVG doesn't repaint it every frame. A paper lantern's is softened, as if seen through paper.
// The flame's spine is a chain of CHAIN links from its base up to its tip (its outer tongue's), each point a weight on
// a damped spring to the point below it, so a swing or a gust travels up it, base first and tip after: it can
// bend into an S and whip, then settle. At rest the chain stands straight up, as tall as the flame burns, bent over by the
// wind (style.flameWind, or paperWind behind paper) and stretched by it, and pushed aside by a moth flying close, each most at the tip. When the
// lantern swings, its base's acceleration throws the weights back (inertia), the higher the harder.
// FEEL: the springs' stiffness at the base (a second squared), how many times floppier the tip's is (falloff), their
// damping (a second), how hard the base's acceleration throws them (the lantern's swing is gentle, so 1, a plain weight,
// would barely show),
// and how strongly the wind, the turbulence (its licking edge, background.js) and a moth move it. Each is a pair: for an
// idle ember (size 0.3) and for a full blaze (size 1), eased between by the flame's size (feelAt), as Dace dialled them in:
// an ember small, tight and smooth-edged; a blaze looser at the tip, bent further by the wind, its edge licking hard.
const FEEL = { stiffness: [160, 65], falloff: [2, 2.25], damping: [9.5, 18], inertia: [8, 15], wind: [0.5, 1.3], turbulence: [0, 1.85], moth: [1.55, 1] };
/** @returns {Record<keyof FEEL, number>} */
const feelAt = size => {
  const u = Math.max(0, Math.min(1, (size - 0.3) / 0.7)), t = u * u * (3 - 2 * u);
  return /** @type {any} */ (Object.fromEntries(Object.entries(FEEL).map(([k, [ember, full]]) => [k, ember + (full - ember) * t])));
};
// the chain: each point above the base, its offset from the base and its speed (the last is the tip), the base's last place
// and speed (scene units), and the style it was set for. bent(i): how much of the tip's lean point i takes at rest.
const bent = i => (i / CHAIN) ** 1.6;
const flameChain = { pts: /** @type {{ x: number, y: number, vx: number, vy: number }[]} */ ([]), bx: 0, by: 0, bvx: 0, bvy: 0, style: null };
// One frame of the flame, `dt` on, burning at `flame` (its size and pulse): that, with its flicker (how much taller or shorter than at rest it stands,
// which the light it gives follows), its base and tip in the scene, and for the shader its turbulence, the gust tearing at it (0 to 1), and its blue root.
function stepFlame(dt, s, flame) {
  const [fx, fy, fk] = style.flame, k = flame.size * fk, [bx, by] = rot(fx + farSlide / 2, fy), ch = flameChain; // at the middle depth (farSlide)
  const flameWind = style.paper ? paperWind : style.flameWind || 0; // how far the wind leans it (lanterns.js)
  const feel = feelAt(flame.size), gust = GUST(s) * feel.wind, wind = gust * flameWind; // the wind's lean, in the flame's units
  // an ember guttering: as it dims below 0.6 its height jumps about, by up to a quarter at its dimmest
  const gutter = Math.max(0, Math.min(1, (0.6 - flame.size) / 0.3));
  const bounce = style.paper ? paperBounce : 1; // paper lanterns bob less (lanterns.js): scales the height swings and the throw from the lantern's swing
  const h = 96 * k * (1 + bounce * wobble(s * 1.3, 2) * 0.08 + Math.min(0.07, Math.abs(wind) * 0.004)) * (1 - 0.25 * bounce * gutter * (0.5 + 0.5 * wobble(s * 4.1, 11)));
  const last = ch.pts[CHAIN - 1];
  if (ch.style !== style || !(last?.x === last?.x && last?.y === last?.y) || Math.hypot(bx - ch.bx, by - ch.by) > 20) // a new lantern, a NaN, or the window resized
    Object.assign(ch, { pts: Array.from({ length: CHAIN }, (_, j) => ({ x: 0, y: -h * (j + 1) / CHAIN, vx: 0, vy: 0 })), bx, by, bvx: 0, bvy: 0, style });
  const pts = ch.pts, tip = pts[CHAIN - 1];
  // a moth flying within 50 of a bare flame's middle pushes it away and makes it waver, the closer the more (one landed
  // is still, and the Moroccan's brass keeps them off its flame)
  const mid = pts[CHAIN / 2 - 1];
  let near = 0, push = 0;
  for (const m of style.scorches ? moths.values() : []) if (!m.wasLanded) {
    const n = Math.max(0, 1 - Math.hypot(m.x - bx - mid.x, m.y - by - mid.y) / (50 * fk));
    if (n > 0) { near = Math.max(near, n); push += n * n * (m.x > bx + mid.x ? -1 : 1); }
  }
  // the tip's lean at rest, which each link takes its share of (bent)
  const lean = (wobble(s, 2) * 9 + wind) * k + feel.moth * (0.3 * push + 0.15 * near * Math.sin(s * 29)) * h;
  if (dt > 0) {
    const bvx = (bx - ch.bx) / dt, bvy = (by - ch.by) / dt, ax = (bvx - ch.bvx) / dt, ay = (bvy - ch.bvy) / dt;
    Object.assign(ch, { bx, by, bvx, bvy });
    // Each point springs toward where it stands at rest on the point below, damped as it moves against that point, from
    // the base up, so a swing passes up the chain link by link. The base's acceleration throws each link by its share of
    // the bend (the tip's the most), so the whole flame leans about as far as one spring would. In steps of at most 1/120
    // of a second, so even the stiffest stays steady.
    const n = Math.ceil(dt * 120), h1 = dt / n;
    for (let step = 0; step < n; step++) pts.forEach((p, j) => {
      const below = j ? pts[j - 1] : { x: 0, y: 0, vx: 0, vy: 0 }, stiff = feel.stiffness / feel.falloff ** (j / (CHAIN - 1));
      const share = bent(j + 1) - bent(j), keep = Math.exp(-feel.damping * h1);
      p.vx += (stiff * (below.x + lean * share - p.x) - bounce * feel.inertia * share * ax) * h1;
      p.vy += (stiff * (below.y - h / CHAIN - p.y) - bounce * feel.inertia * share * ay) * h1;
      p.vx = below.vx + (p.vx - below.vx) * keep; p.vy = below.vy + (p.vy - below.vy) * keep; // damped against the point below
      p.x += p.vx * h1; p.y += p.vy * h1;
    });
  }
  // never past its tallest, leaning over more than 0.6 of that, or the tip squashed under 0.4 of its height
  const most = 96 * k * FLAME_STRETCH;
  for (const p of pts) { p.x = Math.max(-0.6 * most, Math.min(0.6 * most, p.x)); p.y = Math.max(-most, Math.min(0, p.y)); }
  tip.y = Math.min(-0.4 * 96 * k, tip.y);
  // a gust past 1.4 tears at the tip, fully by 2.6 (one on the candle; the Moroccan's walls keep the wind to a third)
  const tear = Math.max(0, Math.min(1, (Math.abs(gust) * flameWind / 6 - 1.4) / 1.2));
  // the blue at its root swells and brightens with the flicker, breathes, and leans with the chain's lowest link: its
  // middle, x and up from the base, and its radii, in the flame's units, and its opacity
  const breathe = 1 + 0.05 * Math.sin(s * 1.7), flick = 1 + flickerFollow * (-tip.y / (96 * k) - 1);
  // spine: each point's offset across from the base, in the flame's units, the base's 0 first (background.js spineX)
  return { ...flame, flick, base: [bx, by], tip: [bx + tip.x, by + tip.y], spine: [0, ...pts.map(p => p.x / k)], tear,
    turb: feel.turbulence * (1 + 1.5 * gutter + tear) + 2 * feel.moth * near,
    blue: [wobble(s, 5) * 1.2 + pts[0].x / k, 4, 10 * flick * breathe, 5 * flick * (2 - breathe), 0.55 * (0.8 + 0.2 * wobble(s * 2, 6)) * flick] };
}
// sparks float off the tip, more of them the busier things get; not from a paper lantern, whose flame is hidden behind paper.
// They're drawn in the flame's own units (#sparks), turned with the lantern and slid with #inside.
function drawSparks(dt, s, { size, tip }) {
  sparkClock += style.paper ? 0 : dt * (0.4 + 5 * level);
  const [fx, fy, fk] = style.flame, [tx, ty] = rot(...tip, -swayAngle);
  while (sparkClock > 1) {
    sparkClock--;
    sparks.push({ x: 340 + (tx - farSlide / 2 - fx) / fk, y: FLAME_BASE + (ty - fy) / fk + 6 * size, vx: (Math.random() - 0.5) * 16, vy: -25 - Math.random() * 30, life: 1 });
  }
  for (const p of sparks) { p.x += p.vx * dt + Math.sin(s * 4 + p.vy) * 0.3; p.y += p.vy * dt; p.life -= dt * 0.8; }
  while (sparks.length && sparks[0].life <= 0) sparks.shift();
  // a fixed set of ember circles, reused every frame (switching lanterns replaces #sparks, so refill it then)
  const embers = $('sparks');
  if (embers.childElementCount !== 12) embers.replaceChildren(...Array.from({ length: 12 }, () => el('circle', { r: 0, opacity: 0 })));
  while (sparks.length > 12) sparks.shift();
  [...embers.children].forEach((c, i) => {
    const p = sparks[i];
    if (!p) return put(c, 'opacity', 0);
    put(c, 'cx', p.x.toFixed(1)); put(c, 'cy', p.y.toFixed(1)); put(c, 'r', (0.6 + 0.6 * p.life).toFixed(2));
    put(c, 'fill', pal('core')); put(c, 'opacity', Math.min(1, p.life * 2).toFixed(2)); // small, bright and crisp, winking out at the end
  });
}

// the lit paper, tinting with the flame
function lightPaper({ size, flick, pulse }) {
  document.querySelectorAll('.paperStop').forEach(n => put(n, 'stop-color', pal('paper')));
  put($('paperGlow'), 'opacity', ((0.3 + 0.7 * size) * flick * pulse).toFixed(3));
  // the paper takes on the flame's colour, more so the brighter it burns
  put($('paperTint'), 'fill', pal('paper'));
  put($('paperTint'), 'opacity', ((0.25 + 0.45 * size) * flick * pulse).toFixed(3));
  // where a lantern's caps face the paper, they catch the flame's light
  document.querySelectorAll('.paperLit').forEach(n => { put(n, 'color', pal('paper')); put(n, 'opacity', ((0.35 + 0.55 * size) * flick * pulse).toFixed(3)); });
}

// ---- the candle's shine -------------------------------------------------------------------------------------------
// A bare flame lights what's round it (style.shine, where each grape that glints sits): the bronze's highlight, its reflection in
// the molten pool (sliding as the flame leans, as a reflection moves with what it reflects) at
// the crown, a highlight on each grape on the side facing it, and the marble slab warming round the foot, the foot's shadow
// on it pushed away from the lean. All of it follows this frame's flame.
// The hot air rising off the lantern, set by drawHeat (null without any): where it leaves, how strong, and the time.
let heat = /** @type {{ x: number, y: number, k: number, t: number } | null} */ (null);
// How much the hot air moves things at scene point (x, y), 0 to the heat's strength: the column (state.js HEAT_COLUMN)
// rising from where it leaves. LIGHT's heat() in background.js bends the same column, so change the two together.
function heatAt(x, y) {
  if (!heat) return 0;
  const { half: h0, widen, start, fade } = HEAT_COLUMN, up = heat.y - y, half = Math.max(1, h0 + widen * up);
  const step = (a, b, v) => { const u = Math.min(1, Math.max(0, (v - a) / (b - a))); return u * u * (3 - 2 * u); };
  return heat.k * step(0, start, up) * (1 - step(fade[0], fade[1], up)) * (1 - step(0.7 * half, half, Math.abs(x - heat.x)));
}
// A speck at (x, y) on its orbit, `dt` on: in the hot air it carries it up at HEAT_RISE a second at its
// strongest, and once out of it it sinks back a third of its lift a second, another offset on the orbit. Its lift, up.
function liftDust(p, x, y, dt) {
  return heat ? p.lift += (HEAT_RISE * heatAt(x, y - p.lift) - p.lift / 3) * dt : p.lift = 0;
}
// How far the wind carries a dust speck of radius r aside at s, k for its ring: at once, the lighter the further and the
// sooner (a heavy one lags a fifth of a second). It's an offset on its orbit, so it drifts back as the gust eases.
const gustAside = (s, r, k) => GUST(s - 0.12 * r) * k / r;
// How far the wind has carried smoke `age` seconds old aside since it was let go at s - age: as far as it's carried a
// middling near speck of dust (radius 1.3, the near dust's 0.7 to 1.9) over that time, so the two drift together.
const smokeDrift = (s, age) => gustAside(s, 1.3, 14) - gustAside(s - age, 1.3, 14);
// Smoke, drawn by the background shader (background.js plume and trailSmoke). Plumes rise, widen, curl and drift with the wind,
// each let go from where it starts over its first `rel` seconds, every bit fading as it ages to PLUME.life (state.js,
// with its size and opacity, the flame's lanes SMOKE and the let-go times). The flame lets one go from its tip now and
// then, on lanes keyed to the wall clock alone (scorch's kind, scorchClock) so every window lets it go at once: one
// every minute or two however it burns, and more lanes opening as it burns harder (`from`, the strength each opens at),
// so it smokes more often the busier things get.
// It lets go one at a time: one that comes up while another is going is let pass, and the one going carries on. A
// scorched moth's singe lets one go from where its wing touched, and as it flies off it leaves a trail: the points it
// passed over TRAIL.secs after the hit (state.js TRAIL), joined to the moth while it's still smoking. At most SMOKERS
// moths smoke at once (scorchStep starts no more), so their smoke always fits the shader's PLUMES and TRAIL_POINTS and
// none of it is ever dropped.
// The flame's plume the lanes let go at `now` (wall ms) burning at `strength`, the earliest begun if two are: its key
// (lane:slot) and seconds in, or null.
function smokeAt(now, strength) {
  let out = null;
  SMOKE.forEach((lane, i) => {
    const e = strength >= lane.from && scorchClock(`candle:smoke:${i}`, now, { ...lane, length: SMOKE_REL + PLUME.life });
    if (e && !(out?.t >= e.t)) out = { key: `${i}:${e.slot}`, t: e.t };
  });
  return out;
}
let flamePlume = null; // the flame's plume going: its key, when it was let go (wall ms) and where
// The smoke this frame. plumes: each [x, y, seconds in, strength, seed, rel, curl, drift, base x, base y], the flame's
// first, from `tip` (its live tip, null without a bare flame) at the flame's `strength`, then the singes. Each plume's
// newest smoke rises from its base: the flame's live tip, so its smoke always leaves the flame however it leans. Each of
// the flame's has its own shape, seeded from its lane and slot so every window draws the same one. trail: each point where
// it was left, carried aside by the wind since (smokeDrift) and curled across its path, and its age in seconds, each trail's head
// first, with an age of -1 parting one moth's trail from the next.
function smoke(now, s, strength, tip) {
  const plumes = [], trail = [];
  if (!tip) flamePlume = null;
  else {
    if (flamePlume && now < flamePlume.from) flamePlume = null; // the clock went back
    const e = smokeAt(now, strength), life = (SMOKE_REL + PLUME.life) * 1000, from = e && now - e.t * 1000;
    if (e && (!flamePlume || from >= flamePlume.from + life)) flamePlume = { key: e.key, from, at: tip }; // not one that began while one was going
    if (flamePlume && now - flamePlume.from < life) {
      const rand = seeded(hash(`candle:smoke:${flamePlume.key}:shape`));
      plumes.push([...flamePlume.at, (now - flamePlume.from) / 1000, 0.5 + 0.5 * strength, 97 * rand(), SMOKE_REL, 0.5 + rand(), 2 * rand() - 1, ...tip]);
    }
  }
  for (const m of moths.values()) if (m.scorch?.hit) {
    const sc = m.scorch, path = (sc.trail || []).filter(([, , at]) => sc.t - at < PLUME.life);
    plumes.push([...sc.aim, sc.t - SCORCH.hit, 1, hash(m.key) % 97, SINGE_REL, 1, 0, ...sc.aim]);
    if (!sc.trailDone) { // joined to the moth where it's drawn now, in place of a point it left this frame before it moved
      if (path.at(-1)?.[2] === sc.t) path.pop();
      const last = path.at(-1);
      path.push([m.x, m.y, sc.t, last ? last[3] + Math.hypot(m.x - last[0], m.y - last[1]) : 0]);
    }
    if (trail.length && path.length) trail.push([0, 0, -1]);
    // each point carried aside by the wind since it was left, and curled into Ss across the path by how far along it it
    // is, swelling in over its first third of a second and travelling slowly along it; its head (the newest) first
    const seed = hash(m.key) % 97, head = [];
    path.forEach(([x, y, at, along], i) => {
      const [ax, ay] = path[Math.max(0, i - 1)], [bx, by] = path[Math.min(path.length - 1, i + 1)], d = Math.hypot(bx - ax, by - ay) || 1;
      const curl = TRAIL.s * Math.min(1, (sc.t - at) / 0.3) * Math.sin(along * 2 * Math.PI / TRAIL.length - sc.t * 1.3 + seed);
      head.unshift([x + smokeDrift(s, sc.t - at) - curl * (by - ay) / d, y + curl * (bx - ax) / d, sc.t - at]);
    });
    trail.push(...head);
  }
  return { plumes, trail };
}
const HEAT_RISE = 11; // how fast the hot air carries dust up at its strongest, units a second
// The hot air rising off the lantern this frame (style.heat), for drawLight, the background and the tip smoke leaves from:
// from style.heat.at, swinging with the lantern, or its bare flame's tip (stepFlame), as strong as the flame burns.
function drawHeat(s, { size, tip }) {
  const h = style.heat;
  if (!h || AMBIENT) { heat = null; return; }
  const [x, y] = h.at ? rot(...h.at) : tip;
  heat = { x, y, k: h.k * size, t: s % (2 * Math.PI) };
}
function drawShine(s, { size, flick, pulse, base, tip }) {
  const shine = style.shine;
  if (!shine || AMBIENT) return;
  const [fx, fy, fk] = style.flame, bright = (0.3 + 0.7 * size) * pulse, core = pal('core');
  // the flame's lean (its middle tongue's tip, about 70 of the outer's 96 up), in the scene
  const lean = (tip[0] - base[0]) * 70 / 96;
  const pool = $('cdPoolGlint');
  put(pool, 'cx', (fx + lean * 0.6 + Math.sin(s * 5.3) * 0.6).toFixed(1)); put(pool, 'rx', (2.4 + 0.6 * flick + 0.3 * Math.sin(s * 7)).toFixed(1));
  put(pool, 'fill', core); put(pool, 'opacity', (0.55 * bright).toFixed(2));
  [...$('cdPedestalGlints').children, ...$('cdGrapeGlints').children].forEach((c, i) => { // the pedestal's bunch first, as style.shine
    const [x, y] = shine[i], dx = fx + lean - x, dy = style.light[1] - y, d = Math.hypot(dx, dy), ph = i * 2.39; // spread round the twinkle
    put(c, 'cx', (x + dx / d * 2.4).toFixed(1)); put(c, 'cy', (y + dy / d * 2.4).toFixed(1)); put(c, 'fill', core);
    put(c, 'opacity', (0.4 * flick * bright * (0.55 + 0.45 * Math.sin(s * 1.7 + ph) ** 2)).toFixed(2));
  });
  put($('cdWarmG'), 'color', mix(pal('paper'), '#ffffff', 0.6));
  put($('cdWarm'), 'opacity', ((0.4 + 0.15 * flick) * bright).toFixed(2));
  put($('cdFootShadow'), 'cx', (fx - lean * 0.5).toFixed(1));
  // the bronze (lanterns.js cdBronze), shaded across each part's curve: its highlight, held where the flame above reflects,
  // takes a little of the flame's colour, and is as bright as the flame burns and flickers
  const BRONZE = '#6E4220'; // the bronze's middle tone, between its dark edges (lanterns.js cdBronze)
  put($('cdBronze').children[3], 'stop-color', mix(BRONZE, mix(mix(BRONZE, '#F2C28A', 0.55), core, 0.3), Math.min(1, bright * flick)));
}

// The candle's vine leaves and tendrils (class cdLeaf, lanterns.js flutter) move in the wind: each turns about its stem
// toward downwind by how far it points from it (up to twice as far for one pointing into the wind, not at all for one
// already pointing with it) times the gust's strength and 6 degrees, by its weight (smaller leaves more), plus a faint
// flutter of its own. A gust reaches the vine from its upwind side: each leaf feels it later the further downwind it is. A
// leaf also grows about its stem, to 3.5 times as drawn on the lower vine (`low` 1) and a sixth of the way there at the
// top (0). Found and
// read once after each redraw (drawHang clears cdLeaves), and only written when it turns by half a degree or grows.
function drawLeaves(s) {
  cdLeaves ??= [...document.querySelectorAll('.cdLeaf')].map(e => {
    const [x, y] = (e.getAttribute('data-at') || '0 0').split(' ').map(Number), low = e.getAttribute('data-low');
    return { e, x, y, k: +(e.getAttribute('data-k') || 1), low: low === null ? -1 : +low, deg: +(e.getAttribute('data-deg') || 0), ph: (x * 0.37 + y * 0.11) % 6.283 };
  });
  const from = Math.sign(GUST(s)) || 1; // the wind's direction this frame: 1 blowing to the right
  for (const { e, x, y, k, low, deg, ph } of cdLeaves) {
    const g = GUST(s - 0.15 - ph * 0.03 - from * (x - 340) * 0.004), down = g > 0 ? 90 : -90;
    let turn = ((down - deg) % 360 + 360) % 360; // how far round to downwind, -180 to 180, over the top when it points straight into the wind
    if (turn > 180 || (turn === 180 && down < 0)) turn -= 360;
    const a = k * (6 * Math.abs(g) * turn / 90 + 0.12 * Math.sin(s * (3 + ph * 0.3) + ph)), grow = low < 0 ? 1 : 1 + 2.5 * (1 + 5 * low) / 6;
    put(e, 'transform', `rotate(${(Math.round(a * 2) / 2).toFixed(1)} ${x} ${y})` + (grow === 1 ? '' : ` translate(${x} ${y}) scale(${grow.toFixed(2)}) translate(${-x} ${-y})`));
  }
}

// The light around the lantern, drawn by the WebGL background: a breathing halo, the rings tinting with the flame, the
// dust, and the moths' shadows.
function drawLight(dt, s, { size, flick, pulse, base, tip, spine, turb, tear, blue }) {
  const [gx, gy] = lightAt();
  const breathe = Math.sin(s * 1.1) * 0.5 + 0.5, strength = Math.max(level, cool * 0.6);
  // rings ripple outward (the inner one swells first) and swing with the lantern, centred where its body hangs (round a
  // standing candle's flame instead, since its body runs down below)
  const ringR = [250, 190, 135].map((r, i) => r * (0.88 + 0.12 * level) * (1 + 0.03 * Math.sin(s * 1.1 - (2 - i) * 0.9)));
  // dust drifts around the light; the far specks fill the dark out to the edges. A speck stays lit for most of a
  // slow cycle (about 40 seconds) and now and then fades out and back over a few seconds, so its brightness mostly
  // changes as it drifts through light and shadow, not from twinkling
  const fadeOut = (t, ph) => 1 - Math.max(0, Math.sin(t + ph)) ** 6;
  // The wind carries each speck sideways (gustAside), further than the lantern swings, with a little lift and swirl of its own
  const blow = (p, k) => { const g = gustAside(s, p.r, k); return [g, -Math.abs(g) * 0.15 + g * 0.2 * Math.sin(s * 0.9 + p.ph)]; };
  dust.forEach((p, i) => {
    p.a += p.w * dt;
    const d = p.d + Math.sin(s * 0.3 + p.ph) * 18, [wx, wy] = blow(p, 14);
    const x = gx + wx + Math.cos(p.a) * d + Math.sin(s * 0.7 + p.ph) * 6, y = gy + wy + Math.sin(p.a) * d * 0.9 + Math.cos(s * 0.5 + p.ph) * 6;
    dustData.set([x, y - liftDust(p, x, y, dt), p.r,
      (0.15 + 0.75 * strength) * (DUST_DEBUG || fadeOut(s * 0.15, p.ph))], i * 4); // no fading with ?dustdebug
  });
  farDust.forEach((p, i) => {
    p.a += p.w * dt;
    const d = p.d + Math.sin(s * 0.25 + p.ph) * 22, [wx, wy] = blow(p, 16);
    const x = CX + wx + Math.cos(p.a) * d * VIEW.kx + Math.sin(s * 0.6 + p.ph) * 10, y = CY + Math.sin(p.a) * d * 0.9 * VIEW.ky + wy + Math.cos(s * 0.45 + p.ph) * 10;
    dustData.set([x, y - liftDust(p, x, y, dt), p.r,
      (0.2 + 0.25 * strength) * fadeOut(s * 0.11, p.ph)], (dust.length + i) * 4);
  });
  const remote = AMBIENT && REMOTE ? remoteLight() : null;
  const dim = style.dim ?? 1; // a pierced brass lantern lets out less light than paper
  // the edge below the flame that bounds its light (holder: its height and half-width, a burner cup or a candle's rim)
  // throws a fan straight down, seen from the flame core's middle (18 up its 40), in the lantern's own units, so the fan
  // breathes with it
  const flameY = style.flame[1] - 18 * size * style.flame[2];
  const casters = AMBIENT ? [] : [...moths.values()].map(m => m.shade).filter(Boolean);
  drawBackground({
    ringC: style.stands ? [gx, gy] : rot(340, 330), ringR, ringA: (0.55 + 0.45 * Math.max(level, cool * 0.5)) * dim,
    ringCol: [0, 1, 2].map(i => mix(WARM.rings[i], COOL.rings[i], cool)),
    // on a second display the glow centres on the lantern's light off its edge (it's only drawn there as the dust's light)
    glowC: remote ? remote.c : [gx, gy], glowR: (150 + 90 * level + 25 * cool + 14 * breathe) * (remote ? remote.scale : 1), glowA: (0.12 + 0.45 * Math.max(level, cool * 0.6)) * flick * pulse * dim, glowCol: pal('glow'),
    lightC: remote ? remote.c : [gx, gy], lightScale: remote ? remote.scale : Math.max(VIEW.kx, VIEW.ky), lightR: 22 + 14 * size,
    airA: AMBIENT && !remote ? 0 : (0.05 + 0.22 * strength) * flick * pulse * dim, dustCol: pal('core'), shadows: casters, sway: swayAngle * Math.PI / 180, heat,
    ...AMBIENT ? { plumes: [], trail: [] } : smoke(Date.now(), s, strength, heat && style.shine && [heat.x, heat.y]),
    drift: Array.from({ length: 13 }, (_, i) => smokeDrift(s, i * PLUME.life / 12)), // background.js smokeDrift samples it
    caps: style.caps ? [style.caps[2] / (style.light[1] - style.caps[0]), style.caps[2] / (style.caps[1] - style.light[1])]
      : style.holder ? [0, style.holder[1] / Math.max(4, style.holder[0] - flameY)] : [0, 0],
    // a standing flame's rim shades the room below from its corners (rimShade), seen from the live flame's base and tip
    flame: [...base, ...tip],
    // the flame, drawn by the shader (background.js drawFlame): its scale, the time, and stepFlame's turbulence,
    // tearing and blue root, its opacity, how soft it is (a paper lantern's, seen through paper), and its colours (halo, tongues out to in, the blue)
    fire: !AMBIENT ? { scale: size * style.flame[2], t: s % 3600, // ponytail: the noise jumps once an hour as the time wraps
      spine, turb, tear, blue, alpha: pulse, soft: style.paper ? paperSoft : 0,
      cols: ['halo', 'outer', 'mid', 'core', 'base'].map(pal) } : null,
    rim: style.shadeFromHolder && !remote ? [style.flame[0], style.holder[1], style.holder[0]] : [0, 0, 0],
    // each band seen from the flame's live centre: its slope, spread wide by the flame's size (about 18 across beside it)
    bandO: rot(style.flame[0] + farSlide / 2, flameY),
    // the Moroccan's far wall (background.js drawFarWall), slid by the twist (farSlide), its brass lifted five sixths of
    // the way to the flame's colour at five sixths the brightness, and toward the flame's core as it burns brighter: the
    // room behind it brightens with the flame too, and a wall that didn't would fade into it at full flame
    farWall: style.farWall && !AMBIENT ? { slide: farSlide, heat, col: mix(mix(mix('#8A6A32', pal('paper'), 5 / 6), '#000000', 1 / 6), pal('core'), 0.65 * strength) } : null,
    bands: !remote ? measureBands().map(([y, h, r]) => [(y - flameY) / r, (h + 18 * size * style.flame[2]) / r]) : [],
  });
}

// ---- scorched moths ----------------------------------------------------------
// On a lantern whose flame is bare and in reach (style.scorches), a session moth whose PR has failing checks flies too
// close to the flame once a minute until they pass. There's a puff and sparks at the touch, then it darts about with its wing
// tips smoking and its wings charred a little, until they heal. Each moth's wall-clock time splits into `slot`-second
// slots, shifted by its own seeded phase so red moths don't scorch in step; each slot holds one episode `length` long,
// starting at a seeded point in the slot's first `window` seconds. A moth must be eligible within `start` of that start,
// or it waits for the next slot. The flame touches it `hit` seconds in. All in seconds. The schedule reads only the key
// and the wall clock, so every window (app, panel, screensaver) scorches a moth at the same moments.
// ?scorch is a demo: no moth lands, every one is eligible, failing checks or not, and each scorches every 15 seconds,
// as long as its smoke lasts.
const SCORCH_DEMO = devToggle('Demo', 'scorch', 'scorch demo', false, 'Every moth flies into the candle\'s flame every 15 seconds, failing checks or not (reloads the page)', () => location.reload());
const SCORCH = SCORCH_DEMO ? { slot: 15, window: 1, length: 13, start: 0.5, hit: 3 } : { slot: 60, window: 30, length: 20, start: 0.5, hit: 3 };
const SCORCH_CHAR = '#5B4636'; // the wings' char, a warm brown
// The live outer tongue in the scene, set by frame() on a scorching lantern (null otherwise): centre x, half-width, height.
let tongue = null;
// The episode in progress for `key` at wall-clock `now` (ms): its slot and the seconds since it started, or null.
/** @param {string} key @param {number} now @param {{ slot: number, window: number, length: number }} [plan] */
function scorchClock(key, now, plan = SCORCH) {
  const { slot, window: span, length } = plan, at = now / 1000 - seeded(hash(key + ':scorch'))() * slot, n = Math.floor(at / slot);
  const t = at - n * slot - seeded(hash(key + ':scorch:' + n))() * span;
  return t >= 0 && t < length ? { slot: n, t } : null;
}
// Where an episode is at `t`: approach, recoil (a second after the hit), agitated, then settling over its last 6 seconds;
// `a` the agitation and `char` the wings' tint toward SCORCH_CHAR.
function scorchFlight(t, { hit, length } = SCORCH) {
  const calm = length - 6, fade = t >= length ? 0 : t < calm ? 1 : (u => u * u * (3 - 2 * u))((length - t) / (length - calm));
  return { phase: t < hit ? 'approach' : t < hit + 1 ? 'recoil' : t < calm ? 'agitated' : 'settling',
    a: t < hit + 1 ? 0 : fade, char: t < hit || t >= length ? 0 : 0.2 * (length - t) / (length - hit) };
}
// One moth's episode, once a frame (mothTarget; `flying` only in its home-drift branch). It starts within `start` of a
// scheduled start while the moth is eligible; before the hit, losing eligibility (landing, leaving, green checks, GitHub
// off, another lantern) ends it with nothing to show; after the hit it runs out its length, steered and smoking only
// while flying, unless the lantern changes. At the hit it throws 5 sparks into the flame's pool, less the scorch
// sparks still alive, so scorches never hold more than 5 of its 12. Touches no DOM; m.scorch exists only during one.
function scorchStep(m, flying, now = Date.now()) {
  const red = () => flying && tongue && style.scorches && (SCORCH_DEMO || m.session?.github?.some(p => p.need === 'failing'));
  if (!m.scorch && !red()) return null; // nothing to do, and no seeded draws
  const at = scorchClock(m.key, now), sc = m.scorch;
  if (!sc) {
    if (!at || at.t >= SCORCH.start || [...moths.values()].filter(o => o.scorch).length >= SMOKERS) return null; // too many smoking: next time
    const rand = seeded(hash(`${m.key}:scorch:${at.slot}:touch`));
    m.scorch = { slot: at.slot, t: at.t, hit: false, flying, rand, up: 0.25 + 0.25 * rand(), side: stretch(m.home)[0] < tongue.cx ? -1 : 1 };
  } else if (!at || at.slot !== sc.slot || !style.scorches || (!sc.hit && !red())) return m.scorch = null;
  else Object.assign(sc, { t: at.t, flying });
  const e = m.scorch;
  if (!e.hit) e.aim = [tongue.cx + e.side * (tongue.half + 8 * m.size), style.flame[1] - e.up * tongue.height]; // a wing tip at the edge
  if (!e.hit && e.t >= SCORCH.hit) {
    e.hit = true;
    const [fx, fy, k] = style.flame, live = sparks.filter(p => p.scorch && p.life > 0).length;
    for (let i = live; i < 5; i++) sparks.push({ x: 340 + (e.aim[0] - fx) / k, y: FLAME_BASE + (e.aim[1] - fy) / k, scorch: true, life: 1,
      vx: e.side * (8 + 30 * e.rand()) / k, vy: -(15 + 40 * e.rand()) / k });
  }
  return e;
}
// ---- moths -------------------------------------------------------------------
// A session moth's home eases toward the spot sync gave it, so when sessions come or go the others slide over to make
// room rather than jump (about 95% there in two seconds). It goes round the ring (ringHome), the short way, never
// across it: homes stay in the order they sit round it, which keeps landed moths' lines from crossing (perchAt).
function glideHome(m, dt) {
  const k = 1 - Math.exp(-1.5 * dt), [a, r] = ringPolar(m.home), [b, s] = ringPolar(m.spot);
  const turn = (b - a + 3 * Math.PI) % (2 * Math.PI) - Math.PI; // the short way round
  m.home = ringPoint(a + turn * k, r + (s - r) * k);
}
// A landed moth's fidgets, off the wall clock like the scorch schedule (scorchClock), so every window shows them at the
// same moments: its time splits into `slot`-second slots, shifted by its own seeded phase, and each holds one fidget
// starting at a seeded point in the slot's first `window` seconds. Mostly a breath, `breathe` seconds long: its wings
// open over 3s, stay open a moment, and close over 3s. Once it has waited 15 minutes it's restless, and about one slot
// in three is a hop instead, `hop` seconds long, landing on its new spot `lift` of the way in. All in seconds.
const FIDGET = { slot: 16, window: 8, breathe: 8, hop: 1.6, lift: 0.35 };
const fidgetPhase = key => seeded(hash(key + ':fidget'))();
// Slot n of moth `key`'s fidgets, for a session waiting since `ws` (ms, 0 if it isn't): when it starts (wall-clock
// seconds) and what it is.
function fidgetSlot(key, n, ws) {
  const rand = seeded(hash(`${key}:fidget:${n}`)), start = (n + fidgetPhase(key)) * FIDGET.slot + rand() * FIDGET.window;
  return { start, kind: ws && start * 1000 - ws >= 15 * 60000 && rand() < 0.35 ? 'hop' : 'breathe' };
}
// The slot of the last hop moth `key` has landed from by wall-clock `now` (seconds), or undefined if it hasn't hopped.
function lastHop(key, ws, now) {
  if (!ws) return;
  for (let n = Math.floor(now / FIDGET.slot - fidgetPhase(key)); ; n--) {
    const { start, kind } = fidgetSlot(key, n, ws);
    if (start * 1000 < ws + 15 * 60000) return; // ponytail: walks back a slot at a time; it stops at the first hop or once it's before the moth got restless
    if (kind === 'hop' && now - start > FIDGET.hop * FIDGET.lift) return n;
  }
}
// Where a moth heads this frame, how briskly it eases there (settle's stiffness, see mothMove) and how fast it beats its
// wings: flying off, circling its session's moth, landed on the lantern (fidgeting now and then), or drifting near
// home. One that has flown far enough off is removed, and gets null.
function mothTarget(k, m, dt, s) {
  let tx, ty, ease = 2.4, flap = 22.4, flying = false; // flap in radians per second, about 3.6 wingbeats a second
  const orbit = m.satellite && moths.get(m.satellite);
  if (orbit?.home) { // a satellite's home circles its parent's, slowly
    const a = m.phase + s * 0.12;
    m.home = [orbit.home[0] + Math.cos(a) * 62, orbit.home[1] + Math.sin(a) * 44];
  } else if (m.spot) glideHome(m, dt);
  const parent = m.parentId && moths.get(m.parentId);
  if (m.parentId && (!parent || parent.leaving)) m.leaving = true;
  // a session waiting on you lands; so does an idle one (nothing running, e.g. after /compact), resting without the violet
  // (with ?scorch none lands, so there's always a moth in the air to scorch)
  const needsMe = !SCORCH_DEMO && !m.leaving && !m.parentId && (m.session?.state === 'waiting' || m.session?.state === 'idle');
  // Where it lands, or would: its spot follows its home round as that glides. It's worked out on the lantern at rest, so
  // it stays put on the paper as the lantern sways and a landed moth rides it without sliding. A flying moth would land
  // on the fresh landing's spot (alongFor).
  if (!m.parentId && m.home) {
    if (!needsMe) m.along = alongFor(m.key);
    else {
      if (!m.wasLanded) m.rand = seeded(hash(`${m.key}:${m.session.waitingSince || 0}`)); // this landing's dice, the same in every window
      // the spot of its last hop, off the wall clock alone, so every window has it in the same place however long it's been
      // open, snoozed or not (a snoozed one eases over without the hop). ponytail: lastHop every frame; it walks back
      // about three slots to the last hop
      m.hopSlot = lastHop(m.key, m.session.waitingSince || 0, Date.now() / 1000);
      m.along = alongFor(m.key, m.hopSlot);
    }
    // worked out afresh only when something it depends on changes, so a settled lantern pays nothing for it
    const key = `${m.home}|${m.along}|${style.name}|${VIEW.kx}|${VIEW.ky}`;
    if (m.perchKey !== key) { m.perch = perchAt(m.home, m.along); m.perchKey = key; }
  }
  if (m.leaving) {
    // it flies straight out from the lantern to past the window's far corner, and goes only once its wings are clear of every edge
    const ang = Math.atan2(m.y - CY, m.x - CX), [bx, by, bw, bh] = VIEW.box || [40, 20, 600, 600], far = Math.hypot(bw, bh) / 2 + 100;
    tx = CX + Math.cos(ang) * far; ty = CY + Math.sin(ang) * far; ease = 1.3;
    const pad = WING_REACH * m.size;
    if ((m.x < bx - pad || m.x > bx + bw + pad || m.y < by - pad || m.y > by + bh + pad) && !m.flies?.size) { dropMoth(k, m); return null; } // its fireflies drift off first
  } else if (parent) {
    // subagents circle their own session's moth
    m.a += m.speed * dt;
    const r = m.r + Math.sin(s * 2.1 + m.phase) * 6;
    tx = parent.x + Math.cos(m.a) * r; ty = parent.y + Math.sin(m.a) * r * 0.75;
    ease = 8; flap = 29;
  } else if (needsMe) {
    // land with the wing joint on the paper (the joint sits 2,6 from the moth's position)
    const ws = m.session.waitingSince || 0, now = Date.now() / 1000;
    [tx, ty] = rot(m.perch[0], m.perch[1]); tx += 2 * m.size; ty += 6 * m.size; ease = 4;
    // which spot this frame's target came from: it rides that one as it moves, and eases over to a new one after a hop,
    // or when its home glides over to the other side of the lantern
    m.perchAim = `${m.hopSlot}${Math.sign(m.perch[0] - 340)}`;
    // Breaths and hops (fidgetSlot) run off the wall clock, so every window shows them at the same moments. Snoozed ones stay still.
    m.fidget = '';
    if (!m.session.snoozed) {
      const n = Math.floor(now / FIDGET.slot - fidgetPhase(m.key)), { start, kind } = fidgetSlot(m.key, n, ws), into = m.into = now - start;
      if (into > 0 && into < FIDGET[kind]) {
        m.fidget = kind;
        // a hop lands on a new spot along its line (lastHop moves it there `lift` of the way in)
        if (kind === 'hop') ty -= HOP * Math.sin(Math.PI * into / FIDGET.hop);
      }
    }
  } else {
    // stay near home, drifting lazily
    flying = true;
    const [hx, hy] = stretch(m.home);
    tx = hx + Math.sin(s * 0.5 + m.phase) * 24 + Math.sin(s * 1.3 + m.phase * 2) * 8;
    ty = hy + Math.cos(s * 0.4 + m.phase) * 18 + Math.sin(s * 1.7 + m.phase) * 6;
  }
  // a scorch steers only a moth drifting near home. It flies into the flame and off it, then darts about as it settles
  const sc = scorchStep(m, flying);
  if (sc?.hit && !sc.trailDone) { // a point on its smoke trail as it flies away, and the last where it is as the smoke stops following it
    const done = sc.t - SCORCH.hit >= TRAIL.secs, last = sc.trail?.at(-1), flown = last ? Math.hypot(m.x - last[0], m.y - last[1]) : 0;
    if (done || !last || sc.trail.length < TRAIL.most && (sc.t - last[2] >= TRAIL.every || flown >= TRAIL.apart)) {
      sc.trailDone = done; (sc.trail ??= []).push([m.x, m.y, sc.t, (last?.[3] ?? 0) + flown]); // with how far along its path it is
    }
  }
  if (sc && flying) {
    const { phase, a } = scorchFlight(sc.t), ph = m.phase;
    if (phase === 'approach') { [tx, ty] = sc.aim; flap = 26; }
    else if (phase === 'recoil') { tx = sc.aim[0] + sc.side * 70; ty = sc.aim[1] - 45; ease = 7; flap = 34; }
    else { // flustered on its way home: slower than calm, on a lazy weave side to side and a little up and down, with a singed moth's jitter over it
      tx += a * (34 * Math.sin(1.4 * s + ph) + 7 * Math.sin(5.3 * s + 2 * ph)); ty += a * (14 * Math.cos(1.1 * s + ph) + 4 * Math.sin(4.9 * s + ph));
      ease = 2.4 - 1.3 * a; flap = 22.4 + 10 * a;
    }
  }
  return { tx, ty, ease, flap, needsMe };
}

function dropMoth(k, m) {
  m.g.remove(); m.thread?.remove(); zones.delete(m.zone); zones.delete(m.flyZone); m.grad?.remove(); m.flyGrad?.remove();
  m.flyLine?.remove(); m.zz?.forEach(t => t.remove());
  moths.delete(k);
  if (hovered === m) hideCard();
}

// Fireflies around a session moth's home, only for PRs the session owns (ones it created, or its branch's), never ones
// it merely mentioned. With GitHub on: every owned open PR, brightest for the ones that need me. Without it:
// created PRs its last You: line points at. A leaving moth's fireflies drift off.
function mothFireflies(m, dt, s) {
  const want = new Map(), gh = m.session.github;
  if (m.leaving) {} // nothing: they all drift off
  else if (gh) {
    for (const p of byUrgency(gh, m.flies)) want.set(p.url, p);
  }
  else {
    const youLinks = new Set((m.session.forYou?.you || []).map(p => p.url).filter(Boolean));
    for (const url of m.session.created || []) if (youLinks.has(url)) want.set(url, { need: 'mention' });
  }
  const home = stretch(m.home);
  swarm(m.flies ??= new Map(), new Map([...want].slice(0, 10)), home, [34, 55], dt);
  // while the moth is landed, a faint dotted line ties its fireflies (still at its home spot) to where it sits: from the
  // middle of the swarm straight toward its perch, along its line (perchAt), which crosses no other at rest
  m.flyLine ??= $('flies').insertBefore(el('path', { fill: 'none', stroke: FLY.mention, 'stroke-width': 1.2, 'stroke-dasharray': '2 5', 'stroke-linecap': 'round' }), $('flies').firstChild);
  const tie = [...m.flies.values()].find(f => !f.leave && f.x !== undefined); // the oldest firefly: it eases in to the swarm's middle, where the line starts (f.near)
  const tied = m.wasLanded && !!tie;
  for (const f of m.flies.values()) f.near = tied && f === tie;
  if (tied) {
    // it ends level with the wings' joint (2,6 from the moth's position), but on the line to the perch, so a hop or the
    // flight in doesn't swing it over a neighbour's
    const [hx, hy] = home, [px, py] = rot(m.perch[0], m.perch[1]), ax = px - hx, ay = py - hy;
    const t = Math.max(0, Math.min(1, ((m.x - 2 * m.size - hx) * ax + (m.y - 6 * m.size - hy) * ay) / (ax * ax + ay * ay || 1)));
    const jx = hx + ax * t, jy = hy + ay * t;
    if (m.flyGrad) { put(m.flyGrad, 'x1', hx.toFixed(1)); put(m.flyGrad, 'y1', hy.toFixed(1)); put(m.flyGrad, 'x2', jx.toFixed(1)); put(m.flyGrad, 'y2', jy.toFixed(1)); }
    // straight: a bow would carry a long line over a shorter neighbour's
    put(m.flyLine, 'd', `M${hx.toFixed(1)} ${hy.toFixed(1)} L${jx.toFixed(1)} ${jy.toFixed(1)}`);
  }
  put(m.flyLine, 'opacity', tied ? 0.2 : 0);
}

// The hover area sits on the moth's home, or on its landing spot with the lantern at rest, not on the moth, so it
// holds still while the moth wanders or the lantern swings.
function mothZones(m, needsMe) {
  // a landed moth rides the lantern exactly, so its area follows it and is only moth-sized: neighbours on the paper
  // no longer overlap and steal each other's card. It sits on the middle of the wings (m.shade, from the last frame),
  // not on m.x, m.y, the joint resting on the paper, which lies below it and would hang the area over the moth below.
  [m.zx, m.zy] = needsMe ? m.shade || [m.x, m.y] : stretch(m.home);
  Object.assign(m.zone, { x: m.zx, y: m.zy, r: needsMe ? 32 : 56, off: !!m.leaving }); // back on for a moth that came back (state.js sync)
  // once it has landed, its fireflies back home get a hover area of their own with the same card
  if (m.flies) {
    m.flyZone ??= hoverArea(m, 'flies');
    [m.fx, m.fy] = stretch(m.home);
    Object.assign(m.flyZone, { x: m.fx, y: m.fy, r: 62, off: !(needsMe && m.flies.size && !m.leaving) });
  }
}

// Glide toward the target on the ghosts' spring (stale.js's settle), so a new target (taking off, landing, a hop,
// leaving) means speeding up and slowing down smoothly, never a snap onto a new heading. Lean into the turn.
function mothMove(m, { tx, ty, ease, needsMe }, dt, s) {
  // a landed moth is carried with its spot as the lantern sways (easing alone would always trail it, so it'd seem to float);
  // the easing is only for getting there: landing, and the jump to a new spot after a hop
  if (needsMe && m.wasLanded && m.perchAim === m.lastAim) { m.x += tx - m.lastT[0]; m.y += ty - m.lastT[1]; }
  m.lastAim = needsMe ? m.perchAim : undefined; m.lastT = [tx, ty];
  if (!needsMe) tx += GUST(s) * 1.8; // a flying moth leans into the wind but gives a little, about a third of the lantern's sway; the spring eases it
  [m.x, m.vx] = settle(m.x, m.vx || 0, tx, ease, dt); [m.y, m.vy] = settle(m.y, m.vy || 0, ty, ease, dt);
  // lean gently into the direction of travel, eased so position jitter doesn't shake it
  // each landing settles at its own angle around the outward direction, so moths on the lantern don't all match
  if (needsMe && !m.wasLanded) m.landJitter = ((m.rand || Math.random)() * 2 - 1) * 15;
  m.wasLanded = needsMe;
  // and each one slowly turns to face its own way, but only as far as it's rolled toward side-on: seen from above a
  // moth points up (flying away from you), and by fully side-on it can turn up to 60 degrees; upright again to land
  const lean = needsMe ? 0 : Math.max(-15, Math.min(15, m.vx * 0.25));
  const sideOn = Math.min(1, Math.abs(m.roll || 0) / (80 * Math.PI / 180));
  const facing = needsMe ? 0 : 60 * sideOn * (0.6 * Math.sin(s * 0.13 + m.phase * 3) + 0.4 * Math.sin(s * 0.29 + m.phase * 5));
  m.tilt = (m.tilt || 0) + (lean + facing - (m.tilt || 0)) * Math.min(1, dt * 3);
}

// A flying moth's wingbeat (stale.js's ghost moths beat the same way): each moth beats at its own speed, so they drift
// in and out of step, and both tips rise toward the viewer and dip slightly away. wingLift is how high a wing is lifted
// at `beat`, a wing `lag` behind the other, on a beat `height` high.
const wingRate = key => 0.88 + seeded(hash(key + ':wings'))() * 0.24;
const wingLift = (beat, lag, height = 1) => height * 80 * Math.PI / 180 * (0.7 * Math.sin(beat - lag) + 0.3);

// The wings in 3D: flapping in flight, folding as the moth lands, and turned onto the lantern's paper once it has.
// Returns both wings' points, for their shading.
function mothWings(m, { tx, ty, flap, needsMe }, dt, s) {
  // How high each beat goes drifts, and the two wings are a touch out of step, so no two beats look exactly alike.
  // keep flapping all the way in; only a moth that has reached its spot slows down and folds
  const perched = needsMe && Math.hypot(tx - m.x, ty - m.y) < ((m.fold || 0) > 0.5 ? 10 : 4); // slack once folded, so the sway can't make it flicker
  const resting = perched && m.fidget !== 'hop'; // perched and not hopping
  m.rate ??= wingRate(m.key);
  m.beat = (m.beat ?? m.phase) + (resting ? 1.5 : flap * m.rate) * dt; // accumulated, so speed changes never jump the wings
  const height = (resting ? 0.35 : 1) * (0.85 + 0.15 * Math.sin(s * 0.9 + m.phase * 2)); // every beat stays clearly visible
  const sweep = resting ? 0 : 0.4 * Math.cos(m.beat);
  // landing turns the moth onto the lantern; taking off (or a restless hop) turns it back
  m.fold = (m.fold || 0) + ((perched && m.fidget !== 'hop' ? 1 : 0) - (m.fold || 0)) * Math.min(1, dt * 2.5);
  // Each moth slowly turns in 3D around its body axis, drifting between seen-from-above and side-on (either way).
  // Mostly near top-down, sometimes swinging well round; landed moths settle back flat before folding.
  const drift = 0.6 * Math.sin(s * 0.21 + m.phase) + 0.4 * Math.sin(s * 0.53 + m.phase * 1.7);
  const rollTo = needsMe ? 0 : Math.sign(drift) * Math.abs(drift) ** 1.3 * 80 * Math.PI / 180;
  m.roll = (m.roll || 0) + (rollTo - (m.roll || 0)) * Math.min(1, dt * 2);
  // Landed, the moth sits on the paper in 3D: belly against it, its body pointing up along the surface (turned a
  // little by its own jitter), its wings standing out along the surface's normal, all swaying with the lantern.
  // In between, the frame turns smoothly from the flying one to the landed one.
  const n0 = m.perch?.[2] || [0, 0, 1], j = (m.landJitter || 0) * Math.PI / 180, sw = swayAngle * Math.PI / 180;
  const t0 = unit([n0[1] * n0[0], n0[1] * n0[1] - 1, n0[1] * n0[2]]); // "up" along the surface
  const tj = unit(lerp3(t0, cross(n0, t0), Math.tan(j))); // turned by the jitter, around the normal
  const swayed = v => [v[0] * Math.cos(sw) - v[1] * Math.sin(sw), v[0] * Math.sin(sw) + v[1] * Math.cos(sw), v[2]];
  const fly = flightFrame(m.roll), f = m.fold;
  const T = unit(lerp3(fly.T, swayed(tj), f)), n1 = lerp3(fly.N, swayed(n0), f), N = unit(lerp3(n1, T, -dot(n1, T)));
  // At rest the folded wings sit nearly together, and a breath opens and closes them once, very slowly. In flight
  // each wing's angle comes from its lift.
  m.open = (m.open || 0) + ((resting ? 1 : 0) - (m.open || 0)) * Math.min(1, dt * 1.5);
  // one slow breath: open over 3s, hold for 2s, close over 3s, eased at both ends
  const smooth = t => t * t * (3 - 2 * t), i = m.into || 0;
  const breath = m.fidget === 'breathe' ? (i < 3 ? smooth(i / 3) : i < 5 ? 1 : smooth(Math.max(0, (8 - i) / 3))) : 0;
  // at rest the wings sit nearly together
  const landOpen = 0.05 + 0.05 * m.open + 0.75 * breath;
  const openAt = (lag, extra) => (Math.PI / 2 - wingLift(m.beat, lag, height)) * (1 - f) + (landOpen + extra) * f;
  const upPts = wing3d(WING_UP, T, N, openAt(0, 0), sweep * (1 - f)), sidePts = wing3d(WING_SIDE, T, N, openAt(0.18, 0.06), sweep * (1 - f));
  put(m.up, 'd', pathOf(upPts)); put(m.side, 'd', pathOf(sidePts));
  wingsInDepthOrder(m.up, upPts, m.side, sidePts);
  put(m.g, 'transform', `translate(${m.x.toFixed(1)} ${m.y.toFixed(1)}) rotate(${m.tilt.toFixed(1)}) scale(${m.size})`);
  m.shade = caster(m.x, m.y, m.tilt, m.size, [...upPts, ...sidePts]);
  return [upPts, sidePts];
}

// Moths near the lantern catch its light, the session that needs me turns violet, and a scorched one is charred a
// little, healing as its episode runs out.
// Snoozed moths rest on the lantern in a paler indigo, idle ones nearly grey; agents circling a landed moth take on its colour too.
function mothColour(m, needsMe, upPts, sidePts, dt) {
  const host = m.parentId ? moths.get(m.parentId) : m, calling = !m.leaving && !host?.leaving && host?.session?.state === 'waiting';
  m.cool += ((calling ? (host.session.snoozed ? 0.5 : 1) : needsMe && m.wasLanded ? 0.15 : 0) - m.cool) * dt * 3; // idle and landed: a hint of violet (MOTH_RESTING)
  const lit = Math.max(level, cool * 0.5) * Math.max(0, 1 - Math.hypot(m.x - CX, m.y - CY) / 330);
  m.tint ||= m.parentId ? moths.get(m.parentId)?.tint : tintFor(m.session); // subagents share their session's tint
  const singed = needsMe && m.session.error;
  // Landed, the flame is behind the moth: it turns to a darker silhouette against the glowing paper.
  const backlit = m.fold || 0;
  let wing = mix(mix(mix(m.tint ? mix(MOTH_IDLE, m.tint, 0.16) : MOTH_IDLE, pal('glow'), lit * 0.45), singed ? MOTH_SINGED : MOTH_CALL, m.cool), '#2B2440', 0.45 * backlit);
  if (m.scorch?.hit) wing = mix(wing, SCORCH_CHAR, scorchFlight(m.scorch.t).char);
  // In flight each wing is lit in two flat tones: paler when the face we see is toward the flame, darker when the
  // flame is behind it, with a little of its warmth glowing through the thin wing.
  const a = -m.tilt * Math.PI / 180, [lx, ly] = lightAt(), fx = lx - m.x, fy = ly - m.y;
  const dx = fx * Math.cos(a) - fy * Math.sin(a), dy = fx * Math.sin(a) + fy * Math.cos(a), shading = (0.4 + 0.6 * lit) * (1 - backlit);
  for (const [path, pts] of [[m.up, upPts], [m.side, sidePts]]) {
    const tone = facesFlame(pts.normal, dx, dy) ? mix(wing, '#FFFFFF', 0.18 * shading) : mix(mix(wing, '#2B2440', 0.22 * shading), pal('glow'), 0.12 * shading);
    if (path.style.fill !== tone) path.style.fill = tone;
  }
  const st = m.g.style;
  st.setProperty('--wing', wing);
}

// A sleeping moth (landed and snoozed) breathes out z's: one at a time, each fading in as it floats up, growing a
// little, and fading out, 0.6s apart, so three or four show at once. They come in spells, about half the time, on
// the moth's own rhythm. A fresh snooze starts a spell right away, with a brief settling dim; for good, a longer one.
function mothZs(m, s) {
  const asleep = !m.leaving && m.wasLanded && m.session?.snoozed && !quiet(), pf = m.puff;
  if (asleep || pf) {
    const gap = 0.6, life = 1.8, cycle = 9;
    if (pf && m.zStart !== pf.at) { m.zStart = pf.at; m.zOff = 0; } // a fresh snooze: a spell starts now
    if (m.zStart === undefined) { m.zStart = s; m.zOff = seeded(hash(m.key))() * cycle; } // already asleep: its own rhythm
    const since = s - m.zStart, spell = pf?.kind === 'always' ? 0.6 : 0.5; // share of each cycle spent breathing z's
    m.zz ??= Array.from({ length: 4 }, () => {
      const t = $('moths').appendChild(el('text', { 'font-style': 'italic', 'text-anchor': 'middle', fill: '#C9BDF5', 'pointer-events': 'none' }));
      t.textContent = 'z';
      return t;
    });
    m.zz.forEach((t, i) => {
      const n = i + 4 * Math.floor((since / gap - i) / 4); // the latest z this node carries
      const born = n * gap, u = (since - born) / life;
      const on = n >= 0 && u <= 1 && (born + m.zOff) % cycle < cycle * spell && (asleep || born < 2);
      if (!on) { put(t, 'opacity', 0); return; }
      put(t, 'x', (m.x + (12 + (n % 3) * 4) * m.size + Math.sin(u * 4 + n) * 3).toFixed(1));
      put(t, 'y', (m.y - 8 * m.size - 32 * u).toFixed(1));
      put(t, 'font-size', (9 + 5 * u + (n % 3) * 1.5).toFixed(1));
      put(t, 'opacity', (0.85 * Math.sin(Math.PI * u) ** 0.8).toFixed(2));
    });
    if (pf) {
      const settle = (s - pf.at) / 1.6;
      if (settle >= 1) { m.puff = null; m.g.style.opacity = ''; } else m.g.style.opacity = (1 - 0.3 * Math.sin(Math.PI * Math.max(0, settle))).toFixed(2);
    }
  } else if (m.zz) { m.zz.forEach(t => t.remove()); m.zz = null; m.zStart = undefined; }
}

// A session moth's thread: straight from the spot on the lantern it lands on, or would (perchAt), out along its line
// toward home to level with the moth's wing joint. With the lantern at rest no thread or dotted line crosses another,
// flying or landed. As it sways, its spots move with it and the homes don't, so two lines closer than the sway carries
// a spot (homes gliding through each other, or a home on the ring further in just past a neighbour's line) can cross
// for a moment. A landed moth's thread has no length; a moth behind its spot (flying in from the far side) has none
// until it comes round.
function threadEnds(m) {
  const [px, py] = rot(m.perch[0], m.perch[1]), [hx, hy] = stretch(m.home), len = Math.hypot(hx - px, hy - py), ux = (hx - px) / len, uy = (hy - py) / len;
  const t = Math.max(0, (m.x - 2 * m.size - px) * ux + (m.y - 6 * m.size - py) * uy);
  return [[px, py], [px + ux * t, py + uy * t]];
}
// Each session moth's thread (threadEnds). Satellites fly untethered.
function mothThread(m, dt, s) {
  const orbit = m.satellite && moths.get(m.satellite);
  if (m.thread) m.thread.style.display = orbit && !orbit.leaving ? 'none' : '';
  if (!m.thread || orbit && !orbit.leaving || !m.perch) return;
  const [[ax, ay], [bx, by]] = threadEnds(m);
  put(m.thread, 'd', `M${ax.toFixed(1)} ${ay.toFixed(1)} L${bx.toFixed(1)} ${by.toFixed(1)}`);
  // The thread's stroke is a gradient from the lantern to the moth, see-through at both ends so it fades in from
  // nowhere. A tool call sends light down it from the moth to the lantern: a bright band in the same gradient
  // travels along, lighting up the dashes as it passes. One pulse at a time, 2.2s each, with at most two waiting.
  const ticks = m.session.ticks || 0, base = mix(pal('thread'), COOL.thread, m.cool);
  // the fireflies' dotted line matches the moth's thread, fading out at both ends the same way
  if (!m.flyGrad) {
    m.flyGrad = el('linearGradient', { id: `thread-${++pulseIds}`, gradientUnits: 'userSpaceOnUse' });
    for (const [o, a] of [[0, 0], [0.25, 1], [0.75, 1], [1, 0]]) m.flyGrad.append(el('stop', { offset: o, 'stop-opacity': a }));
    $('flies').append(m.flyGrad);
    put(m.flyLine, 'stroke', `url(#${m.flyGrad.id})`);
  }
  for (const st of m.flyGrad.children) put(st, 'stop-color', base);
  m.ticks ??= ticks;
  m.ticks = Math.max(m.ticks, ticks - 3);
  if (!m.pulse && ticks > m.ticks) { m.pulse = { at: 0 }; m.ticks++; }
  let at = -1, lit = base, glow = 0; // where along the thread the pulse is (0 lantern, 1 moth), its colour and strength
  if (m.pulse) {
    m.pulse.at += dt / 2.2;
    at = 1 - Math.min(1, m.pulse.at);
    glow = Math.sin(Math.PI * Math.min(1, m.pulse.at)); // fades in and out over the trip
    lit = mix(base, pal('core'), glow);
    if (m.pulse.at >= 1) m.pulse = null;
  }
  if (!m.grad) {
    m.grad = el('linearGradient', { id: `thread-${++pulseIds}`, gradientUnits: 'userSpaceOnUse' });
    for (let i = 0; i <= 16; i++) m.grad.append(el('stop', { offset: i / 16 }));
    $('threads').append(m.grad);
    put(m.thread, 'stroke', `url(#${m.grad.id})`);
  }
  put(m.grad, 'x1', ax.toFixed(1)); put(m.grad, 'y1', ay.toFixed(1)); put(m.grad, 'x2', bx.toFixed(1)); put(m.grad, 'y2', by.toFixed(1));
  [...m.grad.children].forEach((st, i) => {
    const o = i / 16, band = Math.max(0, 1 - Math.abs(o - at) / 0.12), faint = m.leaving ? 0.1 : 0.25;
    put(st, 'stop-color', mix(base, lit, band));
    // the thread itself is faint, the passing pulse nearly full; both fade out toward the ends
    put(st, 'stop-opacity', (Math.min(1, o / 0.25, (1 - o) / 0.25) * (faint + (0.9 - faint) * band * glow)).toFixed(2));
  });
}
