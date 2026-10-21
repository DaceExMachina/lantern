// Wiring, run last once everything is defined: the live connection to the server, controls, and the animation clock.

const es = new EventSource('/events');
es.addEventListener('reviews', e => { reviews = JSON.parse(e.data); }); // PRs waiting on my review (GitHub status on)
es.addEventListener('prose', e => { recentProse = JSON.parse(e.data); pagesData = true; }); // words from recent transcripts, for the barrel's pages
es.addEventListener('stale', e => { stalePRs = JSON.parse(e.data); });
es.addEventListener('name', e => { firstName = JSON.parse(e.data); showPencil(); }); // the user's first name, for Jerrett's pencil (pencil.js)
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
  prList = st.prList || {}; // each session's card: its PRs listed or as chips
  pinned = Array.isArray(st.pinned) ? st.pinned : []; // the sessions in the sidebar, in the order they were pinned, with their PR view
  sync(); renderSidebar();
});
// The status keeps to one line: once it has slid all the way left and still doesn't fit, it shrinks to fit, down to
// 9px, and only wraps past that. Text scales with its font size, so one measurement gives the size that fits.
function fitStatus() {
  const st = $('status'), cs = getComputedStyle(st), pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  st.style.fontSize = st.style.whiteSpace = '';
  const fit = (st.clientWidth - pad) / (st.scrollWidth - pad), size = Math.floor(10 * parseFloat(cs.fontSize) * fit) / 10;
  if (fit >= 1) return;
  st.style.fontSize = `${Math.max(9, size)}px`;
  if (size < 9) st.style.whiteSpace = 'normal';
}
new MutationObserver(fitStatus).observe($('status'), { childList: true, subtree: true, characterData: true });
addEventListener('resize', fitStatus);
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
// Not while the page is hidden (a minimised or covered window, a closed panel), since rAF stops then too. Except in the
// screensaver: WebKit can't tell its window is on screen (screensaver/LanternView.swift), so it may say hidden while showing.
const SAVER = Q.has('screensaver');
setInterval(() => document.hidden && !SAVER || lanternTick(), 16);

