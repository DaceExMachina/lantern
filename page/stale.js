// Stale PRs: my open PRs that no session owns and nobody has touched for a week drift around the lantern as wisps,
// pale ghost fireflies in a washed-out shade of their PR colour, wandering slowly. The longer stale, the fainter and
// dimmer. Now and then one slowly brightens and fades again. Up to 30; the
// oldest beyond that gather into a faint cloud with a count. A new one fades in; one that comes back to life (touched
// again, or picked up by a session) rises and fades. There's no ground: the lantern floats in the dark and its light
// carries onto other displays, so they drift instead of lying anywhere. (The server calls this list the graveyard.) Shown unless turned off in the settings
// menu, and hidden in quiet hours.

let stalePRs = [], staleOn = true;
const STALE_MAX = 30;
const wisps = new Map(); // url -> wisp
let staleSeeded = false; // the first list is simply there; later arrivals fade in
const WISP_TINT = '#C9C0DC'; // what a stale PR's colour washes out toward

function makeWisp(p) {
  const rand = seeded(hash(p.url));
  const ember = [el('circle', { r: 18 }), el('circle', { r: 8 }), el('circle', { r: 2.8 })]; // a firefly's own glow: wide, halo, core
  $('stale').append(...ember);
  const zone = $('zones').appendChild(el('circle', { r: 12 }));
  const d = { p, ember, zone, pref: rand() * 6.283, dist: 180 + rand() * 100, wob: rand(), ph: rand() * 6.28, a: rand() * 6.28, w: (0.25 + rand() * 0.2) * (rand() < 0.5 ? -1 : 1),
    period: 30 + rand() * 30,
    born: staleSeeded ? 0 : 1, gone: undefined };
  // hovering shows the PR's card; clicking (or clicking the card) opens it
  zone.addEventListener('pointerenter', () => { clearTimeout(hideTimer); hovered = { stale: d.p, zone }; renderCard(); });
  zone.addEventListener('pointerleave', () => { hideTimer = setTimeout(() => { hovered = null; $('card').classList.remove('show'); }, 700); });
  zone.addEventListener('click', () => { open(d.p.url, '_blank', 'noopener'); hovered = null; $('card').classList.remove('show'); });
  return d;
}

// Ghost moths: an old session that made some of the stale PRs drifts faintly in the background, the same moth as the
// flying ones, flapping the same way, but pale and nearly see-through. Hovering shows the session and its stale PRs;
// clicking resumes it in a new iTerm tab. At most 8, the most recently active; older ones drift lower and fainter.
const GHOSTS_MAX = 8;
const ghosts = new Map(); // session id -> ghost moth
function makeGhost(o) {
  const rand = seeded(hash(o.id));
  const g = el('g'), wings = el('g', { transform: 'translate(-2 -6)' }), side = el('path'), up = el('path');
  wings.append(side, up); g.append(wings);
  $('stale').prepend(g); // behind the wisps
  const zone = $('zones').appendChild(el('circle', { r: 20 }));
  const m = { o, g, side, up, zone, prs: [], pref: rand() * 6.283, dist: 190 + rand() * 90, ph: rand() * 6.28, beat: rand() * 6.28, back: 0, x: 0, y: 0 };
  zone.addEventListener('pointerenter', () => { clearTimeout(hideTimer); hovered = { ghost: m, zone }; renderCard(); });
  zone.addEventListener('pointerleave', () => { hideTimer = setTimeout(() => { hovered = null; $('card').classList.remove('show'); }, 700); });
  zone.addEventListener('click', () => {
    fetch('/resume', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.o.id }) });
    hovered = null; $('card').classList.remove('show');
  });
  return m;
}

