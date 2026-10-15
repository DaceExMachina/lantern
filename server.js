// Lantern: receives Claude Code hook events, keeps session state, streams it to the page over SSE.
const http = require('http');
const fs = require('fs');
const { execFile, spawnSync } = require('child_process');
const path = require('path');

const PORT = Number(process.env.LANTERN_PORT) || 7717;
const EXPIRE_MS = 20 * 60 * 1000; // a session silent this long is assumed dead (killed terminal, no SessionEnd)
const WAITING_EXPIRE_MS = 3 * 60 * 60 * 1000; // ...unless it's waiting on me, which can quietly take a while
const SEED_RECENT_MS = 15 * 60 * 1000; // on startup, also bring back any session whose transcript moved this recently
const WAITING_NOTIFICATIONS = new Set(['permission_prompt', 'idle_prompt', 'elicitation_dialog', 'agent_needs_input']);

const PROJECTS = path.join(require('os').homedir(), '.claude', 'projects');
const TITLE_EVERY_MS = 15 * 1000;
const UUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;

// Settings every window shares (just the lantern style for now), kept next to the server and out of git.
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
let settings = { style: 'barrel' };
try { settings = { ...settings, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) }; } catch {}

const sessions = new Map(); // session_id -> { id, cwd, state, started, last, subagents: Map of agent_id -> { type, tool, last }, plus what the hover card shows }
const clients = new Set();

function snapshot() {
  return JSON.stringify([...sessions.values()].map(s => ({ ...s, subagents: [...s.subagents].map(([id, a]) => ({ id, ...a })) })));
}

function broadcast() {
  const msg = `event: reviews\ndata: ${JSON.stringify(reviews)}\n\ndata: ${snapshot()}\n\n`;
  for (const res of clients) res.write(msg);
}

// What a tool call is doing, in a few words: the closest thing hooks give us to the app's agent status lines.
function describe(tool, input = {}) {
  const file = p => String(p || '').split('/').pop();
  const text = {
    Bash: input.description || input.command,
    Read: `Reading ${file(input.file_path)}`,
    Edit: `Editing ${file(input.file_path)}`,
    MultiEdit: `Editing ${file(input.file_path)}`,
    Write: `Writing ${file(input.file_path)}`,
    NotebookEdit: `Editing ${file(input.notebook_path)}`,
    Grep: `Searching for "${input.pattern}"`,
    Glob: `Finding ${input.pattern}`,
    Agent: `Starting agent: ${input.description || input.subagent_type}`,
    Task: `Starting agent: ${input.description || input.subagent_type}`,
    WebFetch: `Fetching ${input.url}`,
    WebSearch: `Searching the web for "${input.query}"`,
    Skill: `Using skill ${input.skill}`,
  }[tool] || (tool?.startsWith('mcp__') ? `Using ${tool.split('__').slice(1).join(' ')}` : tool);
  return String(text || '').slice(0, 140);
}

