// Builds the screensaver like screensaver/build.sh (without installing it) and runs test/saver/main.swift against it: the
// page must stop on stopAnimation, on leaving its window and on macOS's willstop notification, and willstop must end the
// process, since macOS leaves the screensaver's host running for days otherwise.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
// willstop is posted to the whole Mac, so don't run while a real screensaver (whose host this would quit) is up
const saverRunning = spawnSync('pgrep', ['-x', 'legacyScreenSaver']).status === 0;

test('the screensaver stops its page and its process when macOS ends it', { skip: saverRunning && 'a screensaver is running' }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lantern-saver-'));
  try {
    const saver = path.join(tmp, 'Lantern.saver');
    fs.mkdirSync(path.join(saver, 'Contents/MacOS'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'screensaver/Info.plist'), path.join(saver, 'Contents/Info.plist'));
    // port 1: nothing listens there, so the page never reaches a real lantern
    execFileSync('plutil', ['-replace', 'LanternPort', '-string', '1', path.join(saver, 'Contents/Info.plist')]);
    const swiftc = args => execFileSync('swiftc', args, { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
    swiftc(['-module-name', 'Lantern', '-emit-executable', '-Xlinker', '-bundle', '-framework', 'ScreenSaver', '-framework', 'WebKit',
      '-o', path.join(saver, 'Contents/MacOS/Lantern'), 'screensaver/LanternView.swift']);
    swiftc(['-o', path.join(tmp, 'harness'), 'test/saver/main.swift']);
    const run = spawnSync(path.join(tmp, 'harness'), [saver], { encoding: 'utf8', timeout: 90000 });
    assert.strictEqual(run.status, 0, run.stdout + run.stderr);
    assert.doesNotMatch(run.stdout, /FAIL/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
