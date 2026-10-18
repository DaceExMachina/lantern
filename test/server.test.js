// Replays recorded hook events against the app's real server (the app/*.swift files, built headless from test/server) and
// checks the session snapshot the page would get. Each file in test/replay is a list of steps: a POST to send, or an
// `expect` holding what /events should show by then (sessions, and settings if the step lists them).
// `UPDATE=1 npm test` rewrites the expect steps from what the server does now; read the diff.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const http = require('http');
const { execFileSync, spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lantern-test-'));
const BIN = path.join(tmp, 'lantern-server');
test.before(() => execFileSync('swiftc', ['-Onone', '-o', BIN, ...fs.readdirSync(path.join(ROOT, 'app')).filter(f => f.endsWith('.swift') && f !== 'main.swift').map(f => 'app/' + f), 'test/server/main.swift'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] }));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const freePort = () => new Promise(done => { const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => done(port)); }); });
const wait = ms => new Promise(r => setTimeout(r, ms));
// Polls `fn` until it returns something truthy and returns that, or throws `what` after `timeout` ms. Tests wait on the
// condition they mean, never on a fixed sleep, so a slow or loaded machine only makes them slower, not red.
async function until(fn, what, timeout = 20000) {
  for (const end = Date.now() + timeout; ; await wait(25)) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
  }
}

// A server of its own: HOME, the Claude folder and the data folder all live in a fresh temp folder, and PATH is empty,
// so it can't see real sessions (ps, lsof) or drive a terminal (osascript). `files` are written there first, and
// `prep(home)` runs after them, for anything a file's text can't say (its mode, its age). `env` adds to the server's.
async function serve(t, files = {}, prep = () => {}, extra = {}) {
  const home = fs.mkdtempSync(path.join(tmp, 'home-'));
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(home, file)), { recursive: true });
    fs.writeFileSync(path.join(home, file), text);
  }
  prep(home);
  // The port is free when picked but not held, so another process can take it first (the ephemeral range is shared with
  // every client socket on the machine). The server then keeps retrying that port every 5 seconds, so a start that takes
  // over 3 seconds (it normally takes ~30ms) is abandoned for a fresh port.
  for (let attempt = 1; ; attempt++) {
    const port = await freePort();
    const env = { HOME: home, CLAUDE_CONFIG_DIR: path.join(home, '.claude'), LANTERN_DATA: path.join(home, 'data'), LANTERN_PORT: String(port), LANTERN_WEB: ROOT, PATH: path.join(home, 'no-bin'),
      TZ: Intl.DateTimeFormat().resolvedOptions().timeZone, ...extra }; // days are local, so the server reads them in our zone
    const child = spawn(BIN, [], { env, stdio: 'ignore' });
    t.after(() => child.kill());
    const base = `http://127.0.0.1:${port}`;
    try { await until(() => fetch(base + '/icon.svg').then(() => true, () => false), 'the server to start', 3000); return base; } catch (e) {
      child.kill();
      if (attempt === 5) throw e;
    }
  }
}

const post = (base, url, body) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// What a page connecting now gets: the sessions and the settings, read off the start of the event stream.
const snapshot = base => new Promise((done, fail) => {
  const req = http.get(base + '/events', res => {
    let text = '';
    const out = {};
    res.on('data', chunk => {
      text += chunk;
      for (const block of text.split('\n\n').slice(0, -1)) {
        const event = block.match(/^event: (.+)$/m)?.[1], data = block.match(/^data: (.*)$/m)?.[1];
        if (event === 'settings') out.settings = JSON.parse(data);
        if (event === 'prose') out.prose = JSON.parse(data);
        if (!event && data) { out.sessions = JSON.parse(data); req.destroy(); return done(out); }
      }
    });
  });
  req.on('error', e => e.code !== 'ECONNRESET' && fail(e));
});
// Times become "<time>". A null iterm or parent goes too: the server's startup passes that look for iTerm tabs (none
// here, with no osascript) and side sessions mark whichever sessions exist when they land, so it only says how fast
// the test ran.
const normalize = v => JSON.parse(JSON.stringify(v, (k, x) => ['iterm', 'parent'].includes(k) && x === null ? undefined : typeof x === 'number' && x > 1e12 ? '<time>' : x));
const sorted = v => Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v;

