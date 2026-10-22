// Snoozed vs sleeping (snoozed for good): which status bar count a session lands in (restOf, page/state.js), and how
// the stats ribbon splits a day's waiting between waiting and snoozed, sleeping counted as snoozed (slices and states, page/stats.js).
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'vitest';

const stub = () => ({ addEventListener() {}, classList: { toggle() {} } });
const page = vm.createContext({ URLSearchParams, location: { search: '' }, performance, document: { getElementById: stub, querySelectorAll: () => [] } });
for (const f of ['scene', 'dev', 'lanterns', 'state', 'stats']) vm.runInContext(fs.readFileSync(path.join(import.meta.dirname, '..', 'public', 'page', f + '.js'), 'utf8'), page, { filename: f + '.js' });
const run = code => vm.runInContext(code, page);

test('snoozed for good counts as sleeping whatever the session is doing; a plain snooze only while it waits', () => {
  const restOf = run('restOf');
  const cases = [
    [{ state: 'waiting' }, 'need'],
    [{ state: 'waiting', snoozed: true }, 'snoozed'],
    [{ state: 'waiting', snoozed: true, quiet: true }, 'snoozed'], // quiet hours (sync marks every wait snoozed)
    [{ state: 'waiting', snoozed: true, forGood: true }, 'sleeping'],
    [{ state: 'idle', snoozed: true, forGood: true }, 'sleeping'],
    [{ state: 'working', snoozed: true, forGood: true }, 'sleeping'],
    [{ state: 'working' }, ''],
    [{ state: 'idle' }, ''],
  ];
  for (const [s, want] of cases) assert.strictEqual(restOf(s), want, JSON.stringify(s));
});

test('the ribbon takes snoozed and sleeping time out of waiting, as one snoozed band', () => {
  const MIN = 60000, t0 = Date.now() - 2 * 3600000, day = { start: t0, end: t0 + 60 * MIN };
  const spans = [['alive', t0, t0 + 60 * MIN, false], ['waiting', t0, t0 + 40 * MIN], ['snoozed', t0, t0 + 10 * MIN], ['sleeping', t0 + 10 * MIN, t0 + 30 * MIN]];
  const r = run('slices')(day, spans, [], 1);
  assert.strictEqual(r.slices.length, 1, 'one slice for the hour');
  const got = run('states')(r.slices[0]), want = { working: 0, waiting: 1 / 6, snoozed: 3 / 6, idle: 2 / 6 };
  for (const k in want) assert.ok(Math.abs(got[k] - want[k]) < 1e-9, `${k}: ${got[k]}, not ${want[k]}`);
  assert.deepStrictEqual(Object.keys(got), Object.keys(want), 'no separate sleeping band');
});
