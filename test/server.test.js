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
  t.server = child; // for a test that stalls it (SIGSTOP)
  let out = '';
  t.output = () => out;
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
        if (event === 'name') out.name = JSON.parse(data);
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
// A task only counts when the session itself started it: the tool result carrying its backgroundTaskId is in the
// session's own transcript, timestamped when it started. `started` is that line, `S1_TRANSCRIPT` s1's transcript.
const S1_TRANSCRIPT = '.claude/projects/-w/s1.jsonl';
const started = (id, at = Date.now()) => ({ type: 'user', timestamp: new Date(at).toISOString(), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `toolu_${id}`, content: `Command running in background with ID: ${id}` }] }, toolUseResult: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: id } });
const stopWith = (home, ...tasks) => ({ session_id: 's1', hook_event_name: 'Stop', cwd: '/w', transcript_path: path.join(home, S1_TRANSCRIPT), last_assistant_message: 'Running in the background.', background_tasks: tasks });
const SERVER = { id: 'b1', type: 'shell', status: 'running', description: 'preview server', command: 'npm run preview' };
const s1 = async base => (await snapshot(base)).sessions.find(s => s.id === 's1');
const agentTool = { session_id: 's1', hook_event_name: 'PreToolUse', cwd: '/w', agent_id: 'a1', agent_type: 'sonnet-implement', tool_name: 'Read', tool_input: { file_path: '/w/x.js' } };

test('a background agent that keeps firing hook events keeps its session working, rests once quiet, and wakes again', async t => {
  let home;
  const base = await serve(t, {}, h => home = h, bg(1, 0.3));
  await post(base, '/event', { session_id: 's1', hook_event_name: 'UserPromptSubmit', cwd: '/w', prompt: 'go' });
  await post(base, '/event', agentTool);
  await post(base, '/event', stopWith(home, { id: 'a1', type: 'subagent', status: 'running', description: 'Audit it', agent_type: 'sonnet-implement' }));
  for (const end = Date.now() + 2500; Date.now() < end; await wait(200)) { // well past the task's 0.3s, the agent busy all along
    await post(base, '/event', agentTool);
    assert.strictEqual((await s1(base)).state, 'paused');
  }
  const quiet = await until(async () => { const s = await s1(base); return s.state === 'idle' && s; }, 'the quiet session to rest');
  assert.match(quiet.note, /^1 agent open for \d+m$/);
  await post(base, '/event', agentTool);
  await until(async () => (await s1(base)).state === 'paused', 'the agent firing again to wake it');
});

// A subagent whose SubagentStop never came is dropped once it's been quiet past LANTERN_AGENT_EXPIRE_SECONDS, even in a
// session whose process is alive (the sweep leaves those sessions open), and re-appears if it fires again. One whose
// transcript ends in a finished turn goes as soon as it's been quiet LANTERN_AGENT_CHECK_SECONDS, long before the expiry.
const agentEnv = expire => ({ LANTERN_AGENT_EXPIRE_SECONDS: String(expire), LANTERN_AGENT_CHECK_SECONDS: '0.2', LANTERN_SWEEP_SECONDS: '0.1' });
const agentFire = (base, home, ev) => fetch(base + '/event', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-claude-pid': String(process.pid) },
  body: JSON.stringify({ ...ev, transcript_path: path.join(home, '.claude/projects/-w/s1.jsonl') }) });
const agentIds = async base => (await s1(base)).subagents.map(a => a.id);

test('a subagent quiet past the expiry is dropped by the sweep, and comes back when it fires again', async t => {
  let home;
  const base = await serve(t, {}, h => home = h, agentEnv(0.5));
  await agentFire(base, home, { session_id: 's1', hook_event_name: 'UserPromptSubmit', cwd: '/w', prompt: 'go' });
  await agentFire(base, home, agentTool);
  assert.deepStrictEqual(await agentIds(base), ['a1']);
  await until(async () => (await agentIds(base)).length === 0, 'the quiet subagent to be dropped');
  await agentFire(base, home, agentTool);
  assert.deepStrictEqual(await agentIds(base), ['a1']);
});

test('a subagent whose transcript ends in a finished turn is dropped once quiet, long before the expiry', async t => {
  let home;
  const base = await serve(t, {}, h => home = h, agentEnv(600));
  await agentFire(base, home, { session_id: 's1', hook_event_name: 'UserPromptSubmit', cwd: '/w', prompt: 'go' });
  await agentFire(base, home, agentTool);
  const dir = path.join(home, '.claude/projects/-w/s1/subagents');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'agent-a1.jsonl'), jsonl([user('Audit it')]));
  await wait(500); // quiet past the check threshold, its transcript unfinished: still going
  assert.deepStrictEqual(await agentIds(base), ['a1']);
  fs.writeFileSync(path.join(dir, 'agent-a1.jsonl'), jsonl([user('Audit it'), answer('Done.'), turnEnd]));
  await until(async () => (await agentIds(base)).length === 0, 'the finished subagent to be dropped');
});

// Background agents end by calling SubagentHandback with their report, not with a closing turn, and no SubagentStop
// follows: a transcript ending on that call's result is finished too, while one ending on any other tool's result isn't.
test('a subagent whose transcript ends in a hand-back is dropped once quiet, long before the expiry', async t => {
  let home;
  const base = await serve(t, {}, h => home = h, agentEnv(600));
  await agentFire(base, home, { session_id: 's1', hook_event_name: 'UserPromptSubmit', cwd: '/w', prompt: 'go' });
  await agentFire(base, home, agentTool);
  const dir = path.join(home, '.claude/projects/-w/s1/subagents');
  fs.mkdirSync(dir, { recursive: true });
  const call = name => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name, input: {} }] } });
  const result = JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } });
  fs.writeFileSync(path.join(dir, 'agent-a1.jsonl'), [JSON.stringify(user('Audit it')), call('Bash'), result].join('\n') + '\n');
  await wait(500); // ends on an ordinary tool's result: still going
  assert.deepStrictEqual(await agentIds(base), ['a1']);
  fs.writeFileSync(path.join(dir, 'agent-a1.jsonl'), [JSON.stringify(user('Audit it')), call('SubagentHandback'), result].join('\n') + '\n');
  await until(async () => (await agentIds(base)).length === 0, 'the handed-back subagent to be dropped');
});

// A hand-back can share its message with other calls: Claude Code writes the message one line per block, so the transcript
// ends on the Bash call's line, the SubagentHandback line, then both results (agent aac33e1a05c9e0ff4's real tail,
// test/fixtures/handback). Claude Code marks the hand-back's result `toolEndsTurn`, which says the run is over whichever
// order the message's lines and results come in (the second agent has its lines swapped).
test('an agent whose hand-back shares its message with other calls is finished', async t => {
  let home;
  const base = await serve(t, {}, h => home = h, agentEnv(600));
  const real = fs.readFileSync(path.join(__dirname, 'fixtures/handback/agent-aac33e1a05c9e0ff4.jsonl'), 'utf8').trim().split('\n');
  const swapped = [...real.slice(0, 3), real[4], real[3], ...real.slice(5)];
  const dir = path.join(home, '.claude/projects/-w/s1/subagents');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'agent-a1.jsonl'), real.slice(0, 4).join('\n') + '\n'); // still going: mid-message
  fs.writeFileSync(path.join(dir, 'agent-a2.jsonl'), real.slice(0, 4).join('\n') + '\n');
  await agentFire(base, home, { session_id: 's1', hook_event_name: 'UserPromptSubmit', cwd: '/w', prompt: 'go' });
  for (const a of ['a1', 'a2']) await agentFire(base, home, { ...agentTool, agent_id: a });
  await wait(500); // quiet past the check, transcripts unfinished
  assert.deepStrictEqual((await agentIds(base)).sort(), ['a1', 'a2']);
  fs.writeFileSync(path.join(dir, 'agent-a1.jsonl'), real.join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'agent-a2.jsonl'), swapped.join('\n') + '\n');
  await until(async () => (await agentIds(base)).length === 0, 'both handed-back agents to be dropped');
});

// After an interrupt (or a compaction), the agent carried on: a coordinator's message, then a Bash call and its result
// (agent a800a90975f56f70f's real lines, test/fixtures/after-interrupt). It's mid-turn; reading on back past the call to
// the interrupt or the compact summary would call it finished. The second case swaps the interrupt for the jwt fixture's
// real compact summary.
test('a turn that carries on after an interrupt or a compaction reads as still going', async t => {
  const real = fs.readFileSync(path.join(__dirname, 'fixtures/after-interrupt/agent-a800a90975f56f70f.jsonl'), 'utf8').trim().split('\n');
  const summary = fs.readFileSync(path.join(__dirname, 'fixtures/jwt/61917df1-4b2c-4e20-b413-cc6c479afa20.jsonl'), 'utf8').trim().split('\n').find(l => JSON.parse(l).isCompactSummary);
  const cases = { interrupted: real, compacted: [real[0], summary, ...real.slice(2)] }, file = i => `.claude/projects/-work/${UUID(i)}.jsonl`;
  const base = await serve(t, Object.fromEntries(Object.values(cases).map((lines, i) => [file(i), lines.join('\n') + '\n'])));
  const sessions = await until(async () => { const s = (await snapshot(base)).sessions; return s.length === 2 && s; }, 'both transcripts to be seeded');
  assert.deepStrictEqual(Object.keys(cases).map((k, i) => [k, sessions.find(s => s.id === UUID(i)).state]), [['interrupted', 'working'], ['compacted', 'working']]);
});

// One rule for an agent being alive, on every sweep: its transcript is unfinished and recent, or a hook was heard from it
// within LANTERN_AGENT_CHECK_SECONDS. A hooked agent whose transcript isn't there stays only that long.
test('a hooked agent with no transcript stays while it was just heard from, then goes', async t => {
  let home;
  const base = await serve(t, {}, h => home = h, { LANTERN_AGENT_EXPIRE_SECONDS: '600', LANTERN_AGENT_CHECK_SECONDS: '1.5', LANTERN_SWEEP_SECONDS: '0.1' });
  await agentFire(base, home, { session_id: 's1', hook_event_name: 'UserPromptSubmit', cwd: '/w', prompt: 'go' });
  await agentFire(base, home, agentTool);
  await wait(700); // several sweeps, inside the check window
  assert.deepStrictEqual(await agentIds(base), ['a1']);
  await until(async () => (await agentIds(base)).length === 0, 'the agent to go once the check window passes');
});

// An agent found from its transcript (no hooks since a restart) keeps its session paused while it writes: each sweep takes
// the transcript's latest time as when it was last heard from, read before the sweep judges the session. The server is
// stopped (SIGSTOP) past the agent's freshness while the agent goes on writing, as a busy machine can stall it. Reads take
// 0.3s here (LANTERN_READ_DELAY_SECONDS, three sweeps), so some are always out when it stops: those finish with times from
// before the stall, older than LANTERN_AGENT_CHECK_SECONDS, and must be read again. And the first sweep after must read
// before it decides. Either way, the session would rest for a while its agent works.
test('an agent known only from its transcript keeps its session paused while it keeps writing, across a stalled server', async t => {
  let home;
  const base = await serve(t, {}, h => home = h, { ...bg(3, 0.1), LANTERN_AGENT_CHECK_SECONDS: '1.5', LANTERN_READ_DELAY_SECONDS: '0.3' });
  const dir = path.join(home, '.claude/projects/-w/s1/subagents'), file = path.join(dir, 'agent-a1.jsonl');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, jsonl([user('Audit it')]));
  await agentFire(base, home, { session_id: 's1', hook_event_name: 'UserPromptSubmit', cwd: '/w', prompt: 'go' });
  await until(async () => (await agentIds(base)).join() === 'a1', 'the sweep to find the agent');
  await agentFire(base, home, { ...stopWith(home, { id: 'a1', type: 'subagent', status: 'running', description: 'Audit it' }) });
  await until(async () => (await s1(base)).state === 'paused', 'the session to pause on its agent');
  const write = async ms => { for (const end = Date.now() + ms; Date.now() < end; await wait(200)) fs.appendFileSync(file, jsonl([user('more')])); };
  await write(400); // past one read, so reads are out all the time
  assert.strictEqual((await s1(base)).state, 'paused');
  t.server.kill('SIGSTOP');
  await write(3500); // past the 3s freshness
  fs.appendFileSync(file, jsonl([user('more')]));
  const wrote = fs.statSync(file).mtimeMs;
  t.server.kill('SIGCONT');
  // the reads that were out land, then fresh ones; the session stays paused until the server has heard the last write
  // (the agent's `last` reaches it), and the freshness is wide enough that a slow runner can't outwait it
  for (const end = Date.now() + 20000; ; await wait(20)) {
    const s = await s1(base);
    assert.strictEqual(s.state, 'paused');
    if (s.subagents[0].last >= wrote) break;
    assert.ok(Date.now() < end, 'timed out waiting for the server to hear the last write');
  }
});

// Claude Code fires no hook on a rename, so the sweep notices the new custom-title.json by itself, in a session that's
// waiting and sends nothing more.
test('a rename of a waiting session reaches the page on the next sweep, with no further hook event', async t => {
  let home;
  const base = await serve(t, {}, h => home = h, agentEnv(600));
  const dir = path.join(home, '.claude/projects/-w/s1');
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  fs.writeFileSync(dir + '.jsonl', jsonl([user('hi'), answer('Done.'), turnEnd]));
  await agentFire(base, home, { session_id: 's1', hook_event_name: 'Stop', cwd: '/w', last_assistant_message: 'Done.' });
  await wait(300); // a few sweeps pass with the old title
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'custom-title.json'), JSON.stringify({ customTitle: 'Renamed by Dace' }));
  await until(async () => (await s1(base)).title === 'Renamed by Dace', 'the sweep to pick up the new title');
});

test('a rename in the Claude app reaches the page on the next sweep, and wins over the transcript\'s title', async t => {
  let home;
  const base = await serve(t, {}, h => home = h, agentEnv(600));
  const dir = path.join(home, '.claude/projects/-w/s1');
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  fs.writeFileSync(dir + '.jsonl', jsonl([user('hi'), answer('Done.'), turnEnd]));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'custom-title.json'), JSON.stringify({ customTitle: 'From Claude Code' }));
  await agentFire(base, home, { session_id: 's1', hook_event_name: 'Stop', cwd: '/w', last_assistant_message: 'Done.' });
  const file = path.join(home, 'Library/Application Support/Claude/claude-code-sessions/a/b/local_x1.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ sessionId: 'local_x1', cliSessionId: 's1', title: 'From the app' }));
  await until(async () => (await s1(base)).title === 'From the app', 'the sweep to pick up the app\'s title');
  fs.writeFileSync(file, JSON.stringify({ sessionId: 'local_x1', cliSessionId: 's1', title: 'Renamed in the app' }));
  await until(async () => (await s1(base)).title === 'Renamed in the app', 'the sweep to pick up the app rename');
});

test('a subagent whose start the hooks missed is found from its transcript by the sweep, while its session is working', async t => {
  let home;
  const base = await serve(t, {}, h => home = h, agentEnv(600));
  await agentFire(base, home, { session_id: 's1', hook_event_name: 'UserPromptSubmit', cwd: '/w', prompt: 'go' });
  assert.deepStrictEqual(await agentIds(base), []);
  const dir = path.join(home, '.claude/projects/-w/s1/subagents');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'agent-a9.jsonl'), jsonl([user('Audit it')]));
  fs.writeFileSync(path.join(dir, 'agent-a8.jsonl'), jsonl([user('Old'), answer('Done.'), turnEnd])); // finished: not adopted
  await until(async () => (await agentIds(base)).join() === 'a9', 'the unannounced subagent to be found');
});

// An agent quiet for minutes mid tool call (af195bdf112f280e9's real tail, test/fixtures/quiet-agent) is still alive.
const QUIET_AGENT = fs.readFileSync(path.join(__dirname, 'fixtures/quiet-agent/agent-af195bdf112f280e9.jsonl'), 'utf8');
const quietFor = (h, file, ms) => { const at = new Date(Date.now() - ms); fs.utimesSync(path.join(h, file), at, at); };
test('a restart brings back an agent that has been quiet for minutes mid tool call', async t => {
  const id = UUID(3), dir = `.claude/projects/-work-3/${id}/subagents`, agent = `${dir}/agent-af195bdf112f280e9.jsonl`;
  // finished agents touched as recently stay gone: one ended its turn, one handed back
  const ended = `${dir}/agent-aended.jsonl`, handed = `${dir}/agent-ahanded.jsonl`;
  const call = { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'SubagentHandback', input: {} }] } };
  const result = { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } };
  const base = await serve(t, { ...transcript(id, [user('Run the audits'), answer('Two audits are running.')]), [agent]: QUIET_AGENT,
    [agent.replace('.jsonl', '.meta.json')]: JSON.stringify({ agentType: 'sonnet-implement', description: 'Audit it' }),
    [ended]: jsonl([user('Audit it'), answer('Done.')]), [handed]: jsonl([user('Audit it'), call, result]) },
  h => { for (const f of [agent, ended, handed]) quietFor(h, f, 3 * 60 * 1000); });
  const s = await until(async () => (await snapshot(base)).sessions.find(x => x.id === id), 'the session to be seeded');
  assert.deepStrictEqual(s.subagents.map(a => [a.id, a.type, a.description]), [['af195bdf112f280e9', 'sonnet-implement', 'Audit it']]);
});
test('the sweep finds a quiet agent the hooks never announced, in a session that is waiting on me', async t => {
  let home;
  const base = await serve(t, {}, h => home = h, agentEnv(600));
  const dir = '.claude/projects/-w/s1';
  fs.mkdirSync(path.join(home, dir, 'subagents'), { recursive: true });
  fs.writeFileSync(path.join(home, dir + '.jsonl'), jsonl([user('hi'), answer('Should I go on?')]));
  await agentFire(base, home, { session_id: 's1', hook_event_name: 'Stop', cwd: '/w', last_assistant_message: 'Should I go on?' });
  assert.strictEqual((await s1(base)).state, 'waiting');
  const agent = `${dir}/subagents/agent-af195bdf112f280e9.jsonl`;
  fs.writeFileSync(path.join(home, agent), QUIET_AGENT);
  quietFor(home, agent, 3 * 60 * 1000);
  await until(async () => (await agentIds(base)).join() === 'af195bdf112f280e9', 'the sweep to find the quiet agent');
  await wait(500); // five sweeps derive the state with the agent in the map
  assert.strictEqual((await s1(base)).state, 'waiting'); // an agent it didn't hand over to doesn't stop it waiting on me
});

test('a background shell task younger than the threshold keeps its session working', async t => {
  let home;
  const base = await serve(t, { [S1_TRANSCRIPT]: jsonl([started('b1')]) }, h => home = h, bg(0.1, 60));
  await post(base, '/event', stopWith(home, SERVER));
  await wait(1000); // ten sweeps, the agent threshold long past
  assert.deepStrictEqual((({ state, note }) => ({ state, note }))(await s1(base)), { state: 'paused', note: 'Waiting on 1 background task' });
});

