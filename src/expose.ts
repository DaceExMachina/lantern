// The page's modules by path, for the harnesses that drive it from outside (test/snapshots/fixture.js) and the console.
// Its own module, imported after wiring.ts: the glob's imports come first in whatever module holds it, in path order, and
// the scene must load in wiring.ts's order (the dev panel lists its controls in the order they load).
Object.assign(window, { lanternModules: import.meta.glob(['./scene/*.ts', './dev.ts', './wiring.ts'], { eager: true }) });
