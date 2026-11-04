// The scene's frame rate (src/scene/frame.ts frameDue): every frame the display shows while something moves fast (a moth's
// wings in flight, a firefly flying in or off: live.brisk), fps.calm the rest of the time.
import assert from 'node:assert';
import { afterEach, test, vi } from 'vitest';
import { layOut } from './page.js';

afterEach(() => vi.restoreAllMocks());

const load = async () => {
  layOut(); vi.resetModules();
  const [{ live }, state, frame, lanterns] = await Promise.all(['live', 'state', 'frame', 'lanterns'].map(f => import(`../src/scene/${f}.ts`)));
  lanterns.applyStyle('barrel');
  return { live, state, frame };
};
// how many of a second's display refreshes at `hz` draw a frame
const drawn = (frameDue, hz) => { let n = 0; for (let i = 0; i < hz; i++) if (frameDue(10000 + i * 1000 / hz)) n++; return n; };

test('calm, it draws every other refresh (30 fps); brisk, every one at 60 Hz and every other at 120 Hz', async () => {
  const { live, frame } = await load();
  assert.strictEqual(frame.fps.calm, 30);
  live.brisk = false;
  assert.strictEqual(drawn(frame.frameDue, 60), 30);
  assert.strictEqual(drawn(frame.frameDue, 120), 30);
  live.brisk = true;
  assert.strictEqual(drawn(frame.frameDue, 60), 60);
  assert.strictEqual(drawn(frame.frameDue, 120), 60);
});

test('a flying moth makes the frame brisk; once every moth has landed it is calm', async () => {
  const { live, state, frame } = await load();
  live.raw = [{ id: 'api', state: 'working', subagents: [] }, { id: 'blog', state: 'waiting', waitingSince: Date.now(), subagents: [] }];
  state.sync();
  let t = 1000;
  for (let i = 0; i < 60; i++) frame.frame(t += 1000 / 60);
  assert.strictEqual(live.moths.size, 2, 'two moths');
  assert.strictEqual(live.brisk, true, 'the working session\'s moth flies');
  live.raw = live.raw.map(s => ({ ...s, state: 'waiting', waitingSince: Date.now() }));
  state.sync();
  for (let i = 0; i < 600; i++) frame.frame(t += 1000 / 60); // ten seconds to land and fold
  assert.ok([...live.moths.values()].every(m => m.wasLanded && m.fold > 0.9), 'both have landed');
  assert.strictEqual(live.brisk, false);
});

test('a review firefly flying in makes the frame brisk, one already circling does not', async () => {
  const { live, frame } = await load();
  let t = 1000;
  live.reviews = [{ url: 'https://github.com/acme/app/pull/1', label: 'app#1', title: 'Old', need: 'waiting', seen: Date.now() - 60000 }];
  for (let i = 0; i < 10; i++) frame.frame(t += 1000 / 60);
  assert.strictEqual(live.brisk, false, 'circling for a minute');
  live.reviews = [...live.reviews, { url: 'https://github.com/acme/app/pull/2', label: 'app#2', title: 'New', need: 'waiting', seen: Date.now() }];
  frame.frame(t += 1000 / 60);
  assert.strictEqual(live.brisk, true, 'flying in');
});
