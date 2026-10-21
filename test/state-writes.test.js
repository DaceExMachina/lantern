// A session's state is decided in one place: derive() in app/Server.swift. Handlers and seeding record facts (turn, awaits,
// taskSince...) and derive() works out the state, so a state bug is fixed there, not by setting state where it showed up.
// This fails when any other code assigns a session's "state". See "Fixing a session-state bug" in CONTRIBUTING.md.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', 'app');

test('only derive() assigns a session\'s state', () => {
  const writes = [];
  let sawDerive = false;
  for (const file of fs.readdirSync(APP).filter(f => f.endsWith('.swift'))) {
    let inDerive = false;
    fs.readFileSync(path.join(APP, file), 'utf8').split('\n').forEach((line, i) => {
      if (/func derive\(/.test(line)) inDerive = sawDerive = true;
      else if (inDerive && /^    \}/.test(line)) inDerive = false; // derive's closing brace, at the method indent
      else if (!inDerive && /\["state"\]\s*=(?!=)/.test(line)) writes.push(`${file}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.ok(sawDerive, 'found derive() (if it moved, update this test)');
  assert.deepStrictEqual(writes, [], 'record a fact or change derive() or check() instead of setting state directly');
});
