// The graveyard: my open PRs that no session owns and nobody has touched for a week lie at the bottom of the scene
// as dead fireflies. Each is a dark husk with a dull trace of its PR colour in the tail, now and then glowing like an
// ember. The longer dead, the further back (smaller, dimmer). Up to 30 lie out; the oldest beyond that pile into a
// heap. A new one falls in from above; one that comes back to life (touched again, or picked up by a session) rises
// and fades. Shown unless it's turned off in the settings menu, and hidden in quiet hours.

let graveyard = [], graveyardOn = true;
const GRAVE_MAX = 30;
const dead = new Map(); // url -> husk
let graveSeeded = false; // the first list just lies there; later arrivals fall in

// Each dead firefly lies on its back, tiny and dark: a small head with antennae, a shield of a thorax, and a segmented
// abdomen whose last two segments are the light organ (on a real firefly the light is on the underside of the tail,
// so a belly-up one shows it). Six spindly legs in the air, each either bent at a crooked angle or curled back; the
// angles come from its PR, so every window draws it the same and no two lie alike.
function husk(rand) {
  const legs = [];
  for (const x of [-1.9, -1.2]) for (const side of [-1, 1]) {
    if (rand() < 0.5) { // bent at the knee
      const kx = x + side * (0.3 + rand() * 0.8), ky = -1.9 - rand() * 1.2;
      legs.push(`M${x} -0.7L${kx.toFixed(2)} ${ky.toFixed(2)}L${(kx + side * (rand() - 0.25) * 1.4).toFixed(2)} ${(ky + (rand() - 0.6) * 1.5).toFixed(2)}`);
    } else { // curled back toward the body
      legs.push(`M${x} -0.7Q${(x + side * (1.2 + rand() * 0.5)).toFixed(2)} ${(-2.4 - rand() * 0.8).toFixed(2)} ${(x + side * (0.2 + rand() * 0.4)).toFixed(2)} ${(-1.8 - rand() * 0.5).toFixed(2)}`);
    }
  }
  return { legs: legs.join('') };
}
const flickerNoise = x => { const v = Math.sin(x * 12.9898) * 43758.5453; return v - Math.floor(v); };