// The question a finished turn ends on, if any: a "Blocker:" line, or a last sentence ending in "?".
function questionIn(message = '') {
  const text = String(message).replace(/[*_`#>]/g, '').trim();
  const blocker = text.match(/Blocker:\s*(.+)/i)?.[1];
  const last = text.split('\n').map(l => l.trim()).filter(Boolean).pop() || '';
  const asked = /\?\s*$/.test(last) ? last.split(/(?<=[.!])\s+/).pop() : '';
  return (blocker || asked).trim().slice(0, 160);
}

// What a finished turn hands me, for its card: the "You:" line from its status footer, PRs and other links, and
// the questions it asked. Links come from the model's own text, so only http(s) ones are kept.
function forYou(message = '') {
  const text = String(message).replace(/```[\s\S]*?```/g, ''); // nothing inside code blocks
  const plain = t => t.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`]/g, '').trim();
  const seen = new Set(), prs = [];
  for (const m of text.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)<>\]]+)/g)) {
    const url = (m[2] || m[3]).replace(/[.,;:]+$/, '');
    if (seen.has(url)) continue;
    seen.add(url);
    const pr = url.match(/github\.com\/[^/]+\/([^/]+)\/pull\/(\d+)/);
    const label = plain(m[1] || '') || (pr ? `${pr[1]}#${pr[2]}` : url.replace(/^https?:\/\//, '').slice(0, 60));
    if (pr) prs.push({ label: label.slice(0, 80), url });
  }
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('>'));
  const blockers = lines.filter(l => /Blocker:/i.test(l)).map(l => plain(l.replace(/^.*?Blocker:\**\s*/i, '')));
  const asked = lines.filter(l => !/Blocker:/i.test(l)).flatMap(l => plain(l).split(/(?<=[.!?])\s+/)).filter(q => q.endsWith('?'));
  // the You: line is the TL;DR of what to do; keep its links, split into plain text and {label, url} pieces
  const youRaw = text.match(/\*\*You:\*\*\s*(.+)/)?.[1] || '', you = [];
  let at = 0;
  for (const m of youRaw.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g)) {
    you.push(youRaw.slice(at, m.index).replace(/[*_`]/g, ''));
    you.push({ label: m[1].replace(/[*_`]/g, ''), url: m[2] });
    at = m.index + m[0].length;
  }
  if (at < youRaw.length) you.push(youRaw.slice(at).replace(/[*_`]/g, ''));
  return {
    you: you.filter(Boolean),
    prs: prs.slice(0, 6),
    questions: [...new Set([...blockers, ...asked])].slice(0, 5).map(q => q.slice(0, 160)),
  };
}

// Agent reports and notifications arrive as "prompts" wrapped in XML; keep just the readable part, labelled.
function cleanPrompt(p) {
  const tag = p.match(/^\s*<([\w-]+)/)?.[1];
  const summary = p.match(/<summary>([\s\S]*?)<\/summary>/)?.[1];
  const text = (summary || p)
    .replace(/\[Subagent hand-back\][\s\S]*?The report follows:/, '')
    .replace(/\[SYSTEM NOTIFICATION[^\]]*\]/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const label = { 'agent-message': 'Agent report: ', 'task-notification': 'Task update: ', 'side-sessions-event': 'Session update: ' }[tag] || '';
  return (label + text).slice(0, 200);
}

// Session names and agent tasks live next to the transcript the hooks point at. Only ever read inside ~/.claude/projects.
function sessionDir(transcript) {
  const p = path.resolve(String(transcript || ''));
  return p.startsWith(PROJECTS + path.sep) && p.endsWith('.jsonl') ? p.slice(0, -'.jsonl'.length) : null;
}
// A renamed session has custom-title.json; otherwise the transcript keeps logging an auto-generated title, so read its tail.
async function readTitle(s, dir) {
  try {
    s.title = JSON.parse(await fs.promises.readFile(path.join(dir, 'custom-title.json'), 'utf8')).customTitle || s.title;
  } catch {
    try {
      const fh = await fs.promises.open(dir + '.jsonl');
      const { size } = await fh.stat(), len = Math.min(size, 512 * 1024), buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, size - len);
      await fh.close();
      const last = key => [...buf.toString('utf8').matchAll(new RegExp(`"${key}":("(?:[^"\\\\]|\\\\.)*")`, 'g'))].pop()?.[1];
      const found = last('customTitle') || last('aiTitle');
      if (found) s.title = JSON.parse(found);
    } catch {}
  }
  broadcast();
}
function readJson(file, then) {
  fs.readFile(file, 'utf8', (err, text) => { if (!err) try { then(JSON.parse(text)); broadcast(); } catch {} });
}

