// The screensaver host calls this on its own animation clock (see src/wiring.ts).
declare function lanternTick(): void;
// Lantern.app's script message handlers (app/main.swift); a browser tab has none.
interface Window { webkit?: { messageHandlers: { dock?: { postMessage: (dockWidth: number) => void } } } }
interface Window { lanternTick: () => void; lanternFrames: number; lanternBadge: (id: string) => void; lanternExpose?: boolean }
