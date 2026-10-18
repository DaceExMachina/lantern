// Replays recorded hook events against the app's real server (app/Server.swift, built headless from test/server) and
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
test.before(() => execFileSync('swiftc', ['-Onone', '-o', BIN, 'app/Server.swift', 'app/Stats.swift', 'test/server/main.swift'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] }));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const freePort = () => new Promise(done => { const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => done(port)); }); });
const wait = ms => new Promise(r => setTimeout(r, ms));

// A server of its own: HOME, the Claude folder and the data folder all live in a fresh temp folder, and PATH is empty,
// so it can't see real sessions (ps, lsof) or drive a terminal (osascript). `files` are written there first, and
// `prep(home)` runs after them, for anything a file's text can't say (its mode, its age).
async function serve(t, files = {}, prep = () => {}) {
  const home = fs.mkdtempSync(path.join(tmp, 'home-')), port = await freePort();
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(home, file)), { recursive: true });
    fs.writeFileSync(path.join(home, file), text);
  }
  prep(home);
  const env = { HOME: home, CLAUDE_CONFIG_DIR: path.join(home, '.claude'), LANTERN_DATA: path.join(home, 'data'), LANTERN_PORT: String(port), LANTERN_WEB: ROOT, PATH: path.join(home, 'no-bin') };
  const child = spawn(BIN, [], { env, stdio: 'ignore' });
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i++) { try { await fetch(base + '/icon.svg'); break; } catch { if (i > 100) throw new Error('server never started'); await wait(50); } }
  return base;
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

// Runs one replay file. Expect steps retry for a couple of seconds, since seeding and side-session links land async.
async function replay(t, name, files) {
  const file = path.join(__dirname, 'replay', name + '.json'), steps = JSON.parse(fs.readFileSync(file, 'utf8'));
  const base = await serve(t, files);
  for (const step of steps) {
    if (step.post) { await post(base, step.post, step.body); continue; }
    let got;
    for (let i = 0; i < 40; i++) {
      const s = normalize(await snapshot(base));
      got = { sessions: s.sessions, ...('settings' in step.expect ? { settings: s.settings } : {}), ...('prose' in step.expect ? { prose: s.prose } : {}) };
      try { assert.deepStrictEqual(got, step.expect); break; } catch { await wait(50); }
    }
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
test('the newest transcripts fill a shared pool of sentences for the pages', t => replay(t, 'prose-pool', recent()));
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
  let s;
  for (let i = 0; i < 40 && !s; i++) { s = (await snapshot(base)).sessions.find(x => x.id === id); if (!s) await wait(50); }
  assert.ok(s, 'the live session was not seeded');
  assert.deepStrictEqual({ pid: s.pid, unconfirmed: s.unconfirmed, state: s.state }, { pid: proc.pid, unconfirmed: false, state: 'waiting' });
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
  const y = stats.days.find(d => d.start === day.getTime());
  assert.deepStrictEqual(
    { warmMoths: y.warmMoths, warmLantern: y.warmLantern, medianWait: y.medianWait, slowWait: y.slowWait, waits: y.waits, answered: y.answered },
    { warmMoths: 75, warmLantern: 80, medianWait: 30 * min, slowWait: 50 * min, waits: 4, answered: 3 });
});