// Where the ghosts go: all around the lantern, in the gaps between the living moths. Each living moth (with its
// fireflies) takes a slice of directions around the lantern; a ghost or loose wisp settles in the free direction
// nearest its own seeded preference, at its own seeded distance, and glides there when the gaps shift. Planned twice a
// second, not every frame.
const angleGap = (a, b) => Math.abs(((a - b) % 6.283 + 9.425) % 6.283 - 3.1416);
function freeAngle(pref, taken) {
  for (let i = 0; i < 64; i++) for (const sign of [1, -1]) {
    const a = pref + sign * i * 0.05;
    if (taken.every(([t, w]) => angleGap(a, t) > w)) return a;
  }
  return pref;
}
let stalePlannedAt = -1;
function planStale(s, loose) {
  if (s - stalePlannedAt < 0.5) return;
  stalePlannedAt = s;
  const taken = [];
  for (const m of moths.values()) if (m.home && !m.parentId && !m.leaving) taken.push([Math.atan2(m.home[1] - 320, m.home[0] - 340), 0.42]);
  for (const m of ghosts.values()) { m.aim = freeAngle(m.pref, taken); taken.push([m.aim, 0.3]); }
  for (const d of loose) { d.aim = freeAngle(d.pref, taken); taken.push([d.aim, 0.1]); }
}
// glide a ghost or wisp toward its planned spot (in the scene's unstretched space), with a gentle drift on top
function driftTo(o, dt, s, sway) {
  const tx = 340 + Math.cos(o.aim) * o.dist, ty = 320 + Math.sin(o.aim) * o.dist * 0.95;
  o.px ??= tx; o.py ??= ty;
  o.px += (tx - o.px) * Math.min(1, dt * 0.6); o.py += (ty - o.py) * Math.min(1, dt * 0.6);
  const [x0, y0, w, h] = VIEW.box || [40, 20, 600, 600];
  const [x, y] = stretch([o.px + Math.sin(s * 0.08 + o.ph) * sway, o.py + Math.sin(s * 0.12 + o.ph * 2) * sway * 0.4]);
  return [Math.max(x0 + 24, Math.min(x0 + w - 24, x)), Math.max(y0 + 24, Math.min(y0 + h - 30, y))];
}

