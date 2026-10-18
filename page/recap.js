// The daily recap: a card over the scene with one day's ribbon, numbers, badges, warm streak, and its sessions as a
// small constellation. It opens by itself when quiet hours start, or as yesterday's recap the first time the lantern
// is looked at the next day (whichever comes first; settings.recapSeen remembers the last day shown, for every
// window), and from the stats panel for any day of the past week.

const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
let recapSeen = null; // the last day (yyyy-MM-dd) a recap opened by itself, once settings say

// Each session alive that day, from the log: when it ran, how long it waited on me (snoozed waits too, as in warm
// moths), how much of that was snoozed, how many waits began that day and the longest, and what its PRs did.
function daySessions(day, spans, prs) {
  const runs = new Map(), clip = (b, e) => Math.max(0, Math.min(e, day.end) - Math.max(b, day.start));
  for (const [kind, b, e, , id, title, project] of spans) {
    if (!id || e <= day.start || b >= day.end) continue;
    if (!runs.has(id)) runs.set(id, { id, from: Infinity, to: 0, ms: 0, waitMs: 0, snoozedMs: 0, waits: 0, longest: 0, prs: new Map() });
    const r = runs.get(id), ms = clip(b, e);
    if (kind === 'alive') { r.from = Math.min(r.from, Math.max(b, day.start)); r.to = Math.max(r.to, Math.min(e, day.end)); r.ms += ms; r.title ||= title; r.project ||= project; }
    if (kind === 'waiting') { r.waitMs += ms; r.longest = Math.max(r.longest, ms); if (b >= day.start) r.waits++; }
    if (kind === 'snoozed') r.snoozedMs += ms;
  }
  for (const [t, id, url, change, need, title] of prs) {
    const r = t >= day.start && t < day.end && url && runs.get(id);
    if (r) r.prs.set(url, { url, label: `#${url.split('/')[6]}`, need: need ?? change, title: title || r.prs.get(url)?.title || '' });
  }
  return [...runs.values()].filter(r => r.ms > 0).map(r => ({ ...r, warm: 1 - Math.min(1, r.waitMs / r.ms) })).sort((a, b) => a.from - b.from);
}

// One dot per session that day, sized by how long it ran, laid out left to right by when it started, on the ribbon's
// time axis (`from` to `to`, so each dot sits over its start and the hover line runs through both), and top to bottom
// by how warm it ran (the share of its time not waiting on me), tinted from the working moth's colour to the waiting
// one's by the same share. Faint lines join them in order.
function constellation(stars, from, to) {
  if (!stars.length) return '';
  const w = 600, h = 90;
  const at = stars.map(s => [Math.max(0, s.from - from) / (to - from) * w, 14 + (1 - s.warm) * (h - 28),
    Math.min(9, 1.6 + Math.sqrt(s.ms / MIN) / 2.2), mix(MOTHS.waiting, MOTHS.working, s.warm)]);
  const lines = at.slice(1).map(([x, y], i) => `<path d="M${at[i][0]} ${at[i][1]}L${x} ${y}"/>`).join('');
  const dots = at.map(([x, y, r, fill], i) => `<g class="star" data-i="${i}" tabindex="0" aria-label="${esc(stars[i].title || 'a session')}">
    <circle cx="${x}" cy="${y}" r="${Math.max(r * 2.6, 9)}" fill="${fill}" opacity=".12"/><circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/></g>`).join('');
  return `<div class="starsBox"><svg class="stars" viewBox="0 0 ${w} ${h}" role="img" aria-label="${stars.length} sessions"><g stroke="${WARM.thread}" stroke-width=".6" opacity=".35" fill="none">${lines}</g>${dots}</svg><i class="cursor" hidden></i></div>`;
}

