// The graveyard: my open PRs that no session owns and nobody has touched for a week lie at the bottom of the scene
// as dead fireflies. Each is a dark husk with a dull trace of its PR colour in the tail, now and then glowing like an
// ember. The longer dead, the further back (smaller, dimmer). Up to 30 lie out; the oldest beyond that pile into a
// heap. A new one falls in from above; one that comes back to life (touched again, or picked up by a session) rises
// and fades. Shown unless it's turned off in the settings menu, and hidden in quiet hours.

let graveyard = [], graveyardOn = true;
const GRAVE_MAX = 30;
const dead = new Map(); // url -> husk
let graveSeeded = false; // the first list just lies there; later arrivals fall in

function makeHusk(p) {
  const rand = seeded(hash(p.url));
  const g = el('g'), body = el('ellipse', { rx: 3.4, ry: 1.7 }), wings = el('path', { d: 'M-3 -0.4Q-0.5 -2.6 2 -0.6' });
  const rim = el('path', { d: 'M-3.2 -0.6Q0 -2.4 3.2 -0.6', fill: 'none', 'stroke-width': 0.5, 'stroke-linecap': 'round' });
  const ember = el('circle', { cx: 3.1, cy: 0, r: 4.5 }), tail = el('circle', { cx: 3.1, cy: 0, r: 1.25 });
  const back = rand() < 1 / 6; // now and then one lies on its back, legs in the air
  if (back) for (const x of [-1.6, 0, 1.6]) g.append(el('path', { d: `M${x} -1.2l${(rand() - 0.5) * 1.2} -1.8`, stroke: '#6A5E7C', 'stroke-width': 0.35, 'stroke-linecap': 'round' }));
  g.append(ember, body, wings, rim, tail);
  $('graveyard').append(g);
  const zone = $('zones').appendChild(el('circle', { r: 10 }));
  const husk = { p, g, body, wings, rim, ember, tail, zone, back, u: 0.05 + rand() * 0.9, wob: rand(), turn: (rand() - 0.5) * 50,
    period: 30 + rand() * 30, ph: rand() * 6.28, fall: graveSeeded ? 0 : 1, gone: undefined };
  // hovering shows the PR's card; clicking (or clicking the card) opens it
  zone.addEventListener('pointerenter', () => { clearTimeout(hideTimer); hovered = { dead: husk.p, zone }; renderCard(); });
  zone.addEventListener('pointerleave', () => { hideTimer = setTimeout(() => { hovered = null; $('card').classList.remove('show'); }, 700); });
  zone.addEventListener('click', () => { open(husk.p.url, '_blank', 'noopener'); hovered = null; $('card').classList.remove('show'); });
  return husk;
}

// rim: the lantern's light on the side of each husk facing it (warm or violet, like everything else)
function drawGraveyard(dt, s, rim) {
  const show = graveyardOn && !quiet(), list = graveyard;
  $('graveyard').style.display = show ? '' : 'none'; // turning it off (or quiet hours) just hides it
  const lying = list.slice(-GRAVE_MAX), heaped = list.length - lying.length; // newest 30 lie out, the oldest pile up
  const want = new Map(lying.map((p, i) => [p.url, [p, i]]));
  for (const [url, [p]] of want) if (!dead.has(url)) dead.set(url, makeHusk(p));
  graveSeeded ||= list.length > 0;
  const [x0, y0, w, h] = VIEW.box || [40, 20, 600, 600], ground = y0 + h;
  for (const [url, d] of dead) {
    const entry = want.get(url);
    if (entry) { d.p = entry[0]; d.gone = undefined; } else d.gone ??= 0;
    if (d.gone !== undefined) { // back to life: it lifts off and fades
      d.gone += dt / 2;
      if (d.gone >= 1) { d.g.remove(); d.zone.remove(); dead.delete(url); continue; }
    }
    d.fall = Math.min(1, d.fall + dt / 2.5);
    // older ones lie further back: higher up the band, smaller and dimmer
    const back = lying.length > 1 && entry ? 1 - entry[1] / (lying.length - 1) : 0.5;
    const x = x0 + w * d.u, rest = ground - 14 - back * 34 - d.wob * 4, k = 2.4 - back * 1;
    const drop = (1 - d.fall) ** 2, y = rest - drop * (rest - y0 - 40) - (d.gone || 0) * 80;
    const sway = drop * Math.sin(s * 3 + d.ph) * 14;
    put(d.g, 'transform', `translate(${(x + sway).toFixed(1)} ${y.toFixed(1)}) rotate(${(d.back ? 180 : 0) + d.turn * (1 - drop) + sway}) scale(${k.toFixed(2)})`);
    const fade = (1 - back * 0.55) * (1 - (d.gone || 0));
    const col = FLY[['ready', 'failing', 'changes', 'draft'].includes(d.p.need) ? d.p.need : 'quiet'];
    // an ember now and then: a brief warm-up of the tail, out of step with the others
    const glow = Math.max(0, Math.sin(s * 6.283 / d.period + d.ph)) ** 24 + (d.gone !== undefined ? 1 - d.gone : 0);
    put(d.body, 'fill', mix('#3E3550', '#2A2240', back)); put(d.body, 'opacity', fade.toFixed(2));
    put(d.wings, 'fill', mix('#544A68', '#2E2644', back)); put(d.wings, 'opacity', fade.toFixed(2));
    put(d.rim, 'stroke', rim); put(d.rim, 'opacity', (0.45 * fade).toFixed(2));
    put(d.tail, 'fill', mix(mix(col, '#1E182E', 0.62), col, glow)); put(d.tail, 'opacity', fade.toFixed(2));
    put(d.ember, 'fill', col); put(d.ember, 'opacity', (0.5 * glow * fade).toFixed(2));
    put(d.zone, 'cx', (x + sway).toFixed(1)); put(d.zone, 'cy', y.toFixed(1));
    d.zone.style.display = show && d.gone === undefined ? '' : 'none';
  }
  // the heap: everything past 30 in a smouldering pile at the back, with a count
  $('graveHeap').style.display = show && heaped > 0 ? '' : 'none';
  if (heaped > 0) {
    put($('graveHeap'), 'transform', `translate(${(x0 + w - 46).toFixed(1)} ${(ground - 50).toFixed(1)})`);
    $('graveHeapCount').textContent = `+${heaped}`;
  }
}

// a dead PR's card: what it is, how long since anyone touched it, and what it needs
function renderDeadCard(p) {
  const h = document.createElement('h3'), chip = document.createElement('span');
  h.textContent = p.label; chip.className = 'chip idle'; chip.textContent = 'dead'; h.append(chip);
  const days = Math.max(7, Math.round((Date.now() - Date.parse(p.updatedAt)) / 864e5));
  $('card').replaceChildren(h, line(p.title || ''), line(`${NEED[p.need] || p.need} · untouched for ${days} days`, 'dim'));
  $('card').classList.add('show');
}
