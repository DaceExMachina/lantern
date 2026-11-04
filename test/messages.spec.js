// A message between two sessions (src/scene/messages.ts): the sender glows gold, a gold pulse runs down its thread to the
// lantern and up the receiver's, the receiver glows, and then it's all gone. Moths sitting on the lantern have no thread
// out, so only the glows play, and the frame goes calm again once they're done.
import assert from 'node:assert';
import { afterEach, test, vi } from 'vitest';
import { layOut } from './page.js';

afterEach(() => vi.restoreAllMocks());

const load = async () => {
  layOut(); vi.resetModules();
  const [{ live }, state, frame, lanterns, messages] = await Promise.all(['live', 'state', 'frame', 'lanterns', 'messages'].map(f => import(`../src/scene/${f}.ts`)));
  lanterns.applyStyle('barrel');
  return { live, state, frame, messages };
};
// Runs frames for `seconds` from `t`, noting each one: both moths' glow and gold pulse, the threads' widths and whether it was brisk.
const play = (frame, live, t, seconds) => {
  const seen = [];
  for (let i = 0; i < seconds * 60; i++) {
    frame.frame(t += 1000 / 60);
    const [a, b] = ['api', 'blog'].map(id => live.moths.get(id));
    seen.push({ t, a: a.shine, b: b.shine, ga: a.gold?.at, gb: b.gold?.at, wa: a.thread.getAttribute('stroke-width'), brisk: live.brisk });
  }
  return { seen, t };
};

test('a message between two flying moths: sender glows, gold runs down its thread and up the other, receiver glows, then it ends', async () => {
  const { live, state, frame, messages } = await load();
  live.raw = [{ id: 'api', state: 'working', subagents: [] }, { id: 'blog', state: 'working', subagents: [] }];
  state.sync();
  let { t } = play(frame, live, 1000, 2);
  messages.sendMessage('api', 'blog', t);
  const { seen } = play(frame, live, t, 5);
  const first = (k, test) => seen.findIndex(f => f[k] !== undefined && test(f[k]));
  const aGlow = first('a', v => v > 0.9), down = first('ga', () => true), up = first('gb', () => true), bGlow = first('b', v => v > 0.9);
  assert.ok(aGlow >= 0 && down > 0 && up > down && bGlow > up, `in order: sender ${aGlow}, down ${down}, up ${up}, receiver ${bGlow}`);
  const downs = seen.map(f => f.ga).filter(v => v !== undefined), ups = seen.map(f => f.gb).filter(v => v !== undefined);
  assert.ok(downs.every((v, i) => i === 0 || v < downs[i - 1]) && downs[0] > 0.9 && downs.at(-1) < 0.1, 'down the sender\'s thread, moth to lantern');
  assert.ok(ups.every((v, i) => i === 0 || v > ups[i - 1]) && ups[0] < 0.1 && ups.at(-1) > 0.9, 'up the receiver\'s, lantern to moth');
  assert.ok(Number(seen[down].wa) > 1.5, 'the sender\'s thread draws thicker while the gold runs down it');
  const last = seen.at(-1);
  assert.deepStrictEqual([messages.flights.length, last.a, last.b, last.ga, last.gb, last.wa], [0, 0, 0, undefined, undefined, null], 'all gone after');
});

test('between two moths on the lantern only the glows play, and the frame is calm again after', async () => {
  const { live, state, frame, messages } = await load();
  live.raw = [{ id: 'api', state: 'waiting', waitingSince: Date.now(), subagents: [] }, { id: 'blog', state: 'waiting', waitingSince: Date.now(), subagents: [] }];
  state.sync();
  let { t, seen } = play(frame, live, 1000, 10); // landed and folded
  assert.strictEqual(seen.at(-1).brisk, false);
  messages.sendMessage('api', 'blog', t);
  ({ seen } = play(frame, live, t, 3));
  assert.ok(seen.some(f => f.a > 0.9) && seen.some(f => f.b > 0.9), 'both glow');
  assert.ok(seen.every(f => f.ga === undefined && f.gb === undefined), 'no thread to run along');
  assert.ok(seen[10].brisk, 'brisk while it plays');
  assert.deepStrictEqual([messages.flights.length, seen.at(-1).brisk], [0, false]);
});
