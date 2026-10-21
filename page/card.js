// The hover card for a moth: its session, what it needs from you, its PRs and agents.

// ---- hover card ------------------------------------------------------------------
const ago = ms => ms < 60e3 ? `${Math.max(0, Math.round(ms / 1e3))}s` : ms < 3600e3 ? `${Math.round(ms / 60e3)} min` : `${Math.floor(ms / 3600e3)}h ${Math.round(ms % 3600e3 / 60e3)}m`;
const project = s => s.cwd.split('/').filter(Boolean).pop() || '(unknown)';
function line(text, cls) { const d = document.createElement('div'); d.textContent = text; if (cls) d.className = cls; return d; }
// Where a floating tip goes beside `el`, in window px: centred above it, or below when there's no room, and kept 8px
// inside the window. A badge's tip and an overflow PR's both use it.
function tipSpot(tip, el) {
  const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
  return { left: Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)), top: r.top - h - 8 >= 8 ? r.top - h - 8 : r.bottom + 8 };
}
// an element with a class and its children (text or nodes)
function make(tag, cls = '', ...kids) { const e = document.createElement(tag); if (cls) e.className = cls; e.append(...kids); return e; }
function link({ label, url }, text = label) {
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener'; if (text) a.textContent = text;
  return a;
}
const short = ms => ms < 60e3 ? `${Math.max(0, Math.round(ms / 1e3))}s` : ms < 3600e3 ? `${Math.round(ms / 60e3)}m` : ms < 48 * 3600e3 ? `${Math.floor(ms / 3600e3)}h` : `${Math.floor(ms / 86400e3)}d`;

// The session's PRs as GitHub sees them: "PRs: #6776 ready to merge, #6801 checks failing"
const NEED = { ready: 'ready to merge', failing: 'checks failing', changes: 'changes requested', waiting: 'in review', draft: 'draft', merged: 'merged', closed: 'closed' };
// a heading, then one line per PR: a dot in its firefly's colour, the number, its state, and the title cut to fit
function prRows(prs) {
  return [line(`PRs (${prs.length})`, 'agents'), ...prs.map(p => {
    const row = line('', 'pr'), a = document.createElement('a'), dot = document.createElement('i'), title = document.createElement('span');
    a.href = p.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = p.label;
    dot.style.background = FLY[p.need] || FLY.quiet;
    title.textContent = p.title; title.title = p.title;
    row.append(dot, a, ` ${NEED[p.need] || p.need} · `, title);
    return row;
  })];
}

// Hover areas show their card on entering, hide it a moment after leaving (so it doesn't flicker as things drift), and on a
// click run `onClick` (or on a right-click, `menu`) and hide it. `target` is what `hovered` becomes; `cardAt` says which of
// its areas the card sits beside. They're plain circles in scene units (x, y, r; `off` while they can't be hovered), hit-tested
// in JS by one set of pointer handlers on the scene (main.js), never SVG elements: moving one of those every frame makes
// WebKit repaint the scene under it.
/** @typedef {{ x: number, y: number, r: number, off: boolean, target: any, onClick: () => void, cardAt?: string, menu?: () => void }} Zone */
/** @type {Set<Zone>} */
const zones = new Set();
function hoverZone(target, onClick, r, cardAt) {
  const zone = { x: 0, y: 0, r, off: false, target, onClick, cardAt };
  zones.add(zone);
  return zone;
}
// Areas can overlap, so a point belongs to the nearest area that contains it: two neighbours split their overlap down the
// middle, in whatever order they come. Plain distance, not weighted by radius: weighting would let a flying moth's wide
// area swallow a landed neighbour's own body.
function zoneAt(zones, x, y) {
  let best = null, near = Infinity;
  for (const z of zones) {
    const d = Math.hypot(x - z.x, y - z.y);
    if (!z.off && d < z.r && d < near) [best, near] = [z, d];
  }
  return best;
}
function enterZone(a) {
  clearTimeout(hideTimer);
  if (hovered === a.target && (!a.cardAt || a.target.cardAt === a.cardAt)) return; // already showing it
  hovered = a.target; if (a.cardAt) a.target.cardAt = a.cardAt; renderCard();
}
// shift+click does what right-click does (the area's `menu`, where it has one), since right-click isn't obvious
function clickZone(a, shift) { (shift && a.menu || a.onClick).call(a); clearTimeout(hideTimer); hideCard(); }
// A tap shows the area's card; tapping the same moth again puts it away. (Tapping the card's header runs the action.)
function tapZone(zone) { if (hovered === zone.target) hideCard(); else enterZone(zone); }
function hideCard() { hovered = held = shown = null; openAgents.clear(); $('card').classList.remove('show'); }

