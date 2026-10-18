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
  const leaveAt = FLASH.gather + 700 + FLASH.hold; // everyone has landed by gather + 700 (`settle`, below)
  const end = leaveAt + 500 + FLASH.leave;

  // Spots packed in rows (hexagonally, each row shifted half a step) 0.8 halo radii apart, out to the pill's edge, so the
  // halos cover it solidly end to end.
  const step = radii[1] * 0.8, r = h / 2 - radii[1] * 0.25, half = w / 2 - h / 2, flies = [];
  for (let row = 0, y = cy - r; y <= cy + r; row++, y += step * 0.866) for (let x = cx - half - r + (row % 2) * step / 2; x <= cx + half + r; x += step) {
    const spot = [x + (rand() - 0.5) * step * 0.3, y + (rand() - 0.5) * step * 0.3];
    if (Math.hypot(Math.max(0, Math.abs(spot[0] - cx) - half), spot[1] - cy) > r) continue;
    // in from the nearer side mostly, from anywhere along its height, and back out to a side when they go
    const side = (spot[0] < cx) !== (rand() < 0.2) ? -radii[0] : W + radii[0], out = rand() < 0.5 ? -radii[0] : W + radii[0];
    const from = still ? spot : [side, rand() * H], away = still ? spot : [out, spot[1] + (rand() - 0.2) * H * 0.6];
    flies.push({ spot, from, away, c1: bend(from, spot, rand), c2: bend(spot, away, rand), delay: rand() * 700, arrive: FLASH.gather * (0.75 + rand() * 0.25),
      lift: leaveAt + rand() * 500, go: FLASH.leave * (0.75 + rand() * 0.25), ph: rand() * 6.28,
      fx: 0.0004 + rand() * 0.0005, fy: 0.0004 + rand() * 0.0005, every: 3000 + rand() * 4000, at: rand() * 7000, dir: rand() * 6.28 });
  }

  // Once everyone has landed they brighten together: each halo eases up to its core's colour and opacity, so the pill
  // glows as one light, then settles back a little through the hold, and dims to normal as each firefly leaves.
  const settle = FLASH.gather + 700, ease = u => (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, u)))) / 2;
  const surgeAt = t => t < settle ? 0 : ease((t - settle) / 500) - 0.25 * ease((t - settle - 500) / 1500);
  const surgeFill = new Map(); // halo colour by surge, in twentieths
  // While they hold the shape they keep moving like a living swarm: a slow wander of a couple of scene units, each on
  // its own phase, and now and then a brief nudge a few units aside. Small next to the halos' overlap, so no holes open.
  const jostle = (f, t) => {
    const n = (t + f.at) % f.every, bump = n < 700 ? Math.sin(Math.PI * n / 700) * 3 * px : 0, a = f.dir + Math.floor((t + f.at) / f.every) * 2.4;
    return [Math.sin(t * f.fx + f.ph) * 2.2 * px + Math.cos(a) * bump, Math.cos(t * f.fy + f.ph * 1.7) * 1.6 * px + Math.sin(a) * bump];
  };
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
        else if (t < f.lift) { const j = jostle(f, t), k = ease((t - f.delay - f.arrive) / 800); p = [f.spot[0] + j[0] * k, f.spot[1] + j[1] * k]; fade = 1; } // eased in from landing
        else {
          const u = Math.min(1, (t - f.lift) / f.go), j = jostle(f, t); p = curve(f.spot, f.c2, f.away, 1 - Math.cos(Math.PI * u / 2));
          p = [p[0] + j[0] * (1 - u), p[1] + j[1] * (1 - u)]; fade = 1 - u; lit *= 1 - ease(u * 2);
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
