// A badge just earned: a swarm of fireflies drifts in from the window's sides and packs into a pill near the top, so
// densely their halos merge into one warm light, with the badge's name on it in dark ink. It holds a few seconds, then
// they scatter back out to the sides. Clicking the pill opens the stats panel on that badge. Badges earned together play
// one after another.
// They're the scene's own fireflies (FIREFLY_R, fireflyBlink and fireflyLook in fireflies.js, at the scene's scale),
// drawn on one canvas that only exists while a flash plays; nothing goes near the per-frame-rotated #lantern.

const FLASH = { total: 10000, minHold: 2500, leave: 1800 }; // ms; the arrival takes as long as the farthest flight needs
// the swarm's speed in screen px per ms as it looks in a 1024x768 window (the scene's scale there is about 1.2), scaling
// with the scene; ?swarmSpeed=0.15 tries another
const SWARM_SPEED = +Q.get('swarmSpeed') || 0.2;
const FLASH_COLOUR = FLY.draft; // the warm amber of a draft PR's firefly
const flashQueue = [];
let flashing = false;

// a point on a quadratic curve from a to b bending through c, at u in [0, 1]
const curve = (a, c, b, u) => [0, 1].map(k => (1 - u) ** 2 * a[k] + 2 * (1 - u) * u * c[k] + u * u * b[k]);
// a point on a cubic curve from a to d with handles b and c: leaving a towards b, arriving at d from c
const cubic = (a, b, c, d, u) => [0, 1].map(k => (1 - u) ** 3 * a[k] + 3 * (1 - u) ** 2 * u * b[k] + 3 * (1 - u) * u * u * c[k] + u ** 3 * d[k]);
const toward = (a, b, len) => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [a[0] + (b[0] - a[0]) / d * len, a[1] + (b[1] - a[1]) / d * len]; };
// a bend for the path from a to b: off to one side by a share of its length
function bend(a, b, rand) {
  const dx = b[0] - a[0], dy = b[1] - a[1], k = (0.2 + rand() * 0.25) * (rand() < 0.5 ? -1 : 1);
  return [(a[0] + b[0]) / 2 - dy * k, (a[1] + b[1]) / 2 + dx * k];
}
// the point `s` along a loop around a pill's middle line (2 * half long) at distance rr from it, clockwise from the top
// left; it wraps, so a firefly can stream round and round
function aroundPill(s, half, rr, cx, cy) {
  const line = 2 * half, arc = Math.PI * rr;
  s = ((s % (2 * line + 2 * arc)) + 2 * line + 2 * arc) % (2 * line + 2 * arc);
  if (s < line) return [cx - half + s, cy - rr];
  if ((s -= line) < arc) { const a = -Math.PI / 2 + s / rr; return [cx + half + Math.cos(a) * rr, cy + Math.sin(a) * rr]; }
  if ((s -= arc) < line) return [cx + half - s, cy + rr];
  const a = Math.PI / 2 + (s - line) / rr; return [cx - half + Math.cos(a) * rr, cy + Math.sin(a) * rr];
}

function flashBadge(id) {
  flashQueue.push(id);
  if (!flashing) nextFlash();
}
function nextFlash() {
  flashing = flashQueue.length > 0;
  if (!flashing) return;
  if (document.hidden) return addEventListener('visibilitychange', nextFlash, { once: true }); // not to an empty room
  playFlash(flashQueue.shift()).then(nextFlash);
}

