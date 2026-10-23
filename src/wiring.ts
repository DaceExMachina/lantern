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
import { clickZone, enterZone, expandCard, hideCard, zoneAt, zones } from './scene/card';
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
  sync();
});
setInterval(sync, 60 * 1000); // notice when quiet hours end, even with nothing else happening
es.onerror = () => {
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

$('card').addEventListener('pointerenter', () => clearTimeout(live.hideTimer));
// every hover area's pointer handling: the area under the pointer is the nearest one that contains it (card.ts's zoneAt).
// Only the scene's own pointer events count, never ones on the card, the footer or a menu over it.
export const zoneAtPoint = (e: MouseEvent) => {
  const ctm = document.querySelector('svg')?.getScreenCTM();
  if (!ctm) return null;
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
  return zoneAt(zones, p.x, p.y);
};
const zoneFor = (e: MouseEvent) => e.target instanceof Element && e.target.closest('#scene') ? zoneAtPoint(e) : null;
// Touch has no hover, so a tap stands in: it expands the area's card, as a click does.
// Taps never hide the card on pointerleave, which a finger lifting would trigger at once.
// A long press reaches snooze through the contextmenu event below.
const isTouch = (e: Event) => 'pointerType' in e && e.pointerType === 'touch';
// Leaving every area (or the scene, or the card) starts the card's grace period, once: an expanded card waits EXPANDED_GRACE
// for the pointer to come back to it or its moth; a compact hover card, a tooltip, goes at once. While a card is expanded, other moths don't take it over on hover.
const EXPANDED_GRACE = 2000;
const hideSoon = (hoverMs: number) => { clearTimeout(live.hideTimer); live.hideTimer = setTimeout(hideCard, live.expanded ? EXPANDED_GRACE : hoverMs); };
let inZone = false;
const leaveZones = () => { if (inZone) { inZone = false; hideSoon($('card').matches('.compact') ? 0 : 700); } };
for (const type of ['pointerdown', 'pointermove'] as const) $('scene').addEventListener(type, e => {
  if (isTouch(e)) return;
  const z = zoneFor(e);
  $('scene').style.cursor = z ? 'pointer' : '';
  if (z && (!live.expanded || z.target === live.hovered)) { inZone = true; enterZone(z); } else leaveZones();
});
$('scene').addEventListener('pointerleave', e => isTouch(e) || leaveZones());
// A click or tap on an area (a moth, a ghost, a wisp) expands its card; a shift-click runs the area's menu (a moth snoozes), and
// on one with none (a ghost, a wisp) is a plain click.
// It listens on the scene itself: iOS only sends a tap's click to an element with a click listener of its own.
$('scene').addEventListener('click', e => {
  const z = zoneFor(e);
  if (z) e.shiftKey && z.menu ? clickZone(z, true) : expandCard(z);
});
// A double click runs the area's click action: opens a moth's session, resumes a ghost's, opens an orphan wisp's PR. Its first
// click expanded the card and its second put it away (card.ts expandCard), so the action runs from a settled page. Shift-click
// and right-click are untouched.
$('scene').addEventListener('dblclick', e => {
  const z = zoneFor(e);
  if (z && !e.shiftKey) clickZone(z, false);
});
// A click anywhere but the card and its own area puts away an expanded card (or, from a tap, any card), and so does Escape.
// It listens while the click is on its way down, before the button it lands on can take itself away (the agents' "more")
// and leave nothing to tell it was on the card; a click on another moth then expands that one's (above).
addEventListener('click', e => {
  if ((live.expanded || isTouch(e)) && zoneFor(e)?.target !== live.hovered && !(e.target instanceof Element && e.target.closest('#card'))) hideCard();
}, true);
addEventListener('keydown', e => { if (e.key === 'Escape' && live.expanded) hideCard(); });
$('scene').addEventListener('contextmenu', e => zoneFor(e)?.menu?.());
// no browser or web view menu (Reload and friends) anywhere: a right-click that misses a moth does nothing
addEventListener('contextmenu', e => e.preventDefault());
$('card').addEventListener('pointerleave', e => { if (!isTouch(e)) hideSoon(400); });

// the daily recap: checked when the window comes back into view, and every minute (a window left open overnight)
addEventListener('visibilitychange', () => maybeRecap());
setInterval(() => maybeRecap(), MIN);
