// How hard a session (or Lantern) is working the Mac, in three steps (yellow, orange, red) for the numbers on its card and its row in the usage
// dropdown. CPU counts in cores' worth, averaged over the last 30 s (six samples) so a brief spike doesn't flash a colour; RAM is the
// physical footprint now. The thresholds are dev knobs (?dev, "Usage heat"), in cores and GB.
import { devSlider } from '../dev';
import type { Usage, UsageGroup } from '../types';

const WINDOW = 6; // 30 s of the server's 5 s samples
const NAMES = ['yellow', 'orange', 'red'];
const cpuAt = [1, 2, 4], ramAt = [4, 8, 16];
NAMES.forEach((n, i) => {
  devSlider('Usage heat', `heatcpu${i + 1}`, `CPU ${n}`, 0, 16, 0.5, cpuAt[i] ?? 0, 'Cores of CPU, averaged over the last 30 s, from which a session\'s CPU number turns this colour', v => { cpuAt[i] = v; });
  devSlider('Usage heat', `heatram${i + 1}`, `RAM ${n}`, 0, 64, 1, ramAt[i] ?? 0, 'GB of RAM from which a session\'s RAM number turns this colour', v => { ramAt[i] = v; });
});

const samples = new Map<string, number[]>(); // per session (and 'lantern' and 'else', and each session's process groups, "id/name"): the last few CPU readings in cores
/** Takes a usage sample: remembers each group's CPU, and forgets the ones that are gone, so it stays as small as the sessions. */
export function recordUsage(u: Usage) {
  const groups = Object.entries({ ...u.sessions, lantern: u.lantern, ...u.else && { else: u.else } });
  const now = groups.flatMap(([id, g]) => [[id, g] as const, ...(g.procs ?? []).map(p => [`${id}/${p.name}`, p] as const)]);
  const seen = new Set<string>();
  for (const [id, g] of now) { seen.add(id); samples.set(id, [...samples.get(id) ?? [], g.cpu / 100].slice(-WINDOW)); }
  for (const id of samples.keys()) if (!seen.has(id)) samples.delete(id);
}
const step = (v: number, at: number[]) => at.filter(t => v >= t).length;
/** 0 for normal, 1 to 3 for yellow, orange, red; and the CPU average that decided it, in cores. */
export function heatOf(id: string, g: UsageGroup) {
  const s = samples.get(id), cores = s?.length ? s.reduce((a, b) => a + b, 0) / s.length : g.cpu / 100;
  return { cpu: step(cores, cpuAt), mem: step(g.mem / 1024, ramAt), cores };
}
/** Why a number is coloured, for its tooltip; empty when it isn't. */
export const heatTip = (h: ReturnType<typeof heatOf>, g: UsageGroup) => ({
  cpu: h.cpu ? `high CPU: about ${h.cores.toFixed(1)} cores for the last 30 s` : '',
  mem: h.mem ? `high RAM: ${(g.mem / 1024).toFixed(1)} GB` : '',
});
