// Wiring, run last once everything is defined: the live connection to the server, controls, and the animation clock.

addEventListener('resize', fitView);
const es = new EventSource('/events');
es.addEventListener('reviews', e => { reviews = JSON.parse(e.data); }); // PRs waiting on my review (GitHub status on)
es.addEventListener('prose', e => { recentProse = JSON.parse(e.data); pagesData = true; }); // words from recent transcripts, for the barrel's pages
es.addEventListener('stale', e => { stalePRs = JSON.parse(e.data); });
// a badge just earned (sent once, never on reconnect): the fireflies' flash, except in quiet hours and on the screensavers
es.addEventListener('badge', e => { if (!quiet() && !document.body.matches('.screensaver, .ambient')) flashBadge(JSON.parse(e.data).id); });
const PINNED = Q.get('style'); // ?style= previews one lantern, whatever the settings say
let version; // index.html's version on the server: when it changes (an edit, or a restart after one), reload
es.addEventListener('version', e => { if (version && e.data !== version) location.reload(); version = e.data; });
es.onmessage = e => { raw = JSON.parse(e.data); pagesData = true; sync(); };
es.addEventListener('settings', e => {
  const st = JSON.parse(e.data);
  const key = PINNED || st.style;
  if (STYLES[key] && STYLES[key] !== style) applyStyle(key);
  const quietStarted = recapSeen !== null && !quiet() && (st.quietUntil || 0) > Date.now(); // not on the first settings: a reload in quiet hours
  quietUntil = st.quietUntil || 0;
  const isTime = /^\d{1,2}:\d{2}$/, hhmm = s => s.padStart(5, '0');
  if (isTime.test(st.quietEnd || '')) quietEnd = st.quietEnd;
  if (isTime.test(st.dayStart || '')) dayStart = st.dayStart;
  $('quietEnd').value = hhmm(quietEnd); $('dayStart').value = hhmm(dayStart);
  if (isTime.test(st.quietFrom || '')) $('quietFrom').value = hhmm(st.quietFrom);
  showSwitch($('quietFromRow'), isTime.test(st.quietFrom || ''));
  quietEndOn = st.quietEndOn !== false; showSwitch($('quietEndRow'), quietEndOn);
  paintRibbon(st.ribbon);
  const until = quietEndOn ? `until ${quietEndLabel()}` : 'until you press it again';
  $('quiet').title = `Treat everything as snoozed ${until}`;
  $('quietUntil').textContent = until;
  setLanternText(st.lanternText === 'off' ? 'off' : 'sessions'); $('textToggle').checked = lanternText !== 'off';
  try { if (st.supervisorPattern) supervisor = new RegExp(st.supervisorPattern, 'i'); } catch { console.warn('supervisorPattern in settings.json is not a valid regular expression'); }
  recapSeen = [recapSeen || '', st.recapSeen || ''].sort().pop(); maybeRecap(quietStarted); // the later of ours and the server's
  usingGh = !!st.github; renderGitHub();
  staleOn = st.stale !== false; $('staleToggle').checked = staleOn;
  sync();
});
setInterval(sync, 60 * 1000); // notice when quiet hours end and tick the warm counter, even with nothing else happening
es.onerror = () => {
  $('status').textContent = 'server offline, retrying…'; $('status').className = 'offline';
  // WebKit can give up on the stream for good (e.g. while the app restarts); start over once the server is back
  if (es.readyState === EventSource.CLOSED) setTimeout(() => location.reload(), 3000);
};

// the iTerm2 toolbelt opens the page with ?panel for a compact layout, the screensaver with ?screensaver
for (const mode of ['panel', 'screensaver', 'ambient']) if (Q.has(mode)) document.body.classList.add(mode);
fitView();
// the dev panel (dev.js): the backtick key opens and closes it, unless you're typing; ?dev opens it on load
addEventListener('keydown', devKey);
if (Q.has('dev')) toggleDevPanel();

$('quiet').onclick = () => {
  const [h, m] = quietEnd.split(':').map(Number), morning = new Date(); morning.setHours(h, m, 0, 0);
  if (morning <= new Date()) morning.setDate(morning.getDate() + 1);
  post('/settings', { quietUntil: quiet() ? 0 : quietEndOn ? morning.getTime() : QUIET_FOREVER });
};

