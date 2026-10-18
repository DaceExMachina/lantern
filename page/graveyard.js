// The graveyard: my open PRs that no session owns and nobody has touched for a week drift low in the scene as wisps,
// pale ghost fireflies in a washed-out shade of their PR colour, wandering slowly. The longer dead, the lower and
// dimmer. Now and then one brightens: half pulse slowly like an ember, half flicker like a dying bulb. Up to 30; the
// oldest beyond that gather into a faint cloud with a count. A new one fades in; one that comes back to life (touched
// again, or picked up by a session) rises and fades. There's no ground: the lantern floats in the dark and its light
// carries onto other displays, so the dead drift instead of lying anywhere. Shown unless turned off in the settings
// menu, and hidden in quiet hours.

let graveyard = [], graveyardOn = true;
const GRAVE_MAX = 30;
const dead = new Map(); // url -> wisp
let graveSeeded = false; // the first list is simply there; later arrivals fade in
const flickerNoise = x => { const v = Math.sin(x * 12.9898) * 43758.5453; return v - Math.floor(v); };
const WISP_TINT = '#C9C0DC'; // what a dead firefly's colour washes out toward

function makeWisp(p) {
  const rand = seeded(hash(p.url));
  const ember = [el('circle', { r: 18 }), el('circle', { r: 8 }), el('circle', { r: 2.8 })]; // a firefly's own glow: wide, halo, core
  $('graveyard').append(...ember);
  const zone = $('zones').appendChild(el('circle', { r: 12 }));
  const d = { p, ember, zone, u: 0.05 + rand() * 0.9, wob: rand(), ph: rand() * 6.28,
    period: 30 + rand() * 30, flicker: rand() < 0.5,
    born: graveSeeded ? 0 : 1, gone: undefined };
  // hovering shows the PR's card; clicking (or clicking the card) opens it
  zone.addEventListener('pointerenter', () => { clearTimeout(hideTimer); hovered = { dead: d.p, zone }; renderCard(); });
  zone.addEventListener('pointerleave', () => { hideTimer = setTimeout(() => { hovered = null; $('card').classList.remove('show'); }, 700); });
  zone.addEventListener('click', () => { open(d.p.url, '_blank', 'noopener'); hovered = null; $('card').classList.remove('show'); });
  return d;
}

function drawGraveyard(dt, s) {
  const show = graveyardOn && !quiet(), list = graveyard;
  $('graveyard').style.display = show ? '' : 'none'; // turning it off (or quiet hours) just hides it
  const drifting = list.slice(-GRAVE_MAX), clouded = list.length - drifting.length; // newest 30 drift, the oldest cloud up
  const want = new Map(drifting.map((p, i) => [p.url, [p, i]]));
  for (const [url, [p]] of want) if (!dead.has(url)) dead.set(url, makeWisp(p));
  graveSeeded ||= list.length > 0;
  const [x0, y0, w, h] = VIEW.box || [40, 20, 600, 600], low = y0 + h * 0.6, floor = y0 + h - 24; // the band they drift in
  for (const [url, d] of dead) {
    const entry = want.get(url);
    if (entry) { d.p = entry[0]; d.gone = undefined; } else d.gone ??= 0;
    if (d.gone !== undefined) { // back to life: it lifts away and fades
      d.gone += dt / 2;
      if (d.gone >= 1) { d.ember.forEach(c => c.remove()); d.zone.remove(); dead.delete(url); continue; }
    }
    d.born = Math.min(1, d.born + dt / 2);
    const back = drifting.length > 1 && entry ? 1 - entry[1] / (drifting.length - 1) : 0.5; // older: lower and dimmer
    const x = x0 + w * d.u + Math.sin(s * 0.09 + d.ph) * 24;
    const y = low + (floor - low) * (0.2 + back * 0.75) + Math.sin(s * 0.13 + d.ph * 1.7) * 8 - (d.gone || 0) * 70;
    const fade = (1 - back * 0.5) * d.born * (1 - (d.gone || 0));
    const pale = mix(FLY[['ready', 'failing', 'changes', 'draft'].includes(d.p.need) ? d.p.need : 'quiet'], WISP_TINT, 0.55);
    // a faint steady glow, and now and then a brightening: half pulse slowly, half flicker like a dying bulb
    const wave = Math.sin(s * 6.283 / d.period + d.ph), n = flickerNoise(Math.floor(s * 14) + d.ph * 100);
    const spark = d.flicker ? (wave > 0.94 && n > 0.4 ? 0.35 + 0.65 * n : 0) : Math.max(0, wave) ** 8;
    const lit = 0.18 + 0.32 * Math.min(1, spark + (d.gone !== undefined ? 1 - d.gone : 0));
    const fills = [pale, pale, mix(pale, '#FFFFFF', 0.5)], strength = [0.16, 0.6, 0.9]; // wide glow, halo, core
    d.ember.forEach((c, i) => { put(c, 'cx', x.toFixed(1)); put(c, 'cy', y.toFixed(1)); put(c, 'fill', fills[i]); put(c, 'opacity', (strength[i] * lit * fade).toFixed(2)); });
    put(d.zone, 'cx', x.toFixed(1)); put(d.zone, 'cy', y.toFixed(1));
    d.zone.style.display = show && d.gone === undefined ? '' : 'none';
  }
  // the overflow: everything past 30 as a faint cloud low on the right, with a count
  $('graveHeap').style.display = show && clouded > 0 ? '' : 'none';
  if (clouded > 0) {
    put($('graveHeap'), 'transform', `translate(${(x0 + w - 50).toFixed(1)} ${(floor - 10).toFixed(1)})`);
    $('graveHeapCount').textContent = `+${clouded}`;
  }
}

// a dead PR's card: what it is, how long since anyone touched it, and what it needs
function renderDeadCard(p) {
  const h = document.createElement('h3'), chip = document.createElement('span');
  h.textContent = p.label; chip.className = 'chip idle'; chip.textContent = 'dead'; h.append(chip);
  const days = Math.max(7, Math.round((Date.now() - Date.parse(p.updatedAt)) / 864e5));
  const made = p.owner ? [line(`Made by ${p.owner.title || 'an old session'}`, 'dim')] : [];
  $('card').replaceChildren(h, line(p.title || ''), line(`${NEED[p.need] || p.need} · untouched for ${days} days`, 'dim'), ...made);
  $('card').classList.add('show');
}
