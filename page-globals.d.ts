// The screensaver host calls this on its own animation clock (see index.html).
declare function lanternTick(): void;
interface Window { lanternTick: () => void }