// The card shows how long each background task has run, from the transcript line that started it.
test('a background task\'s start reaches the page with its description, and goes when the session moves on', async t => {
  let home;
  const at = Date.now() - 5 * 60e3, stamp = new Date(at).toISOString();
  const base = await serve(t, { [S1_TRANSCRIPT]: jsonl([started('b1', at)]) }, h => home = h, bg(0.1, 600));
  await post(base, '/event', stopWith(home, SERVER));
  const s = await until(async () => { const x = await s1(base); return x?.taskStarted && x; }, 'the task\'s start');
  assert.deepStrictEqual([s.tasks, s.taskStarted], [['preview server'], { 'preview server': Date.parse(stamp) }]);
  await post(base, '/event', { session_id: 's1', hook_event_name: 'UserPromptSubmit', cwd: '/w', prompt: 'go' });
  await until(async () => (await s1(base)).taskStarted === undefined, 'it to go with the tasks');
});

test('a background task open past the threshold with no agent activity rests after the sweep, and stays old across turns', async t => {
  let home;
  const base = await serve(t, { [S1_TRANSCRIPT]: jsonl([started('b1')]) }, h => home = h, bg(0.1, 0.5));
  await post(base, '/event', stopWith(home, SERVER));
  assert.strictEqual((await until(() => s1(base), 'the session')).state, 'paused');
  const quiet = await until(async () => { const s = await s1(base); return s.state === 'idle' && s; }, 'the session to rest with no new event');
  assert.match(quiet.note, /^1 background task open for \d+m$/);
  // the same server still open at the next turn's end: it's as old as when it started, so the session rests at once
  await post(base, '/event', { session_id: 's1', hook_event_name: 'UserPromptSubmit', cwd: '/w', prompt: 'more' });
  await post(base, '/event', stopWith(home, SERVER));
  assert.strictEqual((await s1(base)).state, 'idle');
});

// A task the session's transcript didn't start is decided once: its start line is written before any Stop lists it, so a
// miss stays a miss, and the next Stop doesn't scan the whole transcript again (110 ms for a 175 MB one).
test('a background task the transcript didn\'t start is looked up once, not at every Stop', async t => {
  let home;
  const base = await serve(t, { [S1_TRANSCRIPT]: jsonl([user('go')]) }, h => home = h, bg(0.1, 60));
  await post(base, '/event', stopWith(home, SERVER));
  assert.strictEqual((await s1(base)).state, 'waiting');
  fs.appendFileSync(path.join(home, S1_TRANSCRIPT), jsonl([started('b1')])); // only a second scan could find it now
  await post(base, '/event', { session_id: 's1', hook_event_name: 'UserPromptSubmit', cwd: '/w', prompt: 'more' });
  await post(base, '/event', stopWith(home, SERVER));
  assert.strictEqual((await s1(base)).state, 'waiting');
});

// A task's age comes from the line in the transcript that started it, not from when this lantern first saw it, so a
// restart (a fresh server) doesn't make a two-hour-old dev server fresh again.
test('a background task the transcript says started two hours ago rests at its first Stop on a fresh server', async t => {
  let home;
  const base = await serve(t, { [S1_TRANSCRIPT]: jsonl([started('b1', Date.now() - 2 * 3600 * 1000)]) }, h => home = h, bg(0.1, 30 * 60));
  await post(base, '/event', stopWith(home, SERVER));
  const s = await s1(base);
  assert.deepStrictEqual({ state: s.state, note: s.note, tasks: s.tasks }, { state: 'idle', note: '1 background task open for 120m', tasks: ['preview server'] });
});

// Dace's 7791 zombie (Oct 20), from his real transcripts (test/fixtures/zombie, text redacted): subagent a3dc4fce41f0fcc8e
// started shell task b2xhvxx4z (a throwaway server on 7791), ended its turn at 19:44:44Z and fired no hook again, and
// Claude Code kept both listed as running in every Stop. Neither wakes the main session: the agent is long finished (not in
// the agents map, its transcript done and quiet) and the shell's start is only in the subagent's transcript. So the turn
// ending at 20:17Z is waiting on Dace, where Lantern showed "Waiting on 1 background task" for 14 hours. bo1p24jsb, the
// main session's own merge job, does count, and its age comes from the transcript line that started it.
test('Stop ignores a finished subagent and the shell task it started (the 7791 zombie), and counts the session\'s own task by its real age', async t => {
  const id = 'c0223694-dbd3-47d3-99d4-c889a060f541', file = `.claude/projects/-Users-user/${id}.jsonl`, fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures/zombie', name), 'utf8');
  const agentFile = `.claude/projects/-Users-user/${id}/subagents/agent-a3dc4fce41f0fcc8e.jsonl`;
  let home;
  const base = await serve(t, { [file]: fixture('main.jsonl'), [agentFile]: fixture('agent-a3dc4fce41f0fcc8e.jsonl') }, h => {
    home = h;
    const ended = new Date(Date.now() - 33 * 60 * 1000); // its last line, 33 minutes before the 20:17Z turn
    fs.utimesSync(path.join(h, agentFile), ended, ended);
  });
  const hook = (hook_event_name, more = {}) => post(base, '/event', { session_id: id, hook_event_name, cwd: '/Users/user', transcript_path: path.join(home, file), ...more });
  const ZOMBIES = [{ id: 'a3dc4fce41f0fcc8e', type: 'subagent', status: 'running', description: 'Spread the moths', agent_type: 'opus-implement' },
    { id: 'b2xhvxx4z', type: 'shell', status: 'running', description: 'Serve the page on 7791', command: './server' }];
  await hook('UserPromptSubmit', { prompt: 'why does this session show as active?' });
  await hook('Stop', { last_assistant_message: 'It was the leftover server.', background_tasks: ZOMBIES });
  const shown = async () => { const s = (await snapshot(base)).sessions.find(x => x.id === id); return { state: s.state, note: s.note, tasks: s.tasks }; };
  assert.deepStrictEqual(await shown(), { state: 'waiting', note: 'Finished its turn', tasks: [] });
  // the session's own merge job still open: started hours ago per its transcript line, so it rests at once
  await hook('UserPromptSubmit', { prompt: 'and the merge?' });
  await hook('Stop', { last_assistant_message: 'Merging in the background.', background_tasks: [...ZOMBIES, { id: 'bo1p24jsb', type: 'shell', status: 'running', description: 'Merge it', command: 'gh pr merge' }] });
  const merge = await shown();
  assert.deepStrictEqual({ ...merge, note: merge.note.replace(/\d+m$/, 'Nm') }, { state: 'idle', note: '1 background task open for Nm', tasks: ['Merge it'] });
});

// Dace's jwt session (Oct 20, 21:03Z), from its real transcript (test/fixtures/jwt, text redacted): a turn ended with
// background agents still running (turn_duration's pendingBackgroundAgentCount 6; the compaction's task_status lines name
// five running), then he ran /compact. PostCompact (manual) and the SessionStart (source compact) after every compaction
// both landed the moth as idle, and nothing brought it back while the agents worked. They now check instead: Claude Code
// says busy (agents pending), the agents are alive, so it's still waiting on them.
test('a manual /compact while agents run leaves the session paused on them (the jwt compaction)', async t => {
  const id = '61917df1-4b2c-4e20-b413-cc6c479afa20', file = `.claude/projects/-Users-user-work-project/${id}.jsonl`;
  const running = ['ab48c6bbdab5b2cef', 'a1a58c2621ca3b061', 'a4845b0c0d3254c53', 'a1172ab480410edb2', 'aa05709913f843fbc'], done = 'ae931c800df033296';
  let home;
  const base = await serve(t, {
    [file]: fs.readFileSync(path.join(__dirname, 'fixtures/jwt', `${id}.jsonl`), 'utf8'),
    [`.claude/sessions/${process.pid}.json`]: JSON.stringify({ pid: process.pid, sessionId: id, cwd: '/Users/user/work/project', kind: 'interactive', entrypoint: 'cli', status: 'busy' }),
  }, h => home = h);
  const hook = (hook_event_name, more = {}) => fetch(base + '/event', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-claude-pid': String(process.pid) },
    body: JSON.stringify({ session_id: id, hook_event_name, cwd: '/Users/user/work/project', transcript_path: path.join(home, file), ...more }) });
  const shown = async () => { const s = (await snapshot(base)).sessions.find(x => x.id === id); return [s.state, s.note]; };
  await hook('UserPromptSubmit', { prompt: 'run the audits' });
  for (const a of [...running, done]) await hook('SubagentStart', { agent_id: a, agent_type: 'opus-audit' });
  await hook('SubagentStop', { agent_id: done, agent_type: 'opus-audit' });
  await hook('Stop', { last_assistant_message: 'Five audits are running.', background_tasks: [...running.map(a => ({ id: a, type: 'subagent', status: 'running', description: 'Audit', agent_type: 'opus-audit' })),
    { id: done, type: 'subagent', status: 'completed', description: 'Audit', agent_type: 'opus-audit' }] });
  assert.deepStrictEqual(await shown(), ['paused', 'Waiting on 5 agents']);
  await hook('PreCompact', { trigger: 'manual' });
  assert.deepStrictEqual((await shown())[0], 'working');
  await hook('PostCompact', { trigger: 'manual' });
  assert.deepStrictEqual(await shown(), ['paused', 'Waiting on 5 agents']);
  await hook('SessionStart', { source: 'compact' });
  assert.deepStrictEqual(await shown(), ['paused', 'Waiting on 5 agents']);
  // a later turn whose Stop never reached the lantern, then a compaction: Claude Code's status says idle (no turn, nothing
  // pending), which is definitive, so the check lands it rather than leaving it working
  await hook('UserPromptSubmit', { prompt: 'ok resume' });
  fs.writeFileSync(path.join(home, `.claude/sessions/${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: id, cwd: '/Users/user/work/project', status: 'idle' }));
  await hook('SessionStart', { source: 'compact' });
  assert.deepStrictEqual((await shown())[0], 'idle');
});

// An Esc interrupt fires no Stop, and a /compact cancelled before it reported back sends no PostCompact: Claude Code's
// status turns idle while Lantern still says working. The sweep looks once the hooks have been quiet past their usual lag
// (LANTERN_STATUS_LAG_SECONDS) and lands it; while the status says busy (a turn, or a /compact still running) it leaves it.
// The transcript only has to exist, since the status file points at it (it's the real desktop interrupt tail from
// test/fixtures/desktop-turns.jsonl, which only seeding reads).
test('a working session lands once Claude Code says idle and the hooks have gone quiet: an Esc interrupt, a cancelled /compact', async t => {
  const tails = {}; let name;
  for (const line of fs.readFileSync(path.join(__dirname, 'fixtures/desktop-turns.jsonl'), 'utf8').trim().split('\n')) {
    const j = JSON.parse(line);
    if (j.__case) tails[name = j.__case] = []; else tails[name].push(line);
  }
  const id = UUID(4), file = `.claude/projects/-Users-user/${id}.jsonl`, status = `.claude/sessions/${process.pid}.json`;
  const setStatus = (h, st) => fs.writeFileSync(path.join(h, status), JSON.stringify({ pid: process.pid, sessionId: id, cwd: '/Users/user', status: st }));
  let home;
  const base = await serve(t, { [file]: tails.interrupted.join('\n') + '\n', [status]: '' }, h => { home = h; setStatus(h, 'busy'); },
    { LANTERN_SWEEP_SECONDS: '0.1', LANTERN_STATUS_LAG_SECONDS: '2' });
  const hook = ev => fetch(base + '/event', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-claude-pid': String(process.pid) },
    body: JSON.stringify({ session_id: id, cwd: '/Users/user', transcript_path: path.join(home, file), ...ev }) });
  const state = async () => (await snapshot(base)).sessions.find(s => s.id === id).state;
  await hook({ hook_event_name: 'UserPromptSubmit', prompt: 'go' });
  await wait(2500); // past the lag, Claude Code busy: still working
  assert.strictEqual(await state(), 'working');
  await hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {} });
  setStatus(home, 'idle'); // Esc: no Stop comes
  await wait(500); // five sweeps, inside the lag
  assert.strictEqual(await state(), 'working', 'within the lag a Stop may still be on its way');
  await until(async () => await state() === 'idle', 'the sweep to land the interrupted turn');
  // a /compact cancelled before it reported back: the same look lands it
  setStatus(home, 'busy');
  await hook({ hook_event_name: 'PreCompact', trigger: 'manual' });
  await wait(2500); // past the lag, the compaction still running (busy): not landed
  assert.strictEqual(await state(), 'working');
  setStatus(home, 'idle');
  await until(async () => await state() === 'idle', 'the sweep to land the cancelled compaction');
});

// A process that ended leaves its last status file behind. Here the session ran in two processes; the one that said idle
// ends, and the one still running has no status file: nothing alive says idle, so it stays working.
test('an ended process\'s leftover idle status doesn\'t land a session still running elsewhere', async t => {
  const proc = spawn('sleep', ['60']);
  t.after(() => proc.kill());
  const id = UUID(6), file = `.claude/projects/-Users-user/${id}.jsonl`, status = `.claude/sessions/${proc.pid}.json`;
  const setStatus = (h, st) => fs.writeFileSync(path.join(h, status), JSON.stringify({ pid: proc.pid, sessionId: id, cwd: '/Users/user', status: st }));
  let home;
  const base = await serve(t, { [file]: jsonl([user('go')]), [status]: '' }, h => { home = h; setStatus(h, 'busy'); },
    { LANTERN_SWEEP_SECONDS: '0.1', LANTERN_STATUS_LAG_SECONDS: '1' });
  const hook = (pid, ev) => fetch(base + '/event', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-claude-pid': String(pid) },
    body: JSON.stringify({ session_id: id, cwd: '/Users/user', transcript_path: path.join(home, file), ...ev }) });
  const shown = async () => (await snapshot(base)).sessions.find(s => s.id === id);
  await hook(proc.pid, { hook_event_name: 'UserPromptSubmit', prompt: 'go' });
  await hook(process.pid, { hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: {} }); // the other process, no status file
  await wait(1500); // past the lag
  // Its last word, then it ends, all while the server is stopped: a sweep between the two would see a live process saying idle.
  t.server.kill('SIGSTOP');
  setStatus(home, 'idle');
  const gone = new Promise(r => proc.once('exit', r)); proc.kill(); await gone;
  t.server.kill('SIGCONT');
  await until(async () => (await shown()).pids.join() === String(process.pid), 'the sweep to drop the ended process');
  assert.strictEqual((await shown()).state, 'working');
});

// Every way a run of hook events leaves a session's state, note and waitingSince, as one table: the events in order, then
// what the page shows. Each row runs as its own session on one server.
const ev = (hook_event_name, more = {}) => ({ hook_event_name, cwd: '/w', ...more });
const STOP = ev('Stop', { last_assistant_message: 'Done.' }), ASK = ev('Stop', { last_assistant_message: 'Should I merge it?' });
// the table's server points transcript_path at a transcript that started b1
const TASK = { background_tasks: [SERVER], transcript_path: '' }, UPS = ev('UserPromptSubmit', { prompt: 'go' });
const P1 = '6af18942-63c0-492b-b1ed-970d71ebe4ad', P2 = '77b5c98f-e092-40dd-8a2d-be5f73cbd3c3';
const STATE_TABLE = [
  ['a prompt', [UPS], 'working', ''],
  ['a tool call', [ev('PreToolUse', { tool_name: 'Read', tool_input: {} })], 'working', ''],
  ['a finished turn', [UPS, STOP], 'waiting', 'Finished its turn'],
  ['a turn ending on a question', [UPS, ASK], 'waiting', 'Asks: Should I merge it?'],
  ['a turn ending with a task running', [UPS, { ...STOP, ...TASK }], 'paused', 'Waiting on 1 background task'],
  ['a question with a task running', [UPS, { ...ASK, ...TASK }], 'waiting', 'Asks: Should I merge it? (1 background task still running)'],
  ['an API error', [UPS, ev('StopFailure')], 'waiting', 'Turn ended with an API error'],
  ['a permission request', [UPS, ev('PermissionRequest', { tool_name: 'Bash' })], 'waiting', 'Wants permission to use Bash'],
  ['a permission prompt', [UPS, ev('Notification', { notification_type: 'permission_prompt', message: 'Claude needs your permission' })], 'waiting', 'Claude needs your permission'],
  ['an idle nudge after a turn', [UPS, STOP, ev('Notification', { notification_type: 'idle_prompt', message: 'Claude is waiting' })], 'waiting', 'Claude is waiting'],
  ['an idle nudge while waiting on a task', [UPS, { ...STOP, ...TASK }, ev('Notification', { notification_type: 'idle_prompt', message: 'Claude is waiting' })], 'paused', 'Waiting on 1 background task'],
  ['some other notification', [UPS, STOP, ev('Notification', { notification_type: 'auth_success', message: 'Signed in' })], 'waiting', 'Finished its turn'],
  ['a tool call after a permission request', [UPS, ev('PermissionRequest', { tool_name: 'Bash' }), ev('PostToolUse', { tool_name: 'Bash' })], 'working', ''],
  ['a new prompt after waiting on a task', [UPS, { ...STOP, ...TASK }, UPS], 'working', ''],
  ['a subagent firing while waiting on a task', [UPS, { ...STOP, ...TASK }, { ...agentTool, cwd: '/w' }], 'paused', 'Waiting on 1 background task'],
  ['a subagent firing after a finished turn', [UPS, STOP, { ...agentTool, cwd: '/w' }], 'waiting', 'Finished its turn'],
  ['a session start', [ev('SessionStart', { source: 'startup' })], 'idle', undefined],
  ['a session start after a turn', [UPS, STOP, ev('SessionStart', { source: 'resume' })], 'idle', 'Finished its turn'],
  ['a manual compact, started', [UPS, STOP, ev('PreCompact', { trigger: 'manual' })], 'working', 'Finished its turn'],
  ['a manual compact, done', [UPS, STOP, ev('PreCompact', { trigger: 'manual' }), ev('PostCompact', { trigger: 'manual' })], 'idle', ''],
  ['an automatic compact mid-turn', [UPS, ev('PreCompact', { trigger: 'auto' }), ev('PostCompact', { trigger: 'auto' })], 'working', ''],
  ['an automatic compact mid-turn, then its session start', [UPS, ev('PreCompact', { trigger: 'auto' }), ev('PostCompact', { trigger: 'auto' }), ev('SessionStart', { source: 'compact' })], 'working', ''],
  ['a manual compact, then its session start', [UPS, STOP, ev('PreCompact', { trigger: 'manual' }), ev('PostCompact', { trigger: 'manual' }), ev('SessionStart', { source: 'compact' })], 'idle', ''],
  ['a manual compact while waiting on a task', [UPS, { ...STOP, ...TASK }, ev('PreCompact', { trigger: 'manual' }), ev('PostCompact', { trigger: 'manual' }), ev('SessionStart', { source: 'compact' })], 'paused', 'Waiting on 1 background task'],
  // a /compact that never reports back (Esc, or it failed): the next turn takes over, as it always did before
  ['a lost manual compact, then a turn', [UPS, STOP, ev('PreCompact', { trigger: 'manual' }), UPS, STOP], 'waiting', 'Finished its turn'],
  ['a lost manual compact, then a question', [UPS, STOP, ev('PreCompact', { trigger: 'manual' }), UPS, ASK], 'waiting', 'Asks: Should I merge it?'],
  ['a lost manual compact, then a permission request', [UPS, STOP, ev('PreCompact', { trigger: 'manual' }), UPS, ev('PermissionRequest', { tool_name: 'Bash' })], 'waiting', 'Wants permission to use Bash'],
  ['a lost manual compact while waiting on a task, then an idle nudge', [UPS, { ...STOP, ...TASK }, ev('PreCompact', { trigger: 'manual' }), ev('Notification', { notification_type: 'idle_prompt', message: 'Claude is waiting' })], 'paused', 'Waiting on 1 background task'],
  // a /compact answers whatever the session was waiting on, an idle nudge included
  ['a manual compact after an idle nudge', [UPS, STOP, ev('Notification', { notification_type: 'idle_prompt', message: 'Claude is waiting' }), ev('PreCompact', { trigger: 'manual' }), ev('PostCompact', { trigger: 'manual' }), ev('SessionStart', { source: 'compact' })], 'idle', ''],
  // jwt, Oct 20: the turn of prompt 6af18942 ended at 20:57:05.852Z and a queued prompt (77b5c98f) started 50 ms later;
  // both hooks are posted async, so the old turn's Stop can land after the new prompt
  ['a late Stop from the turn before', [{ ...UPS, prompt_id: P1 }, { ...UPS, prompt_id: P2 }, { ...STOP, prompt_id: P1 }], 'working', ''],
  ['a late API error from the turn before', [{ ...UPS, prompt_id: P1 }, { ...UPS, prompt_id: P2 }, ev('StopFailure', { prompt_id: P1 })], 'working', ''],
  ['the new turn\'s own Stop', [{ ...UPS, prompt_id: P1 }, { ...UPS, prompt_id: P2 }, { ...STOP, prompt_id: P1 }, { ...ASK, prompt_id: P2 }], 'waiting', 'Asks: Should I merge it?'],
  ['a Stop from a prompt whose UPS was lost', [{ ...UPS, prompt_id: P1 }, { ...STOP, prompt_id: P2 }], 'waiting', 'Finished its turn'],
  ['a Stop with no prompt_id after a prompt with one', [{ ...UPS, prompt_id: P1 }, STOP], 'waiting', 'Finished its turn'],
  ['a Stop with no prompt seen (a restart mid-turn)', [ev('PreToolUse', { tool_name: 'Read', tool_input: {} }), { ...STOP, prompt_id: P1 }], 'waiting', 'Finished its turn'],
  ['an automatic compact after a turn', [UPS, STOP, ev('PreCompact', { trigger: 'auto' }), ev('PostCompact', { trigger: 'auto' })], 'waiting', 'Finished its turn'],
];
test('the state table: what each run of hook events leaves a session showing', async t => {
  let home;
  const base = await serve(t, { [S1_TRANSCRIPT]: jsonl([started('b1')]) }, h => home = h);
  for (const [name, events] of STATE_TABLE) for (const e of events) await post(base, '/event', { ...e, session_id: name, ...('transcript_path' in e ? { transcript_path: path.join(home, S1_TRANSCRIPT) } : {}) });
  const sessions = (await snapshot(base)).sessions;
  const got = STATE_TABLE.map(([name]) => { const s = sessions.find(x => x.id === name); return [name, s.state, s.note, s.state === 'waiting' ? s.waitingSince > 0 : s.waitingSince]; });
  assert.deepStrictEqual(got, STATE_TABLE.map(([name, , state, note]) => [name, state, note, state === 'waiting' ? true : 0]));
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
// not when an earlier day had it (see the next test), and never in a page's opening burst (a reload or reconnect). Ten agents in one session earn Hive Mind.
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

// The swarm is for the first time a badge is ever earned. Hive Mind earned yesterday: earning it again today plays nothing,
// but it still gets its row and shows in the stats panel's week (/stats) next to yesterday's.
test('a badge earned on an earlier day gets no flash, but still lands in the stats', async t => {
  const dayOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const ago = new Date(Date.now() - 86400000);
  let home;
  const base = await serve(t, { 'data/stats.sqlite': statsLog([['server', null, ago.getTime(), ago.getTime() + 1000]],
    `INSERT INTO achievements (id, day, time) VALUES ('hive_mind', '${dayOf(ago)}', ${ago.getTime()});`) }, h => home = h);
  const blocks = await streamed(base, () => Promise.all(Array.from({ length: 10 }, (_, n) => post(base, '/event', { ...toolCall(UUID(1)), agent_id: `agent-${n}` }))));
  assert.deepStrictEqual(blocks.filter(b => b.startsWith('event: badge')), []);
  await until(async () => (await (await fetch(base + '/stats')).json()).achievements.filter(a => a[0] === 'hive_mind').map(a => a[1]).length === 2, 'both days of Hive Mind in the stats');
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

// Only the lines that mark a turn decide a seeded session's state. Whatever else Claude Code writes after the turn (each
// tail below is shaped like lines in real transcripts) leaves a finished turn waiting and an unfinished one working.
const meta = text => ({ type: 'user', isMeta: true, cwd: '/work', message: { role: 'user', content: text } });
const local = content => ({ type: 'system', subtype: 'local_command', cwd: '/work', content });
const AFTER_TURN = {
  'a /rename': [{ type: 'custom-title', customTitle: 'mediator' }, { type: 'agent-name', agentName: 'mediator' },
    local('<command-name>/rename</command-name>'), local('<local-command-stdout>Session renamed to: mediator</local-command-stdout>'),
    meta('<system-reminder>\nThe user named this session "mediator".\n</system-reminder>')],
  'an older local command': [user('<command-name>/clear</command-name> <command-message>clear</command-message>'), user('<local-command-stdout></local-command-stdout>')],
  'a local command caveat': [meta([{ type: 'text', text: '<local-command-caveat>The command below was run directly in Claude Code.</local-command-caveat>' }])],
  'a ! shell line': [user('<bash-input>git status</bash-input>'), user('<bash-stdout>clean</bash-stdout><bash-stderr></bash-stderr>')],
  'an attachment': [{ type: 'attachment', attachment: { type: 'hook_success' } }, { type: 'attachment', attachment: { type: 'queued_command' } }],
  'system notes': [{ type: 'system', subtype: 'stop_hook_summary' }, { type: 'system', subtype: 'away_summary', content: 'You were fixing it.' },
    { type: 'system', subtype: 'informational' }, { type: 'system', subtype: 'api_error' }],
  'bookkeeping': ['file-history-snapshot', 'ai-title', 'pr-link', 'last-prompt', 'permission-mode', 'mode', 'queue-operation', 'cost-state'].map(type => ({ type })),
  'a kind Claude Code adds later': [{ type: 'something-new', message: { content: 'hello' } }],
};
test('a transcript ending on lines that aren\'t a turn seeds from the last turn: waiting after a finished one, working mid-turn', async t => {
  const kinds = Object.entries(AFTER_TURN), file = (i, done) => `.claude/projects/-work/0000${String(i).padStart(4, '0')}-${done ? 1 : 2}000-4000-8000-000000000000.jsonl`;
  const finished = [user('Fix it'), answer('Fixed.'), turnEnd];
  const midTurn = [user('Fix it'), { type: 'assistant', cwd: '/work', message: { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }] } }];
  const base = await serve(t, Object.assign({}, ...kinds.flatMap(([, tail], i) => [
    { [file(i, true)]: jsonl([...finished, ...tail]) }, { [file(i, false)]: jsonl([...midTurn, ...tail]) }])));
  const sessions = await until(async () => { const s = (await snapshot(base)).sessions; return s.length === kinds.length * 2 && s; }, 'every transcript to be seeded');
  const state = (i, done) => sessions.find(s => s.id === path.basename(file(i, done), '.jsonl')).state;
  assert.deepStrictEqual(Object.fromEntries(kinds.map(([kind], i) => [kind, [state(i, true), state(i, false)]])),
    Object.fromEntries(kinds.map(([kind]) => [kind, ['waiting', 'working']])));
});

// The Claude app's transcripts never get a turn_duration marker, so only their own lines say how a turn ended. Real tails
// from Dace's desktop sessions (test/fixtures/desktop-turns.jsonl, text redacted): a finished turn ends on end_turn and
// stop_hook_summary; an Esc interrupt ends on a list-shaped "[Request interrupted by
// user]" line with no Stop after it, so it's back at the prompt with nothing asked (idle); a side-session event is a
// string-shaped <system-reminder> with no origin, which isn't a prompt; and a typed prompt (origin.kind human) is a turn
// starting, even one whose text starts with a <system-reminder> (306 of them in one of Dace's transcripts; the last case is
// a finished turn, then the typed prompt reshaped that way). Seeded with no process, the transcript is all there is.
test('desktop transcripts seed from their own turn ends: finished waits, an interrupt idles, a side-session event isn\'t a prompt', async t => {
  const cases = {}; let name;
  for (const line of fs.readFileSync(path.join(__dirname, 'fixtures/desktop-turns.jsonl'), 'utf8').trim().split('\n')) {
    const j = JSON.parse(line);
    if (j.__case) cases[name = j.__case] = []; else cases[name].push(line);
  }
  const names = Object.keys(cases), file = i => `.claude/projects/-Users-user/${UUID(i)}.jsonl`;
  const base = await serve(t, Object.fromEntries(names.map((n, i) => [file(i), cases[n].join('\n') + '\n'])));
  const sessions = await until(async () => { const s = (await snapshot(base)).sessions; return s.length === names.length && s; }, 'every transcript to be seeded');
  assert.deepStrictEqual(Object.fromEntries(names.map((n, i) => [n, sessions.find(s => s.id === UUID(i)).state])),
    { finished: 'waiting', interrupted: 'idle', 'interrupted-tool-use': 'idle', 'finished-then-side-session': 'waiting', 'typed-prompt': 'working',
      'typed-prompt-starting-with-a-reminder': 'working' }); // origin.kind human says it's a prompt, whatever its text starts with
});

// The transcript only stands in when no hook has said: a session the hooks already know keeps its state when adoption
// finds its process and reads a transcript that says otherwise (here one that hasn't caught up with the Stop yet).
test('adoption never overrides the state a hook gave a session with what its transcript says', async t => {
  const proc = spawn('sleep', ['60']), other = spawn('sleep', ['60']), id = UUID(8), unknown = UUID(9);
  t.after(() => { proc.kill(); other.kill(); });
  const transcriptOf = s => `.claude/projects/-work/${s}.jsonl`;
  let home;
  const base = await serve(t, {
    [transcriptOf(id)]: jsonl([user('Fix it'), ...AFTER_TURN['a /rename']]), // reads as mid-turn
    [transcriptOf(unknown)]: jsonl([user('Fix it'), answer('Fixed.'), turnEnd]),
    'no-bin/ps': `#!/bin/sh\n[ -f "$HOME/go" ] && echo "${proc.pid} claude" && echo "${other.pid} claude"\n`,
    [`.claude/sessions/${proc.pid}.json`]: JSON.stringify({ pid: proc.pid, sessionId: id, cwd: '/work' }),
    [`.claude/sessions/${other.pid}.json`]: JSON.stringify({ pid: other.pid, sessionId: unknown, cwd: '/work' }),
  }, h => {
    home = h;
    fs.chmodSync(path.join(h, 'no-bin/ps'), 0o755);
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000); // too old for startup seeding: only adoption finds them
    for (const s of [id, unknown]) fs.utimesSync(path.join(h, transcriptOf(s)), dayAgo, dayAgo);
  }, { LANTERN_ADOPT_SECONDS: '0.2' });
  await post(base, '/event', { session_id: id, hook_event_name: 'Stop', cwd: '/work', last_assistant_message: 'Fixed.' });
  fs.writeFileSync(path.join(home, 'go'), '');
  // the pass that adopts the unknown session also read the hooked one's transcript, since the hook gave it no process
  const sessions = await until(async () => { const s = (await snapshot(base)).sessions; return s.some(x => x.id === unknown) && s; }, 'adoption to run');
  assert.deepStrictEqual(sessions.map(s => [s.id, s.state]), [[id, 'waiting'], [unknown, 'waiting']]);
});

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
  assert.deepStrictEqual({ pids: s.pids, state: s.state }, { pids: [proc.pid], state: 'waiting' });
});

