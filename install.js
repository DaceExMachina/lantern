#!/usr/bin/env node
// npx claude-lantern            -> hooks, Lantern.app (the server and its window), screensaver, iTerm2 panel, then opens the app
// npx claude-lantern uninstall  -> undoes all of it (~/.claude/settings.json is backed up first either way)
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const HOME = os.homedir();
// Lantern.app keeps its data and settings here, and the port and Claude config folder are written there once (below), since
// the app, opened from the Dock, never sees your shell's env.
const DATA = path.join(HOME, 'Library', 'Application Support', 'Lantern');
const SETTINGS = path.join(DATA, 'settings.json');
const saved = fs.existsSync(SETTINGS) ? JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) : {};
const PORT = Number(process.env.LANTERN_PORT) || saved.port || 7717;
const FILE = path.join(process.env.CLAUDE_CONFIG_DIR || saved.claudeDir || path.join(HOME, '.claude'), 'settings.json');
const URL = `http://127.0.0.1:${PORT}`;
const MARK = '#lantern';
const EVENTS = ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest',
  'Notification', 'Stop', 'StopFailure', 'SubagentStart', 'SubagentStop', 'PreCompact', 'PostCompact'];
// Runs in the background (async), gives up after 1s, never fails: Claude Code never waits on the lantern.
// The terminal's own ids (each empty outside that terminal) and the app it runs in let clicking a moth bring that
// terminal tab, or the Claude app's session, to the front.
const COMMAND = `curl -s -m 1 -H 'Content-Type: application/json' -H "X-Iterm-Session: $ITERM_SESSION_ID" -H "X-Claude-Pid: $PPID" ` +
  `-H "X-Term-Program: $TERM_PROGRAM" -H "X-Term-App: $__CFBundleIdentifier" -H "X-Term-Pane: $WEZTERM_PANE$KITTY_WINDOW_ID" -H "X-Kitty-Socket: $KITTY_LISTEN_ON" ` +
  `--data-binary @- ${URL}/event >/dev/null 2>&1; exit 0 ${MARK}`;

const LABEL = 'com.lantern.server'; // the launchd agent older installs ran their Node server under
const DOMAIN = `gui/${/** @type {() => number} */ (process.getuid)()}`;
const AGENTS = path.join(HOME, 'Library', 'LaunchAgents');
const SAVER = path.join(HOME, 'Library', 'Screen Savers', 'Lantern.saver');
const APP = path.join(HOME, 'Applications', 'Lantern.app');
const ITERM_SCRIPTS = path.join(HOME, 'Library', 'Application Support', 'iTerm2', 'Scripts');
const APP_BIN = path.join(APP, 'Contents', 'MacOS', 'Lantern'); // only ours has this, not a Safari web app of the same name
const uninstall = process.argv[2] === 'uninstall';

const run = (cmd, ...args) => execFileSync(cmd, args, { stdio: 'pipe' });
const tryRun = (...a) => { try { run(...a); return true; } catch { return false; } };
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const up = () => new Promise(done => http.get(URL, res => { res.resume(); done(true); }).on('error', () => done(false)));

