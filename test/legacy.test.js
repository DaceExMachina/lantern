// server.js, the frozen fallback server: how it reads a transcript's last turn, and what it pulls out of a finished
// turn for the card (the You: line, Blockers, questions, PR links). It starts a server when loaded, so it runs here
// in a vm context where http, child processes, timers and file watching do nothing.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const stubs = {
  http: { createServer: () => ({ listen() { return this; } }) },
  child_process: { execFile: (...args) => args.pop()(new Error('stubbed'), ''), spawnSync: () => ({ status: 1, stdout: '' }) },
  fs: { ...fs, watchFile() {} },
};
const legacy = vm.createContext({
  require: name => stubs[name] || require(name), console, process, Buffer, URL, setInterval() {}, setTimeout() {},
  __dirname: fs.mkdtempSync(path.join(os.tmpdir(), 'lantern-legacy-')), // no settings.json there
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8'), legacy, { filename: 'server.js' });
const { lastTurn, questionIn, forYou } = legacy;
// values from the vm come with its own Object prototype, which deepStrictEqual tells apart
const plain = v => JSON.parse(JSON.stringify(v));

const lines = (...objects) => objects.map(o => JSON.stringify(o));
const user = content => ({ type: 'user', cwd: '/work', message: { content } });
const assistant = (text, stop_reason = 'end_turn') => ({ type: 'assistant', cwd: '/work', message: { stop_reason, content: text ? [{ type: 'text', text }] : [{ type: 'tool_use' }] } });
const turnEnd = { type: 'system', subtype: 'turn_duration' };

test('lastTurn: a finished turn is done, with its last words', () => {
  assert.deepStrictEqual(plain(lastTurn(lines(user('hi'), assistant('All set.'), turnEnd))), { done: true, text: 'All set.', cwd: '/work' });
});
test('lastTurn: past the turn_duration marker, it looks back over tool calls for the text', () => {
  assert.deepStrictEqual(plain(lastTurn(lines(user('hi'), assistant('Here it is.', 'tool_use'), assistant(''), turnEnd))), { done: true, text: 'Here it is.', cwd: '/work' });
});
test('lastTurn: a prompt with no answer yet is still working', () => {
  assert.equal(lastTurn(lines(assistant('Done.'), turnEnd, user('next thing'))).done, false);
});
test('lastTurn: an unanswered task notification after a finished turn leaves it done', () => {
  assert.equal(lastTurn(lines(user('hi'), assistant('Done.'), turnEnd, user('<task-notification>agent finished</task-notification>'))).done, true);
});
test('lastTurn: stopping right after a compact is done and compacted', () => {
  assert.deepStrictEqual(plain(lastTurn(lines(user('hi'), { type: 'system', subtype: 'compact_boundary', cwd: '/work' }))), { done: true, compacted: true, cwd: '/work' });
});
test('lastTurn: lines that are not JSON are skipped', () => {
  assert.equal(lastTurn([...lines(user('hi'), assistant('Done.'), turnEnd), '{"type":"user", cut off']).done, true);
});

test('questionIn: a Blocker line wins over a closing question', () => {
  assert.equal(questionIn('Looked into it.\n**Blocker:** which region do we deploy to?\nWant me to go on?'), 'which region do we deploy to?');
});
test('questionIn: otherwise the last sentence, if it asks something', () => {
  assert.equal(questionIn('Tests pass. Shall I open the PR?'), 'Shall I open the PR?');
  assert.equal(questionIn('Is this right? Yes. All done.'), '');
});

test('forYou: the You: line, with its links split out', () => {
  const card = forYou('Shipped it.\n\n**You:** review [lantern#7](https://github.com/me/lantern/pull/7) when you can\n**Me:** waiting');
  assert.deepStrictEqual(plain(card.you), ['review ', { label: 'lantern#7', url: 'https://github.com/me/lantern/pull/7' }, ' when you can']);
  assert.deepStrictEqual(plain(card.prs), [{ label: 'lantern#7', url: 'https://github.com/me/lantern/pull/7' }]);
});
test('forYou: Blockers then questions, deduplicated, and nothing from inside code blocks', () => {
  const card = forYou('Two options.\n```\nwhy is this here?\n```\n**Blocker:** Postgres or SQLite?\nPostgres or SQLite? Keep the old table?\nSee https://github.com/me/api/pull/12.');
  assert.deepStrictEqual(plain(card.questions), ['Postgres or SQLite?', 'Keep the old table?']);
  assert.deepStrictEqual(plain(card.prs), [{ label: 'api#12', url: 'https://github.com/me/api/pull/12' }]);
  assert.deepStrictEqual(plain(card.you), []); // server.js has no last-paragraph fallback
});