// Claude Code's sessions/<pid>.json says whether a running session is busy or idle, and that wins over the transcript;
// without a status there (older versions, or one it doesn't know), the transcript's last turn decides.
// One session in two processes, one idle and one with a status Claude Code added later: the unknown one says nothing, so
// Claude Code says idle, the way bySession merges the same mix. A compaction's check then lands it.
test('check() reads an idle process beside one with an unrecognised status as idle', async t => {
  const id = UUID(5), file = `.claude/projects/-work/${id}.jsonl`, other = process.ppid;
  const status = (pid, st) => ({ [`.claude/sessions/${pid}.json`]: JSON.stringify({ pid, sessionId: id, cwd: '/work', status: st }) });
  let home;
  const base = await serve(t, { [file]: jsonl([user('Fix it')]), ...status(process.pid, 'idle'), ...status(other, 'something-new') }, h => home = h);
  const hook = (pid, ev) => fetch(base + '/event', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-claude-pid': String(pid) },
    body: JSON.stringify({ session_id: id, cwd: '/work', transcript_path: path.join(home, file), ...ev }) });
  await hook(process.pid, { hook_event_name: 'UserPromptSubmit', prompt: 'go' });
  await hook(other, { hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: {} });
  await hook(process.pid, { hook_event_name: 'SessionStart', source: 'compact' });
  const s = (await snapshot(base)).sessions.find(x => x.id === id);
  assert.deepStrictEqual({ pids: s.pids.slice().sort(), state: s.state }, { pids: [process.pid, other].sort(), state: 'idle' });
});

test('a live session seeds from Claude Code\'s own status when it gives one, and from its transcript when not', async t => {
  const midTurn = [user('Fix it')], finished = [user('Fix it'), answer('Fixed.'), turnEnd];
  // idle mid-turn: no finished turn to wait on, so it's at the prompt (as check() reads Claude Code's idle)
  // with a fresh unfinished agent transcript (the last true): Claude Code idle means nothing is pending, so it doesn't wait on it
  const cases = [['idle', midTurn, 'idle'], ['idle', finished, 'waiting'], ['busy', finished, 'working'], [undefined, midTurn, 'working'], ['something-new', midTurn, 'working'],
    ['idle', finished, 'waiting', true], [undefined, finished, 'paused', true]];
  const procs = cases.map(() => spawn('sleep', ['60']));
  t.after(() => procs.forEach(p => p.kill()));
  const file = i => `.claude/projects/-work/${UUID(i)}.jsonl`;
  const base = await serve(t, Object.assign({ 'no-bin/ps': `#!/bin/sh\n${procs.map(p => `echo "${p.pid} claude"`).join('\n')}\n` },
    ...cases.map(([status, lines, , agent], i) => ({
      [file(i)]: jsonl(lines),
      ...agent ? { [`.claude/projects/-work/${UUID(i)}/subagents/agent-a1.jsonl`]: jsonl([user('Audit it')]) } : {},
      [`.claude/sessions/${procs[i].pid}.json`]: JSON.stringify({ pid: procs[i].pid, sessionId: UUID(i), cwd: '/work', ...(status ? { status } : {}) }),
    }))), home => {
    fs.chmodSync(path.join(home, 'no-bin/ps'), 0o755);
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000); // too old for the recent-transcript pass: only the live one finds them
    cases.forEach((_, i) => fs.utimesSync(path.join(home, file(i)), dayAgo, dayAgo));
  });
  const sessions = await until(async () => { const s = (await snapshot(base)).sessions; return s.length === cases.length && s; }, 'the live sessions to be seeded');
  assert.deepStrictEqual(cases.map((_, i) => sessions.find(s => s.id === UUID(i)).state), cases.map(c => c[2]));
});

// The Claude app's Code tab runs `claude` from inside its own folder, so ps names it by a full path with spaces in it.
// It's as live as a terminal one: a preview, which gets no hooks, has only seeding and adoption to find it by.
test('a quiet Claude app session is seeded with its process, though ps names it by a path with spaces', async t => {
  const proc = spawn('sleep', ['60']), id = UUID(7), file = `.claude/projects/-work/${id}.jsonl`;
  t.after(() => proc.kill());
  const base = await serve(t, {
    [file]: jsonl([user('Fix it'), answer('Fixed. **You:** try it'), turnEnd]),
    [`.claude/sessions/${proc.pid}.json`]: JSON.stringify({ pid: proc.pid, sessionId: id, cwd: '/work', entrypoint: 'claude-desktop' }),
    'no-bin/ps': `#!/bin/sh\necho "${proc.pid} /Users/me/Library/Application Support/Claude/claude-code/2.1.299/x/claude.app/Contents/MacOS/claude"\n`,
  }, home => {
    fs.chmodSync(path.join(home, 'no-bin/ps'), 0o755);
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
    fs.utimesSync(path.join(home, file), dayAgo, dayAgo);
  });
  const s = await until(async () => (await snapshot(base)).sessions.find(x => x.id === id), 'the Claude app session to be seeded');
  assert.deepStrictEqual({ pids: s.pids, state: s.state }, { pids: [proc.pid], state: 'waiting' });
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
  assert.deepStrictEqual({ pids: s.pids, state: s.state }, { pids: [proc.pid], state: 'waiting' });
});

// One session, two processes: Dace's c0223694 ran in the Claude app (pid 58104, status idle) and in a terminal `claude
// --resume` (pid 84025, busy) at once. test/fixtures/two-procs.json holds those two real status files; sleeping children
// stand in for the processes, and a fake ps lists whichever pids are in $HOME/pids. Lantern kept one pid per session:
// seeding took the first in ps order (the app's, idle, so it showed waiting while the terminal worked), adoption re-read
// the 85 MB transcript every minute for the other pid only to throw it away, and quitting the app dropped a session
// still running in iTerm.
const TWO_PROCS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/two-procs.json'), 'utf8'));
async function twoProcs(t, listed = true, adopt = 0.2) {
  const [app, term] = TWO_PROCS.map(() => spawn('sleep', ['60']));
  t.after(() => { app.kill(); term.kill(); });
  const id = TWO_PROCS[0].sessionId, file = `.claude/projects/-Users-user/${id}.jsonl`;
  const ps = procs => procs.map(p => `${p.pid} ${p === app ? '/Applications/Claude.app/Contents/MacOS/claude' : 'claude'}\n`).join('');
  let home;
  const base = await serve(t, {
    [file]: jsonl([user('Fix it'), answer('Fixed. **You:** try it')]), // the transcript alone would say waiting
    ...Object.fromEntries([app, term].map((p, i) => [`.claude/sessions/${p.pid}.json`, JSON.stringify({ ...TWO_PROCS[i], pid: p.pid })])),
    'no-bin/ps': '#!/bin/sh\n[ -f "$HOME/pids" ] && while read -r line; do echo "$line"; done < "$HOME/pids"\n', // builtins only: PATH is empty
    pids: listed ? ps([app, term]) : '',
  }, h => {
    home = h;
    fs.chmodSync(path.join(h, 'no-bin/ps'), 0o755);
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000); // too old for the recent-transcript pass: only its processes find it
    fs.utimesSync(path.join(h, file), dayAgo, dayAgo);
  }, { LANTERN_SWEEP_SECONDS: '0.1', LANTERN_ADOPT_SECONDS: String(adopt) });
  const session = async () => (await snapshot(base)).sessions.find(s => s.id === id);
  const list = procs => fs.writeFileSync(path.join(home, 'pids'), ps(procs));
  // a process ending: gone from ps, then reaped (so kill(pid, 0) fails)
  const end = async (proc, left) => { list(left); const gone = new Promise(r => proc.once('exit', r)); proc.kill(); await gone; };
  return { base, home, id, file, app, term, session, list, end };
}

