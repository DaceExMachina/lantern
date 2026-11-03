// scripts/reload-server restarts only the server, so it must refuse when the running window wasn't built from this
// app/main.swift. It runs here in a stand-in checkout (its own app/build.sh) against a stand-in app whose window is a
// process that just waits, so nothing real is built, stopped or opened.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn, spawnSync } = require('child_process');

test('reload-server goes ahead when the window runs this main.swift, however new the file, and again after its own reload', async t => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lantern-reload-')));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const repo = path.join(tmp, 'repo'), app = path.join(tmp, 'Apps', 'Lantern.app'), bin = path.join(app, 'Contents/MacOS/Lantern');
  const waiter = path.join(tmp, 'waiter');
  execFileSync('cc', ['-x', 'c', '-o', waiter, '-'], { input: 'int pause(void); int main(void) { pause(); return 0; }' });
  fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'app'));
  fs.copyFileSync(path.join(__dirname, '../scripts/reload-server'), path.join(repo, 'scripts/reload-server'));
  fs.chmodSync(path.join(repo, 'scripts/reload-server'), 0o755);
  fs.writeFileSync(path.join(repo, 'app/main.swift'), 'window v1\n');
  // the stand-in build: a new executable (a new file, as the real one makes) and the window's code beside it
  fs.writeFileSync(path.join(repo, 'app/build.sh'), `#!/bin/sh\nset -e\nA="$1/Lantern.app/Contents"\nmkdir -p "$A/MacOS" "$A/Resources"\nrm -f "$A/MacOS/Lantern"\ncp ${waiter} "$A/MacOS/Lantern"\ncp "$(dirname "$0")/main.swift" "$A/Resources/"\necho built >> ${tmp}/builds\n`, { mode: 0o755 });
  const build = () => execFileSync(path.join(repo, 'app/build.sh'), [path.dirname(app)]);
  build();
  const window = spawn(bin, [], { stdio: 'ignore' });
  t.after(() => window.kill('SIGKILL'));
  await new Promise(r => setTimeout(r, 200));
  const builds = () => fs.readFileSync(path.join(tmp, 'builds'), 'utf8').trim().split('\n').length;
  const reload = () => spawnSync(path.join(repo, 'scripts/reload-server'), { env: { ...process.env, LANTERN_APP: app, TMPDIR: tmp }, encoding: 'utf8' });
  const goes = what => { const before = builds(), r = reload(); assert.strictEqual(r.status, 0, `${what}: ${r.stderr}`); assert.strictEqual(builds(), before + 1, what); };
  const refuses = what => { const before = builds(), r = reload(); assert.strictEqual(r.status, 1, what); assert.match(r.stderr, /full relaunch/, what); assert.strictEqual(builds(), before, what); };

  const later = new Date(Date.now() + 60000);
  fs.utimesSync(path.join(repo, 'app/main.swift'), later, later); // a fresh worktree: the same main.swift, newer than the window
  goes('the same main.swift, just newer');
  goes('again, after its own reload replaced the app');
  fs.writeFileSync(path.join(repo, 'app/main.swift'), 'window v2\n');
  refuses('a changed main.swift');
  fs.writeFileSync(path.join(repo, 'app/main.swift'), 'window v1\n');
  goes('main.swift back as the window has it');
  build();
  refuses('an app built by hand since the window opened');
});

test('reload-server asks for a full relaunch from an app built before it copied main.swift in', async t => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lantern-reload-')));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const app = path.join(tmp, 'Apps', 'Lantern.app'), bin = path.join(app, 'Contents/MacOS/Lantern');
  fs.mkdirSync(path.dirname(bin), { recursive: true });
  execFileSync('cc', ['-x', 'c', '-o', bin, '-'], { input: 'int pause(void); int main(void) { pause(); return 0; }' });
  const window = spawn(bin, [], { stdio: 'ignore' });
  t.after(() => window.kill('SIGKILL'));
  await new Promise(r => setTimeout(r, 200));
  const r = spawnSync(path.join(__dirname, '../scripts/reload-server'), { env: { ...process.env, LANTERN_APP: app, TMPDIR: tmp }, encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /full relaunch/);
});
