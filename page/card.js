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
// `el` with a key, so a redraw (morph) gives each row back its own element: agents by id, PRs by url, sessions by id
const keyed = (key, el) => { el.dataset.key = key; return el; };
// Redraws build fresh nodes, then morph patches the live ones to match instead of swapping them in, so whatever the browser
// holds on an element survives: hover, keyboard focus, scroll, and a press between mousedown and click. Children are
// matched by tag and key (unkeyed ones in order), patched in place (attributes, the handlers below, text), and new ones go
// in where they belong; whatever's left over goes. Elements only move when the order changes, and a move drops focus,
// so the focused element gets it back afterwards.
const HANDLERS = ['onclick', 'onpointerenter', 'onpointerleave', 'onfocus', 'onblur']; // ponytail: the ones the card sets; add any new one here
function morph(el, kids) {
  const old = [...el.childNodes], f = /** @type {HTMLElement | null} */ (document.activeElement);
  const next = kids.map(n => {
    const i = old.findIndex(o => o && o.nodeName === n.nodeName && o.dataset?.key === n.dataset?.key);
    if (i < 0) return n;
    const o = old[i]; old[i] = null;
    if (o.nodeType !== 1) { if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue; return o; }
    for (const { name } of [...o.attributes]) if (!n.hasAttribute(name)) o.removeAttribute(name);
    for (const { name, value } of n.attributes) if (o.getAttribute(name) !== value) o.setAttribute(name, value);
    for (const h of HANDLERS) o[h] = n[h];
    morph(o, [...n.childNodes]);
    return o;
  });
  for (const o of old) o?.remove();
  next.forEach((n, i) => { if (el.childNodes[i] !== n) el.insertBefore(n, el.childNodes[i] ?? null); });
  if (f !== document.activeElement && f?.isConnected) f.focus({ preventScroll: true });
}
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
function hideCard() { hovered = held = shown = null; openAgents.clear(); prOver.card = ''; $('card').classList.remove('show'); $('prTip').classList.remove('show'); }

function renderCard() {
  dropTip();
  const m = hovered, s = m?.session;
  if (m?.stale) return renderStaleCard(m.stale);
  if (m?.ghost) return renderGhostCard(m.ghost);
  if (!s) return;
  // the header stays put and the rest scrolls when the card would be taller than the window. The body is keyed by its
  // session, so another session's card gets a fresh one, at the top.
  const [head, ...rest] = sessionRows(s);
  morph($('card'), [head, keyed(s.id, make('div', 'cardBody', ...rest))]);
  $('card').classList.add('show');
}

// A session in rows. Its header opens the session (a click on its moth does the same; shift-click snoozes). `full` is the
// pinned sidebar's version: nothing cut short, and every PR there to list.
function sessionRows(s, full = false) {
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
  const rows = [make('h3', '', open, chip, ...(pinnable() ? [pinButton(s)] : []))];
  if (s.state === 'working' && s.activity) rows.push(make('div', 'state', s.activity));
  else if (s.state !== 'working' && s.note && !/^(Finished its turn|Waiting on|Asks:)/.test(s.note)) rows.push(make('div', 'state' + (s.error ? ' error' : ''), s.note));
  for (const q of questions) rows.push(make('div', 'ask', q));
  if (you.length) rows.push(make('div', 'msg', ...you.map(piece => typeof piece === 'string' ? piece : link(piece))));
  if (s.prompt && !waiting) rows.push(make('div', 'prompt', `“${s.prompt.length > 110 && !full ? s.prompt.slice(0, 110) + '…' : s.prompt}”`));
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
    for (const a of agents) zone.append(agentRow({ ...a, job: a.description || a.type || 'subagent' }, now, full));
    // its kind where an agent's model goes; keyed by place, as two can share a description (and so a start: taskStarted is
    // by description)
    loose.forEach((t, i) => zone.append(agentRow({ id: `shell ${i}`, job: t, last: 0, model: 'shell', started: s.taskStarted?.[t] }, now, full)));
  }
  if (side.length) {
    tray.push(make('div', 'head', 'Side sessions', make('span', 'r', String(side.length))));
    for (const o of side) tray.push(agentRow({ id: o.id, job: o.title || project(o), activity: o.state === 'working' ? o.activity : o.reported ? 'Reported back' : '', started: o.started, last: o.state === 'working' ? o.last : 0 }, now, full));
  }
  if (s.github?.length) tray.push(...prBlock(s, full));
  const foot = make('div', 'foot', `${project(s)} · ${short(now - s.started)} old · active ${short(now - s.last)} ago`);
  rows.push(tray.length ? make('div', 'tray', ...tray, foot) : foot);
  return rows;
}

