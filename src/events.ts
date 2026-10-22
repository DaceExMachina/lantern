import { useLanternStore, type Stats } from './stores/lantern';

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStats = (x: unknown): x is Stats => isRecord(x) && Array.isArray(x['days']) && Array.isArray(x['achievements']) && isRecord(x['tally']);

// The chrome's line to the server. The scene's classic scripts still open their own EventSource (public/page/main.js),
// so for now there are two connections.
export function connect(store = useLanternStore()) {
  const es = new EventSource('/events');
  es.onmessage = e => {
    const sessions: unknown = JSON.parse(e.data);
    if (Array.isArray(sessions)) store.sessions = sessions.filter(isRecord);
  };
  es.addEventListener('settings', e => {
    const settings: unknown = e instanceof MessageEvent ? JSON.parse(e.data) : null;
    if (isRecord(settings)) store.settings = settings;
  });
}

export async function loadStats(store = useLanternStore()) {
  try {
    const stats: unknown = await (await fetch('/stats')).json();
    if (!isStats(stats)) throw new Error('not the stats');
    store.stats = stats;
    store.statsFailed = false;
  } catch { store.statsFailed = true; }
}
