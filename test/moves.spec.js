// The scene never moves an element that is already in the page. WebKit (Safari 26) keeps the old renderer of an element
// moved within the page until the element's parent goes, so one moved every frame leaks for as long as it lives: a flying
// moth reordered its wings on every beat by moving the nearer one to the end of its group.
// The scene's frames run for real here on the page's own markup, with working sessions' moths flying.
import assert from 'node:assert';
import { afterEach, test, vi } from 'vitest';
import { layOut } from './page.js';

afterEach(() => vi.restoreAllMocks());

test('flying moths\' frames add and remove elements but never move one', async () => {
  layOut(); vi.resetModules();
  const [{ live }, state, frame, lanterns] = await Promise.all(['live', 'state', 'frame', 'lanterns'].map(f => import(`../src/scene/${f}.ts`)));
  lanterns.applyStyle('barrel');
  live.raw = ['api', 'blog', 'docs'].map(id => ({ id, state: 'working', subagents: [] }));
  state.sync();
  let t = 1000;
  frame.frame(t); // the first frame lays everything out
  const seen = new MutationObserver(() => {});
  seen.observe(document, { childList: true, subtree: true });
  const moved = new Set(), beats = new Map();
  for (let i = 0; i < 600; i++) { // ten seconds of flight
    frame.frame(t += 1000 / 60);
    // a move is a removal and an addition of the same node, still in the page afterwards
    const records = seen.takeRecords(), removed = new Set(records.flatMap(r => [...r.removedNodes]));
    for (const r of records) for (const n of r.addedNodes) if (removed.has(n) && n.isConnected) moved.add(n);
    for (const m of live.moths.values()) beats.set(m.key, (beats.get(m.key) ?? new Set()).add(m.front.getAttribute('d')));
  }
  assert.strictEqual(live.moths.size, 3, 'three moths');
  for (const [key, shapes] of beats) assert.ok(shapes.size > 100, `${key}'s wings beat: ${shapes.size} shapes`);
  assert.strictEqual(moved.size, 0, `moved: ${[...moved].map(n => n.nodeName).join(', ')}`);
});
