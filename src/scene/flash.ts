// A badge just earned: a swarm of fireflies drifts in from the window's sides and packs into a pill near the top, so
// densely their halos merge into one light, with the badge's name on it in dark ink. It holds a few seconds, then
// they scatter back out to the sides. Clicking the pill opens the stats panel on that badge. Badges earned together play
// one after another.
// They're the scene's own fireflies (bloomSprite and fireflySwell in fireflies.ts, at the scene's scale), their light
// added up on one canvas that only exists while a flash plays, above everything (the lantern's string included);
// nothing goes near the per-frame-rotated #lantern.

import { live } from './live';
import { $, Q, VIEW, nth } from './scene';
import { devButton, devSelect } from '../dev';
import { hash, seeded } from './lanterns';
import { FIREFLY_BLOOM, FLY, bloomSprite, fireflySwell } from './fireflies';
import { ACHIEVEMENTS } from './stats';
import type { Point } from '../types';

const FLASH = { hold: 4000, leave: 2200 }; // ms; the arrival takes as long as the farthest flight needs
// Two speeds, in screen px per ms as they look in a 1024x768 window (the scene's scale there is about 1.2), scaling with
// the scene: flying in and off (on average along a path), and swarming in the pill. ?flySpeed=0.4&swarmSpeed=0.05 tries others.
const FLY_SPEED = Number(Q.get('flySpeed')) || 0.4, SWARM_SPEED = Number(Q.get('swarmSpeed')) || 0.002;
// how much they wander about the pill while it holds (1 by default; ?jostle=0.5 or 2 tries others)
const JOSTLE = Q.has('jostle') ? Number(Q.get('jostle')) || 0 : 1;
// how many fireflies fill the pill, as a share of the densest packing; fewer are spaced wider and stay the scene's
// size, so the pill gets lighter and lacier (?count=1 is the densest)
const BACKING = Q.get('backing') !== '0'; // a soft glow behind the words, so the text keeps its contrast over gaps (?backing=0 turns it off)
const COUNT = Q.has('count') ? Math.min(1, Number(Q.get('count')) || 1) : 0.5;
// The colours PR fireflies come in: half the yellow of a draft, two fifths the orange of one with changes asked for,
// and a sprinkle of the rest: sky blue (in review), green (ready), coral (failing) and yellow-green (waiting on you).
const FLASH_COLOURS: [number, string][] = [[0.5, FLY.draft], [0.4, FLY.changes], [0.025, FLY.quiet], [0.025, FLY.ready], [0.025, FLY.failing], [0.025, FLY.review]];
const flashQueue: string[] = [];
let flashing = false;

// a point on a quadratic curve from a to b bending through c, at u in [0, 1]
// a point on a cubic curve from a to d with handles b and c: leaving a towards b, arriving at d from c
const cubic1 = (a: number, b: number, c: number, d: number, u: number) => (1 - u) ** 3 * a + 3 * (1 - u) ** 2 * u * b + 3 * (1 - u) * u * u * c + u ** 3 * d;
const cubic = (a: Point, b: Point, c: Point, d: Point, u: number): Point => [cubic1(a[0], b[0], c[0], d[0], u), cubic1(a[1], b[1], c[1], d[1], u)];
const toward = (a: Point, b: Point, len: number): Point => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [a[0] + (b[0] - a[0]) / d * len, a[1] + (b[1] - a[1]) / d * len]; };
// a bend for the path from a to b: off to one side by a share of its length
function bend(a: Point, b: Point, rand: () => number): Point {
  const dx = b[0] - a[0], dy = b[1] - a[1], k = (0.2 + rand() * 0.25) * (rand() < 0.5 ? -1 : 1);
  return [(a[0] + b[0]) / 2 - dy * k, (a[1] + b[1]) / 2 + dx * k];
}
// the point `s` along a loop around a pill's middle line (2 * half long) at distance rr from it, clockwise from the top
// left; it wraps, so a firefly can stream round and round
function aroundPill(s: number, half: number, rr: number, cx: number, cy: number): Point {
  const line = 2 * half, arc = Math.PI * rr;
  s = ((s % (2 * line + 2 * arc)) + 2 * line + 2 * arc) % (2 * line + 2 * arc);
  if (s < line) return [cx - half + s, cy - rr];
  if ((s -= line) < arc) { const a = -Math.PI / 2 + s / rr; return [cx + half + Math.cos(a) * rr, cy + Math.sin(a) * rr]; }
  if ((s -= arc) < line) return [cx + half - s, cy + rr];
  const a = Math.PI / 2 + (s - line) / rr; return [cx - half + Math.cos(a) * rr, cy + Math.sin(a) * rr];
}

