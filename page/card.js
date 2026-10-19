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
// click run `onClick` and hide it. `target` is what `hovered` becomes; `cardAt` says which of its areas the card sits beside.
// One set of pointer handlers on #zones (main.js) serves them all, so overlapping areas can split fairly (zoneAt).
const areas = new WeakMap();
function hoverZone(zone, target, onClick, cardAt) {
  areas.set(zone, { target, onClick, cardAt });
  return zone;
}
// Areas can overlap, so a point belongs to the nearest area that contains it: two neighbours split their overlap down the
// middle, whichever is drawn on top. Plain distance, not weighted by radius: weighting would let a flying moth's wide
// area swallow a landed neighbour's own body.
function zoneAt(zones, x, y) {
  let best = null, near = Infinity;
  for (const z of zones) {
    const d = Math.hypot(x - +z.getAttribute('cx'), y - +z.getAttribute('cy'));
    if (d < +z.getAttribute('r') && d < near) [best, near] = [z, d];
  }
  return best;
}
function enterZone(zone) {
  const a = areas.get(zone);
  if (!a) return;
  clearTimeout(hideTimer);
  if (hovered === a.target && (!a.cardAt || a.target.cardAt === a.cardAt)) return; // already showing it
  hovered = a.target; if (a.cardAt) a.target.cardAt = a.cardAt; renderCard();
}
// shift+click does what right-click does (the area's `menu`, where it has one), since right-click isn't obvious
function clickZone(zone, shift) { const a = areas.get(zone); (shift && a?.menu || a?.onClick)?.call(a); clearTimeout(hideTimer); hideCard(); }
function hideCard() { hovered = null; $('card').classList.remove('show'); }

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
    chip.textContent = s.reported ? 'reported back' : s.error && s.state === 'waiting' ? 'error' : s.snoozed && s.state === 'waiting' ? 'snoozed' : { working: 'working', waiting: 'needs you', paused: 'waiting on agents', idle: 'idle' }[s.state] || s.state;
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
    if (s.forGood) rows.push(line('Snoozed for good', 'dim'));
    else if (s.snoozed && s.state === 'waiting') rows.push(line('Snoozed until it does something new', 'dim'));
    rows.push(line(`${project(s)} · running ${ago(now - s.started)} · active ${ago(now - s.last)} ago`, 'dim'));
  }
  chip.className ||= 'chip';
  h.append(chip);
  $('card').replaceChildren(...rows);
  $('card').classList.add('show');
}
function placeCard() {
  if (!hovered) return;
  const pt = document.querySelector('svg').createSVGPoint();
  const zone = hovered.cardAt === 'flies' && hovered.flyZone ? hovered.flyZone : hovered.zone; // beside whichever area was hovered
  pt.x = +zone.getAttribute('cx'); pt.y = +zone.getAttribute('cy');
  const ctm = document.querySelector('svg').getScreenCTM(), p = pt.matrixTransform(ctm), c = $('card');
  const gap = (+zone.getAttribute('r') || 48) * ctm.a * 0.7; // clear of the hover area, which covers the moth
  const x = Math.min(p.x + gap, innerWidth - c.offsetWidth - 12), y = p.y + gap + c.offsetHeight > innerHeight - 8 ? p.y - c.offsetHeight - gap : p.y + gap;
  c.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
}