// Runs one replay file. Expect steps retry for up to 20 seconds, since seeding, the session-text pool and side-session
// links land async, and slowly on a busy CI machine.
async function replay(t, name, files) {
  const file = path.join(__dirname, 'replay', name + '.json'), steps = JSON.parse(fs.readFileSync(file, 'utf8'));
  const base = await serve(t, files);
  for (const step of steps) {
    if (step.post) { await post(base, step.post, step.body); continue; }
    let got;
    await until(async () => {
      const s = normalize(await snapshot(base));
      got = { sessions: s.sessions, ...('settings' in step.expect ? { settings: s.settings } : {}), ...('prose' in step.expect ? { prose: s.prose } : {}) };
      try { assert.deepStrictEqual(got, step.expect); return true; } catch { return false; }
    }, `${name}: step ${steps.indexOf(step)} to match`).catch(() => {}); // the assertion below reports the difference
    if (process.env.UPDATE) step.expect = sorted(got);
    else assert.deepStrictEqual(got, step.expect, `${name}: step ${steps.indexOf(step)}`);
  }
  if (process.env.UPDATE) fs.writeFileSync(file, JSON.stringify(steps, null, 2) + '\n');
}

test('a turn: start, prompt, tool, stop leaves it waiting with its card', t => replay(t, 'turn'));
test('a turn that ends with background agents running is paused, and their activity keeps it paused', t => replay(t, 'paused'));
test('a turn that asks a question or names a Blocker is waiting, with the question as its note', t => replay(t, 'question'));
test('snooze, snooze for good, and wake', t => replay(t, 'snooze'));
test('a manual /compact ends idle, an automatic one leaves the session as it was', t => replay(t, 'compact'));
test('SessionEnd removes the session', t => replay(t, 'session-end'));
test('a turn\'s plain sentences become its prose, consecutive ones joined into runs, without code, links, names, digits or talk to the person', t => replay(t, 'prose'));
test('posting quietUntil without a style keeps the lantern style', t => replay(t, 'quiet-keeps-style'));

// What an open page receives after its first load: the SSE blocks sent while `during(blocks)` runs, then 600ms more (the
// quiet that "nothing else was sent" assertions need; anything that must arrive waits for it inside `during`).
async function streamed(base, during) {
  const blocks = [];
  let text = '', ready;
  const first = new Promise(r => ready = r);
  const req = http.get(base + '/events', res => res.on('data', chunk => {
    text += chunk;
    const parts = text.split('\n\n'); text = parts.pop();
    if (!ready.done) { if (parts.some(b => !b.includes('event:') && b.startsWith('data:'))) { ready.done = true; ready(); } return; }
    blocks.push(...parts);
  }));
  await first;
  await during(blocks);
  await wait(600);
  req.destroy();
  return blocks;
}
// The server also sends snapshots of its own (its startup pass sends one about 1.5s after seeding, which a slow machine
// reaches mid-test), so these tests follow one session's tool-call count through the snapshots rather than counting them.
const ticksSeen = (blocks, id) => blocks.filter(b => b.startsWith('data:')).map(b => JSON.parse(b.slice(5)).find(s => s.id === id)?.ticks).filter(Boolean);
const toolCall = id => ({ session_id: id, hook_event_name: 'PreToolUse', cwd: '/work', tool_name: 'Read', tool_input: { file_path: '/work/a' } });
// The server sends one snapshot 150ms after the first change of a burst, and changes inside that window join it. So a burst
// shows up in one snapshot per 150ms it took, plus one if a window someone else opened was already running when it began.
// Snapshots from outside the burst repeat a count already seen, so the distinct counts are the burst's own snapshots.
test('a burst of hook events reaches the page as one snapshot per coalescing window, not one per event', async t => {
  const base = await serve(t);
  let took;
  const blocks = await streamed(base, async blocks => {
    const began = Date.now();
    await Promise.all(Array.from({ length: 10 }, () => post(base, '/event', toolCall(UUID(1)))));
    took = Date.now() - began;
    await until(() => ticksSeen(blocks, UUID(1)).includes(10), 'a snapshot with all 10 tool calls');
  });
  const counts = [...new Set(ticksSeen(blocks, UUID(1)))];
  assert.ok(counts.length <= 2 + Math.floor(took / 150), `the burst of 10 events that took ${took}ms reached the page in ${counts.length} snapshots: ${counts}`);
});
test('the PR lists are sent when they change, not with every snapshot', async t => {
  const base = await serve(t);
  const blocks = await streamed(base, async blocks => {
    await post(base, '/event', toolCall(UUID(1)));
    await until(() => ticksSeen(blocks, UUID(1)).includes(1), 'the first event\'s snapshot');
    await post(base, '/event', toolCall(UUID(1)));
    await until(() => ticksSeen(blocks, UUID(1)).includes(2), 'the second event\'s snapshot');
  });
  assert.deepStrictEqual(blocks.filter(b => /^event: (reviews|graveyard)/.test(b)), []);
});

