// A fork (src/scene/state.ts heir, the session's `look` from the server) carries on its parent's moth: the same home, the same tint,
// and the moth itself, instead of the parent flying off and a stranger flying in. sync() runs for real, on the page's own markup.
import assert from 'node:assert';
import { afterEach, test, vi } from 'vitest';
import { layOut } from './page.js';

afterEach(() => vi.restoreAllMocks());

async function open() {
  layOut(); vi.resetModules();
  const [{ live }, state, lanterns] = await Promise.all(['live', 'state', 'lanterns'].map(f => import(`../src/scene/${f}.ts`)));
  const sync = sessions => { live.raw = sessions.map(s => ({ state: 'working', subagents: [], cwd: '/work/api', ...s })); state.sync(); };
  return { live, sync, tintFor: lanterns.tintFor };
}
const ids = ['blog', 'api', 'docs', 'infra', 'site', 'admin'];

test('a fork takes over its parent\'s moth, home included, and the parent\'s moth does not leave', async () => {
  const w = await open();
  w.sync(ids.map(id => ({ id })));
  const moth = w.live.moths.get('infra'), spot = moth.spot;
  w.sync(ids.map(id => id === 'infra' ? { id: 'infra-fork', look: 'infra' } : { id }));
  assert.strictEqual(w.live.moths.get('infra-fork'), moth, 'the same moth, now the fork\'s');
  assert.strictEqual(moth.key, 'infra-fork');
  assert.strictEqual(w.live.moths.has('infra'), false);
  assert.strictEqual(moth.leaving, false);
  assert.deepStrictEqual(moth.spot, spot, 'and it keeps the parent\'s place');
});

test('a fork with no moth to take over (its parent left earlier) still lands on the parent\'s home and wears its tint', async () => {
  const [before, after] = [await open(), await open()];
  before.sync(ids.map(id => ({ id })));
  after.sync(ids.map(id => id === 'docs' ? { id: 'late', look: 'docs' } : { id }));
  assert.deepStrictEqual(after.live.moths.get('late').spot, before.live.moths.get('docs').spot);
  assert.strictEqual(after.tintFor({ id: 'late', look: 'docs', cwd: '/work/api' }), before.tintFor({ id: 'docs', cwd: '/work/api' }));
  assert.notStrictEqual(after.tintFor({ id: 'late', cwd: '/work/api' }), before.tintFor({ id: 'docs', cwd: '/work/api' }), 'without its look it would not');
});

test('a fork whose parent is still in the snapshot gets a moth of its own', async () => {
  const w = await open();
  w.sync(ids.map(id => ({ id })));
  const parent = w.live.moths.get('site');
  w.sync([...ids.map(id => ({ id })), { id: 'site-fork', look: 'site' }]);
  assert.strictEqual(w.live.moths.get('site'), parent, 'the parent keeps its moth');
  assert.notStrictEqual(w.live.moths.get('site-fork'), parent);
  assert.strictEqual(w.live.moths.size, ids.length + 1);
});
