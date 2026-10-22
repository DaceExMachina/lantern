import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';

/** A day in GET /stats (app/Stats.swift). */
export interface Day {
  start: number; end: number; mothMs: number;
  warmLantern: number | null; warmMoths: number | null;
  medianWait: number | null; slowWait: number | null; waits: number; merged: number; open: number | null;
  stale: number | null; staleChange: number;
}
/** GET /stats: the event log boiled down. The last day is today. */
export interface Stats {
  days: Day[]; spans: unknown[][]; gauges: number[][]; prs: unknown[][];
  tally: Record<string, [number, string]>; achievements: [string, string][]; streak: number; warmGoal: number;
}

// What the chrome reads. Fed by src/events.ts; the scene never touches it, and nothing per-frame writes it. Arrays and
// parsed payloads are shallowRefs, so Vue never wraps them in proxies.
export const useLanternStore = defineStore('lantern', () => {
  const sessions = shallowRef<Record<string, unknown>[]>([]);
  const settings = shallowRef<Record<string, unknown>>({});
  const stats = shallowRef<Stats | null>(null);
  const statsFailed = ref(false);
  return { sessions, settings, stats, statsFailed };
});
