// The page's domain: what the server sends (sessions, PRs, settings, /stats) and what the scene makes of it (moths and
// their hover areas). Server JSON comes in as `unknown` and goes through the guards and parsers here, at the boundary
// (wiring.ts, events.ts, recap.ts), never per frame. A guard checks the fields the page reads; anything else rides along.

// ---- small checks
export const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
export const isString = (x: unknown): x is string => typeof x === 'string';
const isNumber = (x: unknown): x is number => typeof x === 'number';
const isBoolean = (x: unknown): x is boolean => typeof x === 'boolean';
const arrayOf = <T>(is: (x: unknown) => x is T) => (x: unknown): x is T[] => Array.isArray(x) && x.every(is);
// an optional field: absent, null (the server's NSNull) or of its type
const opt = <T>(is: (x: unknown) => x is T) => (x: unknown): x is T | null | undefined => x == null || is(x);
const isStrings = arrayOf(isString);
const optString = opt(isString), optNumber = opt(isNumber), optBoolean = opt(isBoolean);
const isNumberRecord = (x: unknown): x is Record<string, number> => isRecord(x) && Object.values(x).every(isNumber);
const isBooleanRecord = (x: unknown): x is Record<string, boolean> => isRecord(x) && Object.values(x).every(isBoolean);

/** JSON.parse that hands back `unknown`, for a guard or parser to narrow. */
export const parseJson = (text: string): unknown => JSON.parse(text);

export type Point = [number, number];
export type Vec3 = [number, number, number];
/** An optional field of server JSON: left out, or null (the server's NSNull). */
export type Opt<T> = T | null | undefined;

// ---- sessions (the event stream's default message)
/** A link in a session's "You:" message. */
interface Link { label: string; url: string }
/** What a waiting session wants from me: its questions, and its "You:" message as text and links. */
interface ForYou { questions?: Opt<string[]>; you?: Opt<(string | Link)[]> }
/** What a firefly shows of a PR: what it needs, when the server first saw it (ms), and since when it's needed that, and
 * what it needed before. */
export interface FlyState { need: string; seen?: Opt<number>; since?: Opt<number>; was?: Opt<string> }
/** A PR as GitHub sees it. `need` is ready, failing, changes, waiting, draft, merged or closed. */
export interface PR extends FlyState { url: string; label: string; title: string | null; createdAt?: Opt<string> }
export interface Agent {
  id: string; type?: Opt<string>; description?: Opt<string>; model?: Opt<string>; activity?: Opt<string>;
  started?: Opt<number>; last?: Opt<number>;
}
export interface Session {
  id: string; state: string; subagents: Agent[]; cwd?: Opt<string>; started?: Opt<number>; last?: Opt<number>;
  parent?: Opt<string>; title?: Opt<string>; snoozed?: Opt<boolean>; forGood?: Opt<boolean>; error?: Opt<boolean>;
  waitingSince?: Opt<number>; note?: Opt<string>; activity?: Opt<string>; prompt?: Opt<string>;
  forYou?: Opt<ForYou>; github?: Opt<PR[]>; created?: Opt<string[]>; ticks?: Opt<number>;
  tasks?: Opt<string[]>; taskStarted?: Opt<Record<string, number>>; prose?: Opt<string[]>;
  // the page's own, from state.ts sync: reporting back to its parent session, and snoozed for quiet hours
  reported?: boolean; quiet?: boolean;
}

const isLink = (x: unknown): x is Link => isRecord(x) && isString(x['label']) && isString(x['url']);
const isForYou = (x: unknown): x is ForYou =>
  isRecord(x) && opt(isStrings)(x['questions']) && opt(arrayOf((y: unknown): y is string | Link => isString(y) || isLink(y)))(x['you']);
const isStringOrNull = (x: unknown): x is string | null => x === null || isString(x);
const isPR = (x: unknown): x is PR => isRecord(x) && isString(x['url']) && isString(x['label']) && isString(x['need']) && isStringOrNull(x['title'])
  && optString(x['createdAt']) && optNumber(x['seen']) && optNumber(x['since']) && optString(x['was']);
const isAgent = (x: unknown): x is Agent => isRecord(x) && isString(x['id']) && optString(x['type']) && optString(x['description'])
  && optString(x['model']) && optString(x['activity']) && optNumber(x['started']) && optNumber(x['last']);