function playFlash(id) {
  const [name, how] = ACHIEVEMENTS[id] || [id, ''], compact = document.body.classList.contains('panel');
  const layer = document.createElement('div'), canvas = document.createElement('canvas'), pill = document.createElement('button');
  layer.id = 'flash'; pill.className = 'pill'; pill.title = 'Open in stats'; pill.setAttribute('aria-live', 'polite');
  pill.innerHTML = `<b>${name}</b>${how && !compact ? `<span>${how}</span>` : ''}`; // the iTerm panel is too narrow for the blurb
  layer.append(canvas, pill);
  document.body.append(layer);

  // The canvas covers the window, at the screen's resolution unless that's huge (about 4 million pixels at most).
  const W = innerWidth, H = innerHeight, k = Math.min(devicePixelRatio || 1, Math.sqrt(4e6 / (W * H)));
  canvas.width = Math.round(W * k); canvas.height = Math.round(H * k);
  const g = canvas.getContext('2d');
  g.scale(k, k);
  const px = VIEW.px || 1, radii = FIREFLY_R.map(r => r * px); // the scene's firefly size on screen
  const { width: w, height: h, left, top } = pill.getBoundingClientRect(), cx = left + w / 2, cy = top + h / 2;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = seeded(hash(id + Date.now()));
  const ease = u => (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, u)))) / 2;

  // The pill is filled by currents: nested loops inset from its outline 0.7 halo radii apart, each holding fireflies
  // 0.8 halo radii apart (the density of a hexagonal packing), so the halos cover it solidly end to end. Each loop
  // streams round the pill, neighbours going opposite ways, and every firefly weaves in and out across its neighbours'
  // loops (the outermost only a little, so the rim stays full). A loop moving along itself never thins, so the coverage
  // stays even, and nobody leaves the outline.
  // It's all one motion at one speed: they fly in at the currents' speed, join their loop at the place and heading it
  // has reached when they land, stream at it, and carry it into the fly-off.
  const step = radii[1] * 0.8, r = h / 2 - radii[1] * 0.25, half = w / 2 - h / 2, weave = step * 0.35, flies = /** @type {any[]} */ ([]);
  const inner = step * 0.6; // the tightest loop: round, not a flat line that would turn its fireflies back in an instant, and it doesn't weave
  const speed = still ? 0 : SWARM_SPEED * px / 1.2; // px per ms
  // Landings fall in the 400ms from `gather` (set below, once the longest flight is known); the currents' clock starts
  // there, so where a firefly lands doesn't depend on how long the arrival takes.
  let gather = 0;
  // where a firefly's place in the current is at `t` (its loop runs all along, so it lands on a moving spot)
  const holdAt = (f, t) => {
    t -= gather;
    const rr = Math.max(inner, Math.min(r, f.rr + Math.sin(t * f.wf + f.ph) * f.weave)); // weaving in and out, never past the edge
    return aroundPill((f.s0 + f.v * t) / f.loop * (4 * half + 2 * Math.PI * rr), half, rr, cx, cy); // the same share of the way round
  };
  const heading = (f, t) => { const a = holdAt(f, t - 1), b = holdAt(f, t + 1); return [(b[0] - a[0]) / 2, (b[1] - a[1]) / 2]; }; // px per ms
  for (let ring = 0, rr = r; rr > -0.01; ring++, rr -= step * 0.866) {
    const loop = 4 * half + 2 * Math.PI * Math.max(inner, rr), n = Math.max(1, Math.round(loop / step)), at = rand() * step;
    const way = (ring % 2 ? -1 : 1) * (0.9 + rand() * 0.2); // one pace per loop, so its fireflies never bunch
    for (let i = 0; i < n; i++) flies.push({ rr: Math.max(inner, rr), loop, weave: rr <= inner ? 0 : ring ? weave : weave * 0.4, s0: at + i * loop / n,
      v: way * speed, wf: 0.0015 + rand() * 0.001, ph: rand() * 6.28, land: rand() * 400, go: FLASH.leave * (0.8 + rand() * 0.2), tilt: (rand() - 0.5) * 1.2 });
  }
  // Each firefly's landing time is set first, which fixes where it joins its loop and which way the stream there is
  // heading. It comes in from the side behind that heading (the nearer side where the stream runs up or down), at a
  // height around the pill's, so it flies straight on into the stream instead of turning back against it.
  for (const f of flies) {
    f.spot = holdAt(f, f.land);
    f.vel = heading(f, f.land);
    const side = Math.abs(f.vel[0]) > 0.3 * Math.abs(f.vel[1]) ? f.vel[0] > 0 : f.spot[0] < cx;
    f.from = still ? f.spot : [side ? -radii[0] : W + radii[0], rand() * Math.min(H, f.spot[1] + 0.35 * H)];
    f.len = Math.hypot(f.spot[0] - f.from[0], f.spot[1] - f.from[1]) * 1.15;
    f.arrive = still ? 800 : f.len / speed;
  }
  // The arrival lasts as long as the longest flight; the hold gets what's left of the total, and never less than minHold.
  gather = Math.max(...flies.map(f => f.arrive), 800);
  const settle = gather + 400, leaveAt = settle + Math.max(FLASH.minHold, FLASH.total - gather - 800 - FLASH.leave), end = leaveAt + 400 + FLASH.leave;
  for (const f of flies) {
    f.land += gather; f.delay = f.land - f.arrive; f.lift = leaveAt + f.land - gather;
    // handles a third of the way along: out of the edge towards a bend, and into the spot along the stream's heading
    f.c1 = still ? f.spot : toward(f.from, bend(f.from, f.spot, rand), f.len / 3);
    f.c2 = [f.spot[0] - f.vel[0] * f.arrive / 3, f.spot[1] - f.vel[1] * f.arrive / 3];
  }
  // Once everyone has landed they brighten together: each halo eases up to its core's colour and opacity, so the pill
  // glows as one light, then settles back a little through the hold, and dims to normal as each firefly leaves.
  const surgeAt = t => t < settle ? 0 : ease((t - settle) / 500) - 0.25 * ease((t - settle - 500) / 1500);
  const surgeFill = new Map(); // halo colour by surge, in twentieths
  let t0 = performance.now(), shown = '';
  // a click opens the stats panel with this badge's card pinned (stats.js), and sends the swarm off now
  pill.onclick = () => {
    pinnedBadge = id;
    $('stats').showPopover();
    t0 = Math.min(t0, performance.now() - leaveAt);
  };
  return new Promise(done => {
    const draw = () => {
      const t = performance.now() - t0;
      if (t >= end) { layer.remove(); return done(); }
      g.clearRect(0, 0, W, H);
      const surge = surgeAt(t);
      for (const f of flies) {
        let p, fade, lit = surge;
        if (t < f.delay) continue;
        if (t < f.land) { const u = (t - f.delay) / f.arrive; p = cubic(f.from, f.c1, f.c2, f.spot, u); fade = Math.min(1, u * 3); }
        else if (t < f.lift) { p = holdAt(f, t); fade = 1; }
        else {
          // off from wherever the current had carried it, on along its heading at the same speed
          if (!f.p0) {
            f.p0 = holdAt(f, f.lift);
            // straight on along its heading, turned up to a third of a right angle either way and a little upward
            const vel = heading(f, f.lift), len = speed * f.go, a = Math.atan2(vel[1], vel[0]) + f.tilt * 0.6 - 0.15 * Math.sign(vel[0] || 1);
            f.away = still ? f.p0 : [f.p0[0] + Math.cos(a) * len, f.p0[1] + Math.sin(a) * len];
            f.c3 = [f.p0[0] + vel[0] * f.go / 3, f.p0[1] + vel[1] * f.go / 3]; f.c4 = toward(f.away, f.p0, len / 3);
          }
          const u = Math.min(1, (t - f.lift) / f.go); p = cubic(f.p0, f.c3, f.c4, f.away, u); fade = 1 - u; lit *= 1 - ease(u * 2);
        }
        const look = fireflyLook(FLASH_COLOUR, fireflyBlink(t / 1000, f.ph) * fade, 1 - fade), q = Math.round(lit * 20);
        if (q) {
          if (!surgeFill.has(q)) surgeFill.set(q, mix(look[1][0], look[2][0], q / 20));
          look[1] = [surgeFill.get(q), look[1][1] + (look[2][1] - look[1][1]) * lit];
        }
        look.forEach(([fill, opacity], i) => {
          g.globalAlpha = opacity; g.fillStyle = fill;
          g.beginPath(); g.arc(p[0], p[1], radii[i], 0, 6.2832); g.fill();
        });
      }
      // the name comes up on the brightened pill and goes as the swarm leaves
      const text = String(Math.max(0, Math.min(1, (t - settle - 300) / 600, 1 - (t - leaveAt) / 500)).toFixed(2));
      if (text !== shown) pill.style.opacity = shown = text;
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  });
}

window.lanternBadge = flashBadge; // from the console: lanternBadge('hive_mind')
// ?demoBadge=hive_mind,ghosted plays those badges on load, without earning them
for (const id of (Q.get('demoBadge') || '').split(',').filter(Boolean)) setTimeout(() => flashBadge(id), 1500);
