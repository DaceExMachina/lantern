// Wiring, run last once everything is defined: the live connection to the server, controls, and the animation clock.

addEventListener('resize', fitView);
const es = new EventSource('/events');
es.addEventListener('reviews', e => { reviews = JSON.parse(e.data); }); // PRs waiting on my review (GitHub status on)
es.addEventListener('prose', e => { recentProse = JSON.parse(e.data); pagesData = true; }); // words from recent transcripts, for the barrel's pages
es.addEventListener('graveyard', e => { stalePRs = JSON.parse(e.data); }); // the server calls them the graveyard
const PINNED = new URLSearchParams(location.search).get('style'); // ?style= previews one lantern, whatever the settings say
let version; // index.html's version on the server: when it changes (an edit, or a restart after one), reload
es.addEventListener('version', e => { if (version && e.data !== version) location.reload(); version = e.data; });
es.onmessage = e => { raw = JSON.parse(e.data); pagesData = true; sync(); };
es.addEventListener('settings', e => {
  const st = JSON.parse(e.data);
  const key = PINNED || st.style;
  if (STYLES[key] && STYLES[key] !== style) applyStyle(key);
  const quietStarted = recapSeen !== null && !quiet() && (st.quietUntil || 0) > Date.now(); // not on the first settings: a reload in quiet hours
  quietUntil = st.quietUntil || 0;
  if (/^\d{1,2}:\d{2}$/.test(st.quietEnd || '')) quietEnd = st.quietEnd;
  const until = quietEndLabel();
  $('quiet').title = `Treat everything as snoozed until ${until}`;
  $('quietUntil').textContent = until;
  setLanternText(st.lanternText === 'off' ? 'off' : 'sessions'); $('textToggle').checked = lanternText !== 'off';
  try { if (st.supervisorPattern) supervisor = new RegExp(st.supervisorPattern, 'i'); } catch { console.warn('supervisorPattern in settings.json is not a valid regular expression'); }
  recapSeen = [recapSeen || '', st.recapSeen || ''].sort().pop(); maybeRecap(quietStarted); // the later of ours and the server's
  usingGh = !!st.github; renderGitHub();
  staleOn = st.graveyard !== false; $('staleToggle').checked = staleOn;
  goals = st.goals || {}; renderGoals();
  sync();
});
setInterval(sync, 60 * 1000); // notice when quiet hours end and tick the warm counter, even with nothing else happening
es.onerror = () => { $('status').textContent = 'server offline, retrying…'; $('status').className = 'offline'; };

// the iTerm2 toolbelt opens the page with ?panel for a compact layout, the screensaver with ?screensaver
for (const mode of ['panel', 'screensaver', 'ambient']) if (new URLSearchParams(location.search).has(mode)) document.body.classList.add(mode);
fitView();

$('quiet').onclick = () => {
  const [h, m] = quietEnd.split(':').map(Number), morning = new Date(); morning.setHours(h, m, 0, 0);
  if (morning <= new Date()) morning.setDate(morning.getDate() + 1);
  fetch('/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quietUntil: quiet() ? 0 : morning.getTime() }) });
};

es.addEventListener('github', e => { github = JSON.parse(e.data); renderGitHub(); });

$('textToggle').onchange = e => {
  setLanternText(e.target.checked ? 'sessions' : 'off');
  fetch('/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lanternText: lanternText }) });
};
$('staleToggle').onchange = e => {
  staleOn = e.target.checked;
  fetch('/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ graveyard: staleOn }) });
};

// lantern picker
for (const [key, st] of Object.entries(STYLES)) $('style').append(new Option(st.name, key, false, st === style));
$('style').onchange = e => {
  applyStyle(e.target.value);
  fetch('/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ style: e.target.value }) });
};
applyStyle(STYLES[PINNED] ? PINNED : 'barrel'); // until the server says which lantern is chosen

// The macOS screensaver's web view never fires requestAnimationFrame, so when it goes quiet a timer takes over,
// and the screensaver also calls lanternTick() on its own animation clock. In a normal window rAF runs and these idle.
let rafAt = 0;
const loop = t => { rafAt = performance.now(); frame(t); requestAnimationFrame(loop); };
requestAnimationFrame(loop);
window.lanternTick = () => { const now = performance.now(); if (now - rafAt > 100) { rafAt = now - 86; frame(now); } }; // at most ~70 fps
setInterval(lanternTick, 16);

setInterval(() => hovered && !$('card').matches(':hover') && renderCard(), 500); // don't redraw links under the pointer
$('card').addEventListener('pointerenter', () => clearTimeout(hideTimer));
$('card').addEventListener('click', e => { if (hovered && !e.target.closest('a')) hovered.zone.dispatchEvent(new MouseEvent('click')); });
$('card').addEventListener('pointerleave', () => { hideTimer = setTimeout(() => { hovered = null; $('card').classList.remove('show'); }, 400); });

try { box.checked = localStorage.getItem('lantern-notify') === '1'; } catch {}
box.onchange = () => {
  try { localStorage.setItem('lantern-notify', box.checked ? '1' : '0'); } catch {}
  if (box.checked) { audio ??= new AudioContext(); if (Notification.permission === 'default') Notification.requestPermission(); }
};

// the stats panel reads the log when it opens, and again every minute while it stays open
let statsTimer;
for (const key of Object.keys(GOALS)) $('goal-' + key).onchange = e => setGoal(key, e.target.value);
$('stats').addEventListener('toggle', e => {
  clearInterval(statsTimer);
  if (e.newState === 'open') { loadStats(); statsTimer = setInterval(loadStats, MIN); }
});

// the daily recap: checked when the window comes back into view, and every minute (a window left open overnight)
addEventListener('visibilitychange', () => maybeRecap());
setInterval(() => maybeRecap(), MIN);
$('todayRecap').onclick = () => openRecap(7);
$('statsWeek').addEventListener('click', e => { const day = e.target.closest('.day'); if (day && day.dataset.day) openRecap(+day.dataset.day); });