function renderCard() {
  const m = hovered, s = m?.session;
  if (m?.stale) return renderStaleCard(m.stale);
  if (m?.ghost) return renderGhostCard(m.ghost);
  if (!s) return;
  // the header stays put and the rest scrolls when the card would be taller than the window. A redraw of the same
  // session keeps its place (the PR toggle redraws under the pointer); another session's card starts at the top.
  const [head, ...rest] = sessionRows(s), body = make('div', 'cardBody', ...rest), was = $('card').children[1];
  const top = was?.dataset?.id === s.id ? was.scrollTop : 0; // read before it's taken out, which zeroes it
  body.dataset.id = s.id;
  $('card').replaceChildren(head, body);
  body.scrollTop = top;
  $('card').classList.add('show');
}

// A session in rows. Its header opens the session (a click on its moth does the same; shift-click snoozes).
function sessionRows(s) {
  const now = Date.now(), waiting = s.state === 'waiting', questions = waiting && s.forYou?.questions || [], you = waiting && s.forYou?.you || [];
  // Every control on the card is an outer button or link that fills its zone (the padding around it, up to its neighbours
  // and the card's edges) and an inner .face that's the visible pill or hover, the size it always was (index.html).
  const chip = make('button', 'chip ' + (s.error && waiting ? 'error' : s.snoozed && waiting ? 'idle' : s.state), make('span', 'face',
    s.reported ? 'reported back' : s.error && waiting ? 'error' : s.snoozed && waiting ? (s.forGood ? 'sleeping' : 'snoozed') : { working: 'working', waiting: 'needs you', paused: 'waiting on agents', idle: 'idle' }[s.state] || s.state));
  // The top is what it wants from me: the pill, a state line only where it says more than the pill (a permission, an
  // error; not "Finished its turn", "Waiting on…", or "Asks:" with the question boxed below), the questions, and its
  // "You:" message as a quote.
  const go = make('span', 'go');
  go.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h6.5V10M12.5 3.5l-8 8"/></svg>';
  const open = make('button', 'open', make('span', 'face name', s.title || project(s), go));
  open.title = 'Open this session';
  open.onclick = e => { const m = moths.get(s.id); if (m) clickZone(m.zone, e.shiftKey); };
  // the pill does what a right-click on the moth does (its `menu`, state.js): snooze, then sleep, then wake
  const next = s.forGood ? 'Wake' : waiting && !s.snoozed ? 'Snooze' : 'Sleep until you wake it';
  chip.title = next; chip.setAttribute('aria-label', `${chip.textContent}: ${next.toLowerCase()}`);
  chip.onclick = () => moths.get(s.id)?.zone?.menu?.();
  const rows = [make('h3', '', open, chip)];
  if (s.state === 'working' && s.activity) rows.push(make('div', 'state', s.activity));
  else if (s.state !== 'working' && s.note && !/^(Finished its turn|Waiting on|Asks:)/.test(s.note)) rows.push(make('div', 'state' + (s.error ? ' error' : ''), s.note));
  for (const q of questions) rows.push(make('div', 'ask', q));
  if (you.length) rows.push(make('div', 'msg', ...you.map(piece => typeof piece === 'string' ? piece : link(piece))));
  if (s.prompt && !waiting) rows.push(make('div', 'prompt', `“${s.prompt.length > 110 ? s.prompt.slice(0, 110) + '…' : s.prompt}”`));
  // The work below, in its tray: agents (each once; background tasks only when they aren't one), side sessions, PRs.
  const tray = [], side = sessions.filter(o => o.parent === s.id), loose = (s.tasks || []).filter(t => !s.subagents.some(a => a.description === t));
  if (s.subagents.length || loose.length) { // in a tinted band of their own, set apart from the rest of the work
    // "Running": agents and the shell commands it left running, counted apart ("2 agents · 1 shell")
    const count = [[s.subagents.length, 'agent', 'agents'], [loose.length, 'shell', 'shells']].filter(([n]) => n).map(([n, one, many]) => `${n} ${n > 1 ? many : one}`).join(' · ');
    const zone = make('div', 'agentZone', make('div', 'head', 'Running', make('span', 'r', count)));
    tray.push(zone);
    // oldest first, by start then id, so the order never shifts while they run: a new agent joins at the bottom and a
    // finished one just drops out, whatever order the server's list comes in
    const agents = [...s.subagents].sort((a, b) => (a.started ?? Infinity) - (b.started ?? Infinity) || String(a.id).localeCompare(String(b.id)));
    for (const a of agents) zone.append(agentRow({ ...a, job: a.description || a.type || 'subagent' }, now));
    for (const t of loose) zone.append(agentRow({ job: t, last: 0, kind: 'shell', started: s.taskStarted?.[t] }, now)); // its start: #171
  }
  if (side.length) {
    tray.push(make('div', 'head', 'Side sessions', make('span', 'r', String(side.length))));
    for (const o of side) tray.push(agentRow({ id: o.id, job: o.title || project(o), activity: o.state === 'working' ? o.activity : o.reported ? 'Reported back' : '', started: o.started, last: o.state === 'working' ? o.last : 0 }, now));
  }
  if (s.github?.length) tray.push(...prBlock(s));
  const foot = make('div', 'foot', `${project(s)} · ${short(now - s.started)} old · active ${short(now - s.last)} ago`);
  rows.push(tray.length ? make('div', 'tray', ...tray, foot) : foot);
  return rows;
}

