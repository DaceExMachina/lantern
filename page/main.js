// Wiring, run last once everything is defined: the live connection to the server, controls, and the animation clock.

addEventListener('resize', fitView);
const es = new EventSource('/events');
es.addEventListener('reviews', e => { reviews = JSON.parse(e.data); }); // PRs waiting on my review (GitHub status on)
es.addEventListener('graveyard', e => { graveyard = JSON.parse(e.data); });
let version; // index.html's version on the server: when it changes (an edit, or a restart after one), reload
es.addEventListener('version', e => { if (version && e.data !== version) location.reload(); version = e.data; });
es.onmessage = e => { raw = JSON.parse(e.data); sync(); };
es.addEventListener('settings', e => {
  const st = JSON.parse(e.data);
  if (STYLES[st.style] && STYLES[st.style] !== style) applyStyle(st.style);
  quietUntil = st.quietUntil || 0;
  usingGh = !!st.github; renderGitHub();
  graveyardOn = st.graveyard !== false; $('graveToggle').checked = graveyardOn;
  goals = st.goals || {}; renderGoals();
  sync();
});
setInterval(sync, 60 * 1000); // notice when quiet hours end and tick the warm counter, even with nothing else happening
es.onerror = () => { $('status').textContent = 'server offline, retrying…'; $('status').className = 'offline'; };

// the iTerm2 toolbelt opens the page with ?panel for a compact layout, the screensaver with ?screensaver
for (const mode of ['panel', 'screensaver', 'ambient']) if (new URLSearchParams(location.search).has(mode)) document.body.classList.add(mode);
fitView();

$('quiet').onclick = () => {
  const morning = new Date(); morning.setHours(8, 0, 0, 0);
  if (morning <= new Date()) morning.setDate(morning.getDate() + 1);
  fetch('/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quietUntil: quiet() ? 0 : morning.getTime() }) });
};

es.addEventListener('github', e => { github = JSON.parse(e.data); renderGitHub(); });

$('graveToggle').onchange = e => {
  graveyardOn = e.target.checked;
  fetch('/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ graveyard: graveyardOn }) });
};

// lantern picker
for (const [key, st] of Object.entries(STYLES)) $('style').append(new Option(st.name, key, false, st === style));
$('style').onchange = e => {
  applyStyle(e.target.value);
  fetch('/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ style: e.target.value }) });
};
applyStyle('barrel'); // until the server says which lantern is chosen

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

// the stats panel takes the settings menu's place (opened from script, so it isn't nested in the menu and closing the
// menu leaves it open); it reads the log when it opens, and again every minute while it stays open
$('statsButton').onclick = () => { $('menu').hidePopover(); $('stats').showPopover(); };
let statsTimer;
for (const key of Object.keys(GOALS)) $('goal-' + key).onchange = e => setGoal(key, e.target.value);
$('stats').addEventListener('toggle', e => {
  clearInterval(statsTimer);
  if (e.newState === 'open') { loadStats(); statsTimer = setInterval(loadStats, MIN); }
});
