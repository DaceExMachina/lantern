// The optional notification and chime when a session needs you.

// ---- optional notification + chime --------------------------------------------
const box = $('notify');
let audio;
// the menu's switch, remembered by this browser
try { box.checked = localStorage.getItem('lantern-notify') === '1'; } catch {}
box.onchange = () => {
  try { localStorage.setItem('lantern-notify', box.checked ? '1' : '0'); } catch {}
  if (box.checked) { audio ??= new AudioContext(); if (Notification.permission === 'default') Notification.requestPermission(); }
};
function alertMe(s) {
  if (!box.checked) return;
  const name = s.title || s.cwd.split('/').filter(Boolean).pop() || 'a session';
  if (Notification.permission === 'granted') new Notification('Lantern', { body: `${name} needs you`, silent: true });
  audio ??= new AudioContext();
  const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
  o.frequency.setValueAtTime(660, t); o.frequency.exponentialRampToValueAtTime(990, t + 0.25);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 1);
}
