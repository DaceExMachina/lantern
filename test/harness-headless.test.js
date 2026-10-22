// Every Swift harness that makes a window must never take focus or land on a screen (see test/saver/main.swift).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const harnesses = ['test/saver/main.swift', 'test/morph/main.swift', 'scripts/snapshots.swift'];

test('every window-making harness is in the list', () => {
  const found = ['test', 'scripts'].flatMap(d => fs.readdirSync(path.join(ROOT, d), { recursive: true, withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.swift')).map(e => path.relative(ROOT, path.join(e.parentPath, e.name))))
    .filter(f => /NSWindow|WKWebView/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  assert.deepEqual(found.sort(), [...harnesses].sort());
});

for (const f of harnesses) {
  test(`${f} stays headless`, () => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.match(src, /setActivationPolicy\(\.prohibited\)/);
    assert.match(src, /collectionBehavior = \[\.transient, \.ignoresCycle\]/);
    assert.match(src, /NSScreen\.screens\.map\(\\\.frame\.maxX\)\.max\(\)! \+ 10000/);
    assert.doesNotMatch(src, /x:\s*-\d/, 'a negative origin can land on a display');
    assert.doesNotMatch(src, /\.(orderFront|makeKeyAndOrderFront|orderFrontRegardless)\(|\.activate\(|activateIgnoringOtherApps|makeKey\(/);
    assert.match(src, /asyncAfter\(deadline: \.now\(\) \+ \d+\) \{[^}]*exit\(/);
  });
}
