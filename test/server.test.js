// Replays recorded hook events against the app's real server (the app/*.swift files, built headless from test/server) and
// checks the session snapshot the page would get. Each file in test/replay is a list of steps: a POST to send, or an
// `expect` holding what /events should show by then (sessions, and settings if the step lists them).
// `UPDATE=1 npm test` rewrites the expect steps from what the server does now; read the diff.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync, spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lantern-test-'));
const BIN = path.join(tmp, 'lantern-server');
test.before(() => execFileSync('swiftc', ['-Onone', '-o', BIN, ...fs.readdirSync(path.join(ROOT, 'app')).filter(f => f.endsWith('.swift') && f !== 'main.swift').map(f => 'app/' + f), 'test/server/main.swift'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] }));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

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
  // Port 0: the server takes whichever port is free and says which once it's listening, so no other process can take
  // it first and a slow start only takes longer.
  const env = { HOME: home, CLAUDE_CONFIG_DIR: path.join(home, '.claude'), LANTERN_DATA: path.join(home, 'data'), LANTERN_PORT: '0', LANTERN_WEB: ROOT, PATH: path.join(home, 'no-bin'),
    TZ: Intl.DateTimeFormat().resolvedOptions().timeZone, ...extra }; // days are local, so the server reads them in our zone
  const child = spawn(BIN, [], { env, stdio: ['ignore', 'pipe', 'ignore'] });
  t.after(() => child.kill());
  let out = '';
  child.stdout.on('data', chunk => out += chunk);
  return until(() => out.match(/^Lantern lit at (\S+)$/m)?.[1], 'the server to start');
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

// Background tasks: a session waiting on them counts as working while a task is younger than LANTERN_TASK_FRESH_SECONDS
// or an agent was heard from within LANTERN_AGENT_FRESH_SECONDS; past both it rests (idle, open but quiet), flipped by
// the sweep (every LANTERN_SWEEP_SECONDS) with no new event.
const bg = (agentFresh, taskFresh) => ({ LANTERN_AGENT_FRESH_SECONDS: String(agentFresh), LANTERN_TASK_FRESH_SECONDS: String(taskFresh), LANTERN_SWEEP_SECONDS: '0.1' });
const stopWith = (...tasks) => ({ session_id: 's1', hook_event_name: 'Stop', cwd: '/w', last_assistant_message: 'Running in the background.', background_tasks: tasks });
const SERVER = { id: 'b1', type: 'shell', status: 'running', description: 'preview server', command: 'npm run preview' };
const s1 = async base => (await snapshot(base)).sessions.find(s => s.id === 's1');
const agentTool = { session_id: 's1', hook_event_name: 'PreToolUse', cwd: '/w', agent_id: 'a1', agent_type: 'sonnet-implement', tool_name: 'Read', tool_input: { file_path: '/w/x.js' } };

test('a background agent that keeps firing hook events keeps its session working, rests once quiet, and wakes again', async t => {
  const base = await serve(t, {}, () => {}, bg(1, 0.3));
  await post(base, '/event', { session_id: 's1', hook_event_name: 'UserPromptSubmit', cwd: '/w', prompt: 'go' });
  await post(base, '/event', agentTool);
  await post(base, '/event', stopWith({ id: 'a1', type: 'subagent', status: 'running', description: 'Audit it', agent_type: 'sonnet-implement' }));
  for (const end = Date.now() + 2500; Date.now() < end; await wait(200)) { // well past the task's 0.3s, the agent busy all along
    await post(base, '/event', agentTool);
    assert.strictEqual((await s1(base)).state, 'paused');
  }
  const quiet = await until(async () => { const s = await s1(base); return s.state === 'idle' && s; }, 'the quiet session to rest');
  assert.match(quiet.note, /^1 background task open for \d+m$/);
  await post(base, '/event', agentTool);
  await until(async () => (await s1(base)).state === 'paused', 'the agent firing again to wake it');
});