es.addEventListener('github', e => { github = JSON.parse(e.data); renderGitHub(); });

$('textToggle').onchange = e => {
  setLanternText(e.target.checked ? 'sessions' : 'off');
  post('/settings', { lanternText });
};
// times of day: quiet from and quiet until (each switched off or on, with a time), and the day rollover
for (const id of ['quietFrom', 'quietEnd', 'dayStart']) $(id).onchange = e => e.target.value && post('/settings', { [id]: e.target.value });
function showSwitch(row, on) {
  row.querySelector('input').disabled = !on;
  for (const b of row.querySelectorAll('.pill button')) b.setAttribute('aria-pressed', String(!!b.dataset.on === on));
}
for (const b of document.querySelectorAll('#menu .pill button')) /** @type {HTMLButtonElement} */ (b).onclick = () => {
  const row = b.closest('.switch'), on = !!/** @type {HTMLButtonElement} */ (b).dataset.on;
  showSwitch(row, on);
  post('/settings', row.id === 'quietFromRow' ? { quietFrom: on ? $('quietFrom').value || '22:00' : null } : { quietEndOn: on });
};
for (const name of Object.keys(RIBBONS)) {
  const b = document.createElement('button');
  b.dataset.name = name; b.title = name; b.setAttribute('aria-label', `${name} ribbon`); b.style.setProperty('--c', RIBBONS[name][0]);
  b.onclick = () => { paintRibbon(name); post('/settings', { ribbon: name }); };
  $('ribbons').append(b);
}
paintRibbon('cerulean'); // until the server says which
$('staleToggle').onchange = e => {
  staleOn = e.target.checked;
  post('/settings', { stale: staleOn });
};

// lantern picker
for (const [key, st] of Object.entries(STYLES)) $('style').append(new Option(st.name, key, false, st === style));
$('style').onchange = e => {
  applyStyle(e.target.value);
  post('/settings', { style: e.target.value });
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
$('card').addEventListener('click', e => { if (hovered && !e.target.closest('a')) clickZone(hovered.zone, e.shiftKey); });
// every hover area's pointer handling: the area under the pointer is the nearest one that contains it (card.js's zoneAt)
const zoneFor = (/** @type {MouseEvent} */ e) => {
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform($('zones').getScreenCTM().inverse());
  return zoneAt([...$('zones').children].filter(z => z instanceof SVGElement && z.style.display !== 'none' && z.style.pointerEvents !== 'none'), p.x, p.y);
};
for (const type of ['pointerdown', 'pointermove']) $('zones').addEventListener(type, e => enterZone(zoneFor(e)));
$('zones').addEventListener('pointerleave', () => { hideTimer = setTimeout(hideCard, 700); });
$('zones').addEventListener('click', e => { const z = zoneFor(e); if (z) clickZone(z, e.shiftKey); });
$('zones').addEventListener('contextmenu', e => areas.get(zoneFor(e))?.menu?.());
// no browser or web view menu (Reload and friends) anywhere: a right-click that misses a moth does nothing
addEventListener('contextmenu', e => e.preventDefault());
$('card').addEventListener('pointerleave', () => { hideTimer = setTimeout(hideCard, 400); });

try { box.checked = localStorage.getItem('lantern-notify') === '1'; } catch {}
box.onchange = () => {
  try { localStorage.setItem('lantern-notify', box.checked ? '1' : '0'); } catch {}
  if (box.checked) { audio ??= new AudioContext(); if (Notification.permission === 'default') Notification.requestPermission(); }
};

// the stats panel reads the log when it opens, and again every minute while it stays open
let statsTimer;
$('stats').addEventListener('toggle', e => {
  clearInterval(statsTimer);
  if (e.newState === 'open') { loadStats(); statsTimer = setInterval(loadStats, MIN); }
});

// the daily recap: checked when the window comes back into view, and every minute (a window left open overnight)
addEventListener('visibilitychange', () => maybeRecap());
setInterval(() => maybeRecap(), MIN);
$('todayRecap').onclick = () => openRecap(7);
$('statsWeek').addEventListener('click', e => { const day = e.target.closest('.day'); if (day && day.dataset.day) openRecap(+day.dataset.day); });