export const isSession = (x: unknown): x is Session => isRecord(x)
  && isString(x['id']) && isString(x['state']) && arrayOf(isAgent)(x['subagents']) && optString(x['cwd']) && optNumber(x['started']) && optNumber(x['last'])
  && optString(x['parent']) && optString(x['title']) && optBoolean(x['snoozed']) && optBoolean(x['forGood']) && optBoolean(x['error'])
  && optNumber(x['waitingSince']) && optString(x['note']) && optString(x['activity']) && optString(x['prompt'])
  && opt(isForYou)(x['forYou']) && opt(arrayOf(isPR))(x['github']) && opt(isStrings)(x['created']) && optNumber(x['ticks'])
  && opt(isStrings)(x['tasks']) && opt(isNumberRecord)(x['taskStarted']) && opt(isStrings)(x['prose']);

// ---- the other events
/** A PR waiting on my review. */
export interface Review { url: string; label: string; title: string | null }
export const isReview = (x: unknown): x is Review => isRecord(x) && isString(x['url']) && isString(x['label']) && isStringOrNull(x['title']);
/** The old session that made a stale PR. */
export interface Owner { id: string; title?: Opt<string>; cwd?: Opt<string>; last: number; resuming?: Opt<number> }
/** One of my PRs no session owns and nobody has touched for a week. */
export interface StalePR extends PR { updatedAt: string; owner?: Opt<Owner> }
const isOwner = (x: unknown): x is Owner => isRecord(x) && isString(x['id']) && optString(x['title']) && optString(x['cwd']) && isNumber(x['last']) && optNumber(x['resuming']);
export const isStalePR = (x: unknown): x is StalePR => isRecord(x) && isString(x['updatedAt']) && opt(isOwner)(x['owner']) && isPR(x);
/** The GitHub accounts connected, and a sign-in under way (device flow). */
export interface GitHub { accounts: { login: string; error: string }[]; signIn: { url: string; code: string } | null }
export const isGitHub = (x: unknown): x is GitHub => isRecord(x)
  && arrayOf((a: unknown): a is GitHub['accounts'][number] => isRecord(a) && isString(a['login']) && isString(a['error']))(x['accounts'])
  && (x['signIn'] === null || isRecord(x['signIn']) && isString(x['signIn']['url']) && isString(x['signIn']['code']));

// ---- settings.json, as the settings event sends it
/** A session pinned to the sidebar, with whether its PRs show as chips. */
export interface Pin { id: string; chips?: Opt<boolean> }
const isPin = (x: unknown): x is Pin => isRecord(x) && isString(x['id']) && opt(isBoolean)(x['chips']);
/** The settings the page reads, each undefined when settings.json doesn't hold one of the right type. */
export interface Settings {
  style?: string | undefined; ribbon?: string | undefined; lanternText?: string | undefined; quietUntil?: number | undefined;
  quietEnd?: string | undefined; quietEndOn?: boolean | undefined; quietFrom?: string | undefined; dayStart?: string | undefined;
  supervisorPattern?: string | undefined; recapSeen?: string | undefined; github?: boolean | undefined; stale?: boolean | undefined;
  prList?: Record<string, boolean> | undefined; pinned?: Pin[] | undefined;
}
export function parseSettings(x: unknown): Settings {
  const o = isRecord(x) ? x : {};
  const str = (k: string) => { const v = o[k]; return isString(v) ? v : undefined; };
  const bool = (k: string) => { const v = o[k]; return isBoolean(v) ? v : undefined; };
  const quietUntil = o['quietUntil'], prList = o['prList'], pinned = o['pinned'];
  return {
    style: str('style'), ribbon: str('ribbon'), lanternText: str('lanternText'), quietUntil: isNumber(quietUntil) ? quietUntil : undefined,
    quietEnd: str('quietEnd'), quietEndOn: bool('quietEndOn'), quietFrom: str('quietFrom'), dayStart: str('dayStart'),
    supervisorPattern: str('supervisorPattern'), recapSeen: str('recapSeen'), github: bool('github'), stale: bool('stale'),
    prList: isBooleanRecord(prList) ? prList : undefined, pinned: Array.isArray(pinned) ? pinned.filter(isPin) : undefined,
  };
}