function handle(e) {
  const id = e.session_id;
  if (!id) return;
  const ev = e.hook_event_name;
  if (ev === 'SessionEnd') return sessions.delete(id);

  let s = sessions.get(id);
  if (!s) {
    s = { id, cwd: e.cwd || '', state: 'working', started: Date.now(), last: 0, subagents: new Map() };
    sessions.set(id, s);
  }
  s.last = Date.now();
  if (ev === 'PreToolUse') s.ticks = (s.ticks || 0) + 1; // each tool call, its agents' included, sends a pulse down its thread
  // A session (or one of its agents) that runs `gh pr create` claims the PR: its URL is in the command's output.
  if (ev === 'PostToolUse' && e.tool_name === 'Bash' && /\bgh\s+pr\s+create\b/.test(e.tool_input?.command || '')) {
    const url = JSON.stringify(e.tool_response || '').match(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/)?.[0];
    if (url && !(s.created ||= []).includes(url)) { s.created.push(url); setTimeout(refreshGitHub, 3000); }
  }
  s.unconfirmed = false;
  if (e.cwd) s.cwd = e.cwd;
  if (e.permission_mode) s.mode = e.permission_mode;
  if (/^\d+$/.test(e.pid || '')) s.pid = Number(e.pid); // the Claude Code process the hook ran under ($PPID)
  const iterm = String(e.iterm || '').split(':').pop(); // ITERM_SESSION_ID looks like w0t1p0:<uuid>
  if (UUID.test(iterm)) s.iterm = iterm;
  const dir = sessionDir(e.transcript_path);
  if (dir) s.project = path.basename(path.dirname(dir));
  if (dir && Date.now() - (s.titleRead || 0) > TITLE_EVERY_MS) {
    s.titleRead = Date.now();
    readTitle(s, dir);
  }

  // Any event from inside a subagent tells us it exists, so agents started before the hooks or server still show up.
  if (e.agent_id) {
    if (ev === 'SubagentStop') s.subagents.delete(e.agent_id);
    else {
      const a = s.subagents.get(e.agent_id) || { type: '', description: '', activity: '', tries: 0 };
      // its meta file may not be written yet on the very first event, so try a few times
      if (!a.description && dir && a.tries++ < 3 && /^[\w-]+$/.test(e.agent_id)) readJson(path.join(dir, 'subagents', `agent-${e.agent_id}.meta.json`), j => {
        a.description = j.description || ''; a.type ||= j.agentType || '';
      });
      a.type = e.agent_type || a.type;
      if (ev === 'PreToolUse') a.activity = describe(e.tool_name, e.tool_input);
      a.last = Date.now();
      s.subagents.set(e.agent_id, a);
    }
    // Background agents keep working after the turn ends, so their activity mustn't clear "needs you". Them asking for me still counts.
    if (ev !== 'PermissionRequest' && ev !== 'Notification') return;
  }

  switch (ev) {
    case 'SessionStart':
      s.state = 'idle';
      break;
    case 'Stop': {
      // Three ways a turn ends: agents still running and nothing to ask (not waiting on me), agents running but
      // it asked me something, or fully stopped. Only the first one leaves me alone.
      const running = (e.background_tasks || []).filter(t => !t.status || t.status === 'running');
      const q = questionIn(e.last_assistant_message);
      const tasks = running.length ? `${running.length} background task${running.length > 1 ? 's' : ''}` : '';
      s.tasks = running.map(t => t.description).filter(Boolean).slice(0, 4);
      s.forYou = forYou(e.last_assistant_message);
      s.error = false;
      if (running.length && !q) { s.state = 'paused'; s.note = `Waiting on ${tasks}`; }
      else { s.state = 'waiting'; s.note = (q ? `Asks: ${q}` : 'Finished its turn') + (tasks ? ` (${tasks} still running)` : ''); }
      break;
    }
    case 'StopFailure':
      s.state = 'waiting';
      s.note = 'Turn ended with an API error';
      s.error = true; // the moth lands singed
      break;
    // A /compact you run yourself ends back at the prompt with no Stop after it, so put the session back to idle.
    // An automatic compact carries on with whatever the session was doing (working mid-turn, or waiting), so leave that.
    case 'PreCompact':
      s.activity = 'Compacting the conversation';
      if (e.trigger === 'manual') s.state = 'working';
      break;
    case 'PostCompact':
      s.activity = '';
      if (e.trigger === 'manual') { s.state = 'idle'; s.note = ''; }
      break;
    case 'PermissionRequest':
      s.state = 'waiting';
      s.note = `Wants permission to use ${e.tool_name || 'a tool'}`;
      break;
    case 'Notification':
      // the "idle, waiting for input" nudge also fires while a session waits on its agents; that one doesn't count
      if (e.notification_type === 'idle_prompt' && s.state === 'paused') break;
      if (WAITING_NOTIFICATIONS.has(e.notification_type)) { s.state = 'waiting'; s.note = e.message || s.note; }
      break;
    default: // UserPromptSubmit, PreToolUse, PostToolUse: the session is moving, so it no longer needs me
      s.state = 'working';
      s.note = '';
      s.tasks = [];
      s.error = false;
      s.snoozed = false; // a snooze only covers the wait it was set on
      if (ev === 'UserPromptSubmit' && e.prompt) s.prompt = cleanPrompt(e.prompt);
      if (ev === 'PreToolUse') s.activity = describe(e.tool_name, e.tool_input);
      if (ev === 'UserPromptSubmit') s.activity = 'Thinking about your message';
  }
  // when it started waiting on me: the footer goes oldest first, and moths grow restless the longer it's been
  if (s.state === 'waiting') s.waitingSince ||= Date.now(); else s.waitingSince = 0;
}

