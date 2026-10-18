#!/usr/bin/env node
// npx claude-lantern            -> hooks, Lantern.app (the server and its window), screensaver, iTerm2 panel, then opens the app
// npx claude-lantern uninstall  -> undoes all of it (~/.claude/settings.json is backed up first either way)
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const HOME = os.homedir();
// npx runs from a cache npm may clear, so the server gets a stable copy here. A git checkout runs in place.
// Lantern.app keeps its settings here too, and the port and Claude config folder are written there once (below), since
// the app, opened from the Dock, never sees your shell's env.
const COPY = path.join(HOME, 'Library', 'Application Support', 'Lantern');
const SETTINGS = path.join(COPY, 'settings.json');
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

const LABEL = 'com.lantern.server';
const OLD_LABELS = ['com.dace.lantern']; // hand-made login items from before this installer
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

function stopServer() {
  for (const label of [LABEL, ...OLD_LABELS]) {
    tryRun('launchctl', 'bootout', `${DOMAIN}/${label}`);
    fs.rmSync(path.join(AGENTS, `${label}.plist`), { force: true });
  }
}

// Starts at login, restarts if it crashes. Uses the node that's running this, so nvm users get theirs.
function startServer(dir) {
  const plist = path.join(AGENTS, `${LABEL}.plist`);
  const env = process.env.LANTERN_PORT ? `<key>EnvironmentVariables</key><dict><key>LANTERN_PORT</key><string>${PORT}</string></dict>` : '';
  fs.mkdirSync(AGENTS, { recursive: true });
  fs.writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${path.join(dir, 'server.js')}</string>
  </array>
  ${env}
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/lantern.log</string>
  <key>StandardErrorPath</key><string>/tmp/lantern.log</string>
</dict>
</plist>
`);
  // A bootout that's still finishing makes bootstrap fail for a moment, so retry briefly.
  for (let i = 0; !tryRun('launchctl', 'bootstrap', DOMAIN, plist); i++) {
    if (i === 10) throw new Error(`launchctl couldn't load ${plist}`);
    sleep(500);
  }
  console.log(`Server starts at login (${plist})`);
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
  hooks();
  stopServer();
  if (uninstall) {
    fs.rmSync(SAVER, { recursive: true, force: true });
    if (fs.existsSync(APP_BIN)) {
      tryRun(APP_BIN, '--unregister'); // only the app can take its own login item back out
      tryRun('pkill', '-f', APP_BIN); // its server stops with it
      fs.rmSync(APP, { recursive: true });
    }
    tryRun('defaults', 'delete', 'com.lantern.app');
    fs.rmSync(path.join(ITERM_SCRIPTS, 'AutoLaunch', 'lantern.py'), { force: true });
    fs.rmSync(COPY, { recursive: true, force: true });
    return console.log('Removed the app, login items, screensaver, and iTerm2 panel. Lantern is out.');
  }

  let dir = __dirname;
  if (dir.split(path.sep).includes('_npx')) {
    fs.cpSync(dir, COPY, { recursive: true }); // keeps the lantern style the user picked (settings.json)
    dir = COPY;
  }
  // The port and Claude config folder you installed with, for the app (and LANTERN_PORT for the screensaver's build).
  // A first install from a checkout starts from the lantern style picked there.
  const from = [SETTINGS, path.join(dir, 'settings.json')].find(f => fs.existsSync(f));
  const settings = from ? JSON.parse(fs.readFileSync(from, 'utf8')) : {};
  if (PORT !== 7717 || settings.port) settings.port = PORT;
  if (process.env.CLAUDE_CONFIG_DIR) settings.claudeDir = process.env.CLAUDE_CONFIG_DIR;
  fs.mkdirSync(COPY, { recursive: true });
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
  process.env.LANTERN_PORT = String(PORT);
  // Lantern.app runs the server and opens at login. Without Xcode's command line tools, a launchd agent runs it instead.
  tryRun('pkill', '-f', APP_BIN); // a running copy would keep its old server
  const app = build(dir, 'the app', 'app/build.sh', 'Installed Lantern.app in ~/Applications: it runs the server and opens at login');
  if (app) {
    if (dir === COPY) tryRun('defaults', 'delete', 'com.lantern.app', 'pageDir'); // the app serves its own copy of the page
    else {
      run('defaults', 'write', 'com.lantern.app', 'pageDir', dir); // a checkout: the app serves its index.html, so edits go live
      const cache = 'github-cache.json'; // and the last PR status it saw comes along
      if (fs.existsSync(path.join(dir, cache)) && !fs.existsSync(path.join(COPY, cache))) fs.cpSync(path.join(dir, cache), path.join(COPY, cache));
    }
    run('open', ...(process.stdout.isTTY ? [] : ['-g']), APP); // the app is the server; agents running this get it in the background
  } else startServer(dir);
  build(dir, 'the screensaver', 'screensaver/build.sh', 'Installed the screensaver: pick Lantern in System Settings > Wallpaper > Screen Saver');
  iterm(dir);

  // launchd waits ~10s before restarting a server that couldn't get the port from the one we just stopped.
  for (let i = 0; i < 30 && !(await up()); i++) sleep(500);
  if (!(await up())) throw new Error(`The server didn't come up on ${URL}. Is something else using port ${PORT}? ${app ? '' : 'See /tmp/lantern.log'}`);
  console.log(`Lantern lit at ${URL}`);
  if (!app && process.stdout.isTTY) tryRun('open', URL); // scripts and agents running this don't get a browser tab
}

main().catch(e => { console.error(e.message); process.exit(1); });
