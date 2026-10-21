// The hover card for a moth: its session, what it needs from you, its PRs and agents.

// ---- hover card ------------------------------------------------------------------
const ago = ms => ms < 60e3 ? `${Math.max(0, Math.round(ms / 1e3))}s` : ms < 3600e3 ? `${Math.round(ms / 60e3)} min` : `${Math.floor(ms / 3600e3)}h ${Math.round(ms % 3600e3 / 60e3)}m`;
const project = s => s.cwd.split('/').filter(Boolean).pop() || '(unknown)';
function line(text, cls) { const d = document.createElement('div'); d.textContent = text; if (cls) d.className = cls; return d; }

// What a landed session needs from me: its "You:" line as the TL;DR, with its own links clickable in place, then how
// many questions it asked. PRs are listed separately only when there's no You: line to carry them.
function forYouRows({ you = [], prs = [], questions = [] }) {
  const rows = [], list = document.createElement('ul');
  const link = ({ label, url }, text = label) => {
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = text; a.title = label;
    return a;
  };
  const item = (title, nodes) => {
    const li = document.createElement('li');
    li.append(title);
    nodes.forEach((n, i) => li.append(i ? ', ' : '', n));
    list.append(li);
  };
  if (you.length) {
    const tldr = line('', 'note');
    tldr.append(...you.map(piece => typeof piece === 'string' ? piece : link(piece)));
    rows.push(tldr);
  } else if (prs.length) {
    // PRs read as short numbers, with the repo added only when they come from more than one
    const repos = new Set(prs.map(p => p.url.split('/')[4]));
    item('PRs: ', prs.map(p => link(p, repos.size > 1 ? `${p.url.split('/')[4]}#${p.url.split('/')[6]}` : `#${p.url.split('/')[6]}`)));
  }
  if (questions.length) item(`${questions.length} question${questions.length > 1 ? 's' : ''}`, []);
  if (list.children.length) rows.push(list);
  return rows;
}

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
function hoverZone(target, onClick, cardAt) {
  const zone = { x: 0, y: 0, r: 48, off: false, target, onClick, cardAt };
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
  if (!a) return;
  clearTimeout(hideTimer);
  if (hovered === a.target && (!a.cardAt || a.target.cardAt === a.cardAt)) return; // already showing it
  hovered = a.target; if (a.cardAt) a.target.cardAt = a.cardAt; renderCard();
}
// shift+click does what right-click does (the area's `menu`, where it has one), since right-click isn't obvious
function clickZone(a, shift) { (shift && a?.menu || a?.onClick)?.call(a); clearTimeout(hideTimer); hideCard(); }
// A tap shows the area's card; tapping the same moth again puts it away. (The card's own click runs the action.)
function tapZone(zone) { if (hovered === zone?.target) hideCard(); else enterZone(zone); }
function hideCard() { hovered = held = shown = null; $('card').classList.remove('show'); }

function renderCard() {
  const m = hovered, s = m?.session;
  if (m?.stale) return renderStaleCard(m.stale);
  if (m?.ghost) return renderGhostCard(m.ghost);
  if (!s) return;
  const now = Date.now(), h = document.createElement('h3'), chip = document.createElement('span');
  /** @type {HTMLElement[]} */
  const rows = [h], name = s.title || project(s);
  {
    h.textContent = name;
    chip.textContent = s.reported ? 'reported back' : s.error && s.state === 'waiting' ? 'error' : s.snoozed && s.state === 'waiting' ? (s.forGood ? 'sleeping' : 'snoozed') : { working: 'working', waiting: 'needs you', paused: 'waiting on agents', idle: 'idle' }[s.state] || s.state;
    chip.className = 'chip ' + (s.error && s.state === 'waiting' ? 'error' : s.snoozed && s.state === 'waiting' ? 'idle' : s.state);
    if (s.state !== 'working' && s.note) rows.push(line(s.note, s.state === 'waiting' ? 'note' : ''));
    if (s.state === 'waiting' && s.forYou) rows.push(...forYouRows(s.forYou));
    if (s.github?.length) rows.push(...prRows(s.github));
    if (s.tasks?.length) rows.push(line(`Running: ${s.tasks.join(', ')}`, 'dim'));
    else if (s.activity) rows.push(line(`Now: ${s.activity}`));
    if (s.prompt) rows.push(line(`“${s.prompt.length > 140 ? s.prompt.slice(0, 140) + '…' : s.prompt}”`, 'prompt'));
    const side = sessions.filter(o => o.parent === s.id); // side sessions it started, listed like its agents
    if (side.length) {
      rows.push(line(`Side sessions (${side.length})`, 'agents'));
      for (const o of side) rows.push(line(o.title || project(o), 'agent'), ...(o.activity && o.state === 'working' ? [line(`Now: ${o.activity}`, 'dim')] : o.reported ? [line('Reported back', 'dim')] : []));
    }
    if (s.subagents.length) {
      rows.push(line(`Agents (${s.subagents.length})`, 'agents'));
      for (const a of s.subagents) rows.push(line(a.description || a.type || 'subagent', 'agent'), ...(a.activity ? [line(`Now: ${a.activity}`, 'dim')] : []));
    }
    if (s.forGood) rows.push(line('Sleeping until you wake it', 'dim'));
    else if (s.snoozed && s.state === 'waiting') rows.push(line('Snoozed until it does something new', 'dim'));
    rows.push(line(`${project(s)} · running ${ago(now - s.started)} · active ${ago(now - s.last)} ago`, 'dim'));
  }
  chip.className ||= 'chip';
  h.append(chip);
  $('card').replaceChildren(...rows);
  $('card').classList.add('show');
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
  const to = { x: Math.max(8, x), y: Math.max(8, y) };
  shown = shown ? { x: shown.x + (to.x - shown.x) * 0.2, y: shown.y + (to.y - shown.y) * 0.2 } : to; // a new card starts in place
  c.style.transform = `translate(${shown.x}px, ${shown.y}px)`;
}