// Transcripts on disk, for the seeding cases: one JSON object per line.
const UUID = n => `0000000${n}-0000-4000-8000-000000000000`;
const jsonl = lines => lines.map(l => JSON.stringify(l)).join('\n') + '\n';
const transcript = (id, lines) => ({ [`.claude/projects/-work-${id.slice(7, 8)}/${id}.jsonl`]: jsonl(lines) });
const user = text => ({ type: 'user', cwd: '/work', message: { role: 'user', content: text } });
const answer = text => ({ type: 'assistant', cwd: '/work', message: { role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text }] } });
const turnEnd = { type: 'system', subtype: 'turn_duration', cwd: '/work' };

test('a seeded session brings back the plain sentences from its whole transcript, not just the last turn', t => replay(t, 'seed-prose', {
  ...transcript(UUID(3), [user('Look at the glow'), answer('The glow sits a little higher on the paper than before.'), turnEnd,
    user('And the moths?'), answer('Every moth now lands where the light is warmest on the paper.'), turnEnd]),
}));
// the newest transcripts, ended ones too, give the pages a shared pool of sentences, unless lanternText is off
const recent = () => ({
  ...transcript(UUID(4), [user('Look'), answer('The glow sits a little higher on the paper than before.'), turnEnd]),
  ...transcript(UUID(5), [user('Go'), answer('Every moth now lands where the light is warmest on the paper.'), turnEnd]),
});
test('with little to draw on, the pool reads further back than the newest eight transcripts', t => replay(t, 'prose-pool-deep',
  Object.assign({}, ...["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"].map((w, i) => transcript(UUID(i), [user('Go'), answer(`The glow on the paper settles at row ${w} tonight.`), turnEnd])))));
test('the newest transcripts fill a shared pool of sentences for the pages', t => replay(t, 'prose-pool', recent()));
// It waits for the two transcripts to be seeded before posting, so the hook's session lands after them in every run.
test('with session text off nothing is filtered or read; turning them on reads the pool, turning them off drops every word', t => replay(t, 'prose-toggle', { ...recent(), 'data/settings.json': '{"lanternText": "off"}' }));
test('a transcript ending on an unanswered task notification seeds as waiting, not working', t => replay(t, 'seed-task-notification', {
  ...transcript(UUID(1), [user('Fix it'), answer('Fixed. **You:** try it'), turnEnd, user('<task-notification><summary>Agent finished</summary></task-notification>')]),
  ...transcript(UUID(2), [user('Start on the docs')]), // mid-turn, for contrast
}));

// The Claude app's session files say which session started which; a side session whose parent is alive gets `parent`.
const appSession = (local, cli, from) => ({ [`Library/Application Support/Claude/claude-code-sessions/a/b/${local}.json`]: JSON.stringify({ sessionId: local, cliSessionId: cli, ...(from ? { spawnedFrom: { sessionId: from } } : {}) }) });
test('a side session with a live parent points at it', t => replay(t, 'seed-side-session', {
  ...transcript(UUID(3), [user('Plan the release'), answer('Started a side session.'), turnEnd]),
  ...transcript(UUID(4), [user('Write the changelog'), answer('Done. **You:** nothing'), turnEnd]),
  ...appSession('local_parent', UUID(3)),
  ...appSession('local_child', UUID(4), 'local_parent'),
}));

// A terminal `claude` that's been quiet for a day is still there after a restart, and stays: it's seeded with its process
// (from Claude Code's sessions/<pid>.json), so the sweep keeps it until that process ends instead of timing it out.
// A sleeping child stands in for the process, and a fake `ps` on the server's PATH reports it as `claude`.
test('a long-quiet session whose claude process is alive is seeded with that process', async t => {
  const proc = spawn('sleep', ['60']), id = UUID(5), file = `.claude/projects/-work/${id}.jsonl`;
  t.after(() => proc.kill());
  const base = await serve(t, {
    [file]: jsonl([user('Fix it'), answer('Fixed. **You:** try it'), turnEnd]),
    [`.claude/sessions/${proc.pid}.json`]: JSON.stringify({ pid: proc.pid, sessionId: id, cwd: '/work' }),
    'no-bin/ps': `#!/bin/sh\necho "  ${proc.pid} claude"\n`,
  }, home => {
    fs.chmodSync(path.join(home, 'no-bin/ps'), 0o755);
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
    fs.utimesSync(path.join(home, file), dayAgo, dayAgo);
  });
  const s = await until(async () => (await snapshot(base)).sessions.find(x => x.id === id), 'the live session to be seeded');
  assert.deepStrictEqual({ pid: s.pid, state: s.state }, { pid: proc.pid, state: 'waiting' });
});