function hooks() {
  const settings = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
  if (fs.existsSync(FILE)) {
    const backup = `${FILE}.lantern-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(FILE, backup);
    console.log(`Backed up ${FILE} to ${backup}`);
  }
  const hooks = settings.hooks || {};
  // Strip any previous Lantern entries first, so install is idempotent and uninstall is just this step.
  for (const ev of Object.keys(hooks)) {
    hooks[ev] = hooks[ev].filter(group => !group.hooks?.some(h => h.command?.includes(MARK)));
    if (!hooks[ev].length) delete hooks[ev];
  }
  if (!uninstall) for (const ev of EVENTS) (hooks[ev] ||= []).push({ hooks: [{ type: 'command', command: COMMAND, async: true }] });
  if (Object.keys(hooks).length) settings.hooks = hooks; else delete settings.hooks;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(settings, null, 2) + '\n');
  console.log(`${uninstall ? 'Removed' : 'Added'} Claude Code hooks`);
}

function stopOldServer() {
  tryRun('launchctl', 'bootout', `${DOMAIN}/${LABEL}`);
  fs.rmSync(path.join(AGENTS, `${LABEL}.plist`), { force: true });
}

// The app and the screensaver are built from source on this Mac, which needs Xcode's command line tools.
function build(dir, what, script, done) {
  if (!tryRun('xcode-select', '-p')) return console.log(`Skipped ${what}: it needs Xcode command line tools (xcode-select --install), then run this again`);
  try {
    run('sh', path.join(dir, script));
    console.log(done);
    return true;
  } catch (e) {
    console.log(`Skipped ${what}: the build failed\n${String(e.stderr || e.message).trim()}`);
  }
}

function iterm(dir) {
  if (!fs.existsSync(ITERM_SCRIPTS)) return;
  const autoLaunch = path.join(ITERM_SCRIPTS, 'AutoLaunch');
  fs.mkdirSync(autoLaunch, { recursive: true });
  const script = fs.readFileSync(path.join(dir, 'iterm', 'lantern.py'), 'utf8').replace('127.0.0.1:7717', `127.0.0.1:${PORT}`);
  fs.writeFileSync(path.join(autoLaunch, 'lantern.py'), script);
  console.log('Added the iTerm2 panel: see the README to switch it on');
}

async function main() {
  if (process.platform !== 'darwin') throw new Error('Lantern needs macOS');
  // Without them, a Lantern.app from a release zip will do: this then only adds the hooks and the iTerm2 panel.
  if (!uninstall && !tryRun('xcode-select', '-p') && !fs.existsSync(APP_BIN)) {
    throw new Error('Lantern builds its app on this Mac, which needs Xcode command line tools: run `xcode-select --install`, then this again.\n' +
      'Or put Lantern.app from https://github.com/DaceExMachina/lantern/releases in ~/Applications, then run this again.');
  }
  hooks();
  stopOldServer();
  if (uninstall) {
    fs.rmSync(SAVER, { recursive: true, force: true });
    if (fs.existsSync(APP_BIN)) {
      tryRun(APP_BIN, '--unregister'); // only the app can take its own login item back out
      tryRun('pkill', '-f', APP_BIN); // its server stops with it
      fs.rmSync(APP, { recursive: true });
    }
    tryRun('defaults', 'delete', 'com.lantern.app');
    fs.rmSync(path.join(ITERM_SCRIPTS, 'AutoLaunch', 'lantern.py'), { force: true });
    fs.rmSync(DATA, { recursive: true, force: true });
    return console.log('Removed the app, login items, screensaver, and iTerm2 panel. Lantern is out.');
  }

  const dir = __dirname;
  const npx = dir.split(path.sep).includes('_npx'); // a cache npm may clear, unlike a git checkout
  // The port and Claude config folder you installed with, for the app (and LANTERN_PORT for the screensaver's build).
  // A first install from a checkout starts from the lantern style picked there.
  const from = [SETTINGS, path.join(dir, 'settings.json')].find(f => fs.existsSync(f));
  const settings = from ? JSON.parse(fs.readFileSync(from, 'utf8')) : {};
  if (PORT !== 7717 || settings.port) settings.port = PORT;
  if (process.env.CLAUDE_CONFIG_DIR) settings.claudeDir = process.env.CLAUDE_CONFIG_DIR;
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
  process.env.LANTERN_PORT = String(PORT);
  // Lantern.app runs the server and opens at login.
  tryRun('pkill', '-f', APP_BIN); // a running copy would keep its old server
  if (!build(dir, 'the app', 'app/build.sh', 'Installed Lantern.app in ~/Applications: it runs the server and opens at login') && !fs.existsSync(APP_BIN)) {
    throw new Error('Lantern.app didn\'t build, see above');
  }
  if (npx) tryRun('defaults', 'delete', 'com.lantern.app', 'pageDir'); // the app serves its own copy of the page
  else run('defaults', 'write', 'com.lantern.app', 'pageDir', dir); // a checkout: the app serves its index.html, so edits go live
  run('open', ...(process.stdout.isTTY ? [] : ['-g']), APP); // agents running this get it in the background
  build(dir, 'the screensaver', 'screensaver/build.sh', 'Installed the screensaver: pick Lantern in System Settings > Wallpaper > Screen Saver');
  iterm(dir);

  for (let i = 0; i < 30 && !(await up()); i++) sleep(500);
  if (!(await up())) throw new Error(`The server didn't come up on ${URL}. Is something else using port ${PORT}?`);
  console.log(`Lantern lit at ${URL}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