// ---- finding a session's iTerm tab when hooks haven't told us (seeded, or quiet since a restart) ---------------
const run = (cmd, args) => new Promise(done => execFile(cmd, args, { timeout: 10000 }, (err, out) => done(String(out || ''))));
const tabTitle = name => name.replace(/^[^\w(]+/, '').replace(/\s*\(claude\)$/, '').trim(); // "✳ Some title (claude)" -> "Some title"

async function findIterm(s) {
  // the separator is set outside the tell block: inside it, the word `tab` means iTerm's tab object, not a character
  const tabs = (await run('osascript', ['-e', `set out to ""
    set sep to character id 9
    tell application "iTerm2"
      repeat with w in windows
        repeat with t in tabs of w
          repeat with ss in sessions of t
            set out to out & (unique id of ss) & sep & (name of ss) & linefeed
          end repeat
        end repeat
      end repeat
    end tell
    return out`])).split('\n').map(l => l.split('\t')).filter(([id]) => UUID.test(id || ''));
  // 1. Claude Code puts the session title in the tab name
  const byTitle = s.title && tabs.find(([, name]) => tabTitle(name) === s.title);
  if (byTitle) return byTitle[0];
  // 2. Otherwise: the terminal `claude` in this session's project folder whose tab no other session can claim
  const pids = (await run('ps', ['-axo', 'pid=,comm='])).split('\n').map(l => l.trim().split(/\s+/)).filter(([, c]) => c === 'claude').map(([p]) => p);
  if (!pids.length) return null;
  const tabOf = {}, dirOf = {};
  for (const line of (await run('ps', ['-E', '-p', pids.join(','), '-o', 'pid=,command='])).split('\n')) {
    const pid = line.trim().split(/\s+/)[0], id = line.match(/ITERM_SESSION_ID=\S*?([0-9A-F-]{36})/i)?.[1];
    if (id) tabOf[pid] = id;
  }
  let pid;
  for (const line of (await run('lsof', ['-a', '-d', 'cwd', '-p', pids.join(','), '-Fpn'])).split('\n')) {
    if (line[0] === 'p') pid = line.slice(1);
    if (line[0] === 'n') dirOf[pid] = line.slice(1).replace(/[^a-zA-Z0-9]/g, '-');
  }
  const others = [...sessions.values()].filter(o => o !== s);
  const claimed = new Set(others.map(o => o.iterm).filter(Boolean));
  for (const [id, name] of tabs) if (others.some(o => o.title && o.title === tabTitle(name))) claimed.add(id);
  const left = pids.filter(p => dirOf[p] === s.project && tabOf[p] && !claimed.has(tabOf[p])).map(p => tabOf[p]);
  return left.length === 1 ? left[0] : null;
}

// ---- seeding: rebuild sessions from disk when the server starts, so a restart doesn't forget them -------------
function tail(file, bytes = 256 * 1024) {
  const fd = fs.openSync(file, 'r');
  try {
    const { size } = fs.fstatSync(fd), len = Math.min(size, bytes), buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    return buf.toString('utf8').split('\n');
  } finally { fs.closeSync(fd); }
}
// How the last turn ended: a finished turn (end_turn, then a turn_duration marker) means it's waiting for me.
function lastTurn(lines) {
  let ended = false; // a turn_duration marker comes after the final message, so keep looking back for its text
  for (let i = lines.length - 1; i >= 0; i--) {
    let j; try { j = JSON.parse(lines[i]); } catch { continue; }
    if (j.type === 'system' && j.subtype === 'turn_duration') { ended = true; continue; }
    if (j.type === 'assistant') {
      const text = (j.message?.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
      if (ended && !text) continue;
      return { done: ended || j.message?.stop_reason === 'end_turn', text, cwd: j.cwd };
    }
    if (ended) return { done: true, cwd: j.cwd };
    if (j.isCompactSummary || j.subtype === 'compact_boundary') return { done: true, compacted: true, cwd: j.cwd }; // stopped right after a compact
    if (j.type === 'user') return { done: false, cwd: j.cwd };
  }
  return { done: false };
}
const transcripts = dir => { try { return fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')).map(f => path.join(dir, f)); } catch { return []; } };
const byNewest = files => files.map(f => [f, fs.statSync(f).mtimeMs]).sort((a, b) => b[1] - a[1]).map(([f]) => f);

// Each running terminal `claude` writes into the project folder named after its working folder, so the newest
// transcripts there (one per process) are live sessions, however long they've been quiet.
function liveTranscripts() {
  const pids = spawnSync('ps', ['-axo', 'pid=,comm=']).stdout.toString().split('\n')
    .map(l => l.trim().split(/\s+/)).filter(([, comm]) => comm === 'claude').map(([pid]) => pid);
  if (!pids.length) return [];
  const count = {};
  for (const line of spawnSync('lsof', ['-a', '-d', 'cwd', '-p', pids.join(','), '-Fn']).stdout.toString().split('\n'))
    if (line.startsWith('n')) { const d = line.slice(1).replace(/[^a-zA-Z0-9]/g, '-'); count[d] = (count[d] || 0) + 1; }
  return Object.entries(count).flatMap(([d, n]) => byNewest(transcripts(path.join(PROJECTS, d))).slice(0, n));
}

function seedSession(file, live) {
  const id = path.basename(file, '.jsonl'), dir = file.slice(0, -'.jsonl'.length);
  if (sessions.has(id) || !UUID.test(id)) return;
  const st = fs.statSync(file), turn = lastTurn(tail(file));
  const s = { id, cwd: turn.cwd || '', state: turn.compacted ? 'idle' : turn.done ? 'waiting' : 'working', note: turn.done && !turn.compacted ? 'Finished its turn, waiting for you' : '',
    started: st.birthtimeMs, last: live ? Date.now() : st.mtimeMs, project: path.basename(path.dirname(file)), unconfirmed: !live, subagents: new Map() };
  if (turn.done && turn.text) s.forYou = forYou(turn.text);
  sessions.set(id, s);
  readTitle(s, dir);
  // subagents that look like they're still going: transcript touched in the last two minutes and not finished
  for (const f of transcripts(path.join(dir, 'subagents'))) {
    const agent = path.basename(f).match(/^agent-([\w-]+)\.jsonl$/)?.[1], mtime = fs.statSync(f).mtimeMs;
    if (!agent || Date.now() - mtime > 2 * 60 * 1000 || lastTurn(tail(f, 64 * 1024)).done) continue;
    const a = { type: '', description: '', activity: '', tries: 3, last: mtime };
    try { const j = JSON.parse(fs.readFileSync(path.join(dir, 'subagents', `agent-${agent}.meta.json`), 'utf8')); a.type = j.agentType || ''; a.description = j.description || ''; } catch {}
    s.subagents.set(agent, a);
  }
  if (s.state === 'waiting' && s.subagents.size) { s.state = 'paused'; s.note = 'Waiting on its agents'; }
  if (s.state === 'waiting') s.waitingSince = st.mtimeMs; // it's been waiting since its transcript last changed
}

function seed() {
  try {
    for (const f of liveTranscripts()) seedSession(f, true);
    for (const d of fs.readdirSync(PROJECTS)) for (const f of transcripts(path.join(PROJECTS, d)))
      if (Date.now() - fs.statSync(f).mtimeMs < SEED_RECENT_MS) seedSession(f, false);
  } catch (err) { console.error('seeding failed:', err.message); }
  console.log(`Seeded ${sessions.size} session(s) from disk`);
  // give the titles a moment to load, then find each seeded session's iTerm tab so it's clickable right away
  setTimeout(async () => {
    for (const s of sessions.values()) if (!s.iterm) s.iterm = await findIterm(s);
    broadcast();
    refreshGitHub();
  }, 1500);
}

// ---- GitHub status (opt-in, settings.github): PR state through the person's own `gh`, read-only -------------
// `gh` runs from each session's folder, so a wrapper that picks the account by folder (or plain gh) does the right thing.
// Only read commands: `gh pr view` and `gh search prs`. Nothing is stored beyond memory and nothing leaves the machine.
const GH = [process.env.LANTERN_GH, path.join(require('os').homedir(), '.local/bin/gh'), '/opt/homebrew/bin/gh', '/usr/local/bin/gh']
  .find(p => p && fs.existsSync(p)) || 'gh'; // launchd's PATH is minimal, so look in the usual places
const PR_FIELDS = 'url,number,title,state,isDraft,reviewDecision';
// Some tokens can't read checks, and then GitHub fails the whole query, so ask again without them.
const prView = async (args, cwd) => (await ghJson([...args, '--json', `${PR_FIELDS},statusCheckRollup`], cwd)) || (await ghJson([...args, '--json', PR_FIELDS], cwd));
let reviews = []; // open PRs waiting on my review, from every account the sessions' folders use
const ghJson = (args, cwd) => new Promise(done => execFile(GH, args, { cwd, timeout: 20000 }, (err, out) => {
  try { done(err ? null : JSON.parse(out)); } catch { done(null); }
}));
// what a PR needs from me: merged/closed (gone), checks failing, changes requested, ready to merge, or nothing yet
function prNeed(p) {
  if (p.state !== 'OPEN') return p.state === 'MERGED' ? 'merged' : 'closed';
  const checks = p.statusCheckRollup || [], result = c => c.conclusion || c.state;
  if (checks.some(c => ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED'].includes(result(c)))) return 'failing';
  if (p.reviewDecision === 'CHANGES_REQUESTED') return 'changes';
  const running = checks.some(c => (c.status && c.status !== 'COMPLETED') || result(c) === 'PENDING');
  if (p.reviewDecision === 'APPROVED' && !running) return 'ready';
  return p.isDraft ? 'draft' : 'waiting';
}
let refreshing = false;
async function refreshGitHub() {
  if (!settings.github || refreshing) return;
  refreshing = true;
  try {
    // Only folders inside a git repo: elsewhere (a home folder, say) gh may fall back to the Keychain, which prompts
    // every time from a background process.
    const inRepo = cwd => new Promise(done => execFile('/usr/bin/git', ['-C', cwd, 'rev-parse', '--is-inside-work-tree'], { timeout: 5000 }, err => done(!err)));
    const live = [];
    for (const s of sessions.values()) if (s.cwd && await inRepo(s.cwd)) live.push(s);
    const folders = [...new Set(live.map(s => s.cwd))];
    const found = new Map(); // ask from each folder: different folders can mean different accounts
    for (const cwd of folders)
      for (const p of (await ghJson(['search', 'prs', '--review-requested=@me', '--state=open', '--limit', '20', '--json', 'url,number,title,repository'], cwd)) || [])
        found.set(p.url, { url: p.url, title: p.title, label: `${p.repository.name}#${p.number}` });
    reviews = [...found.values()];
    for (const s of live) {
      // Each session's PRs: the ones it created, plus its branch's PR, but only if it's the only session in that
      // folder (sessions sharing the main checkout don't each own whatever branch happens to be checked out there).
      const alone = live.filter(o => o.cwd === s.cwd).length === 1;
      const prs = new Map(), mine = alone ? await prView(['pr', 'view'], s.cwd) : null;
      if (mine) prs.set(mine.url, mine);
      for (const url of s.created || []) if (!prs.has(url)) { const p = await prView(['pr', 'view', url], s.cwd); if (p) prs.set(url, p); }
      s.github = [...prs.values()].map(p => ({ url: p.url, title: p.title, label: `#${p.number}`, need: prNeed(p) }));
    }
  } finally { refreshing = false; }
  broadcast();
}
function clearGitHub() { reviews = []; for (const s of sessions.values()) delete s.github; broadcast(); }
setInterval(refreshGitHub, 2 * 60 * 1000);

// A closed terminal tab or a killed process can skip SessionEnd, so a session whose Claude process is gone ends here.
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const [id, s] of sessions) {
    if (s.pid && !alive(s.pid)) { sessions.delete(id); changed = true; continue; }
    // a session only seen on disk gets the normal timeout until it proves it's alive with a real event
    const limit = s.state === 'waiting' && !s.unconfirmed ? WAITING_EXPIRE_MS : EXPIRE_MS;
    if (now - s.last > limit) { sessions.delete(id); changed = true; continue; }
    for (const [aid, a] of s.subagents) if (now - a.last > EXPIRE_MS) { s.subagents.delete(aid); changed = true; }
  }
  if (changed) broadcast();
}, 30 * 1000); // checks whether processes are still running, so a closed session's moth leaves within half a minute

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/event') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { handle({ ...JSON.parse(body), iterm: req.headers['x-iterm-session'], pid: req.headers['x-claude-pid'] }); broadcast(); } catch {}
      res.end();
    });
    return;
  }
  // Bring a session's iTerm tab to the front. Only a JSON POST is accepted, which other websites can't send here
  // without a CORS preflight we never answer, and only an id we stored ourselves ever reaches AppleScript.
  if (req.method === 'POST' && req.url === '/focus' && req.headers['content-type'] === 'application/json') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e4) req.destroy(); });
    req.on('end', async () => {
      let s; try { s = sessions.get(JSON.parse(body).id); } catch {}
      if (s && !s.iterm) s.iterm = await findIterm(s);
      const id = s?.iterm;
      if (!id || !UUID.test(id)) return res.writeHead(404).end();
      execFile('osascript', ['-e', `tell application "iTerm2"
        repeat with w in windows
          repeat with t in tabs of w
            repeat with s in sessions of t
              if unique id of s is "${id}" then
                select w
                tell t to select
                tell s to select
                activate
                return
              end if
            end repeat
          end repeat
        end repeat
      end tell`], { timeout: 60000 }, (err, out, stderr) => {
        if (err) console.error('focus failed:', stderr.trim() || err.message);
        res.writeHead(err ? 500 : 204).end();
      });
    });
    return;
  }
  // Snooze or wake a session: it stops counting as needing me until it does something new. Same JSON-only guard as /focus.
  if (req.method === 'POST' && req.url === '/snooze' && req.headers['content-type'] === 'application/json') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e4) req.destroy(); });
    req.on('end', () => {
      let s; try { const j = JSON.parse(body); s = sessions.get(j.id); if (s) s.snoozed = !!j.snoozed; } catch {}
      if (s) broadcast();
      res.writeHead(s ? 204 : 404).end();
    });
    return;
  }
  // Change a shared setting and tell every open window. Same JSON-only guard as /focus.
  if (req.method === 'POST' && req.url === '/settings' && req.headers['content-type'] === 'application/json') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e4) req.destroy(); });
    req.on('end', () => {
      let ok = false;
      try {
        const { style, quietUntil, github } = JSON.parse(body);
        if (typeof github === 'boolean') { settings.github = github; ok = true; if (github) setTimeout(refreshGitHub, 0); else clearGitHub(); }
        if (/^[a-z]+$/.test(style)) { settings.style = style; ok = true; }
        if (Number.isFinite(quietUntil)) { settings.quietUntil = quietUntil; ok = true; } // quiet hours: every wait counts as snoozed until then
      } catch {}
      if (!ok) return res.writeHead(400).end();
      fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n', () => {});
      for (const c of clients) c.write(`event: settings\ndata: ${JSON.stringify(settings)}\n\n`);
      res.writeHead(204).end();
    });
    return;
  }
  if (req.url === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`retry: 2000\nevent: settings\ndata: ${JSON.stringify(settings)}\n\nevent: reviews\ndata: ${JSON.stringify(reviews)}\n\ndata: ${snapshot()}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  const ICONS = { '/icon.svg': 'image/svg+xml', '/icon.png': 'image/png', '/icon-indigo.svg': 'image/svg+xml', '/icon-indigo.png': 'image/png' };
  if (ICONS[req.url]) {
    res.writeHead(200, { 'Content-Type': ICONS[req.url] });
    return fs.createReadStream(path.join(__dirname, req.url)).pipe(res);
  }
  const page = req.url.split('?')[0]; // ?panel and friends are for the page, not the server
  if (page === '/' || page === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res);
  }
  res.writeHead(404).end();
}).listen(PORT, '127.0.0.1', () => { console.log(`Lantern lit at http://127.0.0.1:${PORT}`); seed(); });