test('a session running in the Claude app and a terminal at once seeds busy, with both processes, and stays until both end', async t => {
  const { app, term, session, end } = await twoProcs(t, true, 600); // no adoption pass to bring a dropped session back
  const s = await until(session, 'the session to be seeded');
  assert.deepStrictEqual({ state: s.state, pids: s.pids }, { state: 'working', pids: [app.pid, term.pid] });
  await end(app, [term]); // quitting the app: the terminal still runs it
  await until(async () => (await session())?.pids?.join() === String(term.pid), 'the app\'s process to drop out');
  assert.strictEqual((await session()).state, 'working');
  await end(term, []);
  await until(async () => !(await session()), 'the session to end with its last process');
});

test('adoption adds a known session\'s other process to it instead of re-reading its transcript', async t => {
  const { base, home, id, file, app, term, session, list, end } = await twoProcs(t, false); // ps lists nothing at first
  await fetch(base + '/event', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-claude-pid': String(term.pid) },
    body: JSON.stringify({ session_id: id, hook_event_name: 'UserPromptSubmit', cwd: '/Users/user', transcript_path: path.join(home, file), prompt: 'go' }) });
  list([app, term]);
  await until(async () => (await session()).pids.join() === `${app.pid},${term.pid}`, 'adoption to add the app\'s process');
  // a compaction's check reads every process: the app's says idle, but the terminal's busy one is still working
  await fetch(base + '/event', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-claude-pid': String(term.pid) },
    body: JSON.stringify({ session_id: id, hook_event_name: 'SessionStart', source: 'compact', cwd: '/Users/user', transcript_path: path.join(home, file) }) });
  assert.strictEqual((await session()).state, 'working');
  await end(term, [app]); // the terminal that sent the hooks closes; the app still runs it
  await wait(500); // five sweeps
  assert.deepStrictEqual((await session())?.pids, [app.pid]);
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

// Snoozed for good, a wait is sleeping: it logs a 'sleeping' span, not a 'snoozed' one, and waking it ends the span
// while the wait goes on.
test('stats: a wait snoozed for good is logged as a sleeping span, which waking ends', async t => {
  let home;
  const base = await serve(t, {}, h => home = h);
  const spans = () => JSON.parse(execFileSync('sqlite3', ['-json', path.join(home, 'data/stats.sqlite'),
    "SELECT kind, ended FROM spans WHERE session = 's1' AND kind IN ('waiting', 'snoozed', 'sleeping') ORDER BY rowid"], { encoding: 'utf8' }) || '[]');
  const turn = name => post(base, '/event', { session_id: 's1', hook_event_name: name, cwd: '/work/s1', last_assistant_message: 'Done.' });
  await turn('UserPromptSubmit');
  await turn('Stop');
  await until(() => spans().some(s => s.kind === 'waiting'), 'the wait to be logged');
  await post(base, '/snooze', { id: 's1', snoozed: 'always' });
  await until(() => spans().some(s => s.kind === 'sleeping'), 'a sleeping span');
  await post(base, '/snooze', { id: 's1', snoozed: false });
  const done = await until(() => { const all = spans(); return all.find(s => s.kind === 'sleeping').ended && all; }, 'waking to end the sleeping span');
  assert.deepStrictEqual(done.map(s => [s.kind, !!s.ended]), [['waiting', false], ['sleeping', true]]);
});

// The stale switch used to be saved as "graveyard"; a settings.json from then must still turn the stale PRs off.
test('an old "graveyard" setting is read as "stale"', async t => {
  const base = await serve(t, { 'data/settings.json': '{"graveyard": false}' });
  const { settings } = await snapshot(base);
  assert.strictEqual(settings.stale, false);
  assert.strictEqual('graveyard' in settings, false);
});

const sql = (db, q) => JSON.parse(execFileSync('sqlite3', ['-json', db, q], { encoding: 'utf8' }) || '[]');

// A restart: the log already has three PRs on the stale list, and the restarted lantern sees a session whose branch owns
// one of them, which takes it off the stale list though nobody touched the PR. Only the one someone did touch (updated
// today) was revived. A stand-in gh answers the PR query.
// PRs on o/r, in GitHub's form, and a stand-in gh that answers the PR query with `mine` as my open PRs, next to a git repo
// on branch feat whose origin is o/r: a session working there is one the refresh looks at.
const prUrl = n => `https://github.com/o/r/pull/${n}`, iso = t => new Date(t).toISOString().replace(/\.\d+Z$/, 'Z'); // GitHub's form, no milliseconds
const prNode = (n, updatedAt, headRefName = `b${n}`) => ({ url: prUrl(n), number: n, title: `PR ${n}`, state: 'OPEN', isDraft: true, updatedAt, headRefName, repository: { name: 'r', nameWithOwner: 'o/r' } });
// With `held`, gh answers one query for each call to `release()`, so a test decides when each refresh lands. A query
// still held when the test files are cleaned up gives up, so a test that fails doesn't leave gh waiting.
function ghRepo(mine, held = false) {
  const dir = fs.mkdtempSync(path.join(tmp, 'gh-')), repo = path.join(dir, 'repo'), gh = path.join(dir, 'gh'), go = path.join(dir, 'go');
  fs.writeFileSync(path.join(dir, 'prs.json'), JSON.stringify({ data: { reviews: { nodes: [] }, closed: { nodes: [] }, mine: { nodes: mine } } }));
  if (!held) fs.writeFileSync(go, '');
  fs.writeFileSync(gh, `#!/bin/sh\nwhile [ ! -e '${go}' ] && [ -d '${dir}' ]; do /bin/sleep 0.05; done\n${held ? `/bin/rm '${go}'\n` : ''}exec /bin/cat '${path.join(dir, 'prs.json')}'\n`, { mode: 0o755 });
  fs.mkdirSync(repo);
  for (const args of [['init', '-q', '-b', 'feat'], ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'x'], ['remote', 'add', 'origin', 'https://github.com/o/r.git']]) execFileSync('git', ['-C', repo, ...args]);
  return { gh, repo, release: () => fs.writeFileSync(go, '') };
}
// The log line a refresh writes when a session takes on a PR.
const appeared = (session, n) => `INSERT INTO events (time, kind, session, data) VALUES (${Date.now() - 3600000}, 'pr', '${session}', '{"url":"${prUrl(n)}","change":"appeared","need":"draft"}');`;
const prChanges = db => sql(db, "SELECT session, json_extract(data, '$.url') AS url, json_extract(data, '$.change') AS change FROM events WHERE kind = 'pr' ORDER BY rowid");

test('stats: a session owning a stale PR again after a restart isn\'t a revival, someone touching it is', async t => {
  const url = prUrl, node = prNode, old = iso(Date.now() - 30 * 86400000);
  // 1 is owned by the session's branch and still quiet, 2 stays stale, 3 was touched today
  const { gh, repo } = ghRepo([node(1, old, 'feat'), node(2, old), node(3, iso(Date.now()))]);
  const entered = [1, 2, 3].map(n => `INSERT INTO events (time, kind, data) VALUES (${Date.now() - 86400000}, 'stale', '{"url":"${url(n)}","change":"entered"}');`).join('');
  let home = '';
  const base = await serve(t, { 'data/stats.sqlite': statsLog([['server', null, Date.now() - 2 * 86400000, Date.now() - 3600000]], entered) }, h => home = h, { LANTERN_GH: gh });
  await post(base, '/event', { session_id: 's1', hook_event_name: 'UserPromptSubmit', cwd: repo, prompt: 'go' });
  await post(base, '/settings', { github: true });
  const db = path.join(home, 'data/stats.sqlite'), left = () => sql(db, "SELECT json_extract(data, '$.url') AS url, json_extract(data, '$.how') AS how FROM events WHERE kind = 'stale' AND json_extract(data, '$.change') = 'left'");
  await until(() => left().length, 'the touched PR to leave the stale list'); // the refresh reached the log
  assert.ok(sql(db, "SELECT 1 FROM events WHERE kind = 'pr' AND json_extract(data, '$.change') = 'appeared'").length, 'the session owned PR 1');
  assert.deepStrictEqual(left(), [{ url: url(3), how: 'revived' }]);
  assert.deepStrictEqual(sql(db, "SELECT count(*) AS n FROM events WHERE kind = 'stale' AND json_extract(data, '$.change') = 'entered'"), [{ n: 3 }], 'nothing entered again');
});

// A restart where the session's hooks reach the lantern before seeding does: the session is made from a hook event, so it
// reads the PRs it created back from its transcript as seeding would, and keeps owning the one it made. Before, it owned
// none of them until the next restart, logging each as a stray and then as appeared again hours later.
test('stats: a session the hooks bring back still owns the PRs it created', async t => {
  const id = UUID(8), file = `.claude/projects/-work-8/${id}.jsonl`, { gh, repo } = ghRepo([prNode(1, iso(Date.now()))]); // its branch has no PR
  const made = [{ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'gh pr create --draft --fill' } }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: prUrl(1) + '\n' }] } }];
  let home = '';
  const base = await serve(t, { 'data/stats.sqlite': statsLog([['server', null, Date.now() - 2 * 3600000, Date.now() - 60000]], appeared(id, 1)), [file]: jsonl([user('Fix it'), ...made]) },
    h => { // too old for seeding to find, so the hook event is what brings it in
      home = h;
      const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
      fs.utimesSync(path.join(h, file), dayAgo, dayAgo);
    }, { LANTERN_GH: gh });
  await post(base, '/event', { session_id: id, hook_event_name: 'UserPromptSubmit', cwd: repo, transcript_path: path.join(home, file), prompt: 'go' });
  await post(base, '/settings', { github: true });
  const s = await until(async () => (await snapshot(base)).sessions.find(x => x.id === id && x.github), 'a refresh to look at the session');
  assert.deepStrictEqual(s.github.map(p => p.url), [prUrl(1)]);
  assert.deepStrictEqual(prChanges(path.join(home, 'data/stats.sqlite')), [{ session: id, url: prUrl(1), change: 'appeared' }], 'no stray, no second appeared');
});

// The race that test can't reach: a refresh that goes out while the joining session is still reading its PRs back, and
// lands after. Refreshes leave a session out until its read is done; otherwise that refresh gives it no PRs and logs the
// one it made as a stray. A long transcript full of `gh pr create` mentions (each one parsed) keeps the read going while
// the refresh goes out, and gh holds each refresh's answer until the test lets it go. A second session in another checkout,
// owning nothing, shows when the refresh has landed.
test('stats: a refresh that goes out while a joining session reads its PRs back leaves its PRs alone', async t => {
  const id = UUID(8), file = `.claude/projects/-work-8/${id}.jsonl`, { gh, repo, release } = ghRepo([prNode(1, iso(Date.now()))], true);
  const other = fs.mkdtempSync(path.join(tmp, 'other-'));
  for (const args of [['init', '-q', '-b', 'quiet'], ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'x'], ['remote', 'add', 'origin', 'https://github.com/o/r.git']]) execFileSync('git', ['-C', other, ...args]);
  const made = [{ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'gh pr create --draft --fill' } }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: prUrl(1) + '\n' }] } }];
  const talk = JSON.stringify(answer('Then gh pr create opens it.')) + '\n';
  let home = '';
  const base = await serve(t, { 'data/stats.sqlite': statsLog([['server', null, Date.now() - 2 * 3600000, Date.now() - 60000]], appeared(id, 1)),
    [file]: talk.repeat(200000) + jsonl([user('Fix it'), ...made]) }, h => {
    home = h;
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
    fs.utimesSync(path.join(h, file), dayAgo, dayAgo);
  }, { LANTERN_GH: gh });
  await post(base, '/event', { session_id: 's2', hook_event_name: 'UserPromptSubmit', cwd: other, prompt: 'go' });
  await post(base, '/event', { session_id: id, hook_event_name: 'UserPromptSubmit', cwd: repo, transcript_path: path.join(home, file), prompt: 'go' });
  await post(base, '/settings', { github: true });
  await until(async () => (await snapshot(base)).sessions.find(x => x.id === id)?.created?.length, 'the PR read to finish', 60000);
  release();
  const landed = await until(async () => { const s = (await snapshot(base)).sessions; return s.find(x => x.id === 's2')?.github && s; }, 'the refresh to land');
  assert.strictEqual(landed.find(x => x.id === id).github, undefined, 'the refresh went out while the PR read was still going, so it left the session out');
  release(); // the refresh the finished read asked for
  const s = await until(async () => (await snapshot(base)).sessions.find(x => x.id === id && x.github?.length), 'a refresh to look at the session');
  assert.deepStrictEqual(s.github.map(p => p.url), [prUrl(1)]);
  assert.deepStrictEqual(prChanges(path.join(home, 'data/stats.sqlite')), [{ session: id, url: prUrl(1), change: 'appeared' }], 'no stray, no second appeared');
});

// A session that joins while a refresh is out (adopted, say) isn't in that refresh's answer. Until one looks at it, it
// keeps the PRs it owned rather than dropping them as strays. Here s2 works outside any git repo, so no refresh ever looks
// at it, while s1 in the repo makes the refreshes run.
test('stats: a session no refresh has looked at keeps the PRs it owned', async t => {
  const { gh, repo } = ghRepo([prNode(1, iso(Date.now()))]);
  let home = '';
  const base = await serve(t, { 'data/stats.sqlite': statsLog([['server', null, Date.now() - 2 * 3600000, Date.now() - 60000]], appeared('s2', 1)) }, h => home = h, { LANTERN_GH: gh });
  await post(base, '/event', { session_id: 's2', hook_event_name: 'UserPromptSubmit', cwd: path.join(home, 'elsewhere'), prompt: 'go' });
  await post(base, '/event', { session_id: 's1', hook_event_name: 'UserPromptSubmit', cwd: repo, prompt: 'go' });
  await post(base, '/settings', { github: true });
  await until(async () => (await snapshot(base)).sessions.find(x => x.id === 's1' && x.github), 'a refresh to reach the log'); // the log is written as the answer lands
  assert.deepStrictEqual(prChanges(path.join(home, 'data/stats.sqlite')), [{ session: 's2', url: prUrl(1), change: 'appeared' }], 'no stray');
});

// A firefly's exit says how its PR went: one the session owned that is now merged or closed stays in its list with that
// need, the need it had before, and when the change was seen, while one that just vanished is dropped. A PR that's new
// carries when it was first seen, and one whose need changes says what it was and when it changed. The stats log still has one merged and one closed, with no need change to either.
test('a PR that leaves the list merged or closed stays a while saying so', async t => {
  const { gh, repo } = ghRepo([prNode(1, iso(Date.now()), 'feat'), prNode(2, iso(Date.now())), prNode(3, iso(Date.now())), prNode(4, iso(Date.now()))]);
  const id = UUID(9), file = `.claude/projects/-work-9/${id}.jsonl`, made = n => [
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: `toolu_${n}`, name: 'Bash', input: { command: 'gh pr create --fill' } }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `toolu_${n}`, content: prUrl(n) + '\n' }] } }];
  let home = '';
  const base = await serve(t, { [file]: jsonl([user('Fix it'), ...made(2), ...made(3), ...made(4)]) }, h => home = h, { LANTERN_GH: gh });
  const before = Date.now();
  await post(base, '/event', { session_id: id, hook_event_name: 'UserPromptSubmit', cwd: repo, transcript_path: path.join(home, file), prompt: 'go' });
  await post(base, '/settings', { github: true });
  const first = await until(async () => (await snapshot(base)).sessions.find(x => x.id === id && x.github?.length === 4), 'a refresh to find all four');
  for (const p of first.github) assert.ok(p.seen >= before && p.since === p.seen && p.was === undefined, `first seen now: ${JSON.stringify(p)}`);
  const at = Date.now();
  fs.writeFileSync(path.join(path.dirname(gh), 'prs.json'), JSON.stringify({ data: { reviews: { nodes: [] }, mine: { nodes: [{ ...prNode(3, iso(Date.now())), isDraft: false }] },
    closed: { nodes: [{ url: prUrl(1), state: 'MERGED' }, { url: prUrl(2), state: 'CLOSED' }] } } }));
  await post(base, '/settings', { github: true });
  const s = await until(async () => (await snapshot(base)).sessions.find(x => x.id === id && x.github?.length === 3), 'a refresh to see them go');
  const seen = new Set(first.github.map(p => p.seen));
  assert.deepStrictEqual(s.github.map(p => [p.url, p.need, p.was, seen.has(p.seen)]).sort(),
    [[prUrl(1), 'merged', 'draft', true], [prUrl(2), 'closed', 'draft', true], [prUrl(3), 'waiting', 'draft', true]], 'PR 4 just went');
  for (const p of s.github) assert.ok(p.since >= at, `the change is timed from when it was seen: ${p.since} vs ${at}`);
  const changes = prChanges(path.join(home, 'data/stats.sqlite')).map(c => [c.url, c.change]);
  assert.deepStrictEqual(changes.filter(([, c]) => c !== 'appeared').sort(), [[prUrl(1), 'merged'], [prUrl(2), 'closed'], [prUrl(3), 'need'], [prUrl(4), 'gone']]);
  // a third refresh with the same answer, inside the minute: both stay as they were (the title change marks the refresh as done)
  fs.writeFileSync(path.join(path.dirname(gh), 'prs.json'), JSON.stringify({ data: { reviews: { nodes: [] }, mine: { nodes: [{ ...prNode(3, iso(Date.now())), isDraft: false, title: 'PR 3 again' }] },
    closed: { nodes: [{ url: prUrl(1), state: 'MERGED' }, { url: prUrl(2), state: 'CLOSED' }] } } }));
  await post(base, '/settings', { github: true });
  const again = await until(async () => (await snapshot(base)).sessions.find(x => x.id === id && x.github?.some(p => p.title === 'PR 3 again')), 'a third refresh');
  assert.deepStrictEqual(again.github.map(p => [p.url, p.need, p.since]).sort(), s.github.map(p => [p.url, p.need, p.since]).sort(), 'merged and closed are kept, with the same since');
  assert.deepStrictEqual(prChanges(path.join(home, 'data/stats.sqlite')).map(c => [c.url, c.change]).filter(([, c]) => c !== 'appeared').sort(),
    changes.filter(([, c]) => c !== 'appeared').sort(), 'and the log still has one merged and one closed');
});

