// The scene's shared state, one plain object: what more than one module writes. Whatever only its own module writes
// stays in that module; this holds the rest, mostly what events.js hears from the server. Plain on purpose: frame()
// reads it every frame.

export const live = {
  // ---- from the server's event stream (events.js)
  raw: [], // the sessions as the server sent them (state.js sync turns them into `sessions` and moths)
  reviews: [], // PRs waiting on my review (GitHub status on)
  stalePRs: [], // PRs gone stale, as wisps and ghosts (stale.js)
  recentProse: [], // words from recent transcripts, for the barrel's pages (pages.js)
  pagesData: false, // whether the server has sent any yet
  firstName: '', // the user's first name, for Jerrett's pencil (pencil.js)
  github: { accounts: [], signIn: null }, // the GitHub accounts connected, and a sign-in under way (github.js)
  // ---- from settings.json (events.js)
  // quiet hours: until when (0 for none), when they end and whether they do, and the day rollover ("HH:MM")
  quietUntil: 0, quietEnd: '08:00', quietEndOn: true, dayStart: '00:00',
  supervisor: /supervisor|orchestrat/i, // which agent types count as supervisors (medium moths)
  usingGh: false, // whether GitHub status is on
  staleOn: true, // whether stale PRs show
  /** @type {Record<string, boolean>} */
  prList: {}, // each session's card: its PRs listed or as chips (card.js)
  /** @type {{ id: string, chips?: boolean }[]} the pinned sessions, oldest first, each with whether its PRs show as chips */
  pinned: [],
  recapSeen: null, // the last day (yyyy-MM-dd) a recap opened by itself, once settings say (recap.js)
  // ---- the scene's own
  moths: new Map(), // key -> moth (state.js sync)
  // hovering a moth pins a card to it; a short grace period (hideTimer) stops it flickering as the moth drifts (card.js)
  hovered: null, hideTimer: undefined,
  tally: {}, // every badge ever earned, as id -> [times, last day] (stats.js, from the log recap.js and stats.js read)
  pinnedBadge: null, // the badge whose tip a click keeps open (stats.js, flash.js)
  /** @type {{ e: Element, x: number, y: number, k: number, low: number, deg: number, ph: number }[] | null} */
  cdLeaves: null, // the candle's fluttering leaves, found by frame.js drawLeaves, forgotten when lanterns.js drawHang redraws
  farWall: null, // the Moroccan's far wall baked into a picture (lanterns.js bakeFarWall), for background.js to upload
  // what this frame queued for the background's shaders: firefly lights and ghost moth wing corners (background.js resets them)
  flyLightN: 0, ghostWingN: 0,
};
