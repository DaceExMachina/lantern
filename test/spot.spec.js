// Hovering a bookmark lights its moth (src/scene/spot.ts): the flame turned right down with the light and paper, the other
// moths and their threads dimmed, all easing back once the row lets go. A bookmark with no moth or ghost on screen changes nothing.
import assert from 'node:assert';
import { afterEach, test, vi } from 'vitest';
import { layOut } from './page.js';

afterEach(() => vi.restoreAllMocks());

const load = async () => {
  layOut(); vi.resetModules();
  const [{ live }, state, frame, lanterns, spot] = await Promise.all(['live', 'state', 'frame', 'lanterns', 'spot'].map(f => import(`../src/scene/${f}.ts`)));
  lanterns.applyStyle('barrel');
  live.raw = [{ id: 'api', state: 'working', subagents: [] }, { id: 'blog', state: 'working', subagents: [] }];
  state.sync();
  let t = 0;
  const play = seconds => { for (let i = 0; i < seconds * 60; i++) frame.frame(t += 1000 / 60); };
  play(2);
  return { live, spot, play };
};
// a moth's wings' and thread's opacity, as drawn
const look = (live, id) => { const m = live.moths.get(id); return { wings: [m.back, m.front].map(p => Number(p.getAttribute('fill-opacity'))), thread: Number(m.thread.getAttribute('stroke-opacity')) }; };

test('pointing at a bookmark lights its moth and dims the others and their threads; letting go puts them back', async () => {
  const { live, play } = await load();
  assert.deepStrictEqual(look(live, 'blog'), { wings: [1, 1], thread: 1 }, 'nothing dimmed before');
  live.spot = 'api';
  play(1.5);
  assert.deepStrictEqual(look(live, 'api'), { wings: [1, 1], thread: 1 }, 'the one pointed at stays as it is');
  const dimmed = look(live, 'blog');
  assert.ok(dimmed.wings.every(o => o < 0.5) && dimmed.thread < 0.5, `the other fades: ${JSON.stringify(dimmed)}`);
  live.spot = null;
  play(2);
  assert.deepStrictEqual(look(live, 'blog'), { wings: [1, 1], thread: 1 }, 'and comes back');
});

test('a bookmark whose session has no moth or ghost on screen dims nothing', async () => {
  const { live, play } = await load();
  live.spot = 'ended-long-ago';
  play(1.5);
  assert.deepStrictEqual([look(live, 'api'), look(live, 'blog')], [{ wings: [1, 1], thread: 1 }, { wings: [1, 1], thread: 1 }]);
});

test('pointing at a bookmark turns the flame right down, below the idle ember, the paper and light with it, then back up', async () => {
  const { live, spot, play } = await load();
  const paper = () => ({ glow: Number(document.getElementById('paperGlow').getAttribute('opacity')), tint: document.getElementById('paperTint').getAttribute('fill') });
  const before = paper();
  live.spot = 'api';
  play(1.5);
  const down = paper();
  // the idle ember's paper glow is (0.3 + 0.7 * 0.3) * flick * pulse, about 0.5; turned down it's well under that
  assert.ok(down.glow < 0.1 && down.glow < before.glow / 5, `the paper's glow drops below the ember's: ${before.glow} to ${down.glow}`);
  assert.notStrictEqual(down.tint, before.tint, 'and the paper goes dark');
  live.spot = null;
  play(4);
  assert.ok(Math.abs(paper().glow - before.glow) < 0.15 && paper().tint === before.tint, `and back up: ${JSON.stringify(paper())} after ${JSON.stringify(before)}`);
  assert.strictEqual(spot.turnDown(0.7).by, 1, 'nothing turned down once it has let go');
});