// Feedback is waiting on a PR when, after the newest commit, the last non-bot review or comment is from someone but its author and isn't an approval. It beats ready; the author's reply clears it until the reviewer speaks again.
test("a reviewer's last word since the newest commit makes feedback; a bot, the author's reply, an older review or an approval do not", async t => {
  const hour = 3600000, commit = Date.now() - 4 * hour, at = n => iso(commit + n * hour);
  const node = (n, reviews, extra = {}, comments = []) => ({ ...prNode(n, iso(Date.now())), isDraft: false, author: { login: 'me' }, ...extra,
    reviews: { nodes: reviews.map(([who, state, when, type = 'User']) => ({ author: { __typename: type, login: who }, state, submittedAt: when })) },
    comments: { nodes: comments.map(([who, when, type = 'User']) => ({ author: { __typename: type, login: who }, createdAt: when })) },
    commits: { nodes: [{ commit: { committedDate: iso(commit), statusCheckRollup: null } }] } });
  const cases = [
    ['feedback', node(1, [['you', 'COMMENTED', at(1)]])],
    ['feedback', node(2, [['you', 'COMMENTED', at(1)]], { reviewDecision: 'APPROVED' })], // beats ready
    ['feedback', node(3, [['you', 'APPROVED', at(1)], ['you', 'COMMENTED', at(2)]])],
    ['waiting', node(4, [['you', 'COMMENTED', at(1)], ['me', 'COMMENTED', at(2)]])], // the author's reply clears it
    ['feedback', node(16, [['you', 'COMMENTED', at(1)], ['me', 'COMMENTED', at(2)], ['you', 'COMMENTED', at(3)]])], // and the reviewer's next word brings it back
    ['waiting', node(17, [['you', 'COMMENTED', at(1)]], {}, [['me', at(2)]])], // a page comment from the author clears it too
    ['waiting', node(5, [['me', 'COMMENTED', at(1)]])],
    ['waiting', node(6, [['coderabbitai', 'COMMENTED', at(1), 'Bot']])],
    ['waiting', node(7, [['you', 'COMMENTED', at(-1)]])],
    ['waiting', node(8, [['you', 'PENDING', null]])],
    ['waiting', node(9, [['you', 'COMMENTED', at(1)], ['you', 'APPROVED', at(2)]])], // an approval clears it
    ['feedback', node(10, [], {}, [['you', at(1)]])], // a conversation comment counts
    ['waiting', node(11, [], {}, [['coderabbitai', at(1), 'Bot']])],
    ['waiting', node(12, [], {}, [['me', at(1)]])],
    ['waiting', node(13, [['you', 'APPROVED', at(2)]], {}, [['you', at(1)]])], // a comment, then an approval
    ['waiting', node(14, [], {}, [['you', at(-1)]])],
    ['feedback', node(15, [['you', 'APPROVED', at(1)]], {}, [['you', at(2)]])], // a comment after the approval
  ];
  const { gh, repo } = ghRepo(cases.map(([, c], i) => ({ ...c, url: prUrl(i + 1), number: i + 1 }))); // numbered in order
  const id = UUID(9), file = `.claude/projects/-work-9/${id}.jsonl`, made = n => [
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: `toolu_${n}`, name: 'Bash', input: { command: 'gh pr create --fill' } }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `toolu_${n}`, content: prUrl(n) + '\n' }] } }];
  let home = '';
  const base = await serve(t, { [file]: jsonl([user('Fix it'), ...cases.flatMap((_, i) => made(i + 1))]) }, h => home = h, { LANTERN_GH: gh });
  await post(base, '/event', { session_id: id, hook_event_name: 'UserPromptSubmit', cwd: repo, transcript_path: path.join(home, file), prompt: 'go' });
  await post(base, '/settings', { github: true });
  const s = await until(async () => (await snapshot(base)).sessions.find(x => x.id === id && x.github?.length === cases.length), 'a refresh to find them all');
  const need = Object.fromEntries(s.github.map(p => [p.url, p.need]));
  assert.deepStrictEqual(cases.map((_, i) => need[prUrl(i + 1)]), cases.map(c => c[0]));
});

// GitHub sometimes answers the query with exit 0 and every list empty. That must not wipe the PRs: the last good answer holds
// until it ages out (LANTERN_GH_KEEP_SECONDS), and then a really empty account shows empty.
test('an empty GitHub answer after a good one keeps the PRs until the kept answer ages out', async t => {
  const dir = fs.mkdtempSync(path.join(tmp, 'gh-')), gh = path.join(dir, 'gh');
  const answer = (mine, closed) => fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ data: { reviews: { nodes: [] }, mine: { nodes: mine }, closed: { nodes: closed } } }));
  answer([prNode(31, iso(Date.now()))], [{ url: prUrl(90), state: 'MERGED' }]);
  fs.writeFileSync(gh, `#!/bin/sh\nexec /bin/cat '${dir}/a.json'\n`, { mode: 0o755 });
  const id = UUID(9);
  const files = { [`.claude/projects/-projects/${id}.jsonl`]: jsonl([user('Fix it'),
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'gh pr create --fill' } }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: prUrl(31) + '\n' }] } }]) };
  let home = '';
  const base = await serve(t, files, h => { home = h; fs.mkdirSync(path.join(h, 'projects/repo'), { recursive: true }); execFileSync('git', ['-C', path.join(h, 'projects/repo'), 'init', '-q', '-b', 'feat']); },
    { LANTERN_GH: gh, LANTERN_GH_KEEP_SECONDS: '2' });
  await post(base, '/event', { session_id: id, hook_event_name: 'UserPromptSubmit', cwd: path.join(home, 'projects/repo'), transcript_path: path.join(home, `.claude/projects/-projects/${id}.jsonl`), prompt: 'go' });
  await post(base, '/settings', { github: true });
  const prs = async () => (await snapshot(base)).sessions.find(x => x.id === id)?.github;
  await until(async () => (await prs())?.length === 1, 'the PR to show');
  answer([], []); // the blip
  await post(base, '/settings', { github: true });
  await wait(800);
  assert.strictEqual((await prs())?.length, 1, 'an empty answer does not wipe the PR');
  await wait(1500); // the kept answer is now older than 2s: the account really is empty
  await post(base, '/settings', { github: true });
  await until(async () => (await prs())?.length === 0, 'a really empty account to show empty');
  answer([prNode(31, iso(Date.now()))], []); // open PRs but no closed ones is a real answer, not a blip
  await post(base, '/settings', { github: true });
  await until(async () => (await prs())?.length === 1, 'open PRs without closed ones to show');
});

// One GitHub query failing (an expired token, a blip) must not freeze the others or make its own PRs vanish and fly back in:
// it keeps what it found last time while everything else refreshes. Two top folders under home are two queries.
test('a failing GitHub query keeps its own PRs while another folder\'s change still lands', async t => {
  const dir = fs.mkdtempSync(path.join(tmp, 'gh-')), gh = path.join(dir, 'gh');
  const answer = (file, n, isDraft, title = `PR ${n}`) => fs.writeFileSync(path.join(dir, file), JSON.stringify({ data: { reviews: { nodes: [] }, closed: { nodes: [] }, mine: { nodes: [{ ...prNode(n, iso(Date.now())), isDraft, title }] } } }));
  answer('work.json', 11, true); answer('projects.json', 21, true);
  fs.writeFileSync(gh, `#!/bin/sh\ncase "$(pwd)" in */work/*) f='${dir}/work';; *) f='${dir}/projects';; esac\n[ -f "$f.slow" ] && /bin/sleep 1.5\n[ -f "$f.fail" ] && exit 1\nexec /bin/cat "$f.json"\n`, { mode: 0o755 });
  const ids = { work: UUID(7), projects: UUID(8) }, pr = { work: 11, projects: 21 };
  const files = Object.fromEntries(Object.entries(ids).map(([name, id]) => [`.claude/projects/-${name}/${id}.jsonl`, jsonl([user('Fix it'),
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'gh pr create --fill' } }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: prUrl(pr[name]) + '\n' }] } }])]));
  let home = '';
  const base = await serve(t, files, h => { home = h; for (const dir of ['work/aaa', 'work/repo', 'projects/repo']) { // aaa: another session in the work folder, that goes
    fs.mkdirSync(path.join(h, dir), { recursive: true });
    execFileSync('git', ['-C', path.join(h, dir), 'init', '-q', '-b', 'feat']);
  } }, { LANTERN_GH: gh, LANTERN_GH_KEEP_SECONDS: '4' });
  await post(base, '/event', { session_id: UUID(6), hook_event_name: 'UserPromptSubmit', cwd: path.join(home, 'work/aaa'), prompt: 'go' });
  for (const [name, id] of Object.entries(ids)) await post(base, '/event', { session_id: id, hook_event_name: 'UserPromptSubmit', cwd: path.join(home, name, 'repo'), transcript_path: path.join(home, `.claude/projects/-${name}/${id}.jsonl`), prompt: 'go' });
  await post(base, '/settings', { github: true });
  const prs = async name => (await snapshot(base)).sessions.find(x => x.id === ids[name])?.github;
  const first = await until(async () => { const w = await prs('work'), p = await prs('projects'); return w?.length === 1 && p?.length === 1 && { work: w, projects: p }; }, 'both folders to be asked');
  await post(base, '/event', { session_id: UUID(6), hook_event_name: 'SessionEnd' }); // the work query was asked from aaa so far, and now from repo: the same query
  fs.writeFileSync(path.join(dir, 'work.fail'), ''); // the work query fails from now on, and the projects one reports its PR as ready for review
  answer('projects.json', 21, false);
  await wait(1200); // a kept answer may be up to 4s old (LANTERN_GH_KEEP_SECONDS), so this one is
  const refresh = async title => { // a refresh, done once the projects PR carries this title
    answer('projects.json', 21, false, title);
    await post(base, '/settings', { github: true });
    return until(async () => { const p = await prs('projects'); return p?.[0]?.title === title && p; }, `a refresh to show ${title}`);
  };
  const projects = await refresh('PR 21 v1');
  assert.strictEqual(projects[0].was, 'draft');
  assert.deepStrictEqual(await prs('work'), first.work, 'the failed query\'s PR is kept just as it was: not gone, not new');
  // the query comes back
  const comesBack = async () => {
    fs.unlinkSync(path.join(dir, 'work.fail'));
    await post(base, '/settings', { github: true });
    const w = await until(async () => { const w = await prs('work'); return w?.length === 1 && w; }, 'work\'s PR to come back');
    fs.writeFileSync(path.join(dir, 'work.fail'), '');
    return w;
  };
  await comesBack();
  // GitHub turned off and on again while the query fails, and while a refresh that began before is still running (a slow
  // query): that refresh must not put its old answer back, so there's nothing to keep and work's PR is gone
  fs.writeFileSync(path.join(dir, 'work.slow'), '');
  await post(base, '/settings', { github: true }); // a refresh starts, and takes a while
  await wait(300);
  fs.unlinkSync(path.join(dir, 'work.slow')); // (the one running keeps its pause)
  await post(base, '/settings', { github: false });
  await until(async () => (await prs('work')) === undefined, 'GitHub off to clear the lists');
  await post(base, '/settings', { github: true });
  await until(async () => (await prs('work'))?.length === 0, 'work\'s PR to be gone after off and on');
  // the query comes back, then fails again: kept for 4s from its last good answer, not from the last failure
  const back = await comesBack();
  await wait(1000);
  await refresh('PR 21 v2');
  assert.deepStrictEqual(await prs('work'), back, 'about 1s on, still kept (it keeps 4s)');
  await wait(3200);
  await refresh('PR 21 v3');
  assert.deepStrictEqual(await prs('work'), [], 'over 4s on, no longer kept, though it was kept 3s ago');
});

// Séance and Ghostbuster count PRs, not events: one PR revived five times this week is one revival, and one PR leaving the
// stale list merged five times yesterday is one. Five different PRs closed today do make a Ghostbuster.
test('stats: Séance and Ghostbuster count each PR once', async t => {
  const today = Date.now() - 60000, yesterday = +yesterdayFrom(0) + 12 * 3600000;
  const left = (time, n, how) => `INSERT INTO events (time, kind, data) VALUES (${time}, 'stale', '{"url":"https://github.com/o/r/pull/${n}","change":"left","how":"${how}"}');`;
  const rows = [...Array(5)].map((_, i) => left(today, 1, 'revived') + left(today, 10 + i, 'closed') + left(yesterday, 2, 'merged')).join('');
  let home = '';
  await serve(t, { 'data/stats.sqlite': statsLog([['server', null, yesterday, today]], rows) }, h => home = h);
  const got = () => sql(path.join(home, 'data/stats.sqlite'), "SELECT id, day FROM achievements WHERE id IN ('seance', 'ghostbuster') ORDER BY day");
  const ghost = await until(() => got().length && got(), 'today\'s Ghostbuster to be awarded'); // the award pass ran, and judged yesterday first
  const day = new Date(today), key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  assert.deepStrictEqual(ghost, [{ id: 'ghostbuster', day: key }]);
});

// The page gets the first word of the name on the Claude Code account (for the candle's pencil, src/scene/pencil.ts), the
// display name if it has one, else the full name. With no CLAUDE_CONFIG_DIR, Claude Code keeps the account in ~/.claude.json.
const account = oauthAccount => JSON.stringify({ oauthAccount });
test('the page gets the first name off the Claude Code account', async t => {
  for (const [names, name] of [[{ displayName: 'jerrett smith', fullName: 'Someone Else' }, 'jerrett'], [{ displayName: ' \n', fullName: 'Jerrett\tSmith' }, 'Jerrett']]) {
    const base = await serve(t, { '.claude.json': account(names) }, () => {}, { CLAUDE_CONFIG_DIR: undefined });
    assert.strictEqual((await snapshot(base)).name, name, JSON.stringify(names));
  }
});

// With CLAUDE_CONFIG_DIR set, Claude Code keeps .claude.json in that folder, and the one in HOME is someone else's.
test('the first name comes from the .claude.json in CLAUDE_CONFIG_DIR when that\'s set', async t => {
  const base = await serve(t, { '.claude/.claude.json': account({ displayName: 'Jerrett' }), '.claude.json': account({ displayName: 'Stale' }) });
  assert.strictEqual((await snapshot(base)).name, 'Jerrett');
});

// A .claude.json that doesn't parse falls back to the Mac's own name.
test('a malformed .claude.json gives the Mac\'s first name', async t => {
  const base = await serve(t, { '.claude/.claude.json': '{"oauthAccount": {"displayName": "Jerrett"' });
  const mac = execFileSync('id', ['-F'], { encoding: 'utf8' }).trim().split(/\s+/)[0];
  assert.ok(mac, 'this Mac user has a full name to fall back to');
  assert.strictEqual((await snapshot(base)).name, mac);
});

// npm run preview: hooks only reach the live app, so a preview follows the app's /events and shows its sessions as they
// change, with their subagents, instead of finding its own.
test('a preview shows the live app\'s sessions as they change', async t => {
  const live = await serve(t);
  const preview = await serve(t, {}, () => {}, { LANTERN_MIRROR: live + '/events' });
  const shows = async () => (await snapshot(preview)).sessions.map(s => `${s.id} ${s.state} ${s.subagents.map(a => a.id)}`);
  await post(live, '/event', { session_id: 's1', hook_event_name: 'UserPromptSubmit', cwd: '/w', prompt: 'go' });
  await post(live, '/event', agentTool);
  await until(async () => (await shows()).join() === 's1 working a1', 'the preview to show the live session and its agent');
  await post(live, '/event', { session_id: 's1', hook_event_name: 'Stop', cwd: '/w', last_assistant_message: 'Done.' });
  await until(async () => (await shows()).join() === 's1 waiting a1', 'the preview to follow its turn ending');
  await post(live, '/event', { session_id: 's1', hook_event_name: 'SessionEnd' });
  await until(async () => (await shows()).length === 0, 'the preview to drop the ended session');
});

// A preview's sessions are the app's, so snoozing, sleeping and waking in a preview happen in the app, and the preview
// shows them in the app's next list like anything else. (A server not following an app snoozes its own: the snooze replay.)
test('a preview snoozes, sleeps and wakes sessions in the app, and shows the app\'s word', async t => {
  const live = await serve(t);
  // a preview starts with a copy of the app's settings, here from a day s1 was asleep: the app's word wins over it
  const preview = await serve(t, { 'data/settings.json': JSON.stringify({ snoozedForGood: ['s1'] }) }, () => {}, { LANTERN_MIRROR: live + '/events' });
  const shows = async base => (await snapshot(base)).sessions.map(s => `${s.id} ${s.state}${s.snoozed ? ' snoozed' : ''}${s.forGood ? ' forGood' : ''}`).join();
  await post(live, '/event', { session_id: 's1', hook_event_name: 'Stop', cwd: '/w', last_assistant_message: 'Done.' });
  await until(async () => await shows(preview) === 's1 waiting', 'the preview to show the waiting session');
  for (const [snoozed, after, next] of [[true, 's1 waiting snoozed', 's2'], ['always', 's1 waiting snoozed forGood', 's3'], [false, 's1 waiting', 's4']]) {
    assert.strictEqual((await post(preview, '/snooze', { id: 's1', snoozed })).status, 204, `snoozed: ${snoozed}`);
    assert.strictEqual((await shows(live)).split(',')[0], after, `the app after snoozed: ${snoozed}`);
    await until(async () => (await shows(preview)).split(',')[0] === after, `the preview to show ${after}`);
    // the app's next list (another session's turn): that session in it proves the preview took it, and it still agrees
    await post(live, '/event', { session_id: next, hook_event_name: 'UserPromptSubmit', cwd: '/w', prompt: 'go' });
    await until(async () => (await shows(preview)).includes(next), 'the preview to take the app\'s next list');
    assert.strictEqual((await shows(preview)).split(',')[0], after, `the preview after the app's next list, snoozed: ${snoozed}`);
  }
});

// With the app not answering, a snooze fails rather than landing on a copy the app's next list would replace.
test('a snooze in a preview whose app isn\'t answering fails', async t => {
  const preview = await serve(t, {}, () => {}, { LANTERN_MIRROR: 'http://127.0.0.1:9/events' });
  assert.strictEqual((await post(preview, '/snooze', { id: 's1', snoozed: true })).status, 502);
});

// The app's next list would replace anything the preview seeded, but that can be a while, so it seeds none. Here the app
// never answers, and a server without the mirror seeds the same transcript, to show the seeding had time to happen.
test('a preview following the app seeds no sessions of its own', async t => {
  const files = { [`.claude/projects/-w/${UUID(2)}.jsonl`]: jsonl([user('Mine')]) };
  const [preview, control] = await Promise.all([serve(t, files, () => {}, { LANTERN_MIRROR: 'http://127.0.0.1:9/events' }), serve(t, files)]);
  await until(async () => (await snapshot(control)).sessions.length, 'the transcript to be seeded without the mirror');
  await wait(500);
  assert.deepStrictEqual((await snapshot(preview)).sessions, []);
});