function makeHusk(p) {
  const rand = seeded(hash(p.url)), model = husk(rand);
  const g = el('g');
  const feelers = el('path', { d: 'M-3.6 -0.2l-1.2 -1.3M-3.6 0.2l-1.3 1', fill: 'none', stroke: '#15111C', 'stroke-width': 0.18, 'stroke-linecap': 'round' });
  const head = el('circle', { cx: -3.1, cy: 0, r: 0.55, fill: '#15111C' });
  const wings = el('path', { d: 'M-2.6 -0.9Q-1.4 -1.3 -0.9 -0.6L-0.9 0.6Q-1.4 1.3 -2.6 0.9Z' }); // the thorax's shield
  const legs = el('path', { d: model.legs, fill: 'none', stroke: '#15111C', 'stroke-width': 0.22, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const body = el('path', { d: 'M-0.9 -0.75Q1.2 -1.15 2.4 -0.5Q2.7 0 2.4 0.5Q1.2 1.15 -0.9 0.75Z' }); // the abdomen
  const segments = el('path', { d: 'M0.2 -0.9V0.9M1.1 -0.85V0.85', stroke: '#0E0B13', 'stroke-width': 0.14 });
  const tail = el('path', { d: 'M1.6 -0.72Q2.4 -0.5 2.6 0Q2.4 0.5 1.6 0.72Z' }); // the light organ, the last two segments
  const rim = el('path', { d: 'M-0.9 -0.75Q1.2 -1.15 2.4 -0.5', fill: 'none', 'stroke-width': 0.2, 'stroke-linecap': 'round' });
  // its glow is a firefly's own three circles at full size (wide glow, halo, bright core), just dimmer
  const ember = [el('circle', { r: 18 }), el('circle', { r: 8 }), el('circle', { r: 2.8 })];
  const back = false;
  g.append(feelers, head, legs, wings, body, segments, tail, rim);
  $('graveyard').append(g, ...ember);
  const zone = $('zones').appendChild(el('circle', { r: 10 }));
  const h = { p, g, body, wings, legs, rim, ember, tail, zone, back, u: 0.05 + rand() * 0.9, wob: rand(), turn: (rand() - 0.5) * 40,
    period: 30 + rand() * 30, ph: rand() * 6.28, flicker: rand() < 0.5, fall: graveSeeded ? 0 : 1, gone: undefined };
  // hovering shows the PR's card; clicking (or clicking the card) opens it
  zone.addEventListener('pointerenter', () => { clearTimeout(hideTimer); hovered = { dead: h.p, zone }; renderCard(); });
  zone.addEventListener('pointerleave', () => { hideTimer = setTimeout(() => { hovered = null; $('card').classList.remove('show'); }, 700); });
  zone.addEventListener('click', () => { open(h.p.url, '_blank', 'noopener'); hovered = null; $('card').classList.remove('show'); });
  return h;
}

// Dead moths: an old session that made some of the dead PRs lies on the ground with its dead fireflies around it,
// wings spread flat like a pinned specimen. Hovering shows the session and its dead PRs; clicking resumes it in a
// new iTerm tab. At most 8, the most recently active; older ones lie further back.
const MOTHS_MAX = 8;
const deadMoths = new Map(); // session id -> moth
function makeDeadMoth(o) {
  const rand = seeded(hash(o.id));
  // It lies on the ground in 3D, the same moth as the flying ones: its wing plane is the ground, it faces its own way
  // (seeded, so every window agrees), and one wing stays flat while the other, by pose, lies flat too, props up
  // partway, or sticks up into the air. Then it's seen from just above the ground with the flying moths' perspective.
  const heading = rand() * 2 * Math.PI, pose = rand(), raised = pose < 0.3 ? 0 : pose < 0.65 ? 0.5 + rand() * 0.4 : 1.25 + rand() * 0.4;
  const liftUp = rand() < 0.5; // which wing lifts
  const ground = (pts, lift) => pts.map(([x, y]) => {
    const a = x * AU[0] + y * AU[1], r = x * AN[0] + y * AN[1]; // along the body, and across it
    const up = Math.abs(r) * Math.sin(lift), r2 = r * Math.cos(lift); // a lifted wing swings up around the body
    const px = a * AU[0] + r2 * AN[0], py = a * AU[1] + r2 * AN[1]; // back in the moth's (now the ground's) plane
    const gx = px * Math.cos(heading) - py * Math.sin(heading), gy = px * Math.sin(heading) + py * Math.cos(heading); // its heading
    const view = 0.32, depth = gy * Math.cos(view) + up * Math.sin(view), k = EYE / (EYE - depth); // seen from just above
    return [gx * k, (gy * Math.sin(view) - up * Math.cos(view)) * k];
  });
  const g = el('g'), side = el('path', { d: pathOf(ground(WING_SIDE, liftUp ? 0 : raised)) }), up = el('path', { d: pathOf(ground(WING_UP, liftUp ? raised : 0)) });
  g.append(side, up);
  $('graveyard').append(g);
  const zone = $('zones').appendChild(el('circle', { r: 22 })); // wide enough to take in its little cluster
  const m = { o, g, side, up, zone, prs: [], u: 0.08 + rand() * 0.84, wob: rand(), back: 0, x: undefined, y: 0 };
  zone.addEventListener('pointerenter', () => { clearTimeout(hideTimer); hovered = { deadMoth: m, zone }; renderCard(); });
  zone.addEventListener('pointerleave', () => { hideTimer = setTimeout(() => { hovered = null; $('card').classList.remove('show'); }, 700); });
  zone.addEventListener('click', () => {
    fetch('/resume', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.o.id }) });
    hovered = null; $('card').classList.remove('show');
  });
  return m;
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
  // the sessions that made them, most recently active first
  const owners = new Map();
  for (const p of lying) if (p.owner?.id) { const o = owners.get(p.owner.id) || { ...p.owner, prs: [] }; o.prs.push(p); owners.set(p.owner.id, o); }
  const kept = [...owners.values()].sort((a, b) => b.last - a.last).slice(0, MOTHS_MAX);
  for (const o of kept) if (!deadMoths.has(o.id)) deadMoths.set(o.id, makeDeadMoth(o));
  for (const [id, m] of deadMoths) {
    const i = kept.findIndex(o => o.id === id);
    if (i < 0) { m.g.remove(); m.zone.remove(); deadMoths.delete(id); continue; }
    m.o = kept[i]; m.prs = kept[i].prs;
    m.back = kept.length > 1 ? i / (kept.length - 1) : 0.3; // the longer since it was active, the further back
    m.x = x0 + w * m.u; m.y = ground - 18 - m.back * 30 - m.wob * 4;
    const k = 1.5 - m.back * 0.6, fade = 1 - m.back * 0.5, ash = mix('#9A92A8', '#4A4260', m.back);
    put(m.g, 'transform', `translate(${m.x.toFixed(1)} ${m.y.toFixed(1)}) scale(${(k * 0.9).toFixed(2)})`);
    for (const wing of [m.side, m.up]) { put(wing, 'fill', ash); put(wing, 'opacity', fade.toFixed(2)); }
    m.zone.style.display = show ? '' : 'none';
    put(m.zone, 'cx', m.x.toFixed(1)); put(m.zone, 'cy', m.y.toFixed(1));
  }
  for (const [url, d] of dead) {
    const entry = want.get(url);
    if (entry) { d.p = entry[0]; d.gone = undefined; } else d.gone ??= 0;
    if (d.gone !== undefined) { // back to life: it lifts off and fades
      d.gone += dt / 2;
      if (d.gone >= 1) { d.g.remove(); d.ember.forEach(c => c.remove()); d.zone.remove(); dead.delete(url); continue; }
    }
    d.fall = Math.min(1, d.fall + dt / 2.5);
    // older ones lie further back: higher up the band, smaller and dimmer
    const back = lying.length > 1 && entry ? 1 - entry[1] / (lying.length - 1) : 0.5;
    let x = x0 + w * d.u, rest = ground - 12 - back * 34 - d.wob * 4, k = 1.6 - back * 0.6;
    const moth = deadMoths.get(d.p.owner?.id);
    if (moth) { x = moth.x + (d.u - 0.5) * 50; rest = moth.y + 3 + (d.wob - 0.5) * 8; k = 1.5 - moth.back * 0.5; } // gather around the session that made it
    const drop = (1 - d.fall) ** 2, y = rest - drop * (rest - y0 - 40) - (d.gone || 0) * 80;
    const sway = drop * Math.sin(s * 3 + d.ph) * 14;
    const turn = (d.back ? 180 : 0) + d.turn * (1 - drop) + sway, rad = turn * Math.PI / 180;
    put(d.g, 'transform', `translate(${(x + sway).toFixed(1)} ${y.toFixed(1)}) rotate(${turn.toFixed(1)}) scale(${k.toFixed(2)})`);
    const tx = x + sway + 2.1 * k * Math.cos(rad), ty = y + 2.1 * k * Math.sin(rad); // where its tail is
    const fade = (1 - back * 0.55) * (1 - (d.gone || 0));
    const col = FLY[['ready', 'failing', 'changes', 'draft'].includes(d.p.need) ? d.p.need : 'quiet'];
    // Now and then its tail lights up, out of step with the others. Half of them pulse slowly like an ember; the other
    // half flicker like a dying bulb: a burst of quick, uneven on-and-off, then dark again.
    const wave = Math.sin(s * 6.283 / d.period + d.ph), n = flickerNoise(Math.floor(s * 14) + d.ph * 100);
    const spark = d.flicker ? (wave > 0.94 && n > 0.4 ? 0.35 + 0.65 * n : 0) : Math.max(0, wave) ** 8;
    const glow = 0.3 * Math.min(1, spark + (d.gone !== undefined ? 1 - d.gone : 0)); // the dead only glow faintly
    put(d.body, 'fill', '#15111C'); put(d.wings, 'fill', '#15111C'); // all one near-black
    put(d.g, 'opacity', fade.toFixed(2)); // older ones further back fade, and so does a revived one rising
    put(d.rim, 'stroke', rim); put(d.rim, 'opacity', 0.12);
    put(d.tail, 'fill', mix('#15111C', col, Math.min(1, glow * 3))); // the same black as the rest until it glows
    const lit = glow / 0.3 * 0.35; // as bright as a flying firefly's glow at about a third
    const look = [[col, 0.16 * lit], [col, 0.6 * lit], [mix(col, '#FFFFFF', 0.6), 0.9 * lit]];
    d.ember.forEach((c, i) => { put(c, 'cx', tx.toFixed(1)); put(c, 'cy', ty.toFixed(1)); put(c, 'fill', look[i][0]); put(c, 'opacity', (look[i][1] * fade).toFixed(2)); });
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

// a dead moth's card: the old session, when it was last active, and the dead PRs it made
function renderDeadMothCard(m) {
  const h = document.createElement('h3'), chip = document.createElement('span');
  h.textContent = m.o.title || m.o.id.slice(0, 8); chip.className = 'chip idle'; chip.textContent = 'gone quiet'; h.append(chip);
  const days = Math.round((Date.now() - m.o.last) / 864e5), where = String(m.o.cwd || '').split('/').filter(Boolean).pop() || '';
  $('card').replaceChildren(h, line(`${where ? where + ' · ' : ''}last active ${days ? `${days} days ago` : 'today'}`, 'dim'), ...prRows(m.prs));
  $('card').classList.add('show');
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
