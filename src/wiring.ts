// Wiring: the live connection to the server, controls, and the animation clock. src/main.ts loads it, and it loads the
// rest of the page.

import { live } from './scene/live';
import { $, Q, post } from './scene/scene';
import { devKey, toggleDevPanel } from './dev';
import { STYLES, applyStyle, isStyleKey, paintRibbon, style } from './scene/lanterns';
import { isReview, isSession, isStalePR, isRecord, isString, isTime, parseJson, parseSettings } from './types';
import { showPencil } from './scene/pencil';
import './scene/github'; // its dev toggle
import { QUIET_FOREVER, quiet, quietEndLabel, sync } from './scene/state';
import { fitView, frame } from './scene/frame';
import { setLanternText } from './scene/pages';
import { clickZone, enterZone, hideCard, renderCard, renderSidebar, tapZone, zoneAt, zones } from './scene/card';
import { MIN } from './scene/stats';
import { maybeRecap } from './scene/recap';
import { flashBadge } from './scene/flash';

const es = new EventSource('/events');
// A named event's data, as text: its JSON goes through a guard or parser (types.ts) before the scene sees it.
const listen = (type: string, handle: (text: string) => void) => es.addEventListener(type, e => {
  const text: unknown = 'data' in e ? e.data : null;
  if (typeof text === 'string') handle(text);
});
const listOf = <T>(text: string, is: (x: unknown) => x is T) => { const v = parseJson(text); return Array.isArray(v) ? v.filter(is) : []; };
listen('reviews', t => { live.reviews = listOf(t, isReview); }); // PRs waiting on my review (GitHub status on)
listen('prose', t => { live.recentProse = listOf(t, isString); live.pagesData = true; }); // words from recent transcripts, for the barrel's pages
listen('stale', t => { live.stalePRs = listOf(t, isStalePR); });
listen('name', t => { const name = parseJson(t); live.firstName = isString(name) ? name : ''; showPencil(); }); // the user's first name, for Jerrett's pencil (pencil.ts)
// a badge just earned (sent once, never on reconnect): the fireflies' flash, except in quiet hours and on the screensavers
listen('badge', t => { const b = parseJson(t); if (isRecord(b) && isString(b['id']) && !quiet() && !document.body.matches('.screensaver, .ambient')) flashBadge(b['id']); });
const PINNED = Q.get('style'); // ?style= previews one lantern, whatever the settings say
let version = ''; // index.html's version on the server: when it changes (an edit, or a restart after one), reload
listen('version', t => { if (version && t !== version) location.reload(); version = t; });
es.onmessage = e => { const text: unknown = e.data; if (typeof text === 'string') { live.raw = listOf(text, isSession); live.pagesData = true; sync(); } };
listen('settings', t => {
  const st = parseSettings(parseJson(t));
  const key = PINNED || st.style;
  if (key && isStyleKey(key) && STYLES[key] !== style) applyStyle(key);
  const quietStarted = live.recapSeen !== null && !quiet() && (st.quietUntil || 0) > Date.now(); // not on the first settings: a reload in quiet hours
  live.quietUntil = st.quietUntil || 0;
  if (isTime(st.quietEnd)) live.quietEnd = st.quietEnd;
  if (isTime(st.dayStart)) live.dayStart = st.dayStart;
  live.quietEndOn = st.quietEndOn !== false;
  paintRibbon(st.ribbon);
  const until = live.quietEndOn ? `until ${quietEndLabel()}` : 'until you press it again';
  $('quiet').title = `Treat everything as snoozed ${until}`;
  setLanternText(st.lanternText === 'off' ? 'off' : 'sessions');
  try { if (st.supervisorPattern) live.supervisor = new RegExp(st.supervisorPattern, 'i'); } catch { console.warn('supervisorPattern in settings.json is not a valid regular expression'); }
  live.recapSeen = [live.recapSeen || '', st.recapSeen || ''].sort().pop() ?? ''; maybeRecap(quietStarted); // the later of ours and the server's
  live.staleOn = st.stale !== false;
  live.prList = st.prList || {}; // each session's card: its PRs listed or as chips
  live.pinned = st.pinned ?? []; // the sessions in the sidebar, in the order they were pinned, with their PR view
  sync(); renderSidebar();
});
// The status keeps to one line: once it has slid all the way left and still doesn't fit, it shrinks to fit, down to
// 9px, and only wraps past that. Text scales with its font size, so one measurement gives the size that fits.
export function fitStatus() {
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
// the dev panel (dev.ts): the backtick key opens and closes it, unless you're typing; ?dev opens it on load
addEventListener('keydown', devKey);
if (Q.has('dev')) toggleDevPanel();

$('quiet').onclick = () => {
  const [h = 0, m = 0] = live.quietEnd.split(':').map(Number), morning = new Date(); morning.setHours(h, m, 0, 0);
  if (morning <= new Date()) morning.setDate(morning.getDate() + 1);
  post('/settings', { quietUntil: quiet() ? 0 : live.quietEndOn ? morning.getTime() : QUIET_FOREVER });
};

paintRibbon('cerulean'); // until the server says which
applyStyle(PINNED && isStyleKey(PINNED) ? PINNED : 'barrel'); // until the server says which lantern is chosen

// The macOS screensaver's web view never fires requestAnimationFrame, so when it goes quiet a timer takes over,
// and the screensaver also calls lanternTick() on its own animation clock. In a normal window rAF runs and these idle.
let rafAt = 0;
const loop = (t: number) => { rafAt = performance.now(); frame(t); requestAnimationFrame(loop); };
requestAnimationFrame(loop);
window.lanternTick = () => { const now = performance.now(); if (now - rafAt > 100) { rafAt = now - 86; frame(now); } }; // at most ~70 fps
// Not while the page is hidden (a minimised or covered window, a closed panel), since rAF stops then too. Except in the
// screensaver: WebKit can't tell its window is on screen (screensaver/LanternView.swift), so it may say hidden while showing.
const SAVER = Q.has('screensaver');
setInterval(() => document.hidden && !SAVER || lanternTick(), 16);

// Redraw the open card and the sidebar twice a second. They're patched in place (card.ts morph), so hover, focus, scroll
// and a press mid-click all survive the redraw. The sidebar shows or goes as the window crosses PIN_MIN.
setInterval(() => { if (live.hovered) renderCard(); renderSidebar(); }, 500);
addEventListener('resize', renderSidebar);
$('card').addEventListener('pointerenter', () => clearTimeout(live.hideTimer));
// A session's card opens it from its header (card.ts), or from a click on its body where the card covers its own moth (a
// tall card in the iTerm panel). The other cards (a stale PR, a ghost) open from anywhere on them.
$('card').addEventListener('click', e => {
  const h = live.hovered;
  if (h && !(e.target instanceof Element && e.target.closest('a, button')) && (!('session' in h && h.session) || zoneAtPoint(e) === h.zone)) clickZone(h.zone, e.shiftKey);
});
// every hover area's pointer handling: the area under the pointer is the nearest one that contains it (card.ts's zoneAt).
// Only the scene's own pointer events count, never ones on the card, the footer or a menu over it.
export const zoneAtPoint = (e: MouseEvent) => {
  const ctm = document.querySelector('svg')?.getScreenCTM();
  if (!ctm) return null;
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
  return zoneAt(zones, p.x, p.y);
};
const zoneFor = (e: MouseEvent) => e.target instanceof Element && e.target.closest('#scene') ? zoneAtPoint(e) : null;
// Touch has no hover, so a tap stands in: it shows the card (tapZone), and tapping the card's header then opens it.
// Taps never run a hover area's click action or hide the card on pointerleave, which a finger lifting would trigger at once.
// A long press reaches snooze through the contextmenu event below.
const isTouch = (e: Event) => 'pointerType' in e && e.pointerType === 'touch';
// Leaving every area (or the scene) starts the card's grace period, once.
let inZone = false;
const leaveZones = () => { if (inZone) { inZone = false; live.hideTimer = setTimeout(hideCard, 700); } };
for (const type of ['pointerdown', 'pointermove'] as const) $('scene').addEventListener(type, e => {
  if (isTouch(e)) return;
  const z = zoneFor(e);
  $('scene').style.cursor = z ? 'pointer' : '';
  if (z) { inZone = true; enterZone(z); } else leaveZones();
});
$('scene').addEventListener('pointerleave', e => isTouch(e) || leaveZones());
// A click on an area runs it, and a tap shows its card. It listens on the scene itself: iOS only sends a tap's click to an
// element with a click listener of its own. A tap anywhere else puts the card away.
$('scene').addEventListener('click', e => { const z = zoneFor(e); if (z) isTouch(e) ? tapZone(z) : clickZone(z, e.shiftKey); });
addEventListener('click', e => { if (isTouch(e) && !zoneFor(e) && !(e.target instanceof Element && e.target.closest('#card'))) hideCard(); });
$('scene').addEventListener('contextmenu', e => zoneFor(e)?.menu?.());
// no browser or web view menu (Reload and friends) anywhere: a right-click that misses a moth does nothing
addEventListener('contextmenu', e => e.preventDefault());
$('card').addEventListener('pointerleave', e => { if (!isTouch(e)) live.hideTimer = setTimeout(hideCard, 400); });

// the daily recap: checked when the window comes back into view, and every minute (a window left open overnight)
addEventListener('visibilitychange', () => maybeRecap());
setInterval(() => maybeRecap(), MIN);
