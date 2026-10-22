document.title = 'L33';
import './events.js';

// The page's modules by path, for the harnesses that drive it from outside (test/snapshots/fixture.js) and the console.
Object.assign(window, { lanternModules: import.meta.glob(['./scene/*.js', './dev.js', './events.js'], { eager: true }) });
