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
  const leaveAt = FLASH.gather + 700 + FLASH.hold; // everyone has landed by gather + 700
  const end = leaveAt + 500 + FLASH.leave;

  // Spots on a jittered grid inside the pill (a stadium), close enough that the halos overlap into one solid light,
  // and kept in from its edge by most of a halo so the halos draw the edge.
  const step = radii[1] * 1.25, r = h / 2 - radii[1] * 0.6, half = w / 2 - h / 2, flies = [];
  for (let y = cy - r; y <= cy + r; y += step) for (let x = cx - half - r; x <= cx + half + r; x += step) {
    const spot = [x + (rand() - 0.5) * step * 0.6, y + (rand() - 0.5) * step * 0.6];
    if (Math.hypot(Math.max(0, Math.abs(spot[0] - cx) - half), spot[1] - cy) > r) continue;
    // in from the nearer side mostly, from anywhere along its height, and back out to a side when they go
    const side = (spot[0] < cx) !== (rand() < 0.2) ? -radii[0] : W + radii[0], out = rand() < 0.5 ? -radii[0] : W + radii[0];
    const from = still ? spot : [side, rand() * H], away = still ? spot : [out, spot[1] + (rand() - 0.2) * H * 0.6];
    flies.push({ spot, from, away, c1: bend(from, spot, rand), c2: bend(spot, away, rand), delay: rand() * 700, arrive: FLASH.gather * (0.75 + rand() * 0.25),
      lift: leaveAt + rand() * 500, go: FLASH.leave * (0.75 + rand() * 0.25), ph: rand() * 6.28 });
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
      for (const f of flies) {
        let p, fade;
        if (t < f.delay) continue;
        if (t < f.delay + f.arrive) { const u = (t - f.delay) / f.arrive; p = curve(f.from, f.c1, f.spot, (1 - Math.cos(Math.PI * u)) / 2); fade = Math.min(1, u * 3); }
        else if (t < f.lift) { p = [f.spot[0] + Math.sin(t * 0.0011 + f.ph) * 1.2, f.spot[1] + Math.cos(t * 0.0013 + f.ph) * 1.2]; fade = 1; } // a little hover
        else { const u = Math.min(1, (t - f.lift) / f.go); p = curve(f.spot, f.c2, f.away, 1 - Math.cos(Math.PI * u / 2)); fade = 1 - u; }
        fireflyLook(FLASH_COLOUR, fireflyBlink(t / 1000, f.ph) * fade, 1 - fade).forEach(([fill, opacity], i) => {
          g.globalAlpha = opacity; g.fillStyle = fill;
          g.beginPath(); g.arc(p[0], p[1], radii[i], 0, 6.2832); g.fill();
        });
      }
      // the name comes up once the pill has formed and goes as the swarm leaves
      const text = String(Math.max(0, Math.min(1, (t - FLASH.gather - 300) / 700, 1 - (t - leaveAt) / 500)).toFixed(2));
      if (text !== shown) pill.style.opacity = shown = text;
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  });
}

window.lanternBadge = flashBadge; // from the console: lanternBadge('hive_mind')
// ?demoBadge=hive_mind,ghosted plays those badges on load, without earning them
for (const id of (Q.get('demoBadge') || '').split(',').filter(Boolean)) setTimeout(() => flashBadge(id), 1500);
