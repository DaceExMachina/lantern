// The screensaver host calls this on its own animation clock (see src/wiring.ts).
declare function lanternTick(): void;
interface Window { lanternTick: () => void; lanternFrames: number; lanternBadge: (id: string) => void }
