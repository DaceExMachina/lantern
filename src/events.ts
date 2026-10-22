import { Q } from './scene/scene';
import { useLanternStore } from './stores/lantern';
import { fetchStats, isGitHub, isRecord, parseJson, parseSettings } from './types';

// The chrome's line to the server. The scene still opens its own EventSource (src/wiring.ts),
// so for now there are two connections.
export function connect(store = useLanternStore()) {
  const es = new EventSource('/events');
  // A named event's data, as text: its JSON goes through a guard or parser (types.ts) before the store sees it.
  const listen = (type: string, handle: (text: string) => void) => es.addEventListener(type, e => {
    const text: unknown = 'data' in e ? e.data : null;
    if (typeof text === 'string') handle(text);
  });
  es.onmessage = e => {
    const sessions: unknown = JSON.parse(e.data);
    if (Array.isArray(sessions)) store.sessions = sessions.filter(isRecord);
  };
  // ?style= previews one lantern, whatever the settings say (the scene does the same)
  listen('settings', t => { const settings = parseSettings(parseJson(t)); store.settings = { ...settings, style: Q.get('style') ?? settings.style }; });
  listen('github', t => { const github = parseJson(t); if (isGitHub(github)) store.github = github; });
}

export async function loadStats(store = useLanternStore()) {
  try {
    store.stats = await fetchStats();
    store.statsFailed = false;
  } catch { store.statsFailed = true; }
}
