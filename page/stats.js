// The stats panel (Stats in the settings menu): today's numbers from the event log (GET /stats), the day ribbon,
// and the week before as mini ribbons. Hygiene over volume: the headline is how much of the moths' time was warm.

const MIN = 60 * 1000, DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const RIBBON = { warm: WARM.outer, violet: COOL.outer, quiet: '#3A3050', alive: '#7A6A9C', working: '#43365F', mark: '#D8CCE6' };

const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const clock = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// The ribbon's slices for one day: from the first session that day to `end` (now, or the last session's end).
// Each slice blends what overlapped it: how much the app ran, was violet or quiet, and how much moth time was waiting.
// The working band comes from the five-minute gauges (the latest one at the slice's middle), so it's coarser than the rest.
function slices(day, spans, gauges, count) {
  const alive = spans.filter(s => s[0] === 'alive' && s[2] > day.start && s[1] < day.end);
  if (!alive.length) return null;
  const from = Math.max(day.start, Math.min(...alive.map(s => s[1])));
  const to = day.start + 86400000 > Date.now() ? day.end : Math.min(day.end, Math.max(...alive.map(s => s[2])));
  const width = Math.max(2 * MIN, (to - from) / count), out = [];
  const mine = spans.filter(s => s[2] > from && s[1] < to);
  for (let a = from; a < to; a += width) {
    const b = Math.min(to, a + width), mid = (a + b) / 2, cover = {};
    for (const [kind, s, e] of mine) if (s < b && e > a) cover[kind] = (cover[kind] || 0) + Math.min(e, b) - Math.max(s, a);
    const g = gauges.filter(g => g[0] <= mid && g[0] > mid - 6 * MIN).pop();
    out.push({ a, b, ran: (cover.server || 0) / (b - a), violet: (cover.violet || 0) / (b - a), quiet: (cover.quiet || 0) / (b - a),
      alive: (cover.alive || 0) / (b - a), flying: cover.alive ? 1 - (cover.waiting || 0) / cover.alive : null, working: g ? g[2] : null });
  }
  return { from, to, slices: out, starts: alive.filter(s => !s[3] && s[1] >= from).map(s => s[1]) };
}

// Three strips touching: the lantern (warm or violet, quiet dim), the share of moths flying (warm) vs landed (violet),
// and the moths alive with the working ones as a darker band inside. Small ticks on top mark sessions starting.
function ribbon(r, w, h) {
  const top = Math.round(h * .18), mid = Math.round(h * .3), low = h - top - mid - 3, x = t => (t - r.from) / (r.to - r.from) * w;
  const most = Math.max(1, ...r.slices.map(s => Math.max(s.alive, s.working || 0)));
  let svg = '';
  for (const s of r.slices) {
    const x0 = x(s.a), sw = x(s.b) - x0 + .4;
    const lamp = s.ran < .5 ? null : s.quiet > .5 ? RIBBON.quiet : s.violet > .5 ? RIBBON.violet : RIBBON.warm;
    if (lamp) svg += `<rect x="${x0}" y="3" width="${sw}" height="${top}" fill="${lamp}"/>`;
    if (s.flying != null) svg += `<rect x="${x0}" y="${3 + top}" width="${sw}" height="${mid}" fill="${mix(COOL.outer, WARM.outer, s.flying)}"/>`;
    const ah = low * s.alive / most, wh = low * Math.min(s.alive, s.working ?? 0) / most;
    if (ah) svg += `<rect x="${x0}" y="${h - ah}" width="${sw}" height="${ah}" fill="${RIBBON.alive}"/>`;
    if (wh) svg += `<rect x="${x0}" y="${h - wh}" width="${sw}" height="${wh}" fill="${RIBBON.working}"/>`;
  }
  for (const t of r.starts) svg += `<path d="M${x(t)} 0V3" stroke="${RIBBON.mark}" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`;
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" shape-rendering="crispEdges" aria-hidden="true">${svg}</svg>`;
}

// Badges the server gives from the event log (Stats.swift decides when): good ones reward hygiene, and the cheeky
// shame badges sit right beside them. [name, how it's earned, shame?]
const ACHIEVEMENTS = {
  warm_all_day: ['Warm all day', 'The lantern stayed warm nine tenths of a day with sessions running'],
  clean_floor: ['Clean floor', 'An empty graveyard for a whole week'],
  small_batches: ['Small batches', 'Never more than 3 fireflies in flight for a week'],
  revived: ['Revived', 'Brought a dead PR back and merged it'],
  streak_3: ['Warm streak: 3 days', 'Three days in a row at or over your warm moths goal'],
  streak_7: ['Warm streak: a week', 'Seven days in a row at or over your warm moths goal'],
  streak_14: ['Warm streak: two weeks', 'Fourteen days in a row at or over your warm moths goal'],
  streak_30: ['Warm streak: a month', 'Thirty days in a row at or over your warm moths goal'],
  mass_grave: ['Mass Grave', 'The graveyard went over its 30', true],
  light_pollution: ['Light Pollution', '20 or more fireflies in flight', true],
  swarm_season: ['Swarm Season', 'One session owned 10 open PRs', true],
  hive_mind: ['Hive Mind', 'One session ran 10 agents at once', true],
  purple_rain: ['Purple Rain', 'The lantern stayed violet for a whole hour', true],
  ghosted: ['Ghosted', 'A moth waited 3 hours or more', true],
  snooze_champion: ['Snooze Button Champion', 'Snoozed 10 waits in one day', true],
  lights_out: ['Lights Out', 'Two hours with nothing running between sessions', true],
  necromancer: ['Necromancer', 'Revived 5 dead PRs in a week', true],
};
const badge = (id, extra = '') => { const [name, how, shame] = ACHIEVEMENTS[id] || [id, '']; return `<span class="badge${shame ? ' shame' : ''}" title="${how}">${name}${extra}</span>`; };