// The app's stream carries other messages too (the PR lists, settings), each named by an event line; only the unnamed
// one is the sessions. And when the stream ends, the preview reconnects and takes the list the new stream starts with.
test('a preview takes only the sessions from the app\'s stream, and reconnects when it ends', async t => {
  let connections = 0;
  const app = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    if (++connections === 1) res.end('data: [{"id":"s1","state":"working"}]\n\nevent: reviews\ndata: [{"id":"pr","url":"https://github.com/o/r/pull/1"}]\n\n'); // the PR list last, so taking it would stick until the reconnect
    else res.write('data: [{"id":"s2","state":"waiting"}]\n\n'); // left open, as the app does
  });
  await new Promise(r => app.listen(0, '127.0.0.1', r));
  t.after(() => { app.closeAllConnections(); app.close(); });
  const preview = await serve(t, {}, () => {}, { LANTERN_MIRROR: `http://127.0.0.1:${/** @type {import('net').AddressInfo} */ (app.address()).port}/events` });
  const seen = new Set();
  await until(async () => {
    const ids = (await snapshot(preview)).sessions.map(s => s.id).join();
    seen.add(ids);
    return ids === 's2';
  }, 'the preview to show the second stream\'s sessions');
  assert.ok(connections >= 2, `the preview connected ${connections} time(s)`);
  assert.ok(![...seen].some(ids => ids.includes('pr')), `the PR list showed up as sessions: ${[...seen].join(' | ')}`);
});

// The card shows how long each PR has been open, from its createdAt, through gh (the token path asks the same query).
test('a session\'s PRs carry when each was opened', async t => {
  const opened = iso(Date.now() - 3 * 86400000), { gh, repo } = ghRepo([{ ...prNode(1, iso(Date.now()), 'feat'), createdAt: opened }]);
  // GitHub answers only what's asked: without createdAt in the query, the PR comes back without it
  const asked = path.join(path.dirname(gh), 'asked');
  fs.writeFileSync(asked, `#!/bin/sh\ncase "$*" in *createdAt*) exec '${gh}' ;; *) exec /usr/bin/sed 's/,"createdAt":"[^"]*"//' '${path.join(path.dirname(gh), 'prs.json')}' ;; esac\n`, { mode: 0o755 });
  const base = await serve(t, {}, () => {}, { LANTERN_GH: asked });
  await post(base, '/event', { session_id: 's1', hook_event_name: 'UserPromptSubmit', cwd: repo, prompt: 'go' });
  await post(base, '/settings', { github: true });
  const s = await until(async () => (await snapshot(base)).sessions.find(x => x.id === 's1' && x.github?.length), 'the session\'s PR');
  assert.deepStrictEqual(s.github.map(p => [p.url, p.createdAt]), [[prUrl(1), opened]]);
});
// A stand-in lantern-pr: an event stream the server subscribes to. `send` writes an event to every open stream. With `flap`,
// each stream ends as soon as it starts, before saying anything.
async function fakeLanternPR(t, flap = false) {
  const streams = new Set();
  let connections = 0;
  const server = http.createServer((req, res) => {
    connections++;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    if (flap) return res.end();
    res.write(': hello\n\n');
    streams.add(res);
    res.on('close', () => streams.delete(res));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.closeAllConnections(); server.close(); });
  let id = 0;
  return {
    url: `http://127.0.0.1:${/** @type {import('net').AddressInfo} */ (server.address()).port}/events`,
    send: (event, payload = {}) => { id++; for (const r of streams) r.write(`id: ${id}\ndata: ${JSON.stringify({ id, event, payload })}\n\n`); },
    connections: () => connections,
  };
}
// A server with GitHub on and one session owning a PR, whose stand-in gh counts its calls: one per refresh. Resolves once
// the first refresh has landed; `settled` waits out the others startup asks for (seeding asks for one too).
async function counted(t, extra = {}) {
  const { gh, repo } = ghRepo([prNode(1, iso(Date.now()), 'feat')]), log = path.join(path.dirname(gh), 'calls'), counting = path.join(path.dirname(gh), 'counting');
  fs.writeFileSync(counting, `#!/bin/sh\necho >> '${log}'\nexec '${gh}' "$@"\n`, { mode: 0o755 });
  const base = await serve(t, {}, () => {}, { LANTERN_GH: counting, ...extra });
  await post(base, '/event', { session_id: 's1', hook_event_name: 'UserPromptSubmit', cwd: repo, prompt: 'go' });
  await post(base, '/settings', { github: true });
  await until(async () => (await snapshot(base)).sessions.find(x => x.id === 's1' && x.github?.length), 'the first refresh');
  const calls = () => fs.existsSync(log) ? fs.readFileSync(log, 'utf8').length : 0;
  return { base, calls };
}
const settled = async calls => {
  for (let n = -1, tries = 0; n !== calls(); await wait(2000)) if (n = calls(), ++tries > 5) throw new Error('refreshes kept coming');
};
const lines = (t, re) => t.output().split('\n').filter(l => re.test(l));

test('a lantern-pr event about a PR refreshes GitHub within a couple of seconds, an issue\'s comment doesn\'t', async t => {
  const bus = await fakeLanternPR(t), { calls } = await counted(t, { LANTERN_PR_URL: bus.url });
  await until(() => lines(t, /^lantern-pr connected/).length, 'the server to subscribe');
  await settled(calls);
  const before = calls();
  bus.send('issue_comment', { issue: { number: 3 } });
  await wait(2500); // longer than the 1.5s a refresh waits for the rest of a burst
  assert.strictEqual(calls(), before, 'a comment on an issue changes nothing Lantern shows');
  bus.send('pull_request_review', { pull_request: { number: 1 } });
  await until(() => calls() > before, 'the event to refresh', 5000);
});

test('a burst of lantern-pr events is one refresh', async t => {
  const bus = await fakeLanternPR(t), { calls } = await counted(t, { LANTERN_PR_URL: bus.url });
  await until(() => lines(t, /^lantern-pr connected/).length, 'the server to subscribe');
  await settled(calls);
  const before = calls();
  for (let i = 0; i < 10; i++) bus.send('check_run');
  await until(() => calls() > before, 'the burst to refresh', 5000);
  await wait(2500);
  assert.strictEqual(calls(), before + 1);
});

// A lantern-pr that answers and hangs up at once (restarting, say) is no connection: each try waits longer than the last,
// none is logged as connected, and none brings a refresh.
test('a lantern-pr that keeps hanging up straight away is retried with backoff, quietly, with no refreshes', async t => {
  const bus = await fakeLanternPR(t, true), { calls } = await counted(t, { LANTERN_PR_URL: bus.url });
  await settled(calls);
  const before = calls(), tries = bus.connections();
  await wait(7000); // backing off from 1s, doubling, is at most 3 more tries in 7s; without it, about 7
  assert.ok(bus.connections() - tries <= 3, `${bus.connections() - tries} tries in 7s`);
  assert.strictEqual(calls(), before, 'no refreshes');
  assert.deepStrictEqual(lines(t, /lantern-pr/), []);
});

test('without lantern-pr the server refreshes GitHub as before and logs nothing about it', async t => {
  const { base, calls } = await counted(t); // the harness turns the stream off; counted waits for a refresh
  assert.ok(calls() && (await snapshot(base)).sessions.length, 'the server refreshed and still answers');
  await wait(3000); // a few tries, had it been on
  assert.deepStrictEqual(lines(t, /lantern-pr/), []);
});

// What the card shows of an agent: its job from the meta file, its model by name from its transcript's `model` attachment (a real
// one's first 19 lines, test/fixtures/agent-head, text redacted: attachment.identity.marketingName, 8 lines in), and its
// start from when the transcript was made.
const HEAD_AGENT = 'a9aa21de9d268559e', HEAD = fs.readFileSync(path.join(__dirname, `fixtures/agent-head/agent-${HEAD_AGENT}.jsonl`), 'utf8');
const HEAD_META = JSON.stringify({ agentType: 'opus-implement', description: 'Build card direction E into the real card' });
const headOf = a => a && [a.description, a.type, a.model, Math.round(a.started)];
const headWant = file => ['Build card direction E into the real card', 'opus-implement', 'Opus 5.5', Math.round(fs.statSync(file).birthtimeMs)];
test('a hooked agent gets its job, model and start time from its meta file and transcript head', async t => {
  let home;
  const base = await serve(t, {}, h => home = h, agentEnv(600));
  const dir = path.join(home, '.claude/projects/-w/s1/subagents');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `agent-${HEAD_AGENT}.jsonl`), HEAD);
  fs.writeFileSync(path.join(dir, `agent-${HEAD_AGENT}.meta.json`), HEAD_META);
  await agentFire(base, home, { session_id: 's1', hook_event_name: 'UserPromptSubmit', cwd: '/w', prompt: 'go' });
  await agentFire(base, home, { ...agentTool, agent_id: HEAD_AGENT, agent_type: 'opus-implement' });
  const got = await until(async () => { const a = (await s1(base)).subagents[0]; return a?.model && a; }, 'the agent\'s model');
  assert.deepStrictEqual(headOf(got), headWant(path.join(dir, `agent-${HEAD_AGENT}.jsonl`)));
});
test('an agent whose model lands after its SubagentStart gets it at its next hook', async t => {
  let home;
  const base = await serve(t, {}, h => home = h, agentEnv(600));
  const dir = path.join(home, '.claude/projects/-w/s1/subagents');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `agent-${HEAD_AGENT}.meta.json`), HEAD_META);
  const head = HEAD.split('\n'), model = head.findIndex(l => l.includes('"type":"model","identity"'));
  fs.writeFileSync(path.join(dir, `agent-${HEAD_AGENT}.jsonl`), head.slice(0, model).join('\n') + '\n'); // before its model is written
  await agentFire(base, home, { session_id: 's1', hook_event_name: 'UserPromptSubmit', cwd: '/w', prompt: 'go' });
  await agentFire(base, home, { session_id: 's1', hook_event_name: 'SubagentStart', cwd: '/w', agent_id: HEAD_AGENT, agent_type: 'opus-implement' });
  const first = await until(async () => { const a = (await s1(base)).subagents[0]; return a?.description && a; }, 'the agent\'s job');
  assert.strictEqual(first.model, undefined, 'not written yet');
  fs.writeFileSync(path.join(dir, `agent-${HEAD_AGENT}.jsonl`), HEAD);
  await agentFire(base, home, { ...agentTool, agent_id: HEAD_AGENT, agent_type: 'opus-implement' });
  await until(async () => (await s1(base)).subagents[0]?.model === 'Opus 5.5', 'the model from the next hook');
});
// Which line answers for the model: with the replies and request lines gone, only the model attachment can (its
// identity's name, with a note like "(1M context)" cut); with the attachment gone (a fork), only its first reply.
const headLines = HEAD.split('\n').filter(l => !l.includes('"type":"api-request'));
const attachmentOnly = headLines.filter(l => !l.includes('"type":"assistant"')).join('\n'), fork = headLines.filter(l => !l.includes('"type":"model","identity"')).join('\n');
test('the model comes from the model attachment, or a fork\'s first reply, and a note in brackets is dropped', async t => {
  let home;
  const base = await serve(t, {}, h => home = h, agentEnv(600));
  const dir = path.join(home, '.claude/projects/-w/s1/subagents');
  fs.mkdirSync(dir, { recursive: true });
  assert.ok(!attachmentOnly.includes('"model":"claude') && attachmentOnly.includes('"marketingName":"Opus 5.5"'), 'only the attachment names it');
  assert.ok(fork.includes('"model":"claude-opus-5-5"') && !fork.includes('marketingName'), 'only the reply names it');
  fs.writeFileSync(path.join(dir, 'agent-aattach.jsonl'), attachmentOnly.replace('"marketingName":"Opus 5.5"', '"marketingName":"Sonnet 5.5"'));
  fs.writeFileSync(path.join(dir, 'agent-anoted.jsonl'), attachmentOnly.replace('"marketingName":"Opus 5.5"', '"marketingName":"Opus 5.5 (1M context)"'));
  fs.writeFileSync(path.join(dir, 'agent-afork.jsonl'), fork.replace('"model":"claude-opus-5-5"', '"model":"claude-haiku-4-5-20251001"'));
  await agentFire(base, home, { session_id: 's1', hook_event_name: 'UserPromptSubmit', cwd: '/w', prompt: 'go' });
  for (const id of ['aattach', 'anoted', 'afork']) await agentFire(base, home, { ...agentTool, agent_id: id });
  await until(async () => (await s1(base)).subagents.map(a => a.model).join() === 'Sonnet 5.5,Opus 5.5,Haiku 4.5', 'each agent\'s model by name');
});
test('an agent found after a restart gets its model and real start time too', async t => {
  const id = UUID(4), dir = `.claude/projects/-work-4/${id}/subagents`;
  let home;
  const base = await serve(t, { ...transcript(id, [user('Build it')]), [`${dir}/agent-${HEAD_AGENT}.jsonl`]: HEAD, [`${dir}/agent-${HEAD_AGENT}.meta.json`]: HEAD_META }, h => {
    home = h;
    const later = new Date(Date.now() + 60e3); // its last write differs from when it was made (an earlier mtime would move the birth back too)
    fs.utimesSync(path.join(h, `${dir}/agent-${HEAD_AGENT}.jsonl`), later, later);
  });
  const got = await until(async () => { const a = (await snapshot(base)).sessions.find(x => x.id === id)?.subagents[0]; return a?.model && a; }, 'the seeded agent\'s model');
  assert.deepStrictEqual(headOf(got), headWant(path.join(home, `${dir}/agent-${HEAD_AGENT}.jsonl`)));
});

// About 1 in 200 agents switch models mid-run; the card shows the one it's on now, the newest in its transcript's tail,
// which every sweep reads again. A tail with no model in it (a huge tool result) leaves the model as it was: the
// attachment near the start is only for an agent with no model yet, since after a switch it names the old one. A reply
// Claude Code made up (<synthetic>, an API error) names none.
const reply = model => JSON.stringify({ type: 'assistant', message: { role: 'assistant', model, content: [{ type: 'text', text: 'redacted' }] } });
const filler = JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'x'.repeat(140 * 1024) }] } }); // past the 128 KB tail
test('an agent that switches models shows the one it\'s on now, through a huge tool result and a made-up reply', async t => {
  const id = UUID(5), file = `.claude/projects/-work-5/${id}/subagents/agent-${HEAD_AGENT}.jsonl`;
  let home;
  const base = await serve(t, { ...transcript(id, [user('Build it')]), [file]: HEAD + filler + '\n' }, h => home = h, agentEnv(600));
  const model = async () => (await snapshot(base)).sessions.find(x => x.id === id)?.subagents[0]?.model;
  await until(async () => await model() === 'Opus 5.5', 'its first model, from the start, with no model in the tail');
  fs.appendFileSync(path.join(home, file), reply('claude-sonnet-5') + '\n' + reply('<synthetic>') + '\n');
  await until(async () => await model() === 'Sonnet 5', 'the model it switched to, from a sweep');
  fs.appendFileSync(path.join(home, file), filler + '\n');
  await wait(600); // several sweeps
  assert.strictEqual(await model(), 'Sonnet 5', 'still the model it switched to, not the one it started on');
});

test('page files always revalidate: Cache-Control no-cache, and a 304 when the ETag still matches', async t => {
  const base = await serve(t);
  const script = '/assets/' + fs.readdirSync(path.join(ROOT, 'dist', 'assets')).find(f => f.endsWith('.js')); // npm test builds first
  for (const url of ['/', '/index.html', script, '/icon.png']) {
    const res = await fetch(base + url);
    assert.strictEqual(res.status, 200, url);
    assert.strictEqual(res.headers.get('cache-control'), 'no-cache', url);
    const again = await fetch(base + url, { headers: { 'If-None-Match': res.headers.get('etag') } });
    assert.strictEqual(again.status, 304, url);
    assert.strictEqual(again.headers.get('cache-control'), 'no-cache', url);
    assert.strictEqual((await fetch(base + url, { headers: { 'If-None-Match': '"other"' } })).status, 200, url);
  }
  assert.strictEqual((await fetch(base + '/assets/nope.js')).status, 404);
});

// A Vite build in dist/ (dist/index.html and hashed files under dist/assets/) becomes the web root, and a change to anything
// in it reloads open windows. Without dist/index.html the page is a 503 that retries.
const webRoot = files => {
  const dir = fs.mkdtempSync(path.join(tmp, 'web-'));
  for (const [file, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), text); }
  return dir;
};
const versionsOf = (t, base) => {
  const versions = [];
  const req = http.get(base + '/events', res => {
    let text = '';
    res.on('data', chunk => {
      text += chunk;
      const parts = text.split('\n\n'); text = parts.pop();
      for (const b of parts) if (b.includes('event: version')) versions.push(b.match(/event: version\ndata: (.*)$/m)[1]);
    });
  });
  t.after(() => req.destroy());
  return versions;
};
test('a Vite build in dist/ is the web root: its files get their content types, a vanished file is a 404, and a change reloads windows', async t => {
  const web = webRoot({ 'index.html': 'CHECKOUT', 'icon.png': 'CHECKOUT ICON', 'dist/index.html': 'BUILT', 'dist/assets/app-1a.js': 'js', 'dist/assets/app-1a.css': 'css',
    'dist/favicon.svg': 'svg', 'dist/assets/font-2.woff2': 'font', 'dist/manifest.json': '{}', 'dist/assets/app-1a.js.map': '{}', 'dist/notes.txt': 'txt' });
  const base = await serve(t, {}, () => {}, { LANTERN_WEB: web });
  const get = async (url, headers) => fetch(base + url, { headers });
  for (const [url, type, body] of [['/', 'text/html; charset=utf-8', 'BUILT'], ['/index.html', 'text/html; charset=utf-8', 'BUILT'], ['/?panel', 'text/html; charset=utf-8', 'BUILT'],
    ['/assets/app-1a.js', 'text/javascript; charset=utf-8', 'js'], ['/assets/app-1a.css', 'text/css; charset=utf-8', 'css'], ['/favicon.svg', 'image/svg+xml', 'svg'],
    ['/assets/font-2.woff2', 'font/woff2', 'font'], ['/manifest.json', 'application/json', '{}'], ['/assets/app-1a.js.map', 'application/json', '{}']]) {
    const res = await get(url);
    assert.strictEqual(res.status, 200, url);
    assert.strictEqual(res.headers.get('content-type'), type, url);
    assert.strictEqual(res.headers.get('cache-control'), 'no-cache', url);
    assert.strictEqual(await res.text(), body, url);
    assert.strictEqual((await get(url, { 'If-None-Match': res.headers.get('etag') })).status, 304, url);
  }
  // nothing else: the checkout's own files, unknown types, folders and ways out of dist/ are all 404
  for (const url of ['/icon.png', '/notes.txt', '/assets', '/assets/', '/assets/nope.js', '/.hidden.js', '/assets/.x.js']) assert.strictEqual((await get(url)).status, 404, url);
  for (const url of ['/assets/../../index.html', '/../index.html', '/assets/../../icon.png', '/..%2findex.html']) { // fetch tidies these, so send them as they are
    const res = await new Promise((done, fail) => http.get({ host: new URL(base).hostname, port: new URL(base).port, path: url }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => done({ status: r.statusCode, body: b })); }).on('error', fail));
    assert.ok(res.status === 404 && !/CHECKOUT/.test(res.body), `${url} gave ${res.status} ${res.body}`);
  }
  // the API is untouched
  assert.strictEqual((await get('/stats')).status, 200);
  const versions = versionsOf(t, base);
  await until(() => versions.length, 'the first version');
  fs.rmSync(path.join(web, 'dist/assets/app-1a.js')); // a rebuild replaced a hashed file
  assert.strictEqual((await get('/assets/app-1a.js')).status, 404, 'the replaced file');
  const at = new Date(Date.now() + 60000); // clearly newer than the files above, whatever the clock's granularity
  fs.writeFileSync(path.join(web, 'dist/assets/app-2b.js'), 'js2');
  fs.utimesSync(path.join(web, 'dist/assets/app-2b.js'), at, at);
  await until(() => versions.length > 1, 'a version event after a file in dist/ was added');
  assert.strictEqual(await (await get('/assets/app-2b.js')).text(), 'js2');
  assert.strictEqual(new Set(versions).size, 2);
  // a rebuild that empties dist/ for a moment: the page waits (503), it doesn't fall back to the checkout's index.html
  fs.rmSync(path.join(web, 'dist/index.html'));
  for (const url of ['/', '/index.html']) {
    const res = await get(url);
    const body = await res.text();
    assert.ok(res.status === 503 && !/CHECKOUT/.test(body), `${url} gave ${res.status}`);
    assert.match(body, /http-equiv="refresh"/, `${url}: a page that lands in the gap tries again by itself`);
  }
  fs.writeFileSync(path.join(web, 'dist/index.html'), 'BUILT AGAIN');
  assert.strictEqual(await (await get('/')).text(), 'BUILT AGAIN');
});
test('without dist/index.html the page waits (503) and the checkout is not served', async t => {
  const web = webRoot({ 'index.html': 'CHECKOUT', 'icon.png': 'CHECKOUT ICON', 'dist/assets/app-1a.js': 'js' });
  const base = await serve(t, {}, () => {}, { LANTERN_WEB: web });
  for (const url of ['/', '/index.html']) {
    const res = await fetch(base + url);
    assert.strictEqual(res.status, 503, url);
    assert.doesNotMatch(await res.text(), /CHECKOUT/, url);
  }
  assert.strictEqual((await fetch(base + '/icon.png')).status, 404);
  assert.strictEqual(await (await fetch(base + '/assets/app-1a.js')).text(), 'js');
});

