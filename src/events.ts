import { useLanternStore } from './stores/lantern';
import { fetchStats, isRecord } from './types';

// The chrome's line to the server. The scene still opens its own EventSource (src/wiring.ts),
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
    store.stats = await fetchStats();
    store.statsFailed = false;
  } catch { store.statsFailed = true; }
}