test('a background shell task younger than the threshold keeps its session working', async t => {
  const base = await serve(t, {}, () => {}, bg(0.1, 60));
  await post(base, '/event', stopWith(SERVER));
  await wait(1000); // ten sweeps, the agent threshold long past
  assert.deepStrictEqual((({ state, note }) => ({ state, note }))(await s1(base)), { state: 'paused', note: 'Waiting on 1 background task' });
});

test('a background task open past the threshold with no agent activity rests after the sweep, and stays old across turns', async t => {
  const base = await serve(t, {}, () => {}, bg(0.1, 0.5));
  await post(base, '/event', stopWith(SERVER));
  assert.strictEqual((await until(() => s1(base), 'the session')).state, 'paused');
  const quiet = await until(async () => { const s = await s1(base); return s.state === 'idle' && s; }, 'the session to rest with no new event');
  assert.match(quiet.note, /^1 background task open for \d+m$/);
  // the same server still open at the next turn's end: it's as old as when first seen, so the session rests at once
  await post(base, '/event', { session_id: 's1', hook_event_name: 'UserPromptSubmit', cwd: '/w', prompt: 'more' });
  await post(base, '/event', stopWith(SERVER));
  assert.strictEqual((await s1(base)).state, 'idle');
});

// What an open page receives after its first load: the SSE blocks sent while `during(blocks)` runs, then 600ms more (the
// quiet that "nothing else was sent" assertions need; anything that must arrive waits for it inside `during`).
async function streamed(base, during) {
  const blocks = [], opening = [];
  let text = '', ready;
  const first = new Promise(r => ready = r);
  const req = http.get(base + '/events', res => res.on('data', chunk => {
    text += chunk;
    const parts = text.split('\n\n'); text = parts.pop();
    if (!ready.done) { opening.push(...parts); if (parts.some(b => !b.includes('event:') && b.startsWith('data:'))) { ready.done = true; ready(); } return; }
    blocks.push(...parts);
  }));
  await first;
  await during(blocks);
  await wait(600);
  req.destroy();
  return Object.assign(blocks, { opening }); // `opening` is the first load's burst
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
  assert.deepStrictEqual(blocks.filter(b => /^event: (reviews|stale)/.test(b)), []);
});

