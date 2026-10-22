import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import { parseSettings } from '../types';
import type { GitHub, Hovered, Pin, Session, Settings, Stats } from '../types';

// What the chrome reads. Fed by src/events.ts, the scene's chrome.update (src/main.ts) and the recap's openRecap, which sets
// `recap`; nothing per-frame writes it. Arrays and
// parsed payloads are shallowRefs, so Vue never wraps them in proxies.
export const useLanternStore = defineStore('lantern', () => {
  // the scene's own (src/scene/live.ts chrome.update): its sessions, the hover card's target and the pins
  const sessions = shallowRef<Session[]>([]);
  const hovered = shallowRef<Hovered | null>(null);
  const pinned = shallowRef<Pin[]>([]);
  // the clock relative times count from, a second at a time
  const now = ref(Date.now());
  setInterval(() => { now.value = Date.now(); }, 1000);
  const settings = shallowRef<Settings>(parseSettings({}));
  const github = shallowRef<GitHub>({ accounts: [], signIn: null });
  const stats = shallowRef<Stats | null>(null);
  const statsFailed = ref(false);
  const recap = shallowRef<{ stats: Stats; i: number } | null>(null); // the day RecapPanel shows: day `i` of these stats
  return { sessions, hovered, pinned, now, settings, github, stats, statsFailed, recap };
});
