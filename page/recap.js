// The daily recap: a card over the scene with one day's ribbon, numbers, badges, warm streak, and its sessions as a
// small constellation. It opens by itself when quiet hours start, or as yesterday's recap the first time the lantern
// is looked at the next day (whichever comes first; settings.recapSeen remembers the last day shown, for every
// window), and from the stats panel for any day of the past week.

const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
let recapSeen = null; // the last day (yyyy-MM-dd) a recap opened by itself, once settings say

// One dot per session that day, sized by how long it ran, laid out left to right by when it started (the height is
// its own, from its id), with faint lines joining them in order.
function constellation(day, spans) {
  const runs = new Map();
  for (const [kind, b, e, , id, title] of spans) {
    if (kind !== 'alive' || !id || e <= day.start || b >= day.end) continue;
    const r = runs.get(id) || { id, title, from: b, ms: 0 };
    r.from = Math.min(r.from, b); r.ms += Math.min(e, day.end) - Math.max(b, day.start); r.title ||= title;
    runs.set(id, r);
  }
  const stars = [...runs.values()].sort((a, b) => a.from - b.from);
  if (!stars.length) return '';
  const w = 600, h = 90, from = stars[0].from, to = Math.max(from + 1, stars[stars.length - 1].from);
  const at = stars.map((s, i) => [stars.length === 1 ? w / 2 : 20 + (s.from - from) / (to - from) * (w - 40), 14 + seeded(hash(s.id))() * (h - 28),
    Math.min(9, 1.6 + Math.sqrt(s.ms / MIN) / 2.2), s]);
  const lines = at.slice(1).map(([x, y], i) => `<path d="M${at[i][0]} ${at[i][1]}L${x} ${y}"/>`).join('');
  const dots = at.map(([x, y, r, s]) => `<g><title>${esc(s.title || 'a session')}: ${ago(s.ms)}</title>
    <circle cx="${x}" cy="${y}" r="${r * 2.6}" fill="${WARM.glow}" opacity=".12"/><circle cx="${x}" cy="${y}" r="${r}" fill="${WARM.core}"/></g>`).join('');
  return `<svg class="stars" viewBox="0 0 ${w} ${h}" role="img" aria-label="${stars.length} sessions"><g stroke="${WARM.thread}" stroke-width=".6" opacity=".35" fill="none">${lines}</g>${dots}</svg>`;
}

function renderRecap(j, i) {
  const d = j.days[i], key = dayKey(d.start), isToday = i === j.days.length - 1, pct = v => v == null ? '–' : `${v}%`;
  const title = isToday ? 'Today’s recap' : i === j.days.length - 2 ? 'Yesterday’s recap' : new Date(d.start).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  tally = j.tally;
  const r = slices(d, j.spans, j.gauges, 160), earned = j.achievements.filter(a => a[1] === key);
  const change = d.graveyardChange == null ? '' : d.graveyardChange === 0 ? ', no change' : ` (${d.graveyardChange > 0 ? '+' : ''}${d.graveyardChange})`;
  const nums = [
    ['lantern warm', pct(d.warmLantern)],
    ['answer time', d.medianWait == null ? '–' : ago(d.medianWait)],
    ['fireflies', `${d.merged} merged${d.open == null ? '' : `, ${d.open} open`}`],
    ['stale PRs', d.graveyard == null ? '–' : d.graveyard + change],
  ];
  $('recap').innerHTML = `<h3>${title} <button class="close" aria-label="Close">×</button></h3>
    ${d.warmMoths == null ? '<p class="dim">No moths that day. A quiet one.</p>' : `
      <div class="headline"><b>${d.warmMoths}%</b><span>of moth time was warm</span></div>
      ${r ? `<div class="ribbon">${ribbon(r, 600, 50)}</div><div class="axis"><span>${clock(r.from)}</span><span>${isToday ? 'now' : clock(r.to)}</span></div>` : ''}
      <dl>${nums.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      ${constellation(d, j.spans)}`}
    ${earned.length ? `<div class="badges">${earned.map(([id]) => badge(id)).join('')}</div>` : ''}
    ${j.streak ? `<p class="dim">Warm streak: ${j.streak} day${j.streak === 1 ? '' : 's'} at or over ${j.warmGoal}% warm moths.</p>` : ''}`;
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