// An agent in the tray. With a task tag (when its step starts "[tag]", a tag some setups put on every step) or a model to
// show, three lines: the live dot (dim once it's been quiet 10 s), the tag as a chip, the model and how long it's run;
// then its job; then its current step. With neither, two: the dot, the job and the time; then the step. A shell command
// has no step, so it's one line: the dot, the command, "shell" and the time. The job and step are cut to a line each; a
// click opens the agent to show them in full, and it stays open, by id, through the redraws until the card closes. A
// button, so the keyboard gets it too.
const TAG = /^\[([^\]]+)\]\s*/;
const openAgents = new Set();
/** @param {{ id?: string, job: string, activity?: string, started?: number, last?: number, model?: string, kind?: string }} a */
function agentRow({ id, job, activity = '', started, last = 0, model, kind }, now) {
  const tag = activity.match(TAG)?.[1], step = activity.replace(TAG, ''), key = id || job;
  const dot = make('span', 'live' + (now - last > 10e3 ? ' quiet' : '')), time = started ? [make('span', 't', short(now - started))] : [];
  const about = [...(tag ? [make('span', 'tag', tag)] : []), ...(model ? [make('span', 'model', model)] : [])], name = make('span', 'job', job);
  const lines = kind ? [make('span', 'arow', dot, name, make('span', 'model', kind), ...time)] // a shell command: its kind in the model's style
    : about.length ? [make('span', 'arow', dot, ...about, ...time), name]
    : [make('span', 'arow', dot, name, ...time)]; // nothing to say on a line of its own
  const row = make('button', 'agent' + (openAgents.has(key) ? ' open' : ''), make('span', 'face', ...lines, ...(step ? [make('span', 'astep', step)] : [])));
  row.setAttribute('aria-expanded', String(openAgents.has(key)));
  const toggle = () => {
    const open = !openAgents.has(key);
    if (open) openAgents.add(key); else openAgents.delete(key);
    row.classList.toggle('open', open); row.setAttribute('aria-expanded', String(open));
  };
  row.onclick = toggle;
  return row;
}

