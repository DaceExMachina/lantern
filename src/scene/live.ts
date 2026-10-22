// The scene's shared state, one plain object: what more than one module writes. Whatever only its own module writes
// stays in that module; this holds the rest, mostly what wiring.ts hears from the server. Plain on purpose: frame()
// reads it every frame.

import type { Hovered, Moth, Review, Session, StalePR, Stats } from '../types';

/** One of the candle's fluttering leaves (frame.ts drawLeaves). */
interface Leaf { e: Element; x: number; y: number; k: number; low: number; deg: number; ph: number }

interface Live {
  raw: Session[]; reviews: Review[]; stalePRs: StalePR[]; recentProse: string[]; pagesData: boolean; firstName: string;
  quietUntil: number; quietEnd: string; quietEndOn: boolean; dayStart: string; supervisor: RegExp; staleOn: boolean;
  recapSeen: string | null;
  moths: Map<string, Moth>; hovered: Hovered | null; hideTimer: ReturnType<typeof setTimeout> | undefined;
  tally: Stats['tally']; pinnedBadge: string | null; cdLeaves: Leaf[] | null; farWall: HTMLCanvasElement | null;
  flyLightN: number; ghostWingN: number;
}

export const live: Live = {
  // ---- from the server's event stream (wiring.ts)
  raw: [], // the sessions as the server sent them (state.ts sync turns them into `sessions` and moths)
  reviews: [], // PRs waiting on my review (GitHub status on)
  stalePRs: [], // PRs gone stale, as wisps and ghosts (stale.ts)
  recentProse: [], // words from recent transcripts, for the barrel's pages (pages.ts)
  pagesData: false, // whether the server has sent any yet
  firstName: '', // the user's first name, for Jerrett's pencil (pencil.ts)
  // ---- from settings.json (wiring.ts)
  // quiet hours: until when (0 for none), when they end and whether they do, and the day rollover ("HH:MM")
  quietUntil: 0, quietEnd: '08:00', quietEndOn: true, dayStart: '00:00',
  supervisor: /supervisor|orchestrat/i, // which agent types count as supervisors (medium moths)
  staleOn: true, // whether stale PRs show
  recapSeen: null, // the last day (yyyy-MM-dd) a recap opened by itself, once settings say (recap.ts)
  // ---- the scene's own
  moths: new Map(), // key -> moth (state.ts sync)
  // hovering a moth pins a card to it; a short grace period (hideTimer) stops it flickering as the moth drifts (card.ts)
  hovered: null, hideTimer: undefined,
  tally: {}, // every badge ever earned, as id -> [times, last day] (stats.ts, from the log recap.ts and stats.ts read)
  pinnedBadge: null, // the badge whose tip a click keeps open (stats.ts, flash.ts)
  cdLeaves: null, // the candle's fluttering leaves, found by frame.ts drawLeaves, forgotten when lanterns.ts drawHang redraws
  farWall: null, // the Moroccan's far wall baked into a picture (lanterns.ts bakeFarWall), for background.ts to upload
  // what this frame queued for the background's shaders: firefly lights and ghost moth wing corners (background.ts resets them)
  flyLightN: 0, ghostWingN: 0,
};

// The chrome's view of the scene: src/main.ts points `update` at the Pinia store, which it copies the sessions, the card's
// target into. The scene calls it after a sync and when the card's target or the pins change, never per frame.
export const chrome = { update: () => {} };