function drawStale(dt, s) {
  const show = staleOn && !quiet(), list = stalePRs;
  $('stale').style.display = show ? '' : 'none'; // turning it off (or quiet hours) just hides it
  const drifting = list.slice(-STALE_MAX), clouded = list.length - drifting.length; // newest 30 drift, the oldest cloud up
  const want = new Map(drifting.map((p, i) => [p.url, [p, i]]));
  for (const [url, [p]] of want) if (!wisps.has(url)) wisps.set(url, makeWisp(p));
  staleSeeded ||= list.length > 0;
  const [x0, y0, w, h] = VIEW.box || [40, 20, 600, 600], floor = y0 + h - 24;
  // the sessions that made them, most recently active first
  const owners = new Map();
  for (const p of drifting) if (p.owner?.id) { const o = owners.get(p.owner.id) || { ...p.owner, prs: [] }; o.prs.push(p); owners.set(p.owner.id, o); }
  const kept = [...owners.values()].sort((a, b) => b.last - a.last).slice(0, GHOSTS_MAX);
  for (const o of kept) if (!ghosts.has(o.id)) ghosts.set(o.id, makeGhost(o));
  planStale(s, [...wisps.values()].filter(d => !ghosts.has(d.p.owner?.id)));
  for (const [id, m] of ghosts) {
    const i = kept.findIndex(o => o.id === id);
    if (i < 0) { m.g.remove(); m.zone.remove(); ghosts.delete(id); continue; }
    m.o = kept[i]; m.prs = kept[i].prs;
    m.back = kept.length > 1 ? i / (kept.length - 1) : 0.3;
    m.aim ??= m.pref;
    [m.x, m.y] = driftTo(m, dt, s, 22);
    m.beat += dt * 22.4 * (m.rate ??= 0.88 + seeded(hash(m.o.id + ':wings'))() * 0.24); // a living moth's wingbeat, at its own speed
    const liftAt = lag => 80 * Math.PI / 180 * (0.7 * Math.sin(m.beat - lag) + 0.3), sweep = 0.4 * Math.cos(m.beat);
    const roll = 0.7 * Math.sin(s * 0.17 + m.ph); // drifting between seen from above and side-on, like the live ones
    const upPts = flapWing(WING_UP, liftAt(0), sweep, roll), sidePts = flapWing(WING_SIDE, liftAt(0.18), sweep, roll);
    put(m.up, 'd', pathOf(upPts)); put(m.side, 'd', pathOf(sidePts));
    wingsInDepthOrder(m.up, upPts, m.side, sidePts);
    put(m.g, 'transform', `translate(${m.x.toFixed(1)} ${m.y.toFixed(1)}) scale(${(1 - m.back * 0.3).toFixed(2)})`);
    m.shade = caster(m.x, m.y, 0, 1 - m.back * 0.3, [...upPts, ...sidePts], 0.4 * (1 - m.back * 0.5)); // ghosts barely block the light
    for (const wing of [m.side, m.up]) { put(wing, 'fill', WISP_TINT); put(wing, 'opacity', (0.14 * (1 - m.back * 0.5)).toFixed(2)); }
    m.zone.style.display = show ? '' : 'none';
    put(m.zone, 'cx', m.x.toFixed(1)); put(m.zone, 'cy', m.y.toFixed(1));
  }
  for (const [url, d] of wisps) {
    const entry = want.get(url);
    if (entry) { d.p = entry[0]; d.gone = undefined; } else d.gone ??= 0;
    if (d.gone !== undefined) { // back to life: it lifts away and fades
      d.gone += dt / 2;
      if (d.gone >= 1) { d.ember.forEach(c => c.remove()); d.zone.remove(); wisps.delete(url); continue; }
    }
    d.born = Math.min(1, d.born + dt / 2);
    const back = drifting.length > 1 && entry ? 1 - entry[1] / (drifting.length - 1) : 0.5; // older: fainter
    d.aim ??= d.pref;
    let [x, y] = driftTo(d, dt, s, 16);
    const moth = ghosts.get(d.p.owner?.id);
    if (moth) { // circling the ghost of the session that made it, the way fireflies circle a living moth
      d.a += d.w * dt;
      const r = 22 + d.wob * 16;
      x = moth.x + Math.cos(d.a) * r; y = moth.y + Math.sin(d.a) * r * 0.7;
    }
    y -= (d.gone || 0) * 70;
    const fade = (1 - back * 0.5) * d.born * (1 - (d.gone || 0));
    const pale = mix(FLY[['ready', 'failing', 'changes', 'draft'].includes(d.p.need) ? d.p.need : 'quiet'], WISP_TINT, 0.55);
    // a faint steady glow, and now and then a slow brightening
    const spark = Math.max(0, Math.sin(s * 6.283 / d.period + d.ph)) ** 8;
    const lit = 0.18 + 0.32 * Math.min(1, spark + (d.gone !== undefined ? 1 - d.gone : 0));
    const fills = [pale, pale, mix(pale, '#FFFFFF', 0.5)], strength = [0.16, 0.6, 0.9]; // wide glow, halo, core
    d.ember.forEach((c, i) => { put(c, 'cx', x.toFixed(1)); put(c, 'cy', y.toFixed(1)); put(c, 'fill', fills[i]); put(c, 'opacity', (strength[i] * lit * fade).toFixed(2)); });
    put(d.zone, 'cx', x.toFixed(1)); put(d.zone, 'cy', y.toFixed(1));
    d.zone.style.display = show && d.gone === undefined ? '' : 'none';
  }
  // the overflow: everything past 30 as a faint cloud low on the right, with a count
  $('staleCloud').style.display = show && clouded > 0 ? '' : 'none';
  if (clouded > 0) {
    put($('staleCloud'), 'transform', `translate(${(x0 + w - 50).toFixed(1)} ${(floor - 10).toFixed(1)})`);
    $('staleCloudCount').textContent = `+${clouded}`;
  }
}

// a ghost moth's card: the old session, when it was last active, and the stale PRs it made
function renderGhostCard(m) {
  const h = document.createElement('h3'), chip = document.createElement('span');
  h.textContent = m.o.title || m.o.id.slice(0, 8); chip.className = 'chip idle'; chip.textContent = 'gone quiet'; h.append(chip);
  const days = Math.round((Date.now() - m.o.last) / 864e5), where = String(m.o.cwd || '').split('/').filter(Boolean).pop() || '';
  $('card').replaceChildren(h, line(`${where ? where + ' · ' : ''}last active ${days ? `${days} days ago` : 'today'}`, 'dim'), ...prRows(m.prs));
  $('card').classList.add('show');
}

// a stale PR's card: what it is, how long since anyone touched it, and what it needs
function renderStaleCard(p) {
  const h = document.createElement('h3'), chip = document.createElement('span');
  h.textContent = p.label; chip.className = 'chip idle'; chip.textContent = 'stale'; h.append(chip);
  const days = Math.max(7, Math.round((Date.now() - Date.parse(p.updatedAt)) / 864e5));
  const made = p.owner ? [line(`Made by ${p.owner.title || 'an old session'}`, 'dim')] : [];
  $('card').replaceChildren(h, line(p.title || ''), line(`${NEED[p.need] || p.need} · untouched for ${days} days`, 'dim'), ...made);
  $('card').classList.add('show');
}
