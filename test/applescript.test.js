// Every AppleScript embedded in app/*.swift: a `tabs of X` / `sessions of X` / `windows of X` must name a variable the script
// binds (`repeat with X` or `set X to`). An unbound one is a runtime "variable X is not defined" that only shows up on a Mac.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const appDir = path.join(__dirname, '..', 'app');
const scripts = fs.readdirSync(appDir).filter(f => f.endsWith('.swift')).flatMap(f =>
  [...fs.readFileSync(path.join(appDir, f), 'utf8').matchAll(/"osascript", \["-e", """\n([\s\S]*?)"""/g)].map(m => [f, m[1]]));

test('the embedded AppleScripts are found', () => assert.ok(scripts.length >= 4, `found ${scripts.length}`));

test('every AppleScript loop target is a variable the script defines', () => {
  for (const [file, src] of scripts) {
    for (const [, name] of src.matchAll(/\b(?:tabs|sessions|windows) of (\w+)/g)) {
      assert.match(src, new RegExp(`\\b(?:repeat with|set) ${name}\\b`), `${file}: "${name}" is used but never bound in:\n${src}`);
    }
  }
});
