// Pointing at a session from the bookmarks dropdown (BookmarksMenu sets live.spot while a row is hovered or focused) shows
// which moth or ghost moth it is: the flame is turned down to the idle ember (the slider goes lower, to out), so the lantern, its light and
// the paper go dark with it; the other moths dull toward grey and fade, each as a whole (ghosts fade); every other light
// that flies (fireflies, the lamp's review fireflies, wisps) drops to a third; and the one pointed at keeps its look, its own
// fireflies included, in a bloom of the colour it shows. The knobs are the dev panel's, under
// Bookmarks. Everything eases in and out: `on` for the scene as a whole, and each moth's or ghost's own `lit` toward
// whether it's the one, so moving from row to row hands the light over smoothly.
// Per frame this is a few multiplies per moth; the DOM only changes while something is easing (frame.ts put skips the rest).

import { live } from './live';
import { hex } from './lanterns';
import { devSlider } from '../dev';

export const spotLook = {
  flame: devSlider('Bookmarks', 'bmflame', 'flame', 0, 0.3, 0.01, 0.3, 'How big the flame burns while a bookmark is hovered, the lantern\'s light and paper following it (0.3 is the idle ember; 0 is out)', v => { spotLook.flame = v; }),
  grey: devSlider('Bookmarks', 'bmgrey', 'grey the rest', 0, 1, 0.05, 1, 'How far the other moths dull toward grey', v => { spotLook.grey = v; }),
  fade: devSlider('Bookmarks', 'bmfade', 'fade the rest', 0, 1, 0.05, 0.6, 'How see-through the other moths, their threads and the ghosts go (each moth as a whole)', v => { spotLook.fade = v; }),
  halo: devSlider('Bookmarks', 'bmhalo', 'bloom', 0, 1, 0.05, 0.5, 'How bright the bloom of its own colour round the bookmarked moth or ghost is', v => { spotLook.halo = v; }),
};

const EASE = 5; // a little under half a second to come in or go
let on = 0; // how far in the highlight is, 0 to 1
/** Once a frame, before the flame: eases the highlight in while the session pointed at is `shown` (it has a moth or a ghost
 * on screen; a bookmark with neither changes nothing), and out otherwise. */
export function stepSpot(dt: number, shown: boolean) {
  on += ((shown ? 1 : 0) - on) * Math.min(1, dt * EASE);
  if (Math.abs(on - Math.round(on)) < 0.002) on = Math.round(on); // settled, so it's off again exactly
}
/** The flame turned down from the `size` it burns at by itself, to spotLook.flame as the highlight comes in, and `by`, the
 * share of its size it keeps (1 when it isn't): the light it gives goes down with it. Never turned up. */
export function turnDown(size: number) {
  const to = size + (Math.min(size, spotLook.flame) - size) * on;
  turned.size = to; turned.by = size > 0 ? to / size : 1;
  return turned;
}
const turned = { size: 1, by: 1 }; // one object, reused every frame
/** Eases a moth's or ghost's own `lit` toward whether session `id` is the one pointed at; 0 to 1. */
export function stepLit(o: { lit?: number }, id: string, dt: number) {
  const lit = o.lit ?? 0;
  return o.lit = lit + ((live.spot === id ? 1 : 0) - lit) * Math.min(1, dt * EASE);
}
/** How bright its bloom is, 0 to 1, at that `lit`. */
export const haloAt = (lit: number) => lit * spotLook.halo;
// How far a moth or ghost at that `lit` is set back: the rest as the highlight comes in, not the one pointed at (nor as both fade out)
const back = (lit: number) => Math.max(0, on - lit);
/** What its opacity is multiplied by. */
export const fadeAt = (lit: number) => 1 - spotLook.fade * back(lit);
/** How far its colour dulls toward DULL. */
export const greyAt = (lit: number) => spotLook.grey * back(lit);
export const DULL = '#6E6878'; // a dull grey, between the night and the idle moths' pale
const FLY_LEFT = 0.33; // how much of its light a fly keeps while it isn't the one pointed at's
/** What a light that flies is multiplied by: FLY_LEFT, unless it's the one pointed at's (`lit`; 0 for one that's nobody's). */
export const flyFadeAt = (lit: number) => 1 - (1 - FLY_LEFT) * back(lit);
// The bloom's colour from the colour a moth shows (a snoozed one's paler, a landed one's silhouette and all): brought up to full
// brightness, since light that dark adds nothing, then deepened the way the fireflies' haze is (background.ts FLIES), so a pale
// tint doesn't wash out to white. Only the one pointed at asks, once a frame.
export function bloomColour(col: string) {
  const v = hex(col), m = Math.max(1, ...v);
  return '#' + v.map(x => Math.round(Math.max(0, 255 - (255 - x * 255 / m) * 1.8)).toString(16).padStart(2, '0')).join('');
}
