// A redraw patches the card in place (card.js morph), so what the browser holds on its elements survives it: keyboard
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

test('a redraw keeps focus, scroll, hover and a press, and another session\'s card starts at the top', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lantern-morph-')), page = await serveBuild();
  try {
    execFileSync('swiftc', ['-o', path.join(tmp, 'harness'), 'test/morph/main.swift'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
    // not spawnSync: this process serves the page the harness loads
    const run = await promisify(execFile)(path.join(tmp, 'harness'), [ROOT, page.url], { timeout: 90000 }).catch(e => e);
    assert.strictEqual(run.code ?? 0, 0, run.stdout + run.stderr);
  } finally {
    await page.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
