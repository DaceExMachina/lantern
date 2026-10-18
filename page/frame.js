// The animation: one frame of the lantern, flame, moths, threads and fireflies.

// ---- animation ---------------------------------------------------------------
let level = 0, cool = 0, sparkClock = 0, last = performance.now();
const sparks = [];
// Writing an attribute WebKit already has can still cost a repaint, so the frame loop only writes values that changed.
const put = (el, k, v) => { if (el) { v = String(v); if (el.getAttribute(k) !== v) el.setAttribute(k, v); } };

// Land in the slice of the lantern facing the moth's home, so its dotted line never crosses another; if a neighbour
// is closer than 40, nudge around within the slice and keep the roomiest spot.
function findPerch(m, rand, from) {
  const { top, bottom } = style.body, toward = Math.atan2(m.home[1] - (top + bottom) / 2, m.home[0] - 340);
  const spots = [...moths.values()].filter(o => o !== m && o.wasLanded).map(o => o.perch);
  if (from) spots.push(from); // a hop must go somewhere new, so the spot it left counts as taken
  const room = p => Math.min(Infinity, ...spots.map(o => Math.hypot(o[0] - p[0], o[1] - p[1])));
  let best = pickPerch(toward, rand);
  for (let i = 0; i < 20 && room(best) < 40; i++) { const c = pickPerch(toward + (rand() - 0.5) * 0.5, rand); if (room(c) > room(best)) best = c; }
  return best;
}

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
// One wind for the scene, in the sway's degrees: the ribbon feels it as it blows, the lantern swings with it a moment later.
const GUST = s => Math.sin(s * 0.7) * 1.6 + Math.sin(s * 1.9) * 0.4, LAG = 0.6;
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
  const elapsed = (t - last) / 1000, dt = Math.min(0.05, elapsed); last = t;
  const s = t / 1000;
  const working = sessions.filter(x => x.state === 'working' || x.state === 'paused').length; // agents still busy count too
  const calling = sessions.some(x => x.state === 'waiting' && !x.snoozed);
  level += (Math.min(working, 5) / 5 - level) * dt * 1.5; // 5+ working is "fully lit"
  cool += ((calling ? 1 : 0) - cool) * dt * 2;
  // the flame's size (ember-small when idle), its flicker, and its slow violet pulse while someone needs me
  const flame = { size: 0.3 + 0.7 * Math.max(level, cool * 0.45), flick: 1 + wobble(s * 1.6, 3) * 0.06, pulse: 1 - 0.3 * cool * (0.5 + 0.5 * Math.sin(s * 2.4)) };

  swingLantern(elapsed, s);
  drawFlame(s, flame);
  drawSparks(dt, s, flame.size);
  lightPaper(flame);
  if (!AMBIENT) swarm(lanternFlies, new Map(reviews.map(r => [r.url, 'review'])), rot(...style.light), [125, 170], dt, s);
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
/** @returns {[number, number]} */
function rot(px, py) {
  const rad = swayAngle * Math.PI / 180, top = VIEW.top;
  return [340 + (px - 340) * Math.cos(rad) - (py - top) * Math.sin(rad), top + (px - 340) * Math.sin(rad) + (py - top) * Math.cos(rad)];
}
// Sway on the string, pushed by the wind (GUST) a moment after it blows, with its tassel, ribbon or knot trailing. It
// swings from the top of the window, with the angle scaled so the lantern moves sideways as much as it did hung at y=20.
function swingLantern(elapsed, s) {
  const top = VIEW.top, sl = s - LAG;
  swayAngle = -GUST(sl) * 310 / (330 - top);
  put($('lantern'), 'transform', `rotate(${swayAngle.toFixed(3)} 340 ${top.toFixed(1)})`);
  if (style.tassel) put($('tassel'), 'transform', `rotate(${(-Math.sin(sl * 0.7 - 0.9) * 2.6 - Math.sin(sl * 1.9 - 1.2) * 0.8).toFixed(2)} ${style.tassel[0]} ${style.tassel[1]})`);
  if (style.ribbon) drawRibbon(elapsed, s); // the real time: it caps its own steps, and needs to know what it skipped
  if (style.knot) put($('knotTail'), 'transform', `rotate(${(-Math.sin(sl * 0.7 - 0.5) * 5 - Math.sin(sl * 2.1) * 1.5).toFixed(2)} ${style.knot[0]} ${style.knot[1]})`); // the string's loose tail
}

