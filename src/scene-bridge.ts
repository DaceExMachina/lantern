import type { Day } from './stores/lantern';

// The one place the chrome reaches into the scene. Today the classic scripts hand these over on window (public/page/main.js);
// once they are modules this file imports them instead and nothing else changes.
export interface Slices { from: number; to: number; slices: unknown[]; starts: number[] }
export interface SceneBridge {
  slices(day: Day, spans: unknown[][], gauges: number[][], count: number): Slices | null;
  ribbonBody(r: Slices, w: number, h: number): string;
  headline(day: Day): string;
  dayRibbon(r: Slices, end: string): string;
  followRibbon(box: Element, r: Slices, day: Day): void;
  restoreBadge(root: Element): void;
  setTally(tally: Record<string, [number, string]>): void;
  clock(t: number): string;
  dayKey(t: number): string;
  pct(v: number | null): string;
  ago(ms: number): string;
  ACHIEVEMENTS: Record<string, [string, string]>;
}
declare global { interface Window { sceneBridge: SceneBridge } }

// read when used, not on import: the scene's scripts run after this module
export const scene = (): SceneBridge => window.sceneBridge;
