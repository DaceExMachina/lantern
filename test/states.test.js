// test/STATES.md is the index of every case that decides a session's state. This keeps it honest: every test it names
// exists in test/server.test.js, and every row of the state table there (STATE_TABLE, SUSPECTED) is listed in it.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const spec = fs.readFileSync(path.join(__dirname, 'STATES.md'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, 'server.test.js'), 'utf8');
const unquote = s => s.replace(/\\(.)/g, '$1');

// test names: test('…') and test("…"); table rows: the `['name', [` lines from STATE_TABLE to the end of SUSPECTED
const tests = new Set([...source.matchAll(/^test\((?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/gm)].map(m => unquote(m[1] ?? m[2])));
const tables = source.slice(source.indexOf('const STATE_TABLE = ['), source.indexOf('async function stateRows'));
const rows = [...tables.matchAll(/^ {2}\['((?:[^'\\]|\\.)*)', \[/gm)].map(m => unquote(m[1]));
// the last cell of each table row in STATES.md, and the `names` in it
const named = spec.split('\n').filter(l => l.startsWith('| ') && !l.startsWith('| Situation')).flatMap(l => [...l.split('|').at(-2).matchAll(/`([^`]+)`/g)].map(m => m[1]));

test('STATES.md names only tests that exist', () => {
  assert.ok(rows.length > 40 && tests.has('SessionEnd removes the session'), 'the source parsed'); // a broken pattern can't pass vacuously
  assert.deepStrictEqual(named.filter(n => n.startsWith('state table: ') ? !rows.includes(n.slice(13)) : !tests.has(n)), []);
});

test('STATES.md lists every row of the state table', () => {
  assert.deepStrictEqual(rows.filter(r => !named.includes('state table: ' + r)), []);
});
