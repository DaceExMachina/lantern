// A redraw patches the card in place (card.ts morph), so what the browser holds on its elements survives it: keyboard
// focus, scroll, hover, and a press on the PR toggle between mousedown and mouseup. Only a real browser has those, so
// test/morph/main.swift drives the page in off-screen WebKit through the fixture's morph steps (test/snapshots/fixture.js).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, execFile } = require('child_process');
const { promisify } = require('util');
const { serveBuild } = require('../scripts/serve');

const ROOT = path.join(__dirname, '..');

// builds the harness and runs it against a fresh build of the page loaded with `query`
async function harness(query) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lantern-morph-')), page = await serveBuild();
  try {
    execFileSync('swiftc', ['-o', path.join(tmp, 'harness'), 'test/morph/main.swift'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
    // not spawnSync: this process serves the page the harness loads
    const run = await promisify(execFile)(path.join(tmp, 'harness'), [ROOT, page.url, query], { timeout: 90000 }).catch(e => e);
    assert.strictEqual(run.code ?? 0, 0, run.stdout + run.stderr);
  } finally {
    await page.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

test('a redraw keeps focus, scroll, hover and a press, and another session\'s card starts at the top', () => harness('style=barrel&morph'));

// The screensaver has no footer under the scene, so the swinging lantern's turned layers reached past the bottom of the
// screen, the page grew a scrollbar, and the scene refitted to the narrower window: the whole screen shook (fixture.js sway).
test('on the screensaver, the lantern at the end of its swing neither scrolls the page nor refits the scene', () => harness('style=barrel&screensaver&sway'));