// A session's day, as a card like a moth's, docked just below the recap (or above it when a short window has no room
// below), so it never covers the ribbon or the constellation. Its facts sit on the left and its PRs on the right, with
// rows reserved for six of them, so it keeps one height from session to session. Hovering a star shows its card, and
// moving to another switches it; a click or tap pins it (the star is ringed) so the pointer can go down to its links,
// until the same star, empty space or Escape unpins it. `ongoing` is today's last moment, so a session still running
// ends "now".
let recapStars = [], recapOngoing = 0, pickedStar = null, starTimer;
function showStar(i) {
  clearTimeout(starTimer);
  const root = $('recap');
  for (const g of root.querySelectorAll('.stars .star')) g.classList.toggle('picked', +g.dataset.i === pickedStar);
  let card = root.querySelector('.starCard');
  if (i == null) return card?.classList.remove('show');
  if (!card) { card = document.createElement('div'); card.className = 'starCard'; card.setAttribute('role', 'status'); root.append(card); }
  const s = recapStars[i], h = document.createElement('h3'), facts = document.createElement('div'), prs = document.createElement('div');
  const name = s.title || s.project || 'A session';
  if (sessions.some(o => o.id === s.id)) { // still alive: its title goes to its terminal, like clicking its moth
    const go = document.createElement('button');
    go.className = 'link'; go.textContent = name; go.title = 'Go to this session';
    go.onclick = () => post('/focus', { id: s.id });
    h.append(go);
  } else h.textContent = name;
  facts.append(
    line(`${clock(s.from)} to ${s.to >= recapOngoing - MIN ? 'now' : clock(s.to)}, ran ${ago(s.ms)}`),
    line(`${Math.round(100 * s.warm)}% warm: ${ago(s.ms - s.waitMs)} not waiting, ${ago(s.waitMs - s.snoozedMs)} waiting, ${ago(s.snoozedMs)} snoozed`),
    line(s.waits ? `Waited on you ${s.waits === 1 ? 'once' : `${s.waits} times`}, the longest ${ago(s.longest)}` : 'Never waited on you', 'dim'),
    // ponytail: the log keeps Claude's folder name for the project, so a dash in a real folder name reads as a slash
    ...(s.project ? [line(String(s.project).replace(/-/g, '/').replace(/^\/Users\/[^/]+/, '~'), 'dim')] : []));
  prs.append(...(s.prs.size ? prRows([...s.prs.values()]).slice(0, 7) : [line('No PRs that day', 'dim')]), // the heading and six
    ...(s.prs.size > 6 ? [line(`and ${s.prs.size - 6} more`, 'dim')] : []));
  card.replaceChildren(h, facts, prs);
  const r = root.getBoundingClientRect(), below = r.bottom + 8;
  card.style.left = `${r.left}px`; card.style.width = `${r.width}px`;
  card.style.top = `${below + card.offsetHeight <= innerHeight - 8 || r.top - 8 - card.offsetHeight < 8 ? below : r.top - 8 - card.offsetHeight}px`;
  card.classList.add('show');
}
function followStars(stars, ongoing) {
  recapStars = stars; recapOngoing = ongoing; pickedStar = null;
  for (const g of $('recap').querySelectorAll('.stars .star')) {
    const i = +g.dataset.i, pick = () => { pickedStar = pickedStar === i ? null : i; showStar(i); };
    g.addEventListener('pointerenter', () => { if (pickedStar == null) showStar(i); });
    g.addEventListener('focus', () => { if (pickedStar == null) showStar(i); });
    g.addEventListener('click', pick);
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    // a moment's grace, so crossing from one star to the next doesn't flash the card away
    g.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && pickedStar == null) starTimer = setTimeout(() => showStar(null), 150); });
    g.addEventListener('blur', () => { if (pickedStar == null) showStar(null); });
  }
}
// empty space or Escape unpins (Escape then leaves the recap open)
const unpinStar = () => { pickedStar = null; showStar(null); };
$('recap').addEventListener('pointerdown', e => { if (!e.target.closest?.('.star, .starCard')) unpinStar(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && pickedStar != null && $('recap').matches(':popover-open')) { e.preventDefault(); e.stopPropagation(); unpinStar(); }
}, true);

