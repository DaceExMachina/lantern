// A redraw patches the card in place (card.js morph), so what the browser holds on its elements survives it: keyboard
// focus, scroll, hover, and a press on the PR toggle between mousedown and mouseup. Only a real browser has those, so
// test/morph/main.swift drives the page in off-screen WebKit through the fixture's morph steps (test/snapshots/fixture.js).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

test('a redraw keeps focus, scroll, hover and a press, and another session\'s card starts at the top', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lantern-morph-'));
  try {
    execFileSync('swiftc', ['-o', path.join(tmp, 'harness'), 'test/morph/main.swift'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
    const run = spawnSync(path.join(tmp, 'harness'), [ROOT], { encoding: 'utf8', timeout: 90000 });
    assert.strictEqual(run.status, 0, run.stdout + run.stderr);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