test('a rebuild that empties dist/ for a moment neither reloads windows into the gap nor leaves one stuck there', async t => {
  const web = webRoot({ 'index.html': 'CHECKOUT', 'dist/index.html': 'BUILT 1', 'dist/assets/app-1.js': 'js1' });
  const base = await serve(t, {}, () => {}, { LANTERN_WEB: web });
  const versions = versionsOf(t, base);
  await until(() => versions.length, 'the first version');
  // what `vite build --watch` does: empty dist/ (its folder stays), then write the new files
  for (const f of fs.readdirSync(path.join(web, 'dist'))) fs.rmSync(path.join(web, 'dist', f), { recursive: true });
  const landed = await fetch(base + '/'); // a window that reloads right now
  assert.strictEqual(landed.status, 503);
  assert.match(await landed.text(), /http-equiv="refresh"/);
  await wait(2500); // a couple of the server's one-second version checks
  assert.strictEqual(versions.length, 1, 'no reload while dist/ is empty');
  fs.mkdirSync(path.join(web, 'dist/assets'));
  fs.writeFileSync(path.join(web, 'dist/assets/app-2.js'), 'js2');
  fs.writeFileSync(path.join(web, 'dist/index.html'), 'BUILT 2');
  await until(() => versions.length > 1, 'the reload once the new build is there');
  assert.strictEqual(await (await fetch(base + '/')).text(), 'BUILT 2');
  assert.strictEqual(await (await fetch(base + '/assets/app-2.js')).text(), 'js2');
});

// The app keeps dist/ built by running `vite build --watch` in the checkout it serves, when that has Vite and a config (a
// preview or test server only does when asked, as LANTERN_BUILD, since only the app should). A stand-in vite logs where and
// how it ran; it exits at once (which shows the restart), or with `stay` keeps running, as the real one does.
const fakeVite = (config, vite, stay) => {
  const dir = webRoot({ 'index.html': '<!doctype html>' });
  if (config) fs.writeFileSync(path.join(dir, 'vite.config.js'), '');
  if (vite) {
    fs.mkdirSync(path.join(dir, 'node_modules/.bin'), { recursive: true });
    const body = stay ? 'echo $$ > "$HERE/../../vite.pid"\ntrap \'kill $!\' TERM\n/bin/sleep 120 </dev/null >/dev/null 2>&1 &\nwait\n' : '';
    fs.writeFileSync(path.join(dir, 'node_modules/.bin/vite'), `#!/bin/sh\nHERE=\${0%/*}\necho "$PWD $* $PATH" >> "$HERE/../../vite.log"\n${body}`, { mode: 0o755 });
  }
  return dir;
};
const viteLog = dir => fs.existsSync(path.join(dir, 'vite.log')) ? fs.readFileSync(path.join(dir, 'vite.log'), 'utf8').trim().split('\n') : [];
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
// a stand-in for node, in a folder of its own that the watcher's PATH should start with
const fakeNode = () => { const dir = fs.mkdtempSync(path.join(tmp, 'node-')); fs.writeFileSync(path.join(dir, 'node'), '#!/bin/sh\n', { mode: 0o755 }); return dir; };
test('the app runs vite build --watch only in a checkout that has vite and its config, never in a preview, and brings it back when it exits', async t => {
  const [ready, noConfig, noVite, preview, noNode] = [fakeVite(true, true), fakeVite(false, true), fakeVite(true, false), fakeVite(true, true), fakeVite(true, true)];
  const noShell = path.join(fs.mkdtempSync(path.join(tmp, 'sh-')), 'shell'); // a login shell that finds no node
  fs.writeFileSync(noShell, '#!/bin/sh\n', { mode: 0o755 });
  const env = { LANTERN_NODE: path.join(fakeNode(), 'node') };
  await serve(t, {}, () => {}, { LANTERN_WEB: preview }); // no LANTERN_BUILD
  await serve(t, {}, () => {}, { LANTERN_WEB: noNode, LANTERN_BUILD: '1', SHELL: noShell }); // no node: said once, no vite
  for (const dir of [noConfig, noVite, ready]) await serve(t, {}, () => {}, { LANTERN_WEB: dir, LANTERN_BUILD: '1', ...env });
  await until(() => viteLog(ready).length >= 2, 'vite to start and come back after exiting');
  assert.ok(viteLog(ready)[0].startsWith(`${fs.realpathSync(ready)} build --watch `), viteLog(ready)[0]);
  for (const dir of [noConfig, noVite, preview, noNode]) assert.ok(!fs.existsSync(path.join(dir, 'vite.log')), `${dir} started a watcher`);
});
test('vite gets the node that LANTERN_NODE names, or else the one the login shell finds, first on its PATH', async t => {
  const [viaEnv, viaShell] = [fakeVite(true, true), fakeVite(true, true)];
  const [envNode, shellNode] = [fakeNode(), fakeNode()];
  const shell = path.join(fs.mkdtempSync(path.join(tmp, 'sh-')), 'shell'); // a login shell that chats before it answers
  fs.writeFileSync(shell, `#!/bin/sh\necho "Last login: never"\necho ${shellNode}/node\n`, { mode: 0o755 });
  await serve(t, {}, () => {}, { LANTERN_WEB: viaEnv, LANTERN_BUILD: '1', LANTERN_NODE: `${envNode}/node`, SHELL: shell });
  await serve(t, {}, () => {}, { LANTERN_WEB: viaShell, LANTERN_BUILD: '1', SHELL: shell });
  await until(() => viteLog(viaEnv).length && viteLog(viaShell).length, 'both to start vite');
  assert.ok(viteLog(viaEnv)[0].includes(` ${envNode}:`), viteLog(viaEnv)[0]);
  assert.ok(viteLog(viaShell)[0].includes(` ${shellNode}:`), viteLog(viaShell)[0]);
});
test('a login shell that leaves a background process holding its output does not stop node being found', async t => {
  const web = fakeVite(true, true), node = fakeNode(), dir = fs.mkdtempSync(path.join(tmp, 'sh-')), shell = path.join(dir, 'shell');
  fs.writeFileSync(shell, `#!/bin/sh\n/bin/sleep 60 &\necho $! > ${dir}/sleep.pid\necho ${node}/node\n`, { mode: 0o755 });
  t.after(() => { try { process.kill(Number(fs.readFileSync(path.join(dir, 'sleep.pid'), 'utf8')), 'SIGKILL'); } catch {} });
  await serve(t, {}, () => {}, { LANTERN_WEB: web, LANTERN_BUILD: '1', SHELL: shell });
  await until(() => viteLog(web).length, 'vite to start without waiting for the shell\'s background process', 10000);
  assert.ok(viteLog(web)[0].includes(` ${node}:`), viteLog(web)[0]);
});
test('the watcher stops with the server, and a watcher an earlier run left behind is stopped before a new one starts', async t => {
  const web = fakeVite(true, true, true), fake = `${fakeNode()}/node`;
  const pidFile = path.join(web, 'vite.pid'), recorded = path.join(web, 'node_modules/.lantern-vite.pid');
  // an orphan, as a crashed app leaves it: running, and named in the pid file
  const orphan = spawn(path.join(web, 'node_modules/.bin/vite'), ['build', '--watch'], { stdio: 'ignore' });
  t.after(() => { orphan.kill('SIGKILL'); try { process.kill(Number(fs.readFileSync(pidFile, 'utf8')), 'SIGKILL'); } catch {} });
  await until(() => fs.existsSync(pidFile), 'the orphan to start');
  const orphanPid = Number(fs.readFileSync(pidFile, 'utf8'));
  fs.rmSync(pidFile);
  fs.writeFileSync(recorded, String(orphanPid));
  await serve(t, {}, () => {}, { LANTERN_WEB: web, LANTERN_BUILD: '1', LANTERN_NODE: fake });
  await until(() => !alive(orphanPid), 'the orphan to be stopped by the new watcher');
  const mine = await until(() => fs.existsSync(pidFile) && Number(fs.readFileSync(pidFile, 'utf8')), 'the new watcher');
  assert.notStrictEqual(mine, orphanPid);
  assert.ok(alive(mine), 'the new watcher runs');
  assert.strictEqual(Number(fs.readFileSync(recorded, 'utf8')), mine, 'the pid file names it');
  t.server.kill('SIGTERM'); // how the app is relaunched
  await until(() => !alive(mine), 'the watcher to stop with the server');
  assert.ok(!fs.existsSync(recorded), 'the pid file is gone');
});
test('the pid file only ever stops this checkout\'s vite, and only a stopping server\'s own pid is removed from it', async t => {
  const web = fakeVite(true, true, true), other = fakeVite(true, true, true), fake = `${fakeNode()}/node`;
  const recorded = path.join(web, 'node_modules/.lantern-vite.pid');
  // another project's vite, running on a pid the file names (as if the pid had been reused)
  const elsewhere = spawn(path.join(other, 'node_modules/.bin/vite'), ['build', '--watch'], { stdio: 'ignore' });
  t.after(() => elsewhere.kill('SIGKILL'));
  await until(() => fs.existsSync(path.join(other, 'vite.pid')), 'the other project\'s vite to start');
  const theirs = Number(fs.readFileSync(path.join(other, 'vite.pid'), 'utf8'));
  fs.writeFileSync(recorded, String(theirs));
  await serve(t, {}, () => {}, { LANTERN_WEB: web, LANTERN_BUILD: '1', LANTERN_NODE: fake });
  const mine = await until(() => fs.existsSync(path.join(web, 'vite.pid')) && Number(fs.readFileSync(path.join(web, 'vite.pid'), 'utf8')), 'this checkout\'s watcher');
  assert.ok(alive(theirs), 'the other project\'s vite was left alone');
  await until(() => fs.readFileSync(recorded, 'utf8') === String(mine), 'the server to record its watcher'); // it writes after the watcher starts
  // a newer app has taken over the pid file; this one stopping must not delete it
  fs.writeFileSync(recorded, '999999');
  t.server.kill('SIGTERM');
  await until(() => !alive(mine), 'the watcher to stop with the server');
  assert.strictEqual(fs.readFileSync(recorded, 'utf8'), '999999');
});

// Whether a session's card lists its PRs or shows chips is a shared setting, so every window shows the same.
const settingsStream = base => {
  const seen = [];
  const req = http.get(base + '/events', res => {
    let text = '';
    res.on('data', chunk => {
      text += chunk;
      const parts = text.split('\n\n'); text = parts.pop();
      for (const b of parts) if (b.startsWith('event: settings')) seen.push(JSON.parse(b.match(/^data: (.*)$/m)[1]));
    });
  });
  return { seen, close: () => req.destroy() };
};
test('the PR list toggle is kept per session in the settings, reaches every open window, and outlasts a reconnect', async t => {
  let home;
  const base = await serve(t, {}, h => home = h);
  for (const id of ['s1', 's2']) await post(base, '/event', { session_id: id, hook_event_name: 'UserPromptSubmit', cwd: '/w', prompt: 'go' });
  const one = settingsStream(base), two = settingsStream(base);
  t.after(() => { one.close(); two.close(); });
  await until(() => one.seen.length && two.seen.length, 'both windows to get the settings');
  assert.strictEqual((await post(base, '/settings', { prList: { s1: true } })).status, 204);
  assert.strictEqual((await post(base, '/settings', { prList: { s2: false } })).status, 204);
  const want = { s1: true, s2: false }, same = v => { try { assert.deepStrictEqual(v, want); return true; } catch { return false; } }; // in any key order
  for (const w of [one, two]) await until(() => same(w.seen.at(-1).prList), 'each window to get both sessions\' toggles');
  assert.deepStrictEqual((await snapshot(base)).settings.prList, want, 'a window opened later');
  const saved = () => { try { return JSON.parse(fs.readFileSync(path.join(home, 'data/settings.json'), 'utf8')).prList; } catch { return null; } };
  await until(() => same(saved()), 'the settings file to be saved'); // written off the main queue
  assert.strictEqual((await post(base, '/settings', { prList: { nobody: true } })).status, 400, 'an unknown session is refused');
  assert.strictEqual((await post(base, '/settings', { prList: { s1: 1 } })).status, 400, 'so is a value that isn\'t true or false');
  // an ended session's toggle goes with the next change
  await post(base, '/event', { session_id: 's1', hook_event_name: 'SessionEnd', cwd: '/w' });
  assert.strictEqual((await post(base, '/settings', { prList: { s2: true } })).status, 204);
  await until(async () => JSON.stringify((await snapshot(base)).settings.prList) === '{"s2":true}', 'the ended session\'s toggle to go');
});

// The sessions pinned to the sidebar are a shared setting too: a list in the order they were pinned, each `{ id, chips }`
// with a live session's id or one already pinned (kept after it ends, so the sidebar can dim it), saved, and read back
// after a restart, where a pin whose session didn't come back goes (no window can show it or unpin it).
test('the pinned sessions are a list in the settings: toggled, kept in order with their PR view, refused when bad, and outlast a restart', async t => {
  let home;
  const base = await serve(t, {}, h => home = h);
  for (const id of ['s1', 's2', 's3']) await post(base, '/event', { session_id: id, hook_event_name: 'UserPromptSubmit', cwd: '/w', prompt: 'go' });
  const pinned = async () => (await snapshot(base)).settings.pinned;
  const pin = async pins => (await post(base, '/settings', { pinned: pins })).status;
  const ids = (...xs) => xs.map(id => ({ id }));
  assert.strictEqual(await pin(ids('s2')), 204);
  assert.strictEqual(await pin([{ id: 's2', chips: true }, { id: 's1' }]), 204);
  assert.deepStrictEqual(await pinned(), [{ id: 's2', chips: true }, { id: 's1' }], 'in the order they were pinned, each with its PR view');
  assert.strictEqual(await pin([{ id: 's2', chips: true }, { id: 's1' }, { id: 's1', chips: true }]), 204);
  assert.deepStrictEqual(await pinned(), [{ id: 's2', chips: true }, { id: 's1' }], 'pinning one already pinned changes nothing');
  assert.strictEqual(await pin(ids('s2', 'nobody')), 400, 'an unknown session is refused');
  assert.strictEqual(await pin([{ id: 's2' }, { id: 3 }]), 400, 'so is an id that isn\'t a string');
  assert.strictEqual(await pin([{ id: 's2', chips: 1 }]), 400, 'and chips that aren\'t true or false');
  assert.strictEqual(await pin(['s2']), 400, 'and a pin that isn\'t an entry');
  assert.strictEqual(await pin({ id: 's2' }), 400, 'or pins that aren\'t a list');
  assert.deepStrictEqual(await pinned(), [{ id: 's2', chips: true }, { id: 's1' }], 'and leaves the pins alone');
  await post(base, '/event', { session_id: 's2', hook_event_name: 'SessionEnd', cwd: '/w' });
  await until(async () => !(await snapshot(base)).sessions.some(s => s.id === 's2'), 's2 to end');
  assert.strictEqual(await pin(ids('s2', 's1', 's3')), 204, 'an ended session already pinned stays as more are pinned');
  assert.deepStrictEqual(await pinned(), ids('s2', 's1', 's3'));
  assert.strictEqual(await pin(ids('s1', 's3')), 204);
  assert.strictEqual(await pin(ids('s1', 's3', 's2')), 400, 'but once unpinned, an ended session can\'t come back');
  assert.strictEqual(await pin([]), 204);
  assert.deepStrictEqual(await pinned(), [], 'an empty list unpins them all');
  await pin([{ id: 's3' }, { id: 's1', chips: true }]);
  const file = path.join(home, 'data/settings.json'), want = [{ id: 's3' }, { id: 's1', chips: true }];
  await until(() => { try { assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).pinned, want); return true; } catch { return false; } }, 'the pins to be saved');
  // a restart: one pinned session comes back from its transcript, the other ended while Lantern was closed
  const back = '00000001-0000-4000-8000-000000000000', transcript = { [`.claude/projects/-work/${back}.jsonl`]: jsonl([user('Fix it'), answer('Fixed.'), turnEnd]) };
  const settings = { 'data/settings.json': JSON.stringify({ style: 'barrel', pinned: [{ id: 'gone' }, { id: back, chips: true }] }) };
  const again = await serve(t, { ...transcript, ...settings });
  await until(async () => (await snapshot(again)).sessions.some(s => s.id === back), 'the session to be seeded');
  await until(async () => { try { assert.deepStrictEqual((await snapshot(again)).settings.pinned, [{ id: back, chips: true }]); return true; } catch { return false; } }, 'the ended pin to go and the other to stay'); // in any key order
});