function renderStats(j) {
  const days = j.days, today = days[days.length - 1], pct = v => v == null ? '–' : `${v}%`;
  const r = slices(today, j.spans, j.gauges, 160);
  const grave = today.graveyard == null ? '–' : today.graveyard + (today.graveyardChange ? ` (${today.graveyardChange > 0 ? '+' : ''}${today.graveyardChange})` : '');
  const nums = [
    ['lantern warm', pct(today.warmLantern), 'time the lantern glowed warm, outside quiet hours'],
    ['answer time', today.medianWait == null ? '–' : ago(today.medianWait), 'median time a moth waited before you answered'],
    ['slowest answers', today.slowWait == null ? '–' : ago(today.slowWait), 'one in ten waits lasted at least this long'],
    ['waits', today.waits, 'times a moth landed on the lantern for you'],
    ['merged', today.merged, 'fireflies that flew home (merged PRs)'],
    ['in flight', today.open ?? '–', 'open PRs your sessions own'],
    ['stale PRs', grave, 'open PRs no session owns and nobody touched for a week, and the change since this morning'],
  ];
  const week = days.slice(0, -1).map(d => {
    const mini = slices(d, j.spans, j.gauges, 48), name = DAY_NAMES[new Date(d.start).getDay()];
    return `<div class="day" title="${mini ? `${clock(mini.from)} to ${clock(mini.to)}` : 'nothing recorded'}"><span>${name}</span>
      ${mini ? ribbon(mini, 120, 26) : '<i class="none"></i>'}<b>${pct(d.warmMoths)}</b></div>`;
  }).join('');
  $('statsBody').innerHTML = `
    <div class="headline">${today.warmMoths == null ? '<span>No moths yet today. Your first session starts the day.</span>'
      : `<b>${today.warmMoths}%</b><span>of moth time today was warm: flying, not waiting on you</span>`}</div>
    ${r ? `<div class="ribbon">${ribbon(r, 600, 50)}</div>
      <div class="axis"><span>${clock(r.from)}</span><span>${today.end >= Date.now() - MIN ? 'now' : clock(r.to)}</span></div>
      <div class="legend"><span><i style="background:${RIBBON.warm}"></i>lantern</span><span><i style="background:linear-gradient(90deg, ${COOL.outer}, ${WARM.outer})"></i>moths flying</span>
        <span><i style="background:${RIBBON.alive}"></i>sessions</span><span><i style="background:${RIBBON.working}"></i>working</span></div>` : ''}
    <dl>${nums.map(([k, v, why]) => `<div title="${why}"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  statsToday = today; renderGoals();
  const shelfOpen = $('statsWeek').querySelector('.shelf')?.open; // the panel redraws every minute; keep the shelf as it was
  $('statsWeek').innerHTML = `
    <h4>The week before</h4>
    <div class="week">${week}</div>
    ${days.slice(0, -1).some(d => d.mothMs) ? '' : '<p class="dim">The lantern started keeping a log recently, so the week fills in as the days go by.</p>'}
    <h4>Badges this week</h4>
    ${j.achievements.length ? `<div class="badges">${j.achievements.slice().reverse().map(([id, day]) =>
      badge(id, ` <small>${day === dayKey(Date.now()) ? 'today' : DAY_NAMES[new Date(day + 'T12:00').getDay()]}</small>`)).join('')}</div>`
      : '<p class="dim">None yet this week. They come from the log as the days go by, the cheeky ones too.</p>'}
    ${j.streak ? `<p class="dim">Warm streak: ${j.streak} day${j.streak === 1 ? '' : 's'} at or over ${j.warmGoal}% warm moths.</p>` : ''}
    <details class="shelf"><summary>All badges</summary><div class="badges">${Object.keys(ACHIEVEMENTS).map(id =>
      j.tally[id] ? badge(id, j.tally[id] > 1 ? ` <small>×${j.tally[id]}</small>` : '') : badge(id).replace('class="badge', 'class="badge unearned')).join('')}</div></details>`;
  if (shelfOpen) $('statsWeek').querySelector('.shelf').open = true;
}

// Goals: a few targets kept in the shared settings, each off until it has a number. Progress is said quietly: a goal
// that's met glows warm, one that isn't just shows where today stands.
let goals = {}, statsToday = null;
const GOALS = {
  fireflies: t => t.open == null ? null : [t.open <= goals.fireflies, `${t.open} now`],
  answer: t => t.medianWait == null ? null : [t.medianWait <= goals.answer * MIN, `median ${ago(t.medianWait)}`],
  warm: t => t.warmMoths == null ? null : [t.warmMoths >= goals.warm, `${t.warmMoths}% today`],
};
function renderGoals() {
  for (const [key, judge] of Object.entries(GOALS)) {
    const input = $('goal-' + key), out = $('goalNow-' + key), set = goals[key] != null;
    if (document.activeElement !== input) input.value = set ? goals[key] : '';
    const [met, now] = set && statsToday && judge(statsToday) || [false, ''];
    out.textContent = !set ? '' : now ? (met ? `on track, ${now}` : now) : 'nothing yet today';
    out.classList.toggle('met', met);
  }
}
function setGoal(key, text) {
  const n = text.trim() === '' ? null : Math.max(0, Number(text));
  if (n !== null && !Number.isFinite(n)) return;
  fetch('/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goals: { [key]: n } }) });
}

async function loadStats() {
  try { renderStats(await (await fetch('/stats')).json()); }
  catch { $('statsBody').innerHTML = '<p class="dim">Couldn’t read the stats. Is the Lantern app running?</p>'; }
}
