import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import { parseSettings } from '../types';
import type { GitHub, Settings, Stats } from '../types';

// What the chrome reads. Fed by src/events.ts (and the recap's openRecap, which sets `recap`); nothing per-frame writes it. Arrays and
// parsed payloads are shallowRefs, so Vue never wraps them in proxies.
export const useLanternStore = defineStore('lantern', () => {
  const sessions = shallowRef<Record<string, unknown>[]>([]);
  const settings = shallowRef<Settings>(parseSettings({}));
  const github = shallowRef<GitHub>({ accounts: [], signIn: null });
  const stats = shallowRef<Stats | null>(null);
  const statsFailed = ref(false);
  const recap = shallowRef<{ stats: Stats; i: number } | null>(null); // the day RecapPanel shows: day `i` of these stats
  return { sessions, settings, github, stats, statsFailed, recap };
});
