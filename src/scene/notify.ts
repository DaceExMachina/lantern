// The optional notification and chime when a session needs you.

import type { Session } from '../types';

// ---- optional notification + chime --------------------------------------------
let audio: AudioContext | undefined, on = false;
// the menu's switch, remembered by this browser
try { on = localStorage.getItem('lantern-notify') === '1'; } catch {}
export const notifying = () => on;
export function setNotifying(value: boolean) {
  on = value;
  try { localStorage.setItem('lantern-notify', on ? '1' : '0'); } catch {}
  if (on) { audio ??= new AudioContext(); if (Notification.permission === 'default') Notification.requestPermission(); }
}
export function alertMe(s: Session) {
  if (!on) return;
  const name = s.title || (s.cwd ?? '').split('/').filter(Boolean).pop() || 'a session';
  if (Notification.permission === 'granted') new Notification('Lantern', { body: `${name} needs you`, silent: true });
  audio ??= new AudioContext();
  const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
  o.frequency.setValueAtTime(660, t); o.frequency.exponentialRampToValueAtTime(990, t + 0.25);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 1);
}
