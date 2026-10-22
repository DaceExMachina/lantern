// A moth whose session ended flies off (src/scene/frame.ts mothTarget) and must stay drawn until every bit of it, wings
// included, is outside the window, whatever shape the window is.
import assert from 'node:assert';
import { test, vi } from 'vitest';
import { layOut } from './page.js';

// the page afresh, in a window `kx` times as wide and `ky` times as tall as the 600-unit square, laid out as fitView does
async function window(kx, ky) {
  layOut();
  vi.resetModules();
  const [frame, scene, lanterns, { live }] = await Promise.all(['frame', 'scene', 'lanterns', 'live'].map(f => import(`../src/scene/${f}.ts`)));
  Object.assign(scene.VIEW, { kx, ky, box: [340 - 300 * kx, 320 - 300 * ky, 600 * kx, 600 * ky] });
  lanterns.applyStyle('candle');
  return { box: scene.VIEW.box, reach: scene.WING_REACH, moths: live.moths, mothTarget: frame.mothTarget, mothMove: frame.mothMove };
}
// fly it until it is dropped; where it was on the last frame it was drawn (null if it never goes)
function exitOf(win, angle, flies) {
  const m = { key: 'gone', session: { state: 'working' }, home: [340 + Math.cos(angle) * 150, 320 + Math.sin(angle) * 150], phase: 1, size: 1.4,
    x: 340 + Math.cos(angle) * 150, y: 320 + Math.sin(angle) * 150, tilt: 0, leaving: true, cool: 0, g: { remove() {} }, flies };
  win.moths.set(m.key, m);
  let last = null;
  for (let s = 0; s < 120; s += 1 / 60) {
    const aim = win.mothTarget(m.key, m, 1 / 60, s);
    if (!aim) return { last, dropped: [m.x, m.y] };
    win.mothMove(m, aim, 1 / 60, s);
    last = [m.x, m.y];
  }
  return { last, dropped: null };
}

for (const [name, kx, ky] of [['wide', 3, 1], ['tall', 1, 3], ['square', 1, 1]]) {
  test(`a leaving moth stays drawn until it is wholly outside a ${name} window`, async () => {
    const win = await window(kx, ky), [bx, by, bw, bh] = win.box, pad = win.reach * 1.4;
    for (let i = 0; i < 24; i++) {
      const angle = i * Math.PI / 12, { dropped } = exitOf(win, angle);
      assert.ok(dropped, `angle ${i * 15}: it goes in the end`);
      const [x, y] = dropped;
      assert.ok(x < bx - pad + 1 || x > bx + bw + pad - 1 || y < by - pad + 1 || y > by + bh + pad - 1,
        `angle ${i * 15}: dropped at ${x.toFixed(0)},${y.toFixed(0)} with wings still inside ${bx},${by} ${bw}x${bh}`);
    }
  });
}

test('a leaving moth is kept while its fireflies are still drifting off', async () => {
  const win = await window(1, 1), { dropped, last } = exitOf(win, 0, new Map([['pr', {}]]));
  assert.strictEqual(dropped, null, 'still there while a firefly remains');
  assert.ok(last[0] > 640, `and far outside the window by now: ${last}`);
});