// The session's PRs, worst first, under a header that sums them up ("PRs · 1 ready · 2 in review · 8 drafts"). Either
// chips coloured by state, each putting its title in the header while hovered, or two-line rows (title; dot, number,
// state) capped at the worst PR_CAP so the card still fits beside its moth. The toggle between them is kept per session
// in the server's settings (prList), so every window agrees; until it's used, three PRs or fewer are listed.
const ORDER = ['failing', 'changes', 'ready', 'waiting', 'draft', 'merged', 'closed'];
const SHORT = { ...NEED, ready: 'ready', failing: 'failing' };
const PR_CAP = 4;
/** @type {Record<string, boolean>} */
let prList = {};
const rank = (/** @type {string} */ need) => (ORDER.indexOf(need) + 1) || ORDER.length + 1;
function prSummary(prs) {
  const n = {};
  for (const p of prs) n[p.need] = (n[p.need] || 0) + 1;
  return Object.keys(n).sort((a, b) => rank(a) - rank(b)).map(k => `${n[k]} ${SHORT[k] || k}${k === 'draft' && n[k] > 1 ? 's' : ''}`).join(' · ');
}
function prBlock(s) {
  const prs = [...s.github].sort((a, b) => rank(a.need) - rank(b.need)), open = prList[s.id] ?? prs.length <= 3;
  const ph = make('span', 'ph'), summary = () => { ph.className = 'ph'; ph.replaceChildren(make('span', 'sum', make('b', '', 'PRs'), ` · ${prSummary(prs)}`)); };
  summary();
  const tog = make('button', 'tog'), label = open ? 'Show PRs as chips' : 'List PRs with their titles';
  tog.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>';
  tog.setAttribute('aria-expanded', String(open)); tog.setAttribute('aria-label', label); tog.title = label;
  tog.onclick = () => {
    prList[s.id] = !open;
    post('/settings', { prList: { [s.id]: !open } });
    renderCard();
  };
  const dot = need => { const i = make('i'); i.style.background = FLY[need] || FLY.quiet; return i; };
  const head = make('div', 'phead', ph, tog);
  // A PR's title where the card doesn't already show it in full: an overflow link past the cap (a bare number), or a
  // list row whose title is cut short. It's the badges' tooltip, shown while hovered or focused and placed as a badge's
  // is (tipSpot). The tip is fixed, so out of the card's flow, but the card's transform makes the card its frame, so the
  // window spot is taken back to the card's. A chip names itself in the header instead.
  const tip = make('div', 'badgeTip');
  tip.setAttribute('role', 'tooltip');
  const titled = (/** @type {HTMLElement} */ a, p, cut = () => true) => {
    a.onpointerenter = a.onfocus = () => {
      if (!cut()) return;
      tip.textContent = p.title;
      const at = tipSpot(tip, a), card = $('card'), c = card.getBoundingClientRect();
      tip.style.left = `${at.left - c.left - card.clientLeft}px`; tip.style.top = `${at.top - c.top - card.clientTop}px`;
      tip.classList.add('show');
    };
    a.onpointerleave = a.onblur = () => tip.classList.remove('show');
    return a;
  };
  if (!open) return [head, make('div', 'chips', ...prs.map(p => {
    const a = link(p, '');
    a.append(make('span', 'face', dot(p.need), p.label));
    a.onpointerenter = () => { ph.className = 'ph title'; ph.textContent = p.title; };
    a.onpointerleave = summary;
    return a;
  }))];
  return [head, ...prs.slice(0, PR_CAP).map(p => {
    const a = link(p, ''), ti = make('span', 'ti', p.title);
    a.className = 'pr2';
    a.append(make('span', 'face', ti, make('span', 'me', dot(p.need), make('b', '', p.label), NEED[p.need] || p.need,
      ...(p.createdAt ? [make('span', 't', short(Date.now() - Date.parse(p.createdAt)))] : [])))); // how long it's been open
    return titled(a, p, () => ti.scrollWidth > ti.clientWidth);
  }), ...(prs.length > PR_CAP ? [make('div', 'more', `${prs.length - PR_CAP} more: `, ...prs.slice(PR_CAP).map(p => { // the comma after each is its own, so the links touch
      const a = link(p, '');
      a.className = 'ov'; a.append(make('span', 'face', p.label));
      return titled(a, p);
    }))] : []), tip];
}
// The card holds where it opened while its moth shimmies about (hops, resettling, the lantern's sway): it keeps the
// anchor it first took and only takes a new one when the area has moved CARD_HOLD or more away, or is a different area.
// Then it eases over to the new spot instead of snapping, so it reads as following rather than shaking.
const CARD_HOLD = 40;
let held = null, shown = null; // the anchor in screen px, and where the card is now on its way there
function holdAnchor(zone, x, y) {
  if (!held || held.zone !== zone || Math.hypot(x - held.x, y - held.y) >= CARD_HOLD) held = { zone, x, y };
  return held;
}
function placeCard() {
  if (!hovered) return;
  const pt = document.querySelector('svg').createSVGPoint();
  const zone = hovered.cardAt === 'flies' && hovered.flyZone ? hovered.flyZone : hovered.zone; // beside whichever area was hovered
  pt.x = zone.x; pt.y = zone.y;
  const ctm = document.querySelector('svg').getScreenCTM(), p = pt.matrixTransform(ctm), c = $('card');
  const gap = zone.r * ctm.a * 0.7; // clear of the hover area, which covers the moth
  const a = holdAnchor(zone, p.x, p.y);
  const x = Math.min(a.x + gap, innerWidth - c.offsetWidth - 12), y = a.y + gap + c.offsetHeight > innerHeight - 8 ? a.y - c.offsetHeight - gap : a.y + gap;
  // while the pointer is on it (opening an agent, say), it stays put rather than flipping above its moth, moving up only
  // as far as it must to stay on screen
  const to = { x: Math.max(8, x), y: Math.max(8, shown && c.matches(':hover') ? Math.min(shown.y, innerHeight - 8 - c.offsetHeight) : y) };
  shown = shown ? { x: shown.x + (to.x - shown.x) * 0.2, y: shown.y + (to.y - shown.y) * 0.2 } : to; // a new card starts in place
  c.style.transform = `translate(${shown.x}px, ${shown.y}px)`;
}
