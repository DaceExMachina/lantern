// A badge just earned: a swarm of fireflies drifts in from the window's sides and packs into a pill near the top, so
// densely their halos merge into one warm light, with the badge's name on it in dark ink. It holds a few seconds, then
// they scatter back out to the sides. Clicking the pill opens the stats panel on that badge. Badges earned together play
// one after another.
// They're the scene's own fireflies (FIREFLY_R, fireflyBlink and fireflyLook in fireflies.js, at the scene's scale),
// drawn on one canvas that only exists while a flash plays; nothing goes near the per-frame-rotated #lantern.

const FLASH = { gather: 2400, hold: 4000, leave: 2200 }; // ms; the swarm's own jitter rides on top
const FLASH_COLOUR = FLY.draft; // the warm amber of a draft PR's firefly
const flashQueue = [];
let flashing = false;

// a point on a quadratic curve from a to b bending through c, at u in [0, 1]
const curve = (a, c, b, u) => [0, 1].map(k => (1 - u) ** 2 * a[k] + 2 * (1 - u) * u * c[k] + u * u * b[k]);
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
  const leaveAt = FLASH.gather + 700 + FLASH.hold; // everyone has landed by gather + 700 (`settle`, below)
  const end = leaveAt + 500 + FLASH.leave;

  // Once everyone has landed they brighten together: each halo eases up to its core's colour and opacity, so the pill
  // glows as one light, then settles back a little through the hold, and dims to normal as each firefly leaves.
  const settle = FLASH.gather + 700, ease = u => (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, u)))) / 2;
  const surgeAt = t => t < settle ? 0 : ease((t - settle) / 500) - 0.25 * ease((t - settle - 500) / 1500);
  const surgeFill = new Map(); // halo colour by surge, in twentieths

  // The pill is filled by currents: nested loops inset from its outline 0.7 halo radii apart, each holding fireflies
  // 0.8 halo radii apart (the density of a hexagonal packing), so the halos cover it solidly end to end. Each loop
  // streams round the pill at its own pace, neighbours going opposite ways, and every firefly weaves in and out across
  // its neighbours' loops (the outermost only a little, so the rim stays full). A loop moving along itself never thins,
  // so the coverage stays even, and nobody leaves the outline.
  const step = radii[1] * 0.8, r = h / 2 - radii[1] * 0.25, half = w / 2 - h / 2, weave = step * 0.35, flies = [];
  // where a firefly is at `t` while it holds: along its loop, its pace easing up from a standstill once it lands
  const holdAt = (f, t) => {
    const since = Math.max(0, t - f.land), run = since - 500 * (1 - Math.exp(-since / 500));
    const rr = Math.max(0, Math.min(r, f.rr + Math.sin(t * f.wf + f.ph) * f.weave)); // weaving in and out, never past the edge
    return aroundPill((f.s0 + f.v * run) / f.loop * (4 * half + 2 * Math.PI * rr), half, rr, cx, cy); // the same share of the way round
  };
  for (let ring = 0, rr = r; rr > -0.01; ring++, rr -= step * 0.866) {
    const loop = 4 * half + 2 * Math.PI * Math.max(0, rr), n = Math.max(1, Math.round(loop / step)), at = rand() * step;
    const v = (ring % 2 ? -1 : 1) * (0.018 + rand() * 0.012) * px; // px per ms: a lap of a big pill in about half a minute
    for (let i = 0; i < n; i++) {
      const delay = rand() * 700, arrive = FLASH.gather * (0.75 + rand() * 0.25);
      const f = { rr: Math.max(0, rr), loop, weave: ring ? weave : weave * 0.4, s0: at + i * loop / n, v, wf: 0.0007 + rand() * 0.0007, ph: rand() * 6.28, delay, arrive, land: delay + arrive,
        lift: leaveAt + rand() * 500, go: FLASH.leave * (0.75 + rand() * 0.25) };
      f.spot = holdAt(f, f.land);
      // in from the nearer side mostly, from anywhere along its height, and back out to a side when they go
      const side = (f.spot[0] < cx) !== (rand() < 0.2) ? -radii[0] : W + radii[0], out = rand() < 0.5 ? -radii[0] : W + radii[0];
      f.from = still ? f.spot : [side, rand() * H];
      f.away = [out, f.spot[1] + (rand() - 0.2) * H * 0.6];
      f.c1 = bend(f.from, f.spot, rand); f.bendOut = rand;
      if (still) f.v = 0;
      flies.push(f);
    }
  }
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
        if (t < f.delay + f.arrive) { const u = (t - f.delay) / f.arrive; p = curve(f.from, f.c1, f.spot, (1 - Math.cos(Math.PI * u)) / 2); fade = Math.min(1, u * 3); }
        else if (t < f.lift) { p = holdAt(f, t); fade = 1; }
        else {
          // off from wherever the current had carried it when it lifted
          if (!f.p0) { f.p0 = holdAt(f, f.lift); if (still) f.away = f.p0; f.c2 = bend(f.p0, f.away, f.bendOut); }
          const u = Math.min(1, (t - f.lift) / f.go); p = curve(f.p0, f.c2, f.away, 1 - Math.cos(Math.PI * u / 2)); fade = 1 - u; lit *= 1 - ease(u * 2);
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