/** A time of day as settings.json holds it, "H:MM" or "HH:MM". */
export const isTime = (s: string | undefined): s is string => /^\d{1,2}:\d{2}$/.test(s || '');
/** "8:00" as "08:00", which is what a time input takes. */
export const hhmm = (s: string) => s.padStart(5, '0');
/** "08:00" as "8am", "17:30" as "5:30pm". */
export const timeLabel = (s: string) => { const [h = 0, m = 0] = s.split(':').map(Number); return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''}${h < 12 ? 'am' : 'pm'}`; };

// ---- GET /stats (app/Stats.swift)
/** A day in GET /stats. */
export interface Day {
  start: number; end: number; mothMs: number;
  warmLantern: number | null; warmMoths: number | null;
  medianWait: number | null; slowWait: number | null; waits: number; merged: number; open: number | null;
  stale: number | null; staleChange: number | null;
}
/** A stretch of time: [kind, began, ended, seeded (running at startup), session, title, project]; the server sends all seven. */
export type Span = [kind: string, began: number, ended: number, seeded?: Opt<boolean>, session?: Opt<string>, title?: Opt<string>, project?: Opt<string>];
/** Counts every five minutes: [time, alive, working, waiting, snoozed], -1 where not recorded. */
export type Gauge = [time: number, alive: number, working: number, waiting: number, snoozed: number];
/** What happened to a session's PR: [time, session, url, change, need, title]. */
export type PrEvent = [time: number, session: string | null, url: string | null, change: string | null, need: string | null, title: string | null];
/** GET /stats: the event log boiled down. The last day is today. */
export interface Stats {
  days: Day[]; spans: Span[]; gauges: Gauge[]; prs: PrEvent[];
  tally: Record<string, [number, string]>; achievements: [id: string, day: string][]; streak: number; warmGoal: number;
}
const isNumberOrNull = (x: unknown): x is number | null => x === null || isNumber(x);
const isDay = (x: unknown): x is Day => isRecord(x) && ['start', 'end', 'mothMs', 'waits', 'merged'].every(k => isNumber(x[k]))
  && ['warmLantern', 'warmMoths', 'medianWait', 'slowWait', 'open', 'stale', 'staleChange'].every(k => isNumberOrNull(x[k]));
const isSpan = (x: unknown): x is Span => Array.isArray(x) && x.length <= 7 && isString(x[0]) && isNumber(x[1]) && isNumber(x[2])
  && optBoolean(x[3]) && optString(x[4]) && optString(x[5]) && optString(x[6]);
const isGauge = (x: unknown): x is Gauge => Array.isArray(x) && x.length === 5 && x.every(isNumber);
const isPrEvent = (x: unknown): x is PrEvent => Array.isArray(x) && x.length === 6 && isNumber(x[0]) && x.slice(1).every(isStringOrNull);
const isTally = (x: unknown): x is Stats['tally'] => isRecord(x) && Object.values(x).every(v => Array.isArray(v) && isNumber(v[0]) && isString(v[1]));
const isAchievement = (x: unknown): x is Stats['achievements'][number] => Array.isArray(x) && isString(x[0]) && isString(x[1]); // and when, which the page doesn't read
const isStats = (x: unknown): x is Stats => isRecord(x) && arrayOf(isDay)(x['days']) && arrayOf(isSpan)(x['spans'])
  && arrayOf(isGauge)(x['gauges']) && arrayOf(isPrEvent)(x['prs']) && isTally(x['tally']) && arrayOf(isAchievement)(x['achievements'])
  && isNumber(x['streak']) && isNumber(x['warmGoal']);
/** GET /stats, checked. */
export async function fetchStats(): Promise<Stats> {
  const stats: unknown = await (await fetch('/stats')).json();
  if (!isStats(stats)) throw new Error('not the stats');
  return stats;
}

// ---- the lanterns (lanterns.ts STYLES)
/** The surface moths land on: its top and bottom, and its half-width at a height. */
interface Body { top: number; bottom: number; half: (y: number) => number }
/** A paper lantern's paper, which session text is printed on (pages.ts); see lanterns.ts BARREL. */
export interface Surface {
  cx: number; r: number; top: number; bottom: number; ribs: number[]; gap: number; lines: number; shown: number;
  bow: (y: number) => number; half: (y: number) => number; light: { cx: number; cy: number; rx: number; ry: number }; cy?: number; ry?: number;
}
/** A lantern: what's drawn, where its flame and light are, and what it does (see the notes on lanterns.ts STYLES). */
export interface Style {
  name: string; flame: [x: number, y: number, size: number]; light: Point; body: Body; back: string; front: string; inside?: string;
  paper?: boolean; flameWind?: number | null; dim?: number; surface?: Surface; caps?: [top: number, bottom: number, half: number];
  ribbon?: Point; knot?: Point; tassel?: Point; chain?: number; farWall?: boolean; holder?: Point; shadeFromHolder?: boolean;
  heat?: { at?: Point; k: number }; scorches?: boolean;
  // a standing lantern: the band its stand fills, its column redrawn to the window's bottom, and the grapes it shines on
  stands?: { half: number; top: number }; column?: (bottom: number) => string; shine?: Point[];
}

/** How a firefly leaves: merged, closed or just gone, from when (ms), heading `d`, its merge's loop starting at `start` s. */
interface Leave { kind: string; at: number; d: Point; start: number }
/** A PR's firefly (fireflies.ts swarm): its seeded orbit, the PR, how it's leaving, and where it was drawn this frame. */
export interface Firefly {
  a: number; r: number; w: number; ph: number; bend: number; tilt: number; side: number; p: FlyState; leave: Leave | null;
  k: number; near?: boolean; col: string; x: number; y: number; size: number;
}

// ---- the scene's moths and hover areas
/** A "zz" off a moth that just got snoozed: when, and whether until it does something new or for good. */
interface Puff { at: number; kind: 'once' | 'always' }
/** A scorch in progress (frame.ts scorchStep): its slot and seconds in, whether the flame has touched it yet, where it
 * aims and from which side, and the smoke trail it leaves as it flies off ([x, y, seconds, how far along]). */
export interface Scorch {
  slot: number; t: number; hit: boolean; flying: boolean; rand: () => number; up: number; side: number; aim?: Point;
  trail?: [x: number, y: number, at: number, along: number][]; trailDone?: boolean;
}
/** What every moth has: its drawing, size, where it is, and the animation state frame.ts keeps on it from frame to frame
 * (each starts unset; the tests build moths with only some of it). */
interface MothBase {
  key: string; g: SVGGElement; back: SVGPathElement; front: SVGPathElement; size: number; // front draws whichever wing is nearer
  x: number; y: number; phase: number; cool: number; leaving: boolean;
  session?: Session; flies?: Map<string, Firefly>;
  vx?: number; vy?: number; tilt?: number; roll?: number; fold?: number; open?: number; beat?: number; rate?: number;
  tint?: string | undefined; shade?: Vec3; wasLanded?: boolean; scorch?: Scorch | null; zz?: SVGGElement[] | null;
  // where it lands (perchAt), its hops and breaths, the landing's own dice, and the last target it eased toward
  perch?: [x: number, y: number, normal: Vec3]; perchAim?: string; lastAim?: string | undefined; lastT?: Point;
  fidget?: '' | 'hop' | 'breathe'; into?: number; landJitter?: number; rand?: () => number;
  // a fresh snooze's puff and the sleeping z's it breathes out
  puff?: Puff | null; zStart?: number | undefined; zOff?: number;
}
/** A session's moth. It wanders round its `home` (a spot on the ring, `spot`, or circling its parent's as a satellite),
 * lands on the lantern when its session waits, and is tied to the lantern by its thread. */
export interface SessionMoth extends MothBase {
  parentId?: undefined; thread: SVGPathElement; zone: Zone; flyZone?: Zone; cardAt?: CardAt;
  satellite?: string | null; spot?: Point; home?: Point; snooze?: '' | 'once' | 'always';
  // which spot on its line it lands on, and the hop it landed from (frame.ts mothTarget)
  along?: number; perchKey?: string; hopSlot?: number | undefined;
  // its hover areas' spots, its thread's gradient, bow and pulses, and its fireflies' line
  zx?: number; zy?: number; fx?: number; fy?: number; grad?: SVGLinearGradientElement; flyGrad?: SVGLinearGradientElement; flyLine?: SVGPathElement;
  bowK?: number; ticks?: number; pulse?: { at: number } | null;
}
/** An agent's moth, orbiting its session's. */
export interface AgentMoth extends MothBase { parentId: string; a: number; r: number; speed: number }
export type Moth = SessionMoth | AgentMoth;

/** Which of a session moth's hover areas its card sits beside: the moth, or the fireflies it left back home. */
export type CardAt = 'moth' | 'flies';
/** A stale PR's wisp or a ghost moth, as a hover target (stale.ts). */
export interface StaleTarget { stale: StalePR; zone: Zone }
export interface GhostTarget { ghost: Ghost; zone: Zone }
/** What a hover area shows the card for. */
export type Hovered = SessionMoth | StaleTarget | GhostTarget;
/** A hover area: a plain circle in scene units, hit-tested in JS (card.ts). */
export interface Zone {
  x: number; y: number; r: number; off: boolean; readonly target: Hovered; onClick: () => void; cardAt?: CardAt | undefined; menu?: () => void;
}
/** A ghost moth: an old session that made some of the stale PRs, drifting faintly (stale.ts). */
export interface Ghost extends Drifter {
  o: Owner & { prs: StalePR[] }; zone: Zone; prs: StalePR[]; beat: number; back: number; x: number; y: number; rate: number; out: number; woke?: number;
}
/** A stale PR's wisp (stale.ts). */
export interface Wisp extends Drifter { p: StalePR; zone: Zone; wob: number; a: number; w: number; period: number; born: number; gone: number | undefined }
/** What drifts round the lantern to a planned direction (stale.ts driftTo). */
export interface Drifter { pref: number; dist: number; ph: number; aim?: number; ang?: number; spin?: number; px?: number; py?: number }
