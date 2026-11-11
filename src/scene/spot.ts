// Pointing at a session from the bookmarks dropdown (BookmarksMenu sets live.spot while a row is hovered or focused) shows
// which moth or ghost moth it is: a soft halo round it, the other moths and ghosts dimmed, or the whole scene darkened
// round it (the lantern's light and art, every other moth and ghost) with only it and the fireflies left bright. The look
// is the dev panel's, under Bookmarks. Everything eases in and out: `on` for the scene as a whole, and each moth's or
// ghost's own `lit` toward whether it's the one, so moving from row to row hands the light over smoothly.
// Per frame this is a few multiplies per moth; the DOM only changes while something is easing (frame.ts put skips the rest).

import { live } from './live';
import { devSelect, devSlider } from '../dev';

export const SPOT_STYLES = ['halo + dim', 'halo', 'dim', 'spotlight'];
export const spotLook = {
  style: devSelect('Bookmarks', 'bmstyle', 'highlight', SPOT_STYLES, 'halo + dim', 'How hovering a bookmark shows its moth or ghost: a halo round it, the rest dimmed, both, or the whole scene dark but it and the fireflies', v => { spotLook.style = v; }),
  halo: devSlider('Bookmarks', 'bmhalo', 'halo', 0, 1, 0.05, 0.6, 'How bright the halo round the bookmarked moth or ghost is (also in spotlight)', v => { spotLook.halo = v; }),
  dim: devSlider('Bookmarks', 'bmdim', 'dim the rest', 0, 1, 0.05, 0.6, 'How far the other moths and ghosts fade', v => { spotLook.dim = v; }),
  dark: devSlider('Bookmarks', 'bmdark', 'spotlight dark', 0, 1, 0.05, 0.75, 'How dark the scene goes round the bookmarked moth or ghost in spotlight: the flame, its light, the lantern and the other moths and ghosts', v => { spotLook.dark = v; }),
};

const EASE = 5; // a little under half a second to come in or go
let on = 0; // how far in the highlight is, 0 to 1
/** Once a frame, before the moths: eases the highlight in while the session pointed at is `shown` (it has a moth or a ghost
 * on screen; a bookmark with neither changes nothing), and out otherwise. */
export function stepSpot(dt: number, shown: boolean) {
  on += ((shown ? 1 : 0) - on) * Math.min(1, dt * EASE);
  if (Math.abs(on - Math.round(on)) < 0.002) on = Math.round(on); // settled, so it's off again exactly (no filter left on the lantern)
}
/** Eases a moth's or ghost's own `lit` toward whether session `id` is the one pointed at; 0 to 1. */
export function stepLit(o: { lit?: number }, id: string, dt: number) {
  const lit = o.lit ?? 0;
  return o.lit = lit + ((live.spot === id ? 1 : 0) - lit) * Math.min(1, dt * EASE);
}
/** How bright its halo is, 0 to 1, at that `lit`. */
export const haloAt = (lit: number) => spotLook.style === 'dim' ? 0 : lit * spotLook.halo;
/** What its opacity is multiplied by: the rest fade as the highlight comes in, the one pointed at doesn't (nor as both fade out). */
export const fadeAt = (lit: number) => {
  const k = spotLook.style === 'halo' ? 0 : spotLook.style === 'spotlight' ? spotLook.dark : spotLook.dim;
  return 1 - k * Math.max(0, on - lit);
};
/** How dark the rest of the scene is in spotlight, 0 to 1: the lantern's light and art go down by this much. */
export const darkness = () => spotLook.style === 'spotlight' ? on * spotLook.dark : 0;