// An agent in the tray. With a task tag (when its step starts "[tag]", a tag some setups put on every step) or a model to
// show, three lines: the live dot (dim once it's been quiet 10 s), the tag as a chip, the model and how long it's run;
// then its job; then its current step. With neither, two: the dot, the job and the time; then the step. A shell command
// left running has "shell" where an agent's model goes, then the command below. The job and step are cut to a line each; a
// click opens the agent to show them in full, and it stays open, by id, through the redraws until the card closes. A
// button, so the keyboard gets it too. Keyed by id, so a redraw keeps each row's element (and its focus) with its agent.
const TAG = /^\[([^\]]+)\]\s*/;
const openAgents = new Set();
/** @param {{ id?: string, job: string, activity?: string, started?: number, last?: number, model?: string }} a */
function agentRow({ id, job, activity = '', started, last = 0, model }, now, full = false) {
  const tag = activity.match(TAG)?.[1], step = activity.replace(TAG, ''), key = id || job;
  const dot = make('span', 'live' + (now - last > 10e3 ? ' quiet' : '')), time = started ? [make('span', 't', short(now - started))] : [];
  const about = [...(tag ? [make('span', 'tag', tag)] : []), ...(model ? [make('span', 'model', model)] : [])], name = make('span', 'job', job);
  const lines = about.length ? [make('span', 'arow', dot, ...about, ...time), name]
    : [make('span', 'arow', dot, name, ...time)]; // nothing to say on a line of its own
  const face = make('span', 'face', ...lines, ...(step ? [make('span', 'astep', step)] : []));
  if (full) return keyed(key, make('div', 'agent open', face)); // the sidebar shows it in full already, so there's nothing to open
  const row = keyed(key, make('button', 'agent' + (openAgents.has(key) ? ' open' : ''), face));
  row.setAttribute('aria-expanded', String(openAgents.has(key)));
  row.onclick = () => { if (!openAgents.delete(key)) openAgents.add(key); renderCard(); };
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
const prOver = { card: '', dock: '' }; // the url of the PR chip under the pointer in each, whose title its header shows
let tipFor = null; // the link #prTip was shown for
// a redraw that took away the link the tip was showing for takes the tip too
function dropTip() { if (!tipFor?.isConnected) $('prTip').classList.remove('show'); }
const rank = (/** @type {string} */ need) => (ORDER.indexOf(need) + 1) || ORDER.length + 1;
function prSummary(prs) {
  const n = {};
  for (const p of prs) n[p.need] = (n[p.need] || 0) + 1;
  return Object.keys(n).sort((a, b) => rank(a) - rank(b)).map(k => `${n[k]} ${k === 'changes' && n[k] === 1 ? 'change requested' : SHORT[k] || k}${k === 'draft' && n[k] > 1 ? 's' : ''}`).join(' · ');
}
function prBlock(s, full = false) {
  // in the sidebar they're listed in full until that pin's own toggle (kept with the pin) turns them into chips
  const pin = full && pinned.find(p => p.id === s.id), cap = full ? Infinity : PR_CAP;
  const prs = [...s.github].sort((a, b) => rank(a.need) - rank(b.need)), open = full ? !pin?.chips : prList[s.id] ?? prs.length <= 3;
  const where = full ? 'dock' : 'card', over = !open && prs.find(p => p.url === prOver[where]), redraw = full ? renderSidebar : renderCard;
  const ph = over ? make('span', 'ph title', over.title) : make('span', 'ph', make('span', 'sum', make('b', '', 'PRs'), ` · ${prSummary(prs)}`));
  const tog = make('button', 'tog'), label = open ? 'Show PRs as chips' : 'List PRs with their titles';
  tog.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>';
  tog.setAttribute('aria-expanded', String(open)); tog.setAttribute('aria-label', label); tog.title = label;
  tog.onclick = () => {
    if (full) return setPins(pinned.map(p => p.id === s.id ? { ...p, chips: open } : p));
    prList[s.id] = !open;
    post('/settings', { prList: { [s.id]: !open } });
    renderCard();
  };
  const dot = need => { const i = make('i'); i.style.background = FLY[need] || FLY.quiet; return i; };
  const head = make('div', 'phead', ph, tog);
  // A PR's title where the card doesn't already show it in full: an overflow link past the cap (a bare number), or a
  // list row whose title is cut short. It's the badges' tooltip (#prTip, outside the redrawn rows so a redraw leaves it
  // be), shown while hovered or focused and placed as a badge's is (tipSpot). A chip names itself in the header instead.
  // The handlers measure the element the event came to: after a redraw that's the live one, not the one built here.
  const titled = (/** @type {HTMLElement} */ a, p, cut = (/** @type {Element} */ _) => true) => {
    a.onpointerenter = a.onfocus = e => {
      const tip = $('prTip'), el = /** @type {HTMLElement} */ (e.currentTarget);
      if (!cut(el)) return;
      tipFor = el;
      tip.textContent = p.title;
      const at = tipSpot(tip, el);
      tip.style.left = `${at.left}px`; tip.style.top = `${at.top}px`;
      tip.classList.add('show');
    };
    a.onpointerleave = a.onblur = () => $('prTip').classList.remove('show');
    return a;
  };
  if (!open) return [head, make('div', 'chips', ...prs.map(p => {
    const a = keyed(p.url, link(p, ''));
    a.append(make('span', 'face', dot(p.need), p.label));
    a.onpointerenter = () => { prOver[where] = p.url; redraw(); };
    a.onpointerleave = () => { prOver[where] = ''; redraw(); };
    return a;
  }))];
  return [head, ...prs.slice(0, cap).map(p => {
    const a = keyed(p.url, link(p, '')), ti = make('span', 'ti', p.title);
    a.className = 'pr2';
    a.append(make('span', 'face', ti, make('span', 'me', dot(p.need), make('b', '', p.label), NEED[p.need] || p.need,
      ...(p.createdAt ? [make('span', 't', short(Date.now() - Date.parse(p.createdAt)))] : [])))); // how long it's been open
    return titled(a, p, el => { const t = el.querySelector('.ti'); return t.scrollWidth > t.clientWidth; });
  }), ...(prs.length > cap ? [make('div', 'more', `${prs.length - cap} more: `, ...prs.slice(cap).map(p => { // the comma after each is its own, so the links touch
      const a = keyed(p.url, link(p, ''));
      a.className = 'ov'; a.append(make('span', 'face', p.label));
      return titled(a, p);
    }))] : [])];
}
// ---- the pinned sidebar ------------------------------------------------------------
// Sessions pinned from their cards show in full, stacked in the order they were pinned (the newest at the bottom, so
// nothing jumps), in one column docked right of the scene, which narrows to make room (fitView follows the scene's size).
// The pins are a setting, so every window agrees and they survive a restart. A pinned session that ends stays in its
// place, dimmed, as this window last saw it, until it's unpinned; a window that never saw it leaves it out. No pinning
// where there's no room: windows under PIN_MIN wide, the iTerm panel and the screensavers.
const PIN_MIN = 800;
/** @type {{ id: string, chips?: boolean }[]} the pinned sessions, oldest first, each with whether its PRs show as chips */
let pinned = [];
const isPinned = (/** @type {string} */ id) => pinned.some(p => p.id === id);
const pinnedLast = new Map(); // id → the session as this window last saw it
const pinnable = () => innerWidth >= PIN_MIN && !document.body.matches('.panel, .screensaver, .ambient');
function pinButton(s) {
  const on = isPinned(s.id), face = make('span', 'face'), b = make('button', 'pin' + (on ? ' on' : ''), face), name = s.title || project(s);
  face.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M10 1l5 5-2 1-3 3 .5 3.5L9 15l-3-3-4 4-1-1 4-4-3-3 1.5-1.5L7 7l3-3z"/></svg>';
  b.setAttribute('aria-label', on ? `Unpin ${name}` : `Pin ${name} to the sidebar`);
  b.title = on ? 'Unpin' : 'Pin to the sidebar';
  b.onclick = () => setPins(on ? pinned.filter(p => p.id !== s.id) : [...pinned, { id: s.id }]);
  return b;
}
// Only the pins this window can show go to the server (the one just pinned is live), so one nobody can see any more
// doesn't linger.
function setPins(/** @type {typeof pinned} */ pins) {
  pinned = pins.filter(p => pinnedLast.has(p.id) || sessions.some(o => o.id === p.id));
  post('/settings', { pinned });
  renderSidebar();
  if (hovered) renderCard(); // its pin shows the change
}
function renderSidebar() {
  dropTip();
  for (const id of pinnedLast.keys()) if (!isPinned(id)) pinnedLast.delete(id);
  for (const o of sessions) if (isPinned(o.id)) pinnedLast.set(o.id, o);
  const ids = pinnable() ? pinned.map(p => p.id).filter(id => pinnedLast.has(id)) : [];
  document.body.classList.toggle('pinned', ids.length > 0);
  $('dock').inert = !ids.length; // out of the tab order and the accessibility tree while closed
  if (!ids.length) return; // ponytail: what it showed stays, so it slides out whole
  const live = new Set(sessions.map(o => o.id));
  // one section per session in the column's scroller (index.html)
  morph($('dock').children[0], ids.map(id => keyed(id, make('section', live.has(id) ? '' : 'ended', ...sessionRows(pinnedLast.get(id), true)))));
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
  // it stays above the footer (in the iTerm panel the footer takes a good share of a short window), as tall as fits there
  const floor = document.querySelector('footer')?.getBoundingClientRect().top ?? innerHeight, most = `${Math.round(floor - 16)}px`;
  if (c.style.maxHeight !== most) c.style.maxHeight = most;
  const a = holdAnchor(zone, p.x, p.y);
  const x = Math.min(a.x + gap, innerWidth - c.offsetWidth - 12), y = a.y + gap + c.offsetHeight > floor - 8 ? a.y - c.offsetHeight - gap : a.y + gap;
  // while the pointer is on it (opening an agent, say), it stays put rather than flipping above its moth, moving up only
  // as far as it must to stay on screen
  const to = { x: Math.max(8, x), y: Math.max(8, Math.min(floor - 8 - c.offsetHeight, shown && c.matches(':hover') ? shown.y : y)) };
  shown = shown ? { x: shown.x + (to.x - shown.x) * 0.2, y: shown.y + (to.y - shown.y) * 0.2 } : to; // a new card starts in place
  c.style.transform = `translate(${shown.x}px, ${shown.y}px)`;
}