export function flashBadge(id: string) {
  flashQueue.push(id);
  if (!flashing) nextFlash();
}
function nextFlash() {
  flashing = flashQueue.length > 0;
  if (!flashing) return;
  if (document.hidden) return addEventListener('visibilitychange', nextFlash, { once: true }); // not to an empty room
  const id = flashQueue.shift();
  if (id !== undefined) playFlash(id).then(nextFlash);
}

/** One firefly of the flash: its seeded way round the pill, the flight in and out (worked out before it starts), and
 * where it has got to. */
interface FlashFly {
  rr: number; s0: number; v: number; col: string; ph: number; ax: number; bx: number; ay: number; by: number; every: number; dartAt: number; dir: number;
  land: number; go: number; tilt: number; strayBy: number; rest: number; overshoot: boolean;
  off: Point; strayEvery: number; lead: number; spot: Point; vel: Point; from: Point; len: number; arrive: number;
  delay: number; lift: number; flowT: number; c1: Point; c2: Point;
  at?: Point; was?: [Point, number]; exit?: { p0: Point, c3: Point, c4: Point, away: Point };
}
function playFlash(id: string) {
  const [name, how] = ACHIEVEMENTS[id] || [id, ''], compact = document.body.classList.contains('panel');
  const layer = document.createElement('div'), canvas = document.createElement('canvas'), pill = document.createElement('button');
  layer.id = 'flash'; pill.className = 'pill'; pill.title = 'Open in stats'; pill.setAttribute('aria-live', 'polite');
  pill.innerHTML = `<b>${name}</b>${how && !compact ? `<span>${how}</span>` : ''}`; // the iTerm panel is too narrow for the blurb
  layer.append(canvas, pill);
  document.body.append(layer);

  // The canvas covers the window, at the screen's resolution unless that's huge (about 4 million pixels at most).
  const W = innerWidth, H = innerHeight, k = Math.min(devicePixelRatio || 1, Math.sqrt(4e6 / (W * H)));
  canvas.width = Math.round(W * k); canvas.height = Math.round(H * k);
  const g = canvas.getContext('2d');
  if (!g) { layer.remove(); return Promise.resolve(); }
  g.scale(k, k);
  // On screen, at the scene's scale: a firefly's bright glow (how far off screen they start), the halo the packing is
  // measured in, and the whole bloom, its colour's picture, swelling the way the scene's do.
  const px = VIEW.px || 1, glowR = 20 * px, haloR = 6.5 * px, bloomR = FIREFLY_BLOOM * px;
  const sprites = new Map<string, HTMLCanvasElement>(), sprite = (col: string) => { let s = sprites.get(col); if (!s) sprites.set(col, s = bloomSprite(col, Math.ceil(2 * bloomR * k))); return s; };
  const { width: w, height: h, left, top } = pill.getBoundingClientRect(), cx = left + w / 2, cy = top + h / 2;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = seeded(hash(id + Date.now()));

  // The pill is filled by slow currents: nested loops inset from its outline 0.7 halo radii apart, each holding
  // fireflies 0.8 halo radii apart (the density of a hexagonal packing, wider for a lower COUNT), so the halos cover
  // it solidly end to end. Each
  // loop creeps round the pill, neighbours going opposite ways, and a loop moving along itself never thins.
  // On top of that a swirl carries them about and each wanders on its own, so it reads as a loose swarm, not lanes.
  // They fly in fast and slow down steadily as they land, reaching their place at its own gentle pace and carrying on
  // with it, never stopping; when they leave they speed up again from that pace.
  const step = haloR * 0.8 / Math.sqrt(COUNT), r = h / 2 - haloR * 0.25, half = w / 2 - h / 2, flies: FlashFly[] = [];
  const inner = step * 0.6; // the tightest loop: round, not a flat line that would turn its fireflies back in an instant
  const jostle = still ? 0 : JOSTLE;
  const fly = FLY_SPEED * px / 1.2, swarm = still ? 0 : SWARM_SPEED * px / 1.2; // px per ms
  // Landings fall in the 400ms from `gather` (set below, once the longest flight is known); the currents' clock starts
  // there, so where a firefly lands doesn't depend on how long the arrival takes.
  let gather = 0;
  // How far in from the pill's edge a point is (its outline, in from the halos' reach), negative outside.
  const inside = (p: Point) => r - Math.hypot(Math.max(0, Math.abs(p[0] - cx) - half), p[1] - cy);
  // A slow swirl over the whole pill: three crossing waves of a stream function, changing over a few seconds, and the
  // fireflies flow along its curl, carried frame by frame (`flow`). A flow like that never squeezes or spreads what it
  // carries, so it can take them a long way round without opening holes; the stream function fades out at the rim,
  // straight down to it (not easing in, which would stop the flow there), so at the edge the flow runs along it and
  // nobody is carried out.
  const waves = [0, 1, 2].map(() => {
    const k = 2 * Math.PI / ((8 + rand() * 8) * step), a = rand() * 6.28;
    return { kx: k * Math.cos(a), ky: k * Math.sin(a), w: 2 * Math.PI / (3000 + rand() * 3000), ph: rand() * 6.28, amp: 0.025 * px / k };
  });
  // A gentle current round the rim on top (its stream function is just the fade itself), so nothing near the edge is
  // ever still where the waves happen to cancel out.
  const rimCurrent = (rand() < 0.5 ? -1 : 1) * 0.015 * px * 2 * step;
  const stream = (x: number, y: number, t: number) => { const m = Math.min(1, Math.max(0, inside([x, y]) / (2 * step))); return m * (rimCurrent + waves.reduce((sum, v) => sum + v.amp * Math.sin(v.kx * x + v.ky * y + v.w * t + v.ph), 0)); };
  const swirl = (p: Point, t: number): Point => { const e = 0.5; return [(stream(p[0], p[1] + e, t) - stream(p[0], p[1] - e, t)) / (2 * e) * jostle, -(stream(p[0] + e, p[1], t) - stream(p[0] - e, p[1], t)) / (2 * e) * jostle]; }; // px per ms
  // back onto the outline, along the way it went out, if a point is past it
  const keepIn = (p: Point): Point => {
    if (inside(p) >= 0) return p;
    const q = Math.max(-half, Math.min(half, p[0] - cx)), d = Math.hypot(p[0] - cx - q, p[1] - cy) || 1;
    return [cx + q + (p[0] - cx - q) / d * r, cy + (p[1] - cy) / d * r];
  };
  // Each firefly's own wander on top, two fifths of a spacing, and now and then a quick dart of half a spacing, on its
  // own clocks (`t` in ms since the landings began). Enough that none is ever still where the swirl is calm, and kept
  // small, since unlike the swirl these can open gaps.
  const wanderAt = (f: FlashFly, t: number): Point => {
    const n = (t + f.dartAt) % f.every, dart = n < 450 ? Math.sin(Math.PI * n / 450) * 0.5 * step : 0, a = f.dir + Math.floor((t + f.dartAt) / f.every) * 2.4;
    return [jostle * ((Math.sin(t * f.ax + f.ph) * 0.25 + Math.sin(t * f.bx + f.ph * 2.3) * 0.15) * step + Math.cos(a) * dart),
      jostle * ((Math.sin(t * f.ay + f.ph * 1.7) * 0.25 + Math.sin(t * f.by + f.ph * 3.1) * 0.15) * step + Math.sin(a) * dart)];
  };
  // where a firefly's place in the current is at `t`, with its wander but before any swirl (it all runs from the start,
  // so it lands on a moving spot; the swirl starts carrying it once it's there)
  const holdAt = (f: FlashFly, t: number) => {
    t -= gather;
    const b = aroundPill(f.s0 + f.v * t, half, f.rr, cx, cy), o = wanderAt(f, t);
    return keepIn([b[0] + o[0], b[1] + o[1]]);
  };
  // The swirl carries a firefly's offset `off` from its place `b` on by `dt` ms, at `t` ms since the landings began
  // (a midpoint step, so it follows the curl closely).
  const carry = (b: Point, off: Point, t: number, dt: number): Point => {
    if (!jostle || dt <= 0) return off;
    const at: Point = [b[0] + off[0], b[1] + off[1]], v1 = swirl(at, t), v2 = swirl([at[0] + v1[0] * dt / 2, at[1] + v1[1] * dt / 2], t + dt / 2);
    return [off[0] + v2[0] * dt, off[1] + v2[1] * dt];
  };
  // Again and again every ring strays five to ten spacings past the outline (a few, fifteen to twenty-five) and
  // comes back, so the edge looks like a living swarm, not a drawn pill. It's part of the swarm from the start: each
  // one's first stray comes just after it lands, and some land in the middle of one, arriving past the rim and
  // drifting back in.
  const strayFor = (f: FlashFly) => 600 + f.strayBy / step * 300; // the further it strays, the longer out and back
  const strayOff = (f: FlashFly, t: number): Point => {
    const n = t - f.land + f.lead, away = strayFor(f);
    if (!f.strayBy || n < 0 || n % f.strayEvery >= away) return [0, 0];
    // outward from its own place on its loop, which never crosses the pill's middle line (the swirl can carry the
    // firefly itself across it, and outward from there would flip it to the other side in a frame)
    const o = aroundPill(f.s0 + f.v * (t - gather), half, f.rr, cx, cy);
    const q = Math.max(-half, Math.min(half, o[0] - cx)), d = Math.hypot(o[0] - cx - q, o[1] - cy) || 1;
    const out = Math.sin(Math.PI * (n % f.strayEvery) / away) * f.strayBy; // up out of the window too
    return [(o[0] - cx - q) / d * out, (o[1] - cy) / d * out];
  };
  // One frame of the hold: the swirl carries the firefly on, then its place, wander, offset and any stray make where it is.
  const flow = (f: FlashFly, t: number): Point => {
    const b = holdAt(f, t);
    f.off = carry(b, f.off, f.flowT - gather, Math.min(50, t - f.flowT)); f.flowT = t;
    const p = keepIn([b[0] + f.off[0], b[1] + f.off[1]]), o = strayOff(f, t);
    return [p[0] + o[0], p[1] + o[1]];
  };
  const heading = (f: FlashFly, t: number): Point => { const a = holdAt(f, t - 1), b = holdAt(f, t + 1); return [(b[0] - a[0]) / 2, (b[1] - a[1]) / 2]; }; // px per ms
  // rings from the rim in to the innermost, evenly spaced and no further apart than a hexagonal packing's rows
  const rings = Math.ceil((r - inner) / (step * 0.866)) + 1;
  for (let ring = 0; ring < rings; ring++) {
    const rr = r - (r - inner) * ring / (rings - 1);
    const loop = 4 * half + 2 * Math.PI * rr, n = Math.max(1, Math.round(loop / step)), at = rand() * step;
    // one pace per loop, so its fireflies never bunch; the rim's a little quicker, since the edge clips half its wander
    const way = (ring % 2 ? -1 : 1) * (0.9 + rand() * 0.2);
    for (let i = 0; i < n; i++) {
      let pick = rand(), col = FLY.draft;
      for (const [share, c] of FLASH_COLOURS) if ((pick -= share) < 0) { col = c; break; }
      const wander = () => (0.0015 + rand() * 0.0015) * (rand() < 0.5 ? -1 : 1); // radians per ms, each its own
      flies.push({ rr, s0: at + i * loop / n, v: way * (ring || still ? swarm : Math.max(swarm, 0.008 * px / 1.2)), col, ph: rand() * 6.28,
        ax: wander(), bx: wander(), ay: wander(), by: wander(), every: 2000 + rand() * 3000, dartAt: rand() * 5000, dir: rand() * 6.28,
        land: rand() * 400, go: FLASH.leave * (0.8 + rand() * 0.2), tilt: (rand() - 0.5) * 1.2,
        strayBy: !jostle ? 0 : (r - rr) + 5 * (rand() < 0.15 ? 3 + rand() * 2 : 1 + rand()) * step * jostle, rest: 0.45 + rand() * 0.45, overshoot: rand() < 0.3,
        off: [0, 0], strayEvery: 0, lead: 0, spot: [0, 0], vel: [0, 0], from: [0, 0], len: 0, arrive: 0, delay: 0, lift: 0, flowT: 0, c1: [0, 0], c2: [0, 0] }); // the rest, worked out below
    }
  }
  // Each firefly's landing time is set first, which fixes where it joins its loop and which way it's moving there. It
  // comes in from the side behind that heading (the nearer side where its loop runs up or down), from anywhere along
  // its height, so it eases into the loop going the same way instead of hooking round to turn back.
  for (const f of flies) {
    // The swirl runs for everyone from the first landing, so they all move with one flow and stay evenly spread: a
    // firefly landing later lands where the swirl would have carried it by then, already moving the way it goes.
    f.off = [0, 0];
    for (let at = 0; at < f.land; at += 16) f.off = carry(holdAt(f, at), f.off, at, Math.min(16, f.land - at));
    // its first stray: some are mid-stray as they land (they arrive past the rim and drift back in), the rest stray
    // a moment after landing
    // a stray's cycle is the stray itself plus a rest at home about two thirds as long, so about six in ten are out at
    // once (never shorter than the stray, or it would restart mid-stray and the firefly would snap back to the rim)
    f.strayEvery = strayFor(f) * (1 + f.rest);
    f.lead = f.overshoot ? strayFor(f) * (0.3 + rand() * 0.3) : -rand() * f.rest * strayFor(f);
    const b = holdAt(f, f.land), carried = swirl([b[0] + f.off[0], b[1] + f.off[1]], f.land), own = heading(f, f.land);
    const p = keepIn([b[0] + f.off[0], b[1] + f.off[1]]), o = strayOff(f, f.land), o2 = strayOff(f, f.land + 1);
    f.spot = [p[0] + o[0], p[1] + o[1]];
    f.vel = [own[0] + carried[0] + o2[0] - o[0], own[1] + carried[1] + o2[1] - o[1]];
    const behind = Math.abs(f.vel[0]) > 0.3 * Math.abs(f.vel[1]) ? f.vel[0] > 0 : f.spot[0] < cx;
    f.from = still ? f.spot : [behind ? -glowR : W + glowR, glowR + rand() * (H - glowR)];
    f.len = Math.hypot(f.spot[0] - f.from[0], f.spot[1] - f.from[1]) * 1.15;
    f.arrive = still ? 800 : f.len / fly;
  }
  // The arrival lasts as long as the longest flight.
  gather = Math.max(...flies.map(f => f.arrive), 800);
  const settle = gather + 400, leaveAt = settle + FLASH.hold, end = leaveAt + 400 + FLASH.leave;
  for (const f of flies) {
    f.land += gather; f.delay = f.land - f.arrive; f.lift = leaveAt + f.land - gather; f.flowT = f.land;
    // handles: out of the edge a third of the way towards a bend, and into the spot at its loop's pace and heading, so it
    // slows all the way down to that pace instead of stopping
    // The bend goes to whichever side keeps the path in the window: the pill sits near the top, and a path bowing up
    // past it would skim along above the window with only the edges of its glows showing, a line stuck to the top.
    let via: Point = bend(f.from, f.spot, rand);
    if (via[1] < glowR) via = [f.from[0] + f.spot[0] - via[0], f.from[1] + f.spot[1] - via[1]];
    f.c1 = still ? f.spot : toward(f.from, via, f.len / 3);
    f.c2 = [f.spot[0] - f.vel[0] * f.arrive / 3, f.spot[1] - f.vel[1] * f.arrive / 3];
  }
  // A soft amber glow in the shape of the words, under the fireflies, coming and going with them: where the swarm thins
  // behind a letter the dark sky doesn't show through, so the text keeps its contrast, and it hugs the letters rather
  // than reading as a shape of its own. The words are drawn blurred once (as a shadow, since WebKit's canvas has no
  // filter, with the words themselves off to the side, out of view), then stamped each frame.
  const words = [...pill.children], pad = 16, blur = 5;
  const boxes = words.map(e => e.getBoundingClientRect());
  const bx = Math.min(...boxes.map(b => b.left)) - pad, by = Math.min(...boxes.map(b => b.top)) - pad;
  const bw = Math.max(...boxes.map(b => b.right)) + pad - bx, bh = Math.max(...boxes.map(b => b.bottom)) + pad - by;
  const backing = document.createElement('canvas');
  backing.width = Math.ceil(bw * k); backing.height = Math.ceil(bh * k);
  const bg = backing.getContext('2d'), away = backing.width * 2;
  if (!bg) { layer.remove(); return Promise.resolve(); }
  bg.scale(k, k);
  bg.shadowColor = FLY.draft; bg.shadowBlur = 2 * blur * k; bg.shadowOffsetX = away * k; bg.fillStyle = FLY.draft; bg.lineWidth = 4;
  bg.strokeStyle = FLY.draft; bg.textAlign = 'center'; bg.textBaseline = 'middle'; bg.lineJoin = 'round';
  words.forEach((e, i) => {
    const css = getComputedStyle(e), b = nth(boxes, i), text = e.textContent ?? '';
    bg.font = `${css.fontStyle} ${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
    for (let pass = 0; pass < 3; pass++) { // a few passes, so the glow is solid right around the strokes
      bg.fillText(text, b.left + b.width / 2 - bx - away, b.top + b.height / 2 - by);
      bg.strokeText(text, b.left + b.width / 2 - bx - away, b.top + b.height / 2 - by);
    }
  });
  let t0 = performance.now(), shown = '';
  // a click opens the stats panel with this badge's card pinned (stats.ts), and sends the swarm off now
  pill.onclick = () => {
    live.pinnedBadge = id;
    $('stats').showPopover();
    t0 = Math.min(t0, performance.now() - leaveAt);
  };
  return new Promise<void>(done => {
    const draw = () => {
      const t = performance.now() - t0;
      if (t >= end) { layer.remove(); return done(); }
      g.clearRect(0, 0, W, H);
      const text = Math.max(0, Math.min(1, (t - settle - 300) / 600, 1 - (t - leaveAt) / 500));
      g.globalCompositeOperation = 'source-over';
      if (text && BACKING) { g.globalAlpha = text; g.drawImage(backing, bx, by, bw, bh); }
      g.globalCompositeOperation = 'lighter'; // light adds up
      for (const f of flies) {
        let p: Point, fade: number;
        if (t < f.delay) continue;
        if (t < f.land) { const u = (t - f.delay) / f.arrive; p = cubic(f.from, f.c1, f.c2, f.spot, u); fade = Math.min(1, u * 3); }
        else if (t < f.lift) { p = flow(f, t); fade = 1; f.was = [f.at ?? p, f.flowT]; f.at = p; }
        else {
          // off from wherever the current had carried it, out towards a side (a little upward), speeding up from its
          // loop's pace to the fly speed on a gently curving path
          if (!f.exit) {
            // from where the swarm had it, going the way it was going (its last frame's step)
            const p0 = f.at ?? holdAt(f, f.lift);
            const len = fly * f.go, side = f.tilt > 0 ? W + glowR : -glowR;
            const vel: Point = f.was ? [(p0[0] - f.was[0][0]) / 16, (p0[1] - f.was[0][1]) / 16] : heading(f, f.lift);
            const away = still ? p0 : toward(p0, [side, p0[1] - H * 0.15 + f.tilt * H * 0.4], len);
            const along = toward(away, p0, len / 3), curl = f.tilt * len * 0.3;
            f.exit = { p0, away, c3: [p0[0] + vel[0] * f.go / 3, p0[1] + vel[1] * f.go / 3],
              c4: [along[0] - (away[1] - p0[1]) / len * curl, along[1] + (away[0] - p0[0]) / len * curl] };
          }
          const { p0, c3, c4, away } = f.exit, u = Math.min(1, (t - f.lift) / f.go); p = cubic(p0, c3, c4, away, u); fade = 1 - u;
        }
        const swell = fireflySwell(t / 1000, f.ph), br = bloomR * (0.75 + 0.45 * swell);
        g.globalAlpha = (0.6 + 0.4 * swell) * fade; g.drawImage(sprite(f.col), p[0] - br, p[1] - br, 2 * br, 2 * br);
      }
      // the name comes up once the pill has formed and goes as the swarm leaves
      if (text.toFixed(2) !== shown) pill.style.opacity = shown = text.toFixed(2);
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  });
}

window.lanternBadge = flashBadge; // from the console: lanternBadge('hive_mind')
// ?demoBadge=hive_mind,ghosted plays those badges on load, without earning them
for (const id of (Q.get('demoBadge') || '').split(',').filter(Boolean)) setTimeout(() => flashBadge(id), 1500);
let devBadge = devSelect('Demo', 'badge', 'badge', Object.keys(ACHIEVEMENTS), 'warm_all_day', 'Which badge the play button flashes', v => { devBadge = v; });
devButton('Demo', 'play badge', 'Flash the chosen badge, without earning it', () => flashBadge(devBadge));
