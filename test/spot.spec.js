// Hovering a bookmark lights its moth (src/scene/spot.ts): a halo round it, the other moths and their threads dimmed, all
// easing back once the row lets go. A bookmark with no moth or ghost on screen changes nothing. In spotlight the lantern's
// drawing and flame darken too.
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

test('in spotlight the lantern\'s drawing and flame darken while it\'s pointed at, and light again after', async () => {
  const { live, spot, play } = await load();
  spot.spotLook.style = 'spotlight';
  const layers = ['lanternBack', 'pagesInk', 'flame', 'lanternLayer'].map(id => document.getElementById(id));
  live.spot = 'api';
  play(1.5);
  for (const e of layers) assert.match(e.style.filter, /^brightness\(0\.[0-9]+\)$/, `${e.id} darkened`);
  live.spot = null;
  play(4);
  assert.deepStrictEqual(layers.map(e => e.style.filter), ['', '', '', ''], 'lit again, filter gone');
});
