// Jerrett made the candle, so when he's the one at it (his first name, from the server's `name` event, wiring.ts) a worn
// yellow pencil, its point snapped off beside it, lies on the pedestal under the vine. It goes into the candle's drawing
// once, in the spot lanterns.ts keeps for it (#cdPencil), hidden by index.html's CSS until showPencil says so; ?pencil
// (the dev panel's Demo toggle) shows it for anyone.
import { live } from './live';
import { $ } from './scene';
import { devToggle } from '../dev';
import { STYLES } from './lanterns';

let pencilForced = devToggle('Demo', 'pencil', 'Jerrett\'s pencil', false, 'The pencil Jerrett sees on the candle\'s pedestal', v => { pencilForced = v; showPencil(); });
export const pencilShows = () => pencilForced || live.firstName.toLowerCase() === 'jerrett';
export function showPencil() { $('lantern', SVGGElement).classList.toggle('pencil', pencilShows()); }

// Lying along x, centred on its spot: the eraser at the left, the broken point at the right, lit from above.
const PENCIL = `<ellipse cx="1" cy="4" rx="45" ry="3.4" fill="#2B2238" opacity=".16"/><ellipse cx="0" cy="3.4" rx="41" ry="2" fill="#2B2238" opacity=".22"/><!-- its shadow on the stone -->
  <path d="M-33 -3.5H-37.5Q-41 -3.5 -41 0Q-41 3.5 -37.5 3.5H-33Z" fill="#E48E9B"/><!-- the eraser -->
  <rect x="-33" y="-3.7" width="9" height="7.4" fill="#C8C1B2"/><path d="M-30.5 -3.7V3.7M-27 -3.7V3.7" stroke="#857E70" stroke-width=".7"/><!-- the ferrule -->
  <rect x="-24" y="-3.5" width="58" height="7" fill="#E7B42E"/><rect x="-24" y="-3.5" width="58" height="2.3" fill="#F7D76E"/>
  <path d="M-24 1.2H34" stroke="#B5851A" stroke-width=".6"/><!-- the hexagonal body, its top face lit -->
  <path d="M34 -3.5L39.3 -1.7L38.7 -.9L39.6 -.2L38.9 .7L39.4 1.6L34 3.5Z" fill="#E9C793"/><!-- the wood, snapped off at the lead -->
  <path d="M38.7 -1.1L39.9 -1.15L40.5 -.3L39.85 1L38.8 1Z" fill="#4B525B" stroke="#160A03" stroke-width=".7" stroke-linejoin="round"/><path d="M39.2 -.5L39.9 -.6" stroke="#A9B1BA" stroke-width=".6" stroke-linecap="round"/><!-- the lead's broken end, graphite with a sheen -->
  <path d="M34 -3.5Q36.2 -2.4 34 -1.2Q36.2 0 34 1.2Q36.2 2.4 34 3.5" fill="#E7B42E" stroke="#160A03" stroke-width=".6"/><!-- the paint's scalloped edge -->
  <path d="M-37.5 -3.5H34L39.3 -1.7L38.7 -.9L39.6 -.2L38.9 .7L39.4 1.6L34 3.5H-37.5Q-41 3.5 -41 0Q-41 -3.5 -37.5 -3.5ZM-33 -3.7V3.7M-24 -3.7V3.7"
    fill="none" stroke="#160A03" stroke-width="1.2" stroke-linejoin="round"/>
  <g transform="translate(47 4) rotate(25)"><ellipse cx=".4" cy="1.2" rx="2.6" ry=".9" fill="#2B2238" opacity=".2"/>
    <path d="M-1.1 -1.1L2.6 0L-1.1 1.1L-.7 .4L-1.3 -.2Z" fill="#4B525B" stroke="#160A03" stroke-width=".7" stroke-linejoin="round"/>
    <path d="M-.4 -.45L1.7 -.05" stroke="#A9B1BA" stroke-width=".4" stroke-linecap="round"/></g><!-- the snapped-off lead -->`;
STYLES.candle.back = STYLES.candle.back.replace(/<g id="cdPencil"[^>]*>/, m => m + PENCIL);
