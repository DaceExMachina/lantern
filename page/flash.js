// A badge just earned: a swarm of fireflies drifts in from the lantern and the window's edges, settles into the outline of
// a pill near the top with the badge's name, holds a few seconds, then lifts off. Clicking the pill opens the stats panel
// on that badge. Badges earned together play one after another.
// Each firefly is a small div with one Web Animations timeline (arrive, hold, leave) on transform and opacity, which
// WebKit runs on the compositor: no script runs per frame, and nothing goes near the per-frame-rotated #lantern.

const FLASH = { gather: 2400, hold: 4000, leave: 2200 }; // ms; the swarm's own jitter rides on top
const FLASH_GLOW = '#FFD27A';
const flashQueue = [];
let flashing = false;

// a point on a quadratic curve from a to b bending through c, at u in [0, 1]
const curve = (a, c, b, u) => [0, 1].map(k => (1 - u) ** 2 * a[k] + 2 * (1 - u) * u * c[k] + u * u * b[k]);
// a bend for the path from a to b: off to one side by a share of its length
function bend(a, b, rand) {
  const dx = b[0] - a[0], dy = b[1] - a[1], k = (0.2 + rand() * 0.25) * (rand() < 0.5 ? -1 : 1);
  return [(a[0] + b[0]) / 2 - dy * k, (a[1] + b[1]) / 2 + dx * k];
}
// the point `s` along the outline of a w x h pill (a stadium) centred on [cx, cy], clockwise from the top left
function onPill(s, w, h, cx, cy) {
  const r = h / 2, line = w - h, arc = Math.PI * r;
  if (s < line) return [cx - line / 2 + s, cy - r];
  if ((s -= line) < arc) { const a = -Math.PI / 2 + s / r; return [cx + line / 2 + Math.cos(a) * r, cy + Math.sin(a) * r]; }
  if ((s -= arc) < line) return [cx + line / 2 - s, cy + r];
  const a = Math.PI / 2 + (s - line) / r; return [cx - line / 2 + Math.cos(a) * r, cy + Math.sin(a) * r];
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
  const layer = document.createElement('div'); layer.id = 'flash';
  const pill = document.createElement('button'); pill.className = 'pill'; pill.setAttribute('aria-live', 'polite');
  pill.innerHTML = `<b>${name}</b>${how && !compact ? `<span>${how}</span>` : ''}`; // the iTerm panel is too narrow for the blurb
  pill.title = 'Open in stats';
  layer.append(pill);
  document.body.append(layer);

  const { width: w, height: h, left, top } = pill.getBoundingClientRect(), cx = left + w / 2, cy = top + h / 2;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = seeded(hash(id + Date.now()));
  const perimeter = 2 * (w - h) + Math.PI * h, count = still ? 0 : Math.round(Math.min(36, Math.max(16, perimeter / 24)));
  // where the lantern hangs on screen, from the scene's 600x600 layout (its paper's centre is 340, 350)
  const svg = document.querySelector('#scene svg').getBoundingClientRect();
  const lantern = VIEW.box ? [svg.left + (340 - VIEW.box[0]) * VIEW.px, svg.top + (350 - VIEW.box[1]) * VIEW.px] : [innerWidth / 2, innerHeight / 2];
  const leaveAt = FLASH.gather + 700 + FLASH.hold; // everyone has landed by gather + 700
  const end = leaveAt + 500 + FLASH.leave;
  const at = (p, opacity, offset) => ({ transform: `translate(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px)`, opacity, offset: offset / end });
  const anims = [];
  for (let i = 0; i < count; i++) {
    const spot = onPill((i + rand() * 0.5) / count * perimeter, w, h, cx, cy).map(v => v + (rand() - 0.5) * 5); // loosely, not a row of bulbs
    // about half rise from the lantern, the rest drift in from the sides and the bottom
    const from = i % 2 ? [lantern[0] + (rand() - 0.5) * 60, lantern[1] + (rand() - 0.5) * 60]
      : rand() < 0.5 ? [rand() < 0.5 ? -20 : innerWidth + 20, innerHeight * (0.3 + rand() * 0.7)] : [rand() * innerWidth, innerHeight + 20];
    const away = [spot[0] + (spot[0] - cx) * (2 + rand() * 2) + (rand() - 0.5) * 200, spot[1] - innerHeight * (0.3 + rand() * 0.4)];
    const c1 = bend(from, spot, rand), c2 = bend(spot, away, rand);
    const delay = rand() * 700, arrive = FLASH.gather * (0.8 + rand() * 0.2), lift = leaveAt + rand() * 500, go = FLASH.leave * (0.8 + rand() * 0.2);
    const frames = [at(from, 0, 0)];
    for (let k = 0; k <= 12; k++) { const u = k / 12; frames.push(at(curve(from, c1, spot, (1 - Math.cos(Math.PI * u)) / 2), Math.min(1, u * 4), delay + arrive * u)); }
    for (let k = 0; k <= 12; k++) { const u = k / 12; frames.push(at(curve(spot, c2, away, 1 - Math.cos(Math.PI * u / 2)), 1 - u, lift + go * u)); }
    frames.push(at(away, 0, end));
    const fly = document.createElement('i'), glow = document.createElement('i');
    fly.className = 'fly'; fly.append(glow);
    layer.append(fly);
    anims.push(fly.animate(frames, { duration: end, fill: 'both' }));
    // a little twinkle and hover while they hold the shape
    glow.animate([{ opacity: 1, transform: 'none' }, { opacity: 0.45, transform: `translate(${(rand() - 0.5) * 4}px, ${(rand() - 0.5) * 4}px)` }],
      { duration: 900 + rand() * 1400, delay: -rand() * 2000, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' });
  }
  // the pill's fill and text come up as the fireflies arrive, and go as they leave
  const show = still ? 400 : FLASH.gather * 0.7;
  anims.push(pill.animate([{ opacity: 0 }, { opacity: 0, offset: show / end }, { opacity: 1, offset: (show + 900) / end, easing: 'ease-in' },
    { opacity: 1, offset: leaveAt / end }, { opacity: 0, offset: (leaveAt + 1000) / end }, { opacity: 0 }], { duration: end, fill: 'both' }));
  // a click opens the stats panel with this badge's card pinned (stats.js), and sends the swarm off now
  pill.onclick = () => {
    pinnedBadge = id;
    $('stats').showPopover();
    for (const a of anims) if (+a.currentTime < leaveAt) a.currentTime = leaveAt;
  };
  return Promise.all(anims.map(a => a.finished)).then(() => layer.remove());
}

window.lanternBadge = flashBadge; // from the console: lanternBadge('hive_mind')
// ?demoBadge=hive_mind,ghosted plays those badges on load, without earning them
for (const id of (Q.get('demoBadge') || '').split(',').filter(Boolean)) setTimeout(() => flashBadge(id), 1500);