// A badge earned live goes out once as `event: badge`, for the page's flash: not again when it's earned again that day,
// and never in a page's opening burst (a reload or reconnect). Ten agents in one session earn Hive Mind.
test('a badge earned live reaches open pages once, and never on reconnect', async t => {
  const base = await serve(t), agent = n => ({ ...toolCall(UUID(1)), agent_id: `agent-${n}` });
  const badges = blocks => blocks.filter(b => b.startsWith('event: badge'));
  const first = await streamed(base, async () => {
    await Promise.all(Array.from({ length: 10 }, (_, n) => post(base, '/event', agent(n))));
    await wait(300);
    await post(base, '/event', agent(10)); // still ten or more: earned again, today already has it
  });
  assert.deepStrictEqual(badges(first), ['event: badge\ndata: {"id":"hive_mind"}']);
  const again = await streamed(base, () => post(base, '/event', agent(11)));
  assert.deepStrictEqual([...badges(again.opening), ...badges(again)], []);
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

// A stats log (stats.sqlite) at the schema of version 2, holding the given spans ([kind, session, began, ended, data]),
// then any `more` SQL (events, say).
function statsLog(spans, more = '') {
  const db = path.join(tmp, `stats-${process.pid}-${Math.random()}.sqlite`);
  const rows = spans.map(([kind, session, began, ended, data = {}]) => `('${kind}', ${session ? `'${session}'` : 'NULL'}, ${began}, ${ended}, '${JSON.stringify(data)}')`);
  execFileSync('sqlite3', [db], { input: `
    CREATE TABLE spans (kind TEXT NOT NULL, session TEXT, began INTEGER NOT NULL, ended INTEGER, data TEXT NOT NULL DEFAULT '{}');
    CREATE TABLE events (time INTEGER NOT NULL, kind TEXT NOT NULL, session TEXT, data TEXT NOT NULL DEFAULT '{}');
    CREATE TABLE gauges (time INTEGER NOT NULL, alive INTEGER, working INTEGER, waiting INTEGER, snoozed INTEGER, fireflies INTEGER, agents INTEGER, strays INTEGER, graveyard INTEGER);
    CREATE TABLE achievements (id TEXT NOT NULL, day TEXT NOT NULL, time INTEGER NOT NULL, data TEXT NOT NULL DEFAULT '{}', PRIMARY KEY (id, day));
    PRAGMA user_version = 2;
    INSERT INTO spans (kind, session, began, ended, data) VALUES ${rows.join(', ')};${more}` });
  return fs.readFileSync(db);
}
// The start of the day before the current one, for days starting at `hour`.
function yesterdayFrom(hour) {
  const day = new Date(); day.setHours(hour, 0, 0, 0);
  if (day > new Date()) day.setDate(day.getDate() - 1); // today's day hasn't started yet: it's still yesterday's
  day.setDate(day.getDate() - 1);
  return day;
}

// The stats panel's numbers, from GET /stats over a small log: yesterday, ten hours of lantern with two of them violet,
// eight hours of sessions with two hours of waits (three answered: 10, 30 and 50 minutes; one that ended unanswered).
test('stats: warm moths, warm lantern and response times', async t => {
  const day = yesterdayFrom(0); // days start at midnight unless settings say otherwise
  const at = (h, m = 0) => new Date(day).setHours(h, m);
  const min = 60 * 1000, answered = { how: 'answered' };
  const base = await serve(t, { 'data/stats.sqlite': statsLog([
    ['server', null, at(10), at(20)],
    ['violet', null, at(12), at(13)], ['violet', null, at(15), at(16)],
    ['alive', 'a', at(10), at(14), { title: 'Fix it', project: 'lantern' }], ['alive', 'b', at(14), at(18)],
    ['waiting', 'a', at(11), at(11) + 10 * min, answered],
    ['waiting', 'a', at(12), at(12) + 30 * min, answered],
    ['waiting', 'b', at(15), at(15) + 50 * min, answered],
    ['waiting', 'b', at(17, 30), at(18), { how: 'ended' }],
  ], `INSERT INTO events (time, kind, session, data) VALUES (${at(13)}, 'pr', 'a', '{"url":"https://github.com/o/r/pull/7","change":"merged","from":"ready"}');`) });
  const stats = await (await fetch(base + '/stats')).json();
  const y = stats.days.at(-2); // yesterday: days run oldest first and end with today
  assert.deepStrictEqual(
    { warmMoths: y.warmMoths, warmLantern: y.warmLantern, medianWait: y.medianWait, slowWait: y.slowWait, waits: y.waits, answered: y.answered },
    { warmMoths: 75, warmLantern: 80, medianWait: 30 * min, slowWait: 50 * min, waits: 4, answered: 3 });
  // the recap's session cards: each session's title and project, and what its PRs did
  assert.deepStrictEqual(stats.spans.find(s => s[0] === 'alive' && s[4] === 'a').slice(4), ['a', 'Fix it', 'lantern']);
  assert.deepStrictEqual(stats.prs, [[at(13), 'a', 'https://github.com/o/r/pull/7', 'merged', null, null]]);
});

// A day runs from one day rollover (settings.dayStart) to the next, so an hour of work just before it lands on the day before.
test('stats: days start at the day rollover', async t => {
  const start = +yesterdayFrom(6), hour = 3600000;
  const base = await serve(t, { 'data/settings.json': '{"dayStart": "06:00"}', 'data/stats.sqlite': statsLog([
    ['alive', 'late', start - 2 * hour, start - hour], // 4am to 5am: still the day before's
    ['alive', 'early', start + hour, start + 2 * hour], // 7am to 8am
  ]) });
  const { days } = await (await fetch(base + '/stats')).json();
  assert.deepStrictEqual(days.slice(-3, -1).map(d => [d.start, d.mothMs]), [[start - 24 * hour, hour], [start, hour]]);
});

// Quiet from turns quiet hours on by itself, until quietEnd, as if the moon were pressed; turned off by hand that night,
// they stay off.
const hhmm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
test('quiet from turns quiet hours on, and leaves them off once ended by hand', async t => {
  const base = await serve(t);
  const hour = 3600000, from = new Date(Date.now() - hour), end = new Date(Date.now() + hour);
  const until = new Date(end); until.setSeconds(0, 0);
  await post(base, '/settings', { quietFrom: hhmm(from), quietEnd: hhmm(end) });
  assert.strictEqual((await snapshot(base)).settings.quietUntil, +until);
  await post(base, '/settings', { quietUntil: 0 }); // the moon, pressed to end it
  await post(base, '/settings', { quietFrom: hhmm(from) });
  assert.ok((await snapshot(base)).settings.quietUntil <= Date.now(), 'quiet hours came back on after being turned off');
});

// With quiet until switched off, quiet hours have no end: quiet from turns them on even with quietEnd behind it, and
// they last until the moon is pressed. Ended by hand, they stay off that night.
test('with quiet until off, quiet hours last until the moon is pressed', async t => {
  const base = await serve(t, { 'data/settings.json': '{"quietEndOn": false}' });
  const hour = 3600000;
  await post(base, '/settings', { quietFrom: hhmm(new Date(Date.now() - 2 * hour)), quietEnd: hhmm(new Date(Date.now() - hour)) });
  assert.strictEqual((await snapshot(base)).settings.quietUntil, 8.64e15);
  await post(base, '/settings', { quietUntil: 0 });
  await post(base, '/settings', { quietFrom: hhmm(new Date(Date.now() - 2 * hour)) });
  assert.ok((await snapshot(base)).settings.quietUntil <= Date.now(), 'quiet hours came back on after being turned off');
});

// A snooze logs a 'snoozed' span for the part of the wait it covered: from the snooze to the end of the wait. The server
// writes it a moment after each request (its next look at the sessions), so each bound runs from just before the request
// to when the test first saw the row.
test('stats: a snooze is logged as a snoozed span, from the snooze to the end of the wait', async t => {
  let home;
  const base = await serve(t, {}, h => home = h);
  const spans = () => JSON.parse(execFileSync('sqlite3', ['-json', path.join(home, 'data/stats.sqlite'),
    "SELECT kind, began, ended FROM spans WHERE session = 's1' AND kind IN ('waiting', 'snoozed') ORDER BY rowid"], { encoding: 'utf8' }) || '[]');
  const turn = name => post(base, '/event', { session_id: 's1', hook_event_name: name, cwd: '/work/s1', last_assistant_message: 'Done.' });
  await turn('UserPromptSubmit');
  await turn('Stop');
  await until(() => spans().some(s => s.kind === 'waiting'), 'the wait to be logged');
  const snoozedFrom = Date.now();
  await post(base, '/snooze', { id: 's1', snoozed: true });
  const snooze = await until(() => spans().find(s => s.kind === 'snoozed'), 'a snoozed span');
  const snoozedBy = Date.now();
  const wokeFrom = Date.now();
  await turn('UserPromptSubmit');
  const done = await until(() => { const all = spans(); return all.every(s => s.ended) && all; }, 'the wait and the snooze to end');
  const wokeBy = Date.now();
  const waiting = done.find(s => s.kind === 'waiting'), snoozed = done.filter(s => s.kind === 'snoozed');
  assert.strictEqual(snoozed.length, 1);
  assert.ok(snooze.began >= snoozedFrom && snooze.began <= snoozedBy, `the snooze began at ${snooze.began}, not between ${snoozedFrom} and ${snoozedBy}`);
  assert.ok(snoozed[0].ended >= wokeFrom && snoozed[0].ended <= wokeBy, `the snooze ended at ${snoozed[0].ended}, not between ${wokeFrom} and ${wokeBy}`);
  assert.strictEqual(snoozed[0].ended, waiting.ended);
});

// The stale switch used to be saved as "graveyard"; a settings.json from then must still turn the stale PRs off.
test('an old "graveyard" setting is read as "stale"', async t => {
  const base = await serve(t, { 'data/settings.json': '{"graveyard": false}' });
  const { settings } = await snapshot(base);
  assert.strictEqual(settings.stale, false);
  assert.strictEqual('graveyard' in settings, false);
});
