#!/usr/bin/env node
// npx claude-lantern            -> hooks, login item, Lantern.app, screensaver, iTerm2 panel, then opens the app
// npx claude-lantern uninstall  -> undoes all of it (~/.claude/settings.json is backed up first either way)
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const HOME = os.homedir();
const FILE = path.join(HOME, '.claude', 'settings.json');
const PORT = Number(process.env.LANTERN_PORT) || 7717;
const URL = `http://127.0.0.1:${PORT}`;
const MARK = '#lantern';
const EVENTS = ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest',
  'Notification', 'Stop', 'StopFailure', 'SubagentStart', 'SubagentStop', 'PreCompact', 'PostCompact'];
// Runs in the background (async), gives up after 1s, never fails: Claude Code never waits on the lantern.
// The iTerm session id (empty outside iTerm) lets clicking a moth bring that terminal to the front.
const COMMAND = `curl -s -m 1 -H 'Content-Type: application/json' -H "X-Iterm-Session: $ITERM_SESSION_ID" -H "X-Claude-Pid: $PPID" --data-binary @- ${URL}/event >/dev/null 2>&1; exit 0 ${MARK}`;

const LABEL = 'com.lantern.server';
const OLD_LABELS = ['com.dace.lantern']; // hand-made login items from before this installer
const DOMAIN = `gui/${/** @type {() => number} */ (process.getuid)()}`;
const AGENTS = path.join(HOME, 'Library', 'LaunchAgents');
const SAVER = path.join(HOME, 'Library', 'Screen Savers', 'Lantern.saver');
const APP = path.join(HOME, 'Applications', 'Lantern.app');
const ITERM_SCRIPTS = path.join(HOME, 'Library', 'Application Support', 'iTerm2', 'Scripts');
// npx runs from a cache npm may clear, so the server gets a stable copy here. A git checkout runs in place.
const COPY = path.join(HOME, 'Library', 'Application Support', 'Lantern');
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
  fs.copyFileSync(path.join(dir, 'iterm', 'lantern.py'), path.join(autoLaunch, 'lantern.py'));
  console.log('Added the iTerm2 panel: see the README to switch it on');
}

async function main() {
  if (process.platform !== 'darwin') throw new Error('Lantern needs macOS');
  hooks();
  stopServer();
  if (uninstall) {
    fs.rmSync(SAVER, { recursive: true, force: true });
    if (fs.existsSync(path.join(APP, 'Contents', 'MacOS', 'Lantern'))) fs.rmSync(APP, { recursive: true }); // not a Safari web app of the same name
    fs.rmSync(path.join(ITERM_SCRIPTS, 'AutoLaunch', 'lantern.py'), { force: true });
    fs.rmSync(COPY, { recursive: true, force: true });
    return console.log('Removed the login item, app, screensaver, and iTerm2 panel. Lantern is out.');
  }

  let dir = __dirname;
  if (dir.split(path.sep).includes('_npx')) {
    fs.cpSync(dir, COPY, { recursive: true }); // keeps the lantern style the user picked (settings.json)
    dir = COPY;
  }
  startServer(dir);
  const app = build(dir, 'the app', 'app/build.sh', 'Installed Lantern.app in ~/Applications');
  build(dir, 'the screensaver', 'screensaver/build.sh', 'Installed the screensaver: pick Lantern in System Settings > Wallpaper > Screen Saver');
  iterm(dir);

  // launchd waits ~10s before restarting a server that couldn't get the port from the one we just stopped.
  for (let i = 0; i < 30 && !(await up()); i++) sleep(500);
  if (!(await up())) throw new Error(`The server didn't come up on ${URL}. Is something else using port ${PORT}? See /tmp/lantern.log`);
  console.log(`Lantern lit at ${URL}`);
  if (process.stdout.isTTY) tryRun('open', app ? APP : URL); // scripts and agents running this don't get a window
}

main().catch(e => { console.error(e.message); process.exit(1); });
