// node install.js            -> merge Lantern hooks into ~/.claude/settings.json (backs it up first)
// node install.js uninstall  -> remove only Lantern's hooks
const fs = require('fs');
const os = require('os');
const path = require('path');

const FILE = path.join(os.homedir(), '.claude', 'settings.json');
const PORT = Number(process.env.LANTERN_PORT) || 7717;
const MARK = '#lantern';
const EVENTS = ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest',
  'Notification', 'Stop', 'StopFailure', 'SubagentStart', 'SubagentStop'];
// Runs in the background (async), gives up after 1s, never fails: Claude Code never waits on the lantern.
// The iTerm session id (empty outside iTerm) lets clicking a moth bring that terminal to the front.
const COMMAND = `curl -s -m 1 -H 'Content-Type: application/json' -H "X-Iterm-Session: $ITERM_SESSION_ID" --data-binary @- http://127.0.0.1:${PORT}/event >/dev/null 2>&1; exit 0 ${MARK}`;

const settings = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const backup = `${FILE}.lantern-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
if (fs.existsSync(FILE)) fs.copyFileSync(FILE, backup);

const hooks = settings.hooks || {};
// Strip any previous Lantern entries first, so install is idempotent and uninstall is just this step.
for (const ev of Object.keys(hooks)) {
  hooks[ev] = hooks[ev].filter(group => !group.hooks?.some(h => h.command?.includes(MARK)));
  if (!hooks[ev].length) delete hooks[ev];
}
if (process.argv[2] !== 'uninstall') {
  for (const ev of EVENTS) (hooks[ev] ||= []).push({ hooks: [{ type: 'command', command: COMMAND, async: true }] });
}
if (Object.keys(hooks).length) settings.hooks = hooks; else delete settings.hooks;

fs.writeFileSync(FILE, JSON.stringify(settings, null, 2) + '\n');
console.log(`${process.argv[2] === 'uninstall' ? 'Removed' : 'Installed'} Lantern hooks in ${FILE}`);
if (fs.existsSync(backup)) console.log(`Backup: ${backup}`);