// Redraw the open card, but not under the pointer (links, a scroll), a finger (a swipe through its body) or keyboard focus.
// Except when its session's state or snooze changes, say from its own pill: then always, so the pill says what it'll do
// next (a same-session redraw keeps the scroll).
let touching = false, drawnAs = '';
setInterval(() => {
  if (!hovered) return;
  const s = hovered.session, as = s ? `${s.id} ${s.state} ${!!s.snoozed} ${!!s.forGood}` : '';
  if (as !== drawnAs || !touching && !$('card').matches(':hover, :has(:focus-visible)')) { drawnAs = as; renderCard(); }
}, 500);
// and the sidebar, under the pointer too, so pins, toggles and state changes show at once (its scroller keeps its scroll
// through a redraw). Except mid-press, since a redraw between press and release swallows the click (WebKit), and while
// a control in it has keyboard focus. It shows or goes as the window crosses PIN_MIN.
setInterval(() => { if (!$('dock').matches(':active, :has(:focus-visible)')) renderSidebar(); }, 500);
addEventListener('resize', renderSidebar);
$('card').addEventListener('touchstart', () => { touching = true; }, { passive: true });
for (const type of ['touchend', 'touchcancel']) $('card').addEventListener(type, () => { touching = false; });
$('card').addEventListener('pointerenter', () => clearTimeout(hideTimer));
// A session's card opens it from its header (card.js), or from a click on its body where the card covers its own moth (a
// tall card in the iTerm panel). The other cards (a stale PR, a ghost) open from anywhere on them.
$('card').addEventListener('click', e => {
  if (hovered && !e.target.closest('a, button') && (!hovered.session || zoneAtPoint(e) === hovered.zone)) clickZone(hovered.zone, e.shiftKey);
});
// every hover area's pointer handling: the area under the pointer is the nearest one that contains it (card.js's zoneAt).
// Only the scene's own pointer events count, never ones on the card, the footer or a menu over it.
const zoneAtPoint = (/** @type {MouseEvent} */ e) => {
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(document.querySelector('svg').getScreenCTM().inverse());
  return zoneAt(zones, p.x, p.y);
};
const zoneFor = (/** @type {MouseEvent} */ e) => (/** @type {Element} */ (e.target)).closest?.('#scene') ? zoneAtPoint(e) : null;
// Touch has no hover, so a tap stands in: it shows the card (tapZone), and tapping the card's header then opens it.
// Taps never run a hover area's click action or hide the card on pointerleave, which a finger lifting would trigger at once.
// A long press reaches snooze through the contextmenu event below.
const isTouch = (/** @type {PointerEvent} */ e) => e.pointerType === 'touch';
// Leaving every area (or the scene) starts the card's grace period, once.
let inZone = false;
const leaveZones = () => { if (inZone) { inZone = false; hideTimer = setTimeout(hideCard, 700); } };
for (const type of ['pointerdown', 'pointermove']) $('scene').addEventListener(type, e => {
  if (isTouch(e)) return;
  const z = zoneFor(e);
  $('scene').style.cursor = z ? 'pointer' : '';
  if (z) { inZone = true; enterZone(z); } else leaveZones();
});
$('scene').addEventListener('pointerleave', e => isTouch(e) || leaveZones());
// A click on an area runs it, and a tap shows its card. It listens on the scene itself: iOS only sends a tap's click to an
// element with a click listener of its own. A tap anywhere else puts the card away.
$('scene').addEventListener('click', e => { const z = zoneFor(e); if (z) isTouch(e) ? tapZone(z) : clickZone(z, e.shiftKey); });
addEventListener('click', e => { if (isTouch(e) && !zoneFor(e) && !(/** @type {Element} */ (e.target)).closest('#card')) hideCard(); });
$('scene').addEventListener('contextmenu', e => zoneFor(e)?.menu?.());
// no browser or web view menu (Reload and friends) anywhere: a right-click that misses a moth does nothing
addEventListener('contextmenu', e => e.preventDefault());
$('card').addEventListener('pointerleave', e => { if (!isTouch(e)) hideTimer = setTimeout(hideCard, 400); });

try { box.checked = localStorage.getItem('lantern-notify') === '1'; } catch {}
box.onchange = () => {
  try { localStorage.setItem('lantern-notify', box.checked ? '1' : '0'); } catch {}
  if (box.checked) { audio ??= new AudioContext(); if (Notification.permission === 'default') Notification.requestPermission(); }
};

// An option's tip (the .tip after its row) docks just above the settings menu at the menu's width, like the recap's session card
// below its panel; with no room above (a short window) it sits at the window's top edge. A pointer over a row or keyboard focus
// in it shows its tip; aria-describedby links each control to its tip for screen readers.
const menu = $('menu');
let tipped = null;
function showTip(/** @type {Event} */ e, on = true) {
  const row = on && e.target instanceof Element ? e.target.closest('#menu > :not(.tip)') : null;
  const tip = row?.nextElementSibling?.matches('.tip') ? /** @type {HTMLElement} */ (row.nextElementSibling) : null;
  if (e.type === 'focusin' && !(/** @type {Element} */ (e.target).matches(':focus-visible'))) return;
  if (tip === tipped) return;
  tipped?.classList.remove('show'); tipped = tip;
  if (!tip) return;
  const r = menu.getBoundingClientRect();
  tip.style.left = `${r.left}px`; tip.style.width = `${r.width}px`;
  tip.style.top = `${Math.max(8, r.top - 8 - tip.offsetHeight)}px`;
  tip.classList.add('show');
}
menu.addEventListener('pointerover', showTip);
menu.addEventListener('focusin', showTip);
menu.addEventListener('pointerleave', e => showTip(e, false));
menu.addEventListener('focusout', e => showTip(e, false));
menu.addEventListener('toggle', e => { if (/** @type {ToggleEvent} */ (e).newState === 'closed') showTip(e, false); });

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
