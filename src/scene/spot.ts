// Pointing at a session from the bookmarks dropdown (BookmarksMenu sets live.spot while a row is hovered or focused) shows
// which moth or ghost moth it is: the flame is turned right down, well below the idle ember, so the lantern, its light and
// the paper go dark with it; the other moths and ghosts fade; and the one pointed at keeps its look in a bloom of its own
// colour. The fireflies stay as they are, so they and it read against the dark. The knobs are the dev panel's, under
// Bookmarks. Everything eases in and out: `on` for the scene as a whole, and each moth's or ghost's own `lit` toward
// whether it's the one, so moving from row to row hands the light over smoothly.
// Per frame this is a few multiplies per moth; the DOM only changes while something is easing (frame.ts put skips the rest).

import { live } from './live';
import { hex } from './lanterns';
import { devSlider } from '../dev';

export const spotLook = {
  flame: devSlider('Bookmarks', 'bmflame', 'flame', 0, 0.3, 0.01, 0.06, 'How big the flame burns while a bookmark is hovered, the lantern\'s light and paper following it (0.3 is the idle ember; 0 is out)', v => { spotLook.flame = v; }),
  dim: devSlider('Bookmarks', 'bmdim', 'dim the rest', 0, 1, 0.05, 0.6, 'How far the other moths and ghosts fade', v => { spotLook.dim = v; }),
  halo: devSlider('Bookmarks', 'bmhalo', 'bloom', 0, 1, 0.05, 0.6, 'How bright the bloom of its own colour round the bookmarked moth or ghost is', v => { spotLook.halo = v; }),
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
/** What its opacity is multiplied by: the rest fade as the highlight comes in, the one pointed at doesn't (nor as both fade out). */
export const fadeAt = (lit: number) => 1 - spotLook.dim * Math.max(0, on - lit);
// A colour deepened the way the fireflies' haze is (background.ts FLIES): the pale wing tints added as light wash out to
// white, so their bloom pushes each channel away from the brightest. Worked out once per colour.
const deepened = new Map<string, string>();
export function bloomColour(col: string) {
  let d = deepened.get(col);
  if (!d) {
    const v = hex(col), m = Math.max(...v);
    d = '#' + v.map(x => Math.round(Math.max(0, m - (m - x) * 1.8)).toString(16).padStart(2, '0')).join('');
    deepened.set(col, d);
  }
  return d;
}