// flame: layered tongues that lean and stretch independently, ember-small when idle
function drawFlame(s, { size, pulse }) {
  const layers = [['fOuter', 34, 96, 9, 2], ['fMid', 24, 70, 6, 3], ['fCore', 13, 40, 3, 4]];
  for (const [id, w, h, lean, k] of /** @type {[string, number, number, number, number][]} */ (layers)) {
    const n = $(id);
    put(n, 'd', flamePath(w * (1 + wobble(s, k + 9) * 0.05), h * (1 + wobble(s * 1.3, k) * 0.08), wobble(s, k) * lean));
    put(n, 'fill', pal(id.slice(1).toLowerCase()));
  }
  put($('fBase'), 'fill', pal('base'));
  const grow = `translate(340 ${FLAME_BASE}) scale(${size.toFixed(3)})`;
  put($('tongues'), 'transform', `${grow} translate(-340 -${FLAME_BASE})`);
  // the halo grows with the flame, and stretches and leans like a tongue (46 by 118), its tip pushed sideways about its base
  const hh = 1 + wobble(s * 1.3, 1) * 0.08, lean = Math.atan(-wobble(s, 1) * 6 / (118 * hh)) * 180 / Math.PI;
  put($('fHalo'), 'transform', `${grow} skewX(${lean.toFixed(2)}) scale(${(1 + wobble(s, 10) * 0.05).toFixed(3)} ${hh.toFixed(3)}) translate(-340 -${FLAME_BASE})`);
  put($('fHalo'), 'color', pal('halo'));
  put($('flame'), 'opacity', pulse.toFixed(3));
}

