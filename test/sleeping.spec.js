// Snoozed vs sleeping (snoozed for good): which status bar count a session lands in (restOf, src/scene/state.js), and how
// the stats ribbon splits a day's waiting between waiting and snoozed, sleeping counted as snoozed (slices and states, src/scene/stats.js).
import assert from 'node:assert';
import { test } from 'vitest';
import { restOf } from '../src/scene/state.js';
import { slices, states } from '../src/scene/stats.js';

test('snoozed for good counts as sleeping whatever the session is doing; a plain snooze only while it waits', () => {
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
  const r = slices(day, spans, [], 1);
  assert.strictEqual(r.slices.length, 1, 'one slice for the hour');
  const got = states(r.slices[0]), want = { working: 0, waiting: 1 / 6, snoozed: 3 / 6, idle: 2 / 6 };
  for (const k in want) assert.ok(Math.abs(got[k] - want[k]) < 1e-9, `${k}: ${got[k]}, not ${want[k]}`);
  assert.deepStrictEqual(Object.keys(got), Object.keys(want), 'no separate sleeping band');
});