// A snooze lasts until the session does something new, and a restart doesn't end it: the second server starts from the
// settings.json the first one saved, and finds the same session on disk.
test('a snooze survives a restart, and new activity after it still ends the snooze', async t => {
  const id = UUID(4), files = transcript(id, [user('Look'), answer('The glow sits a little higher on the paper than before.'), turnEnd]);
  const session = async base => (await snapshot(base)).sessions.find(s => s.id === id);
  let home;
  const first = await serve(t, files, h => home = h);
  await until(async () => (await session(first))?.state === 'waiting', 'the transcript to be seeded as waiting');
  assert.strictEqual((await post(first, '/snooze', { id, snoozed: true })).status, 204);
  const saved = await until(() => { try { const s = fs.readFileSync(path.join(home, 'data/settings.json'), 'utf8'); return JSON.parse(s).snoozed?.length && s; } catch {} }, 'the snooze to be saved');
  let home2;
  const second = await serve(t, { ...files, 'data/settings.json': saved }, h => home2 = h);
  const back = await until(() => session(second), 'the transcript to be seeded again');
  assert.deepStrictEqual([back.state, back.snoozed], ['waiting', true], 'still snoozed after the restart');
  await post(second, '/event', { session_id: id, hook_event_name: 'UserPromptSubmit', cwd: '/w', prompt: 'go' });
  await until(async () => (await session(second)).snoozed === false, 'new activity to end the snooze');
  await until(() => JSON.parse(fs.readFileSync(path.join(home2, 'data/settings.json'), 'utf8')).snoozed?.length === 0, 'the ended snooze to leave settings.json');
});

// The harness (also the preview's server) must not reach the real lantern-pr on this Mac. Listen on its default address if
// we can; if the real one holds it, its connection would be logged instead.
test('the test server does not connect to the default lantern-pr stream', async t => {
  let hits = 0;
  const trap = http.createServer((req, res) => { hits++; res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write(': hello\n\n'); });
  const ours = await new Promise(r => trap.once('error', () => r(false)).listen(8788, '127.0.0.1', () => r(true)));
  t.after(() => { trap.closeAllConnections(); trap.close(); });
  await serve(t);
  await wait(2500);
  assert.strictEqual(hits, 0, 'nothing connected to the default stream');
  assert.deepStrictEqual(lines(t, /lantern-pr/), []);
  if (!ours) t.diagnostic('8788 was taken (the real lantern-pr?), so only the log was checked');
});

// Two Claude config folders (a personal ~/.claude and a work ~/.claude-work) show in one lantern. Where the work one's
// projects are a symlink into the personal one, a session is still counted once.
const ids = async base => (await snapshot(base)).sessions.map(s => s.id).sort();
test('sessions from a second config folder, ~/.claude-work, show beside the first', async t => {
  const work = transcript(UUID(2), [user('Work thing')]);
  const base = await serve(t, {
    ...transcript(UUID(1), [user('Personal thing')]),
    ...Object.fromEntries(Object.entries(work).map(([f, text]) => [f.replace('.claude/', '.claude-work/'), text])),
  });
  await until(async () => (await ids(base)).length === 2, 'both folders to be seeded');
  assert.deepStrictEqual(await ids(base), [UUID(1), UUID(2)]);
});
test('sessions from ~/.claude-personal show beside the first', async t => {
  const personal = transcript(UUID(2), [user('Personal thing')]);
  const base = await serve(t, {
    ...transcript(UUID(1), [user('Work thing')]),
    ...Object.fromEntries(Object.entries(personal).map(([f, text]) => [f.replace('.claude/', '.claude-personal/'), text])),
  });
  await until(async () => (await ids(base)).length === 2, 'both folders to be seeded');
  assert.deepStrictEqual(await ids(base), [UUID(1), UUID(2)]);
});
test('LANTERN_CLAUDE_DIRS adds more config folders, and one that is not there is skipped', async t => {
  const extra = path.join(fs.mkdtempSync(path.join(tmp, 'extra-')), 'cfg');
  fs.mkdirSync(path.join(extra, 'projects/-work-2'), { recursive: true });
  fs.writeFileSync(path.join(extra, 'projects/-work-2', UUID(2) + '.jsonl'), jsonl([user('Elsewhere')]));
  const base = await serve(t, transcript(UUID(1), [user('Personal thing')]), () => {}, { LANTERN_CLAUDE_DIRS: path.join(tmp, 'nowhere') + ':' + extra });
  await until(async () => (await ids(base)).length === 2, 'both folders to be seeded');
  assert.deepStrictEqual(await ids(base), [UUID(1), UUID(2)]);
});
test('a config folder whose projects and sessions are symlinks into the first is read once', async t => {
  const id = UUID(1);
  const base = await serve(t, transcript(id, [user('Personal thing')]), home => {
    fs.mkdirSync(path.join(home, '.claude-work'));
    for (const d of ['projects', 'sessions']) {
      fs.mkdirSync(path.join(home, '.claude', d), { recursive: true });
      fs.symlinkSync(path.join(home, '.claude', d), path.join(home, '.claude-work', d));
    }
  }, {});
  await until(async () => (await ids(base)).length === 1, 'the session to be seeded');
  assert.deepStrictEqual(await ids(base), [id]);
  assert.match(t.output(), /of prose from 1 recent transcript\(s\)/);
});
test('with the same session in both folders (a frozen copy in ~/.claude, the live one in ~/.claude-work), the newest copy wins', async t => {
  const id = UUID(1), rel = `projects/-work-1/${id}.jsonl`;
  const base = await serve(t, {
    ['.claude/' + rel]: jsonl([user('Stale copy')]),
    ['.claude-work/' + rel]: jsonl([user('Live copy')]),
  }, home => { const old = new Date(Date.now() - 600e3); fs.utimesSync(path.join(home, '.claude', rel), old, old); });
  await until(async () => (await ids(base)).length === 1, 'the session to be seeded');
  const [s] = (await snapshot(base)).sessions;
  assert.ok(Date.now() - s.last < 60e3, `last ${s.last}`);
});
test('a hook whose transcript is under ~/.claude-work finds its project when that folder\'s projects link into ~/.claude', async t => {
  let home;
  const base = await serve(t, {}, h => {
    home = h;
    fs.mkdirSync(path.join(h, '.claude/projects'), { recursive: true });
    fs.mkdirSync(path.join(h, '.claude-work'));
    fs.symlinkSync(path.join(h, '.claude/projects'), path.join(h, '.claude-work/projects'));
  });
  await post(base, '/event', { session_id: 's1', hook_event_name: 'UserPromptSubmit', cwd: '/w', prompt: 'go', transcript_path: path.join(home, '.claude-work/projects/-w/s1.jsonl') });
  assert.deepStrictEqual((await snapshot(base)).sessions.map(x => [x.id, x.project]), [['s1', '-w']]);
});

// GitHub App user tokens last 8 hours, so on a 401 the account trades its refresh token for a new pair instead of asking to
// reconnect. A stand-in GitHub answers /graphql only for tokens it has granted (a good answer takes a moment, so a test can
// look before it lands), and /login/oauth/access_token for the refresh tokens in `grants` (refresh token -> [access token, next
// refresh token]), each good once, as GitHub rotates them. `gate` holds every /graphql answer until it's released. A stand-in
// `security` keeps the Keychain item in a file, so these tests never touch the real Keychain.
async function githubStub(t, grants) {
  const live = new Set(), seen = { bearers: [], refreshes: [] };
  let release, gate = new Promise(r => release = r);
  release();
  const stub = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      const reply = (status, json, after = 0) => setTimeout(() => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(json)); }, after);
      if (req.url === '/graphql') {
        const bearer = req.headers.authorization.replace('Bearer ', '');
        seen.bearers.push(bearer);
        await gate;
        return live.has(bearer) ? reply(200, { data: { reviews: { nodes: [] }, mine: { nodes: [] }, closed: { nodes: [] } } }, 500) : reply(401, { message: 'Bad credentials' });
      }
      const sent = JSON.parse(body);
      assert.deepStrictEqual([sent.grant_type, sent.client_id], ['refresh_token', 'Iv23liGsGuBVmd5HoOSn']);
      seen.refreshes.push(sent.refresh_token);
      const grant = grants[sent.refresh_token];
      delete grants[sent.refresh_token];
      if (!grant) return reply(200, { error: 'bad_refresh_token' }, 800); // late, so a Lantern that lost a race has seen the winner's save
      live.add(grant[0]);
      reply(200, { access_token: grant[0], refresh_token: grant[1], expires_in: 28800, refresh_token_expires_in: 15811200 }, 200);
    });
  });
  await new Promise(r => stub.listen(0, '127.0.0.1', r));
  t.after(() => stub.close());
  return { url: `http://127.0.0.1:${stub.address().port}`, seen, live, hold: () => { gate = new Promise(r => release = r); }, release: () => release() };
}
function keychain(item) {
  const dir = fs.mkdtempSync(path.join(tmp, 'kc-')), security = path.join(dir, 'security');
  fs.writeFileSync(path.join(dir, 'octo'), item);
  fs.writeFileSync(security, `#!/bin/sh\ncmd=$1; shift\nwhile [ $# -gt 0 ]; do case $1 in -a) a=$2; shift;; -w) [ "$cmd" = add-generic-password ] && { w=$2; shift; };; -s|-l) shift;; esac; shift; done\n` +
    `if [ "$cmd" = add-generic-password ]; then printf %s "$w" > '${dir}/'"$a"; else /bin/cat '${dir}/'"$a"; fi\n`, { mode: 0o755 });
  return { security, stored: () => JSON.parse(fs.readFileSync(path.join(dir, 'octo'), 'utf8')), save: text => fs.writeFileSync(path.join(dir, 'octo'), text) };
}
async function githubServer(t, stub, kc) {
  const base = await serve(t, { 'data/settings.json': '{"githubAccounts":["octo"]}' }, () => {}, { LANTERN_SECURITY: kc.security, LANTERN_GITHUB_WEB: stub.url, LANTERN_GITHUB_API: stub.url });
  const error = () => new Promise((done, fail) => { // the account row's error, off the start of the event stream
    const req = http.get(base + '/events', res => {
      let text = '';
      res.on('data', chunk => {
        text += chunk;
        const block = text.split('\n\n').find(b => b.startsWith('event: github') || b.includes('\nevent: github'));
        if (block) { req.destroy(); done(JSON.parse(block.match(/^data: (.*)$/m)[1]).accounts[0]?.error); }
      });
    });
    req.on('error', e => e.code !== 'ECONNRESET' && fail(e));
  });
  // Asks for another poll and waits until it goes out: that is after the one running has finished and recorded its outcome.
  const polled = async () => { const n = stub.seen.bearers.length; await post(base, '/settings', { github: true }); await until(() => stub.seen.bearers.length > n, 'another poll'); };
  return { base, error, polled };
}
async function githubAccount(t, item, grants) {
  const stub = await githubStub(t, grants), kc = keychain(item);
  return { ...stub, ...kc, ...await githubServer(t, stub, kc), seen: stub.seen };
}

test('a 401 refreshes the GitHub token once, retries and keeps the account connected', async t => {
  const g = await githubAccount(t, JSON.stringify({ token: 'old', refresh: 'r1' }), { r1: ['fresh1', 'r2'] });
  await until(() => g.seen.bearers.includes('fresh1'), 'the retry with the new token');
  await g.polled(); // the poll that retried is done: it must not have said reconnect
  assert.deepStrictEqual(g.seen.bearers.slice(0, 2), ['old', 'fresh1']);
  assert.deepStrictEqual(g.seen.refreshes, ['r1']);
  assert.strictEqual(await g.error(), '');
});

test('the rotated GitHub refresh token is saved and used for the next refresh', async t => {
  const g = await githubAccount(t, JSON.stringify({ token: 'old', refresh: 'r1' }), { r1: ['fresh1', 'r2'], r2: ['fresh2', 'r3'] });
  await until(() => g.seen.bearers.includes('fresh1'), 'the first refresh');
  assert.strictEqual(g.stored().refresh, 'r2', 'the Keychain holds the new refresh token');
  g.live.delete('fresh1'); // the token runs out again
  await post(g.base, '/settings', { github: true });
  await until(() => g.seen.bearers.includes('fresh2'), 'the second refresh');
  assert.deepStrictEqual(g.seen.refreshes, ['r1', 'r2'], 'the second refresh used the rotated token, not the first');
  assert.deepStrictEqual([g.stored().token, g.stored().refresh], ['fresh2', 'r3']);
});

test('a GitHub refresh that fails, or a token with no refresh token, marks the account to reconnect', async t => {
  const dead = await githubAccount(t, JSON.stringify({ token: 'old', refresh: 'gone' }), {});
  await until(async () => (await dead.error()) === 'expired', 'the dead refresh token to say reconnect');
  assert.deepStrictEqual(dead.seen.refreshes, ['gone']);
  const bare = await githubAccount(t, 'old', { r1: ['fresh1', 'r2'] }); // saved before refresh tokens were kept
  await until(async () => (await bare.error()) === 'expired', 'a bare token to say reconnect');
  assert.deepStrictEqual(bare.seen.refreshes, []);
  assert.strictEqual(bare.seen.bearers[0], 'old', 'the saved token itself was sent');
});

// `npm run preview` runs a second Lantern on the same Keychain item. Both get the 401 together and both trade r1; GitHub
// honours one, so the other must take the pair the winner saved instead of showing reconnect.
test('two Lanterns sharing a GitHub Keychain item both stay connected when one rotates the refresh token', async t => {
  const stub = await githubStub(t, { r1: ['fresh1', 'r2'] }), kc = keychain(JSON.stringify({ token: 'old', refresh: 'r1' }));
  stub.hold(); // both sit on their first answer until both are asking
  const a = await githubServer(t, stub, kc), b = await githubServer(t, stub, kc);
  await until(() => stub.seen.bearers.length >= 2, 'both Lanterns to ask');
  stub.release();
  await until(() => stub.seen.refreshes.length === 2 && stub.seen.bearers.filter(x => x === 'fresh1').length === 2, 'both to refresh and retry');
  await a.polled(); await b.polled();
  assert.deepStrictEqual([await a.error(), await b.error()], ['', ''], 'neither says reconnect');
  assert.strictEqual(kc.stored().refresh, 'r2');
});

// The same race, one step at a time. Another Lantern rotated the pair before ours asked GitHub for anything...
test('a GitHub 401 takes the newer pair another Lantern saved instead of refreshing', async t => {
  const stub = await githubStub(t, {}), kc = keychain(JSON.stringify({ token: 'old', refresh: 'r1' }));
  stub.hold();
  const g = await githubServer(t, stub, kc);
  await until(() => stub.seen.bearers.length, 'the first ask');
  stub.live.add('fresh1'); kc.save(JSON.stringify({ token: 'fresh1', refresh: 'r2' })); // the other Lantern
  stub.release();
  await until(() => stub.seen.bearers.includes('fresh1'), 'the retry with the saved token');
  await g.polled();
  assert.deepStrictEqual(stub.seen.refreshes, [], 'GitHub was not asked');
  assert.strictEqual(await g.error(), '');
});
// ...or while ours was asking, so GitHub refuses the refresh token it already rotated for the other one.
test('a refused GitHub refresh token is not reconnect when another Lantern saved a newer pair meanwhile', async t => {
  const stub = await githubStub(t, {}), kc = keychain(JSON.stringify({ token: 'old', refresh: 'r1' }));
  const g = await githubServer(t, stub, kc);
  await until(() => stub.seen.refreshes.length, 'the refresh');
  stub.live.add('fresh1'); kc.save(JSON.stringify({ token: 'fresh1', refresh: 'r2' })); // the refusal is on its way
  await until(() => stub.seen.bearers.includes('fresh1'), 'the retry with the saved token');
  assert.strictEqual(await g.error(), '', 'the same poll retried, so it never said reconnect'); // its answer is still on its way
  assert.deepStrictEqual(stub.seen.refreshes, ['r1']);
});

// Dace's PR-watch session (Oct 22, 7fd92067): a turn ended while its own background shell (bk0eb85kg, launched with
// run_in_background) still ran, then Lantern restarted. Seeding only counted agents, so it came back landed instead of paused
// on the shell. The launch is a tool result with toolUseResult.backgroundTaskId (a Monitor's is taskId); it ends with a
// task-notification carrying a <status> (a Monitor's event notices have none) or a TaskStop.
test('a seeded session waiting on its own background shell is paused, not landed (the PR-watch restart)', async t => {
  const at = minutes => new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const launch = (task, minutes, key = 'backgroundTaskId') => ({ type: 'user', cwd: '/work', timestamp: at(minutes), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: `Command running in background with ID: ${task}.` }] }, toolUseResult: { stdout: '', interrupted: false, [key]: task } });
  const notice = (task, inner) => ({ type: 'queue-operation', operation: 'enqueue', timestamp: at(1), content: `<task-notification>\n<task-id>${task}</task-id>\n${inner}\n</task-notification>` });
  const watching = (...extra) => [user('watch the PR'), ...extra, answer('Watching CI, I will pick it up when it finishes.'), turnEnd];
  const cases = {
    running: watching(launch('bk0eb85kg', 5)),
    completed: watching(launch('bk0eb85kg', 5), notice('bk0eb85kg', '<status>completed</status>')),
    stopped: watching(launch('bk0eb85kg', 5), { type: 'user', cwd: '/work', toolUseResult: { message: 'Successfully stopped task: bk0eb85kg (gh pr checks)', task_id: 'bk0eb85kg' } }),
    old: watching(launch('bk0eb85kg', 31)),
    monitor: watching(launch('bmon', 5, 'taskId'), notice('bmon', '<summary>Monitor event: "CI"</summary>\n<event>unit|success</event>')),
  };
  const names = Object.keys(cases);
  const base = await serve(t, Object.assign({}, ...names.map((n, i) => transcript(UUID(i), cases[n]))));
  const sessions = await until(async () => { const s = (await snapshot(base)).sessions; return s.length === names.length && s; }, 'every transcript to be seeded');
  assert.deepStrictEqual(Object.fromEntries(names.map((n, i) => [n, sessions.find(s => s.id === UUID(i)).state])),
    { running: 'paused', completed: 'waiting', stopped: 'waiting', old: 'idle', monitor: 'paused' }); // old: open but past TASK_FRESH_MS, so it rests
  assert.strictEqual(sessions.find(s => s.id === UUID(0)).note, 'Waiting on 1 background task');
});

// A Monitor's launch result carries taskId, not backgroundTaskId, so a Stop listing a session's own Monitor found no start
// line and dropped it: the session landed instead of pausing on its watch.
test('Stop counts a Monitor the session started (its launch carries taskId)', async t => {
  const id = UUID(0), file = `.claude/projects/-work/${id}.jsonl`, started = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  let home;
  const base = await serve(t, { [file]: jsonl([user('watch CI'), { type: 'user', cwd: '/work', timestamp: started, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'Monitor started (task bmon1)' }] }, toolUseResult: { taskId: 'bmon1', timeoutMs: 1800000, persistent: false } }]) }, h => home = h);
  const hook = (hook_event_name, more = {}) => post(base, '/event', { session_id: id, hook_event_name, cwd: '/work', transcript_path: path.join(home, file), ...more });
  await hook('UserPromptSubmit', { prompt: 'watch CI' });
  await hook('Stop', { last_assistant_message: 'Watching.', background_tasks: [{ id: 'bmon1', type: 'monitor', status: 'running', description: 'CI results' }] });
  const s = (await snapshot(base)).sessions.find(x => x.id === id);
  assert.deepStrictEqual({ state: s.state, note: s.note, tasks: s.tasks }, { state: 'paused', note: 'Waiting on 1 background task', tasks: ['CI results'] });
});
