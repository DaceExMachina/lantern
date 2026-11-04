// Messages between sessions: when one session sends another a message (SendMessage, which the server passes on as
// `event: message`), a gold pulse carries it. The sender's moth glows gold, a gold pulse runs down its thread to the
// lantern, then up the receiver's thread to its moth, which glows gold in turn. A moth sitting on the lantern has no
// thread out, so that leg is skipped: the pulse just reaches the lantern, or leaves from it.
// This only says, each frame, where the gold is: frame.ts draws it, on the threads (mothThread, with the tool calls'
// white pulse) and on the moths (mothColour), and each glow's aura is light the background shader draws, like a firefly's.

import { live } from './live';
import { WARM } from './lanterns';
import { quiet, sessionMoth } from './state';
import { devButton, devSlider } from '../dev';
import type { SessionMoth } from '../types';

export const GOLD = WARM.mid; // the lantern's warm gold, #FFC266 (--accent-warm in the chrome)
// The dev panel's knobs: the gold pulse's extra thickness on the thread, how strong its aura is, and how fast it all plays.
export const goldLook = {
  width: devSlider('Messages', 'msgwidth', 'pulse thickness', 0, 4, 0.25, 2, 'How much thicker a thread draws while a message\'s gold pulse runs along it (scene units)', v => { goldLook.width = v; }),
  aura: devSlider('Messages', 'msgaura', 'aura', 0, 2, 0.05, 1, 'How bright the soft glow behind a message\'s gold pulses is', v => { goldLook.aura = v; }),
  speed: devSlider('Messages', 'msgspeed', 'speed', 0.25, 3, 0.05, 1, 'How fast a message plays: the glows and the trip down and up the threads', v => { goldLook.speed = v; }),
};
// seconds at speed 1: each moth's glow, and each leg along a thread
export const SHINE = 0.7, LEG = 1;
/** A message on its way: the sessions' ids, and when it set off (a frame time, ms). */
interface Flight { from: string; to: string; at: number }
export const flights: Flight[] = [];
export const sendMessage = (from: string, to: string, at = performance.now()) => { flights.push({ from, to, at }); };

// A moth that can take part: there, not flying off, and not asleep on the lantern.
const awake = (m: SessionMoth | undefined) => m && !m.leaving && !(m.wasLanded && m.session?.snoozed) ? m : undefined;
// whether its thread reaches out to it: one landed on the lantern or circling another moth has none
const threaded = (m: SessionMoth) => !m.wasLanded && !m.satellite;
const rise = (u: number) => u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u); // 0 to 1 and back over a glow

/** Where every message's gold is at frame time `t` (ms), on the moths (`shine`) and their threads (`gold`). A message
 * whose moths go, fly off or fall asleep ends there, and so does every one in quiet hours. */
export function stepMessages(t: number) {
  for (const m of live.moths.values()) if (m.parentId === undefined) { m.shine = 0; m.gold = null; }
  for (let i = flights.length - 1; i >= 0; i--) {
    const f = flights[i], a = f && awake(sessionMoth(f.from)), b = f && awake(sessionMoth(f.to));
    if (!f || !a || !b || quiet()) { flights.splice(i, 1); continue; }
    // the timeline, in seconds: the sender's glow, the leg down its thread (from halfway through the glow), the leg up the
    // receiver's, then the receiver's glow (starting a little before the pulse gets there)
    const s = (t - f.at) / 1000 * goldLook.speed, down = threaded(a) ? LEG : 0, up = threaded(b) ? LEG : 0;
    const downAt = SHINE / 2, upAt = downAt + down, shineAt = Math.max(0, upAt + up - 0.15);
    if (s > shineAt + SHINE) { flights.splice(i, 1); continue; }
    if (s < 0) continue;
    live.brisk = true; // it moves fast (frame.ts frameDue)
    a.shine = Math.max(a.shine ?? 0, rise(s / SHINE));
    b.shine = Math.max(b.shine ?? 0, rise((s - shineAt) / SHINE));
    // along a thread `at` runs from the lantern (0) to the moth (1): down the sender's, then up the receiver's
    if (down && s >= downAt && s < upAt) a.gold = { at: 1 - (s - downAt) / down };
    if (up && s >= upAt && s < upAt + up) b.gold = { at: (s - upAt) / up };
  }
}

// The dev panel's "send a test message": between two of the moths on screen, on this page only.
devButton('Messages', 'send a test message', 'A gold pulse runs from one moth to another, as when one session messages another (this page only)', () => {
  const ids = [...live.moths.values()].filter((m): m is SessionMoth => m.parentId === undefined && !!awake(m)).map(m => m.key);
  const from = ids[Math.floor(Math.random() * ids.length)], others = ids.filter(id => id !== from), to = others[Math.floor(Math.random() * others.length)];
  if (from && to) sendMessage(from, to);
});
