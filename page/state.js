// Sessions from the server, turned into moths (session moths and their agents), with their hover areas.

let sessions = [];
const moths = new Map(); // key -> moth
let seenWaiting = new Set(), nextUp = 0;
// ---- state from server -------------------------------------------------------
let raw = [], quietUntil = 0, reviews = [];
// When the lantern was last violet. Each window keeps its own, from when it last saw violet (or opened), since the
// server doesn't say yet; windows opened at different times can differ.
let violetAt = Date.now();
// quiet hours: until 8am every waiting session counts as snoozed, so nothing turns violet, notifies or badges
const quiet = () => quietUntil > Date.now();

function sync() {
  sessions = quiet() ? raw.map(s => s.state === 'waiting' ? { ...s, snoozed: true, quiet: true } : s) : raw;
  const q = $('quiet');
  q.textContent = quiet() ? 'quiet until 8am' : 'quiet';
  q.classList.toggle('on', quiet());
  const live = new Set();
  for (const s of sessions) {
    live.add(s.id);
    if (!moths.has(s.id)) moths.set(s.id, Object.assign(makeSessionMoth(s.id), { key: s.id }));
    moths.get(s.id).session = s;
    // A session another session started (the Claude app's side sessions) is a satellite: it orbits its parent's moth,
    // smaller, with its thread to the parent; it still lands on the lantern on its own when it needs you.
    const m = moths.get(s.id), parent = s.parent && moths.get(s.parent);
    m.satellite = parent && !parent.leaving ? s.parent : null;
    m.size = m.satellite ? SIZE.supervisor * 1.15 : SIZE.session;
    if (m.satellite) m.slot = -1; // it doesn't hold one of the home spots
    // a fresh snooze (not quiet hours, not waking) puffs a "zz" off the moth; the first sync only records where it stands
    const snooze = s.forGood ? 'always' : s.snoozed && !s.quiet ? 'once' : '';
    if (m.snooze !== undefined && snooze && snooze !== m.snooze) m.puff = { at: performance.now() / 1000, kind: snooze };
    m.snooze = snooze;
    for (const a of s.subagents) {
      const k = s.id + '/' + a.id;
      live.add(k);
      if (!moths.has(k)) moths.set(k, Object.assign(makeSubMoth(k, s.id, /supervisor/i.test(a.type) ? SIZE.supervisor : SIZE.subagent), { key: k }));
      Object.assign(moths.get(k), { session: s, type: a.type });
    }
  }
  for (const [k, m] of moths) if (!live.has(k)) m.leaving = true;

  const working = sessions.filter(s => s.state === 'working').length;
  const onAgents = sessions.filter(s => s.state === 'paused').length;
  const waiting = sessions.filter(s => s.state === 'waiting' && !s.snoozed);
  const snoozed = sessions.filter(s => s.state === 'waiting' && s.snoozed).length;
  const st = $('status');
  st.className = waiting.length ? 'waiting' : '';
  if (!sessions.length) st.textContent = 'quiet night, no sessions';
  else {
    st.replaceChildren(`${sessions.length} session${sessions.length > 1 ? 's' : ''} · ${working} working` + (onAgents ? ` · ${onAgents} waiting on agents` : ''));
    if (waiting.length) {
      // "N need you" opens the session that's waited longest; each click moves on to the next one
      const next = document.createElement('button');
      next.className = 'next'; next.textContent = `${waiting.length} need${waiting.length > 1 ? '' : 's'} you`;
      next.title = 'Open the session that has waited longest';
      next.onclick = () => {
        const queue = sessions.filter(s => s.state === 'waiting' && !s.snoozed).sort((a, b) => a.waitingSince - b.waitingSince);
        const s = queue[nextUp++ % queue.length];
        if (s) fetch('/focus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id }) });
      };
      st.append(' · ', next);
    }
    if (snoozed) st.append(` · ${snoozed} snoozed`);
    if (waiting.length) violetAt = Date.now();
    else if (!quiet() && Date.now() - violetAt >= 60000) {
      const m = Math.floor((Date.now() - violetAt) / 60000), warm = document.createElement('span');
      warm.className = 'warm'; warm.textContent = `warm for ${m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`}`;
      st.append(' · ', warm);
    }
    if (reviews.length) {
      const a = document.createElement('a');
      a.href = 'https://github.com/pulls/review-requested'; a.target = '_blank'; a.rel = 'noopener'; a.className = 'next';
      a.textContent = `${reviews.length} review${reviews.length > 1 ? 's' : ''}`; a.title = reviews.map(r => `${r.label} ${r.title}`).join('\n');
      st.append(' · ', a);
    }
  }
  // the Dock app's icon shows how many sessions need me (Safari may want notification permission for this)
  try { const p = waiting.length ? navigator.setAppBadge?.(waiting.length) : navigator.clearAppBadge?.(); p?.catch?.(() => {}); } catch {}

  for (const s of waiting) if (!seenWaiting.has(s.id)) alertMe(s);
  seenWaiting = new Set(waiting.map(s => s.id));
}

function el(tag, attrs = {}) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

function mothNode() {
  const g = el('g', { class: 'moth' });
  const up = el('path', { d: pathOf(WING_UP), class: 'wing' }), side = el('path', { d: pathOf(WING_SIDE), class: 'wing' });
  const wings = el('g', { transform: 'translate(-2 -6)' }); // same offset as the original artwork, so it pivots the same way
  wings.append(side, up);
  g.append(wings);
  $('moths').append(g);
  return { g, up, side };
}

// hovering a moth pins a card to it; a short grace period stops it flickering as the moth drifts
let hovered = null, hideTimer;
// A hover area for a moth: shows its card (beside the area it came from), click opens the session, right-click snoozes.
// A session moth has two once it lands: one on the moth, and one over the fireflies it left back home.
function hoverArea(m, at) {
  const zone = $('zones').appendChild(el('circle', { r: 48 }));
  zone.addEventListener('pointerenter', () => { clearTimeout(hideTimer); hovered = m; m.cardAt = at; renderCard(); });
  // clicking brings the session's iTerm tab to the front (a subagent focuses its parent session)
  zone.addEventListener('click', () => {
    fetch('/focus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.key }) });
    clearTimeout(hideTimer); hovered = null; $('card').classList.remove('show'); // you're off to the session, so the card can go
  });
  // Right-click cycles a session's snooze: a waiting one snoozes until it does something new, then for good (new activity
  // never wakes it, say for a chat you only drop into now and then), then wakes. One that isn't waiting goes straight
  // to for good. A snoozed moth rests on the lantern without turning it violet.
  zone.addEventListener('contextmenu', e => {
    e.preventDefault();
    const s = m.session;
    if (!s) return;
    const next = s.forGood ? false : s.state === 'waiting' && !s.snoozed ? true : 'always';
    fetch('/snooze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, snoozed: next }) });
  });
  zone.addEventListener('pointerleave', () => { hideTimer = setTimeout(() => { hovered = null; $('card').classList.remove('show'); }, 700); });
  return zone;
}
function hoverable(m) {
  m.zone = hoverArea(m, 'moth');
  return m;
}

function makeSessionMoth(key) {
  // each session has its own favourite home spot, so every window agrees; if it's taken, the next free one
  const taken = new Set([...moths.values()].filter(m => m.home && !m.leaving).map(m => m.slot)), pref = hash(key) % HOMES.length;
  let slot, i = 0;
  do slot = (pref + i) % HOMES.length + Math.floor(i / HOMES.length) * HOMES.length, i++; while (taken.has(slot));
  const [hx, hy] = HOMES[slot % HOMES.length];
  const spill = Math.floor(slot / HOMES.length) * 35; // more than 8 sessions: crowd in near an existing spot
  const [x, y] = stretch(EDGES[Math.floor(Math.random() * EDGES.length)]);
  const thread = el('path');
  $('threads').append(thread);
  return hoverable({ ...mothNode(), size: SIZE.session, slot, home: [hx + spill, hy + spill * 0.5], thread,
    x, y, phase: seeded(hash(key))() * 10, perch: pickPerch(), cool: 0, leaving: false });
}

function makeSubMoth(key, parentId, size) {
  const p = moths.get(parentId), rand = seeded(hash(key));
  return ({ ...mothNode(), size, parentId, x: p?.x ?? CX, y: p?.y ?? CY, a: rand() * 6.28,
    r: (size === SIZE.supervisor ? 54 : 38) + rand() * 14,
    speed: (1.1 + rand()) * (rand() < 0.5 ? -1 : 1) / size ** 0.5,
    phase: rand() * 10, cool: 0, leaving: false });
}

function flamePath(w, h, lean) {
  const bx = 340, by = FLAME_BASE, tx = bx + lean, ty = by - h, f = n => n.toFixed(1);
  return `M${f(bx - w * 0.55)} ${f(by - h * 0.14)}` +
    `C${f(bx - w * 1.05)} ${f(by - h * 0.45)} ${f(tx - w * 0.35 + lean * 0.2)} ${f(ty + h * 0.35)} ${f(tx)} ${f(ty)}` +
    `C${f(tx + w * 0.35 + lean * 0.2)} ${f(ty + h * 0.35)} ${f(bx + w * 1.05)} ${f(by - h * 0.45)} ${f(bx + w * 0.55)} ${f(by - h * 0.14)}` +
    `C${f(bx + w * 0.6)} ${f(by + h * 0.1)} ${f(bx - w * 0.6)} ${f(by + h * 0.1)} ${f(bx - w * 0.55)} ${f(by - h * 0.14)}Z`;
}
