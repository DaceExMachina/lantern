// The dev panel's way to see the GitHub menu mid sign-in without a real one (src/components/GitHubPanel.vue shows it).
// It lives here so the dev panel lists it in the order the scene's modules load.

import { devToggle } from '../dev';

const watchers = new Set<(on: boolean) => void>();
export let ghDemo = devToggle('Demo', 'ghconnect', 'GitHub connecting', false, 'Show the GitHub menu mid sign-in, with a made-up code', v => { ghDemo = v; watchers.forEach(w => w(v)); });
/** Calls `watcher` whenever the toggle flips; returns the way to stop. */
export const watchGhDemo = (watcher: (on: boolean) => void) => { watchers.add(watcher); return () => { watchers.delete(watcher); }; };