function renderRecap(j, i) {
  const d = j.days[i], key = dayKey(d.start), isToday = i === j.days.length - 1, pct = v => v == null ? '–' : `${v}%`;
  const title = isToday ? 'Today’s recap' : i === j.days.length - 2 ? 'Yesterday’s recap' : new Date(d.start).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  tally = j.tally;
  const r = slices(d, j.spans, j.gauges, 160), earned = j.achievements.filter(a => a[1] === key), stars = daySessions(d, j.spans, j.prs);
  const change = d.staleChange == null ? '' : d.staleChange === 0 ? ', no change' : ` (${d.staleChange > 0 ? '+' : ''}${d.staleChange})`;
  const nums = [
    ['lantern warm', pct(d.warmLantern)],
    ['answer time', d.medianWait == null ? '–' : ago(d.medianWait)],
    ['fireflies', `${d.merged} merged${d.open == null ? '' : `, ${d.open} open`}`],
    ['stale PRs', d.stale == null ? '–' : d.stale + change],
  ];
  $('recap').innerHTML = `<h3>${title} <button class="close" aria-label="Close">×</button></h3>
    ${d.warmMoths == null ? '<p class="dim">No moths that day. A quiet one.</p>' : `
      <div class="headline"><b>${d.warmMoths}%</b><span>of moth time was warm</span></div>
      ${r ? dayRibbon(r, isToday ? 'now' : clock(r.to)) : ''}
      <dl>${nums.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      ${r ? constellation(stars, r.from, r.to) : ''}`}
    ${earned.length ? `<div class="badges">${earned.map(([id]) => badge(id)).join('')}</div>` : ''}
    ${j.streak ? `<p class="dim">Warm streak: ${j.streak} day${j.streak === 1 ? '' : 's'} at or over ${j.warmGoal}% warm moths.</p>` : ''}`;
  const box = $('recap').querySelector('.dayRibbon');
  if (box) followRibbon(box, r, d);
  followStars(stars, d.end);
  $('recap').querySelector('.close').onclick = () => $('recap').hidePopover();
  return d;
}

// Shows day `i` of /stats (the last one is today). `auto` is the lantern opening it by itself: it marks the day as
// seen for every window, and says so in a notification when "notify me" is on.
async function openRecap(i, auto = false) {
  const j = await (await fetch('/stats')).json(), d = j.days[i];
  const isToday = i === j.days.length - 1;
  if (auto) {
    if (d.warmMoths == null && isToday) return false; // quiet hours on a day with no moths yet: yesterday's can still come
    post('/settings', { recapSeen: dayKey(d.start) });
    if (d.warmMoths == null) return false; // nothing to recap: just remember it was considered
  }
  renderRecap(j, i);
  $('stats').hidePopover();
  $('recap').showPopover();
  if (auto && box.checked && Notification.permission === 'granted') {
    const badges = j.achievements.filter(a => a[1] === dayKey(d.start)).length;
    new Notification(`Lantern: ${isToday ? 'today' : 'yesterday'}`, { body: `${d.warmMoths}% warm moths${badges ? `, ${badges} badge${badges === 1 ? '' : 's'}` : ''}`, silent: true });
  }
  return true;
}

// Yesterday's recap, the first time this window is looked at on a new day, unless a recap since then was shown; today's
// when quiet hours start. Only the full window does this (not the iTerm panel or a screensaver), and only once settings
// have said what was seen.
function maybeRecap(quietStarted = false) {
  if (document.body.matches('.panel, .screensaver, .ambient') || document.hidden || recapSeen === null) return;
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const today = dayKey(Date.now()), [i, day] = quietStarted && recapSeen < today ? [7, today] : [6, dayKey(yesterday.getTime())];
  if (recapSeen >= day) return;
  const was = recapSeen;
  recapSeen = day; // before the fetch, so a second check meanwhile doesn't open it again
  openRecap(i, true).then(shown => { if (!shown && i === 7) recapSeen = was; }, () => { recapSeen = was; });
}