// A `claude` the hooks never told the lantern about (iTerm restarted, a hook failed) shows up after startup: the next
// adoption pass finds it through ps and its sessions/<pid>.json and seeds it with its process, as startup would have.
test('a running session the lantern missed is adopted with its process on the next pass', async t => {
  const id = UUID(6), file = `.claude/projects/-work/${id}.jsonl`;
  let home;
  const base = await serve(t, { 'no-bin/ps': '#!/bin/sh\n[ -f "$HOME/pids" ] && read -r line < "$HOME/pids" && echo "$line"\n' }, h => {
    home = h;
    fs.chmodSync(path.join(h, 'no-bin/ps'), 0o755);
  }, { LANTERN_ADOPT_SECONDS: '0.2' });
  await wait(300); // at least one pass that found nothing (a floor, not a deadline: the adoption below is awaited by condition)
  assert.deepStrictEqual((await snapshot(base)).sessions, []);
  const proc = spawn('sleep', ['60']);
  t.after(() => proc.kill());
  fs.mkdirSync(path.join(home, '.claude/projects/-work'), { recursive: true });
  fs.writeFileSync(path.join(home, file), jsonl([user('Fix it'), answer('Fixed. **You:** try it'), turnEnd]));
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
  fs.utimesSync(path.join(home, file), dayAgo, dayAgo);
  fs.mkdirSync(path.join(home, '.claude/sessions'), { recursive: true });
  fs.writeFileSync(path.join(home, `.claude/sessions/${proc.pid}.json`), JSON.stringify({ pid: proc.pid, sessionId: id, cwd: '/work' }));
  fs.writeFileSync(path.join(home, 'pids'), `  ${proc.pid} claude\n`);
  const s = await until(async () => (await snapshot(base)).sessions.find(x => x.id === id), 'the running session to be adopted');
  assert.deepStrictEqual({ pid: s.pid, state: s.state }, { pid: proc.pid, state: 'waiting' });
});

// The stats panel's numbers, from GET /stats over a small log: yesterday, ten hours of lantern with two of them violet,
// eight hours of sessions with two hours of waits (three answered: 10, 30 and 50 minutes; one that ended unanswered).
test('stats: warm moths, warm lantern and response times', async t => {
  const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() - 1);
  const at = (h, m = 0) => new Date(day).setHours(h, m);
  const min = 60 * 1000;
  const db = path.join(tmp, `stats-${process.pid}.sqlite`);
  const sql = `
    CREATE TABLE spans (kind TEXT NOT NULL, session TEXT, began INTEGER NOT NULL, ended INTEGER, data TEXT NOT NULL DEFAULT '{}');
    CREATE TABLE events (time INTEGER NOT NULL, kind TEXT NOT NULL, session TEXT, data TEXT NOT NULL DEFAULT '{}');
    CREATE TABLE gauges (time INTEGER NOT NULL, alive INTEGER, working INTEGER, waiting INTEGER, snoozed INTEGER, fireflies INTEGER, agents INTEGER, strays INTEGER, graveyard INTEGER);
    CREATE TABLE achievements (id TEXT NOT NULL, day TEXT NOT NULL, time INTEGER NOT NULL, data TEXT NOT NULL DEFAULT '{}', PRIMARY KEY (id, day));
    PRAGMA user_version = 2;
    INSERT INTO spans (kind, session, began, ended, data) VALUES
      ('server', NULL, ${at(10)}, ${at(20)}, '{}'),
      ('violet', NULL, ${at(12)}, ${at(13)}, '{}'), ('violet', NULL, ${at(15)}, ${at(16)}, '{}'),
      ('alive', 'a', ${at(10)}, ${at(14)}, '{}'), ('alive', 'b', ${at(14)}, ${at(18)}, '{}'),
      ('waiting', 'a', ${at(11)}, ${at(11) + 10 * min}, '{"how":"answered"}'),
      ('waiting', 'a', ${at(12)}, ${at(12) + 30 * min}, '{"how":"answered"}'),
      ('waiting', 'b', ${at(15)}, ${at(15) + 50 * min}, '{"how":"answered"}'),
      ('waiting', 'b', ${at(17, 30)}, ${at(18)}, '{"how":"ended"}');`;
  execFileSync('sqlite3', [db], { input: sql });
  const base = await serve(t, { 'data/stats.sqlite': fs.readFileSync(db) });
  const stats = await (await fetch(base + '/stats')).json();
  const y = stats.days.at(-2); // yesterday: days run oldest first and end with today
  assert.deepStrictEqual(
    { warmMoths: y.warmMoths, warmLantern: y.warmLantern, medianWait: y.medianWait, slowWait: y.slowWait, waits: y.waits, answered: y.answered },
    { warmMoths: 75, warmLantern: 80, medianWait: 30 * min, slowWait: 50 * min, waits: 4, answered: 3 });
});