// sparks float off the tip, more of them the busier things get; not from a paper lantern, whose flame is hidden behind paper
function drawSparks(dt, s, size) {
  sparkClock += style.paper ? 0 : dt * (0.4 + 5 * level);
  while (sparkClock > 1) {
    sparkClock--;
    sparks.push({ x: 340 + wobble(s, 2) * 6 * size, y: FLAME_BASE - 90 * size, vx: (Math.random() - 0.5) * 16, vy: -25 - Math.random() * 30, life: 1 });
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

// The light around the lantern, drawn by the WebGL background: a breathing halo, the rings tinting with the flame, the
// dust, and the moths' shadows.
function drawLight(dt, s, { size, flick, pulse }) {
  const [gx, gy] = rot(...style.light);
  const breathe = Math.sin(s * 1.1) * 0.5 + 0.5, strength = Math.max(level, cool * 0.6);
  // rings ripple outward (the inner one swells first) and swing with the lantern, centred where its body hangs
  const ringR = [250, 190, 135].map((r, i) => r * (0.88 + 0.12 * level) * (1 + 0.03 * Math.sin(s * 1.1 - (2 - i) * 0.9)));
  // dust drifts around the light; the far specks fill the dark out to the edges. A speck stays lit for most of a
  // slow cycle (about 40 seconds) and now and then fades out and back over a few seconds, so its brightness mostly
  // changes as it drifts through light and shadow, not from twinkling
  const fadeOut = (t, ph) => 1 - Math.max(0, Math.sin(t + ph)) ** 6;
  dust.forEach((p, i) => {
    p.a += p.w * dt;
    const d = p.d + Math.sin(s * 0.3 + p.ph) * 18;
    dustData.set([gx + Math.cos(p.a) * d + Math.sin(s * 0.7 + p.ph) * 6, gy + Math.sin(p.a) * d * 0.9 + Math.cos(s * 0.5 + p.ph) * 6, p.r,
      (0.15 + 0.75 * strength) * (DUST_DEBUG || fadeOut(s * 0.15, p.ph))], i * 4); // no fading with ?dustdebug
  });
  farDust.forEach((p, i) => {
    p.a += p.w * dt;
    const d = p.d + Math.sin(s * 0.25 + p.ph) * 22;
    dustData.set([CX + Math.cos(p.a) * d * VIEW.kx + Math.sin(s * 0.6 + p.ph) * 10, CY + Math.sin(p.a) * d * 0.9 * VIEW.ky + Math.cos(s * 0.45 + p.ph) * 10, p.r,
      (0.2 + 0.25 * strength) * fadeOut(s * 0.11, p.ph)], (dust.length + i) * 4);
  });
  const remote = AMBIENT && REMOTE ? remoteLight() : null;
  const dim = style.dim ?? 1; // a pierced brass lantern lets out less light than paper
  // a burner cup under the flame (holder: its bottom and half-width) throws a narrow fan straight down, seen from the flame
  // core's live centre so the fan breathes with it
  const core = /** @type {SVGGraphicsElement} */ ($('fCore')).getBBox(), flameY = style.flame[1] + (core.y + core.height / 2 - FLAME_BASE) * size * style.flame[2];
  const casters = AMBIENT ? [] : [...moths.values()].map(m => m.shade).filter(Boolean);
  drawBackground({
    ringC: rot(340, 330), ringR, ringA: (0.55 + 0.45 * Math.max(level, cool * 0.5)) * dim,
    ringCol: [0, 1, 2].map(i => mix(WARM.rings[i], COOL.rings[i], cool)),
    // on a second display the glow centres on the lantern's light off its edge (it's only drawn there as the dust's light)
    glowC: remote ? remote.c : [gx, gy], glowR: (150 + 90 * level + 25 * cool + 14 * breathe) * (remote ? remote.scale : 1), glowA: (0.12 + 0.45 * Math.max(level, cool * 0.6)) * flick * pulse * dim, glowCol: pal('glow'),
    lightC: remote ? remote.c : [gx, gy], lightScale: remote ? remote.scale : Math.max(VIEW.kx, VIEW.ky), lightR: 22 + 14 * size,
    airA: AMBIENT && !remote ? 0 : (0.05 + 0.22 * strength) * flick * pulse * dim, dustCol: pal('core'), shadows: casters, sway: swayAngle * Math.PI / 180,
    caps: style.caps ? [style.caps[2] / (style.light[1] - style.caps[0]), style.caps[2] / (style.caps[1] - style.light[1])]
      : style.holder ? [0, style.holder[1] / Math.max(4, style.holder[0] - flameY)] : [0, 0],
    // each band seen from the flame's live centre: its slope, spread wide by the flame's size (about 18 across beside it)
    bandO: rot(340 + (core.x + core.width / 2 - 340) * size * style.flame[2], flameY),
    bands: !remote ? measureBands().map(([y, h, r]) => [(y - flameY) / r, (h + 18 * size * style.flame[2]) / r]) : [],
  });
}

// ---- moths -------------------------------------------------------------------
// Where a moth heads this frame, how briskly it eases there (settle's stiffness, see mothMove) and how fast it beats its
// wings: flying off, circling its session's moth, landed on the lantern (fidgeting now and then), or drifting near
// home. One that has flown far enough off is removed, and gets null.
function mothTarget(k, m, dt, s) {
  let tx, ty, ease = 2.4, flap = 22.4; // radians per second: about 3.6 wingbeats a second
  const orbit = m.satellite && moths.get(m.satellite);
  if (orbit?.home) { // a satellite's home circles its parent's, slowly
    const a = m.phase + s * 0.12;
    m.home = [orbit.home[0] + Math.cos(a) * 62, orbit.home[1] + Math.sin(a) * 44];
  }
  const parent = m.parentId && moths.get(m.parentId);
  if (m.parentId && (!parent || parent.leaving)) m.leaving = true;
  // a session waiting on you lands; so does an idle one (nothing running, e.g. after /compact), resting without the violet
  const needsMe = !m.leaving && !m.parentId && (m.session?.state === 'waiting' || m.session?.state === 'idle');
  if (m.leaving) {
    const ang = Math.atan2(m.y - CY, m.x - CX);
    tx = CX + Math.cos(ang) * 600; ty = CY + Math.sin(ang) * 600; ease = 1.3;
    if (Math.hypot(m.x - CX, m.y - CY) > 420) { dropMoth(k, m); return null; }
  } else if (parent) {
    // subagents circle their own session's moth
    m.a += m.speed * dt;
    const r = m.r + Math.sin(s * 2.1 + m.phase) * 6;
    tx = parent.x + Math.cos(m.a) * r; ty = parent.y + Math.sin(m.a) * r * 0.75;
    ease = 8; flap = 29;
  } else if (needsMe) {
    // land with the wing joint on the paper (the joint sits 2,6 from the moth's position)
    if (!m.wasLanded) {
      m.rand = seeded(hash(`${m.key}:${m.session.waitingSince || 0}`)); // this landing's dice, the same in every window
      m.perch = findPerch(m, m.rand);
      m.hops = 0;
    }
    [tx, ty] = rot(m.perch[0], m.perch[1]); tx += 2 * m.size; ty += 6 * m.size; ease = 4;
    m.perchAim = m.perch; // the spot this frame's target came from (a hop below may pick the next one)
    // Every 8-16s a waiting moth breathes: its wings open over 3s, stay open a moment, and close
    // over 3s. After 15 minutes it's restless and sometimes hops off the paper instead. A hop takes 1.6s, a breath 8s.
    // Snoozed ones stay still.
    const waited = (Date.now() - (m.session.waitingSince || Date.now())) / 60000;
    const weights = waited >= 15 ? { breathe: 0.65, hop: 0.35 } : { breathe: 1 };
    m.fidget = '';
    if (m.session.snoozed) m.fidgetAt = 0;
    else {
      if (!m.fidgetAt) { m.fidgetAt = s + 3 + Math.random() * 8; m.dice = Math.random(); }
      let kind = 'breathe', acc = 0;
      for (const [k, w] of Object.entries(weights)) if (m.dice < (acc += w)) { kind = k; break; }
      const dur = kind === 'breathe' ? 8 : 1.6, into = m.into = s - m.fidgetAt;
      if (into > dur) { m.fidgetAt = s + 8 + Math.random() * 8; m.dice = Math.random(); }
      else if (into > 0) {
        m.fidget = kind;
        if (m.fidget === 'hop') {
          ty -= 16 * Math.sin(Math.PI * into / dur);
          // a hop lands on a new spot in its own slice, picked once as it lifts off (seeded by the hop count, so windows agree)
          if (into > dur * 0.35 && m.hoppedAt !== m.fidgetAt) {
            m.hoppedAt = m.fidgetAt;
            m.perch = findPerch(m, seeded(hash(`${m.key}:${m.session.waitingSince || 0}:${++m.hops}`)), m.perch);
          }
        }
      }
    }
  } else {
    // stay near home, drifting lazily
    const [hx, hy] = stretch(m.home);
    tx = hx + Math.sin(s * 0.5 + m.phase) * 24 + Math.sin(s * 1.3 + m.phase * 2) * 8;
    ty = hy + Math.cos(s * 0.4 + m.phase) * 18 + Math.sin(s * 1.7 + m.phase) * 6;
  }
  return { tx, ty, ease, flap, needsMe };
}

function dropMoth(k, m) {
  m.g.remove(); m.thread?.remove(); m.zone?.remove(); m.flyZone?.remove(); m.grad?.remove(); m.flyGrad?.remove();
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
    const needs = p => ['ready', 'failing', 'changes'].includes(p.need);
    for (const p of [...gh.filter(needs), ...gh.filter(p => !needs(p))]) want.set(p.url, p.need); // needy first, so the cap keeps them
  }
  else {
    const youLinks = new Set((m.session.forYou?.you || []).map(p => p.url).filter(Boolean));
    for (const url of m.session.created || []) if (youLinks.has(url)) want.set(url, 'mention');
  }
  const home = stretch(m.home);
  swarm(m.flies ??= new Map(), new Map([...want].slice(0, 10)), home, [34, 55], dt, s);
  // while the moth is landed, a faint dotted line ties its fireflies (still at its home spot) to where it sits
  m.flyLine ??= $('flies').insertBefore(el('path', { fill: 'none', stroke: FLY.mention, 'stroke-width': 1.2, 'stroke-dasharray': '2 5', 'stroke-linecap': 'round' }), $('flies').firstChild);
  const end = [...m.flies.values()].find(f => f.gone === undefined && f.x !== undefined); // the line ends on one firefly, the oldest
  const tied = m.wasLanded && !!end;
  if (tied) {
    const hx = end.x, hy = end.y;
    if (m.flyGrad) { put(m.flyGrad, 'x1', hx.toFixed(1)); put(m.flyGrad, 'y1', hy.toFixed(1)); put(m.flyGrad, 'x2', m.x.toFixed(1)); put(m.flyGrad, 'y2', m.y.toFixed(1)); }
    const dx = m.x - hx, dy = m.y - hy, len = Math.hypot(dx, dy) || 1, bow = 0.12 * len;
    put(m.flyLine, 'd', `M${hx.toFixed(1)} ${hy.toFixed(1)} Q${(hx + dx / 2 - dy / len * bow).toFixed(1)} ${(hy + dy / 2 + dx / len * bow).toFixed(1)} ${m.x.toFixed(1)} ${m.y.toFixed(1)}`);
  }
  put(m.flyLine, 'opacity', tied ? 0.2 : 0);
}

// The hover area sits on the moth's home, or on its landing spot with the lantern at rest, not on the moth, so it
// holds still while the moth wanders or the lantern swings.
function mothZones(m, needsMe) {
  // a landed moth rides the lantern exactly, so its area follows it and is only moth-sized: neighbours on the paper
  // no longer overlap and steal each other's card
  [m.zx, m.zy] = needsMe ? [m.x, m.y] : stretch(m.home);
  put(m.zone, 'cx', m.zx.toFixed(1)); put(m.zone, 'cy', m.zy.toFixed(1)); put(m.zone, 'r', needsMe ? 22 : 48);
  // once it has landed, its fireflies back home get a hover area of their own with the same card
  if (m.flies) {
    m.flyZone ??= hoverArea(m, 'flies');
    [m.fx, m.fy] = stretch(m.home);
    put(m.flyZone, 'cx', m.fx.toFixed(1)); put(m.flyZone, 'cy', m.fy.toFixed(1)); put(m.flyZone, 'r', 62);
    m.flyZone.style.display = needsMe && m.flies.size && !m.leaving ? '' : 'none';
  }
  if (m.leaving) m.zone.style.pointerEvents = 'none';
}

// Glide toward the target on the ghosts' spring (stale.js's settle), so a new target (taking off, landing, a hop,
// leaving) means speeding up and slowing down smoothly, never a snap onto a new heading. Lean into the turn.
function mothMove(m, { tx, ty, ease, needsMe }, dt, s) {
  // a landed moth is carried with its spot as the lantern sways (easing alone would always trail it, so it'd seem to float);
  // the easing is only for getting there: landing, and the jump to a new spot after a hop
  if (needsMe && m.wasLanded && m.perchAim === m.lastAim) { m.x += tx - m.lastT[0]; m.y += ty - m.lastT[1]; }
  m.lastAim = needsMe ? m.perchAim : undefined; m.lastT = [tx, ty];
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

// Colour: moths near the lantern catch its light; the session that needs me turns violet with a pale outline.
// Snoozed moths rest on the lantern in a paler indigo, idle ones nearly grey; agents circling a landed moth take on its colour too.
function mothColour(m, needsMe, upPts, sidePts, dt) {
  const host = m.parentId ? moths.get(m.parentId) : m, calling = !m.leaving && !host?.leaving && host?.session?.state === 'waiting';
  m.cool += ((calling ? (host.session.snoozed ? 0.5 : 1) : needsMe && m.wasLanded ? 0.15 : 0) - m.cool) * dt * 3; // idle and landed: a hint of violet (MOTH_RESTING)
  const lit = Math.max(level, cool * 0.5) * Math.max(0, 1 - Math.hypot(m.x - CX, m.y - CY) / 330);
  m.tint ||= m.parentId ? moths.get(m.parentId)?.tint : tintFor(m.session); // subagents share their session's tint
  const singed = needsMe && m.session.error;
  // Landed, the flame is behind the moth: it turns to a darker silhouette against the glowing paper.
  const backlit = m.fold || 0;
  const wing = mix(mix(mix(m.tint ? mix(MOTH_IDLE, m.tint, 0.16) : MOTH_IDLE, pal('glow'), lit * 0.45), singed ? MOTH_SINGED : MOTH_CALL, m.cool), '#2B2440', 0.45 * backlit);
  // In flight each wing is lit in two flat tones: paler when the face we see is toward the flame, darker when the
  // flame is behind it, with a little of its warmth glowing through the thin wing.
  const a = -m.tilt * Math.PI / 180, [lx, ly] = rot(...style.light), fx = lx - m.x, fy = ly - m.y;
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

// One thread from the light to each session moth, bowing gently. Satellites fly untethered.
function mothThread(m, dt, s) {
  const orbit = m.satellite && moths.get(m.satellite);
  if (m.thread) m.thread.style.display = orbit && !orbit.leaving ? 'none' : '';
  if (!m.thread || orbit && !orbit.leaving) return;
  const [ax, ay] = rot(...style.light);
  const dx = m.x - ax, dy = m.y - ay, len = Math.hypot(dx, dy) || 1;
  const bow = Math.sin(s * 0.8 + m.phase) * 0.12 * len + 0.08 * len;
  const qx = ax + dx / 2 - dy / len * bow, qy = ay + dy / 2 + dx / len * bow;
  put(m.thread, 'd', `M${ax.toFixed(1)} ${ay.toFixed(1)} Q${qx.toFixed(1)} ${qy.toFixed(1)} ${m.x.toFixed(1)} ${m.y.toFixed(1)}`);
  // The thread's stroke is a gradient from the lantern to the moth, see-through at both ends so it fades in from
  // nowhere. A tool call sends light down it from the moth to the lantern: a bright band in the same gradient
  // travels along, lighting up the dashes as it passes. One pulse at a time, 2.2s each, with at most two waiting.
  const ticks = m.session.ticks || 0, base = mix(pal('thread'), COOL.thread, m.cool);
  // the fireflies' dotted line matches the moth's thread, fading out at both ends the same way
  if (!m.flyGrad) {
    m.flyGrad = el('linearGradient', { id: `thread-${++pulseIds}`, gradientUnits: 'userSpaceOnUse' });
    for (const [o, a] of [[0, 0], [0.25, 1], [0.75, 1], [1, 0]]) m.flyGrad.append(el('stop', { offset: o, 'stop-opacity': a }));
    document.querySelector('svg defs').append(m.flyGrad);
    put(m.flyLine, 'stroke', `url(#${m.flyGrad.id})`);
  }
  for (const st of m.flyGrad.children) put(st, 'stop-color', base);
  m.ticks ??= ticks;
  m.ticks = Math.max(m.ticks, ticks - 3);
  if (!m.pulse && ticks > m.ticks) { m.pulse = { at: 0 }; m.ticks++; }
  let at = -1, lit = base, glow = 0; // where along the thread the pulse is (0 lantern, 1 moth), its colour and strength
  if (m.pulse) {
    m.pulse.at += dt / 2.2;
    const t = 1 - Math.min(1, m.pulse.at), u = 1 - t;
    const x = u * u * ax + 2 * u * t * qx + t * t * m.x, y = u * u * ay + 2 * u * t * qy + t * t * m.y;
    at = ((x - ax) * dx + (y - ay) * dy) / (len * len);
    glow = Math.sin(Math.PI * Math.min(1, m.pulse.at)); // fades in and out over the trip
    lit = mix(base, pal('core'), glow);
    if (m.pulse.at >= 1) m.pulse = null;
  }
  if (!m.grad) {
    m.grad = el('linearGradient', { id: `thread-${++pulseIds}`, gradientUnits: 'userSpaceOnUse' });
    for (let i = 0; i <= 16; i++) m.grad.append(el('stop', { offset: i / 16 }));
    document.querySelector('svg defs').append(m.grad);
    put(m.thread, 'stroke', `url(#${m.grad.id})`);
  }
  put(m.grad, 'x1', ax.toFixed(1)); put(m.grad, 'y1', ay.toFixed(1)); put(m.grad, 'x2', m.x.toFixed(1)); put(m.grad, 'y2', m.y.toFixed(1));
  [...m.grad.children].forEach((st, i) => {
    const o = i / 16, band = Math.max(0, 1 - Math.abs(o - at) / 0.12), faint = m.leaving ? 0.1 : 0.25;
    put(st, 'stop-color', mix(base, lit, band));
    // the thread itself is faint, the passing pulse nearly full; both fade out toward the ends
    put(st, 'stop-opacity', (Math.min(1, o / 0.25, (1 - o) / 0.25) * (faint + (0.9 - faint) * band * glow)).toFixed(2));
  });
}
