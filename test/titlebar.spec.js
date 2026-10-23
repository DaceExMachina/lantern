// The app window's drag strip takes every click on its top band (app/main.swift DragStrip, index.html's --titlebar), so
// nothing that flies goes up into it: moths, fireflies, ghosts and wisps are kept below src/scene/scene.ts's roof(). Outside
// the app (--titlebar 0) the roof is the window's top edge and nothing changes.
import assert from 'node:assert';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { swarm } from '../src/scene/fireflies';
import { mothMove } from '../src/scene/frame';
import { live } from '../src/scene/live';
import { VIEW, roof, titlebar } from '../src/scene/scene';
import { settle } from '../src/scene/stale';

const BAR = 28, saved = { ...VIEW };
// a window 500 x 400 scene units at 2 px a unit, laid out as fitView does, in the app
beforeAll(() => {
  document.body.classList.add('app');
  const px = 2; Object.assign(VIEW, { px, box: [-100, -50, 500, 400] });
  expect(titlebar()).toBe(BAR); // body.app sets it
});
afterAll(() => { Object.assign(VIEW, saved); document.body.classList.remove('app'); });

test('the roof is the strip\'s height below the window\'s top edge', () => {
  assert.strictEqual(roof(), VIEW.box[1] + BAR / VIEW.px);
});

test('a moth aimed up into the strip, and kept there for a long run, never goes above the roof', () => {
  const dt = 1 / 60, m = { x: 0, y: 0, phase: 0, size: 1 }; let top = Infinity;
  for (let i = 0; i < 60 * 60; i++) { // a minute, aimed at the very top edge and above
    mothMove(m, { tx: 0, ty: VIEW.box[1] - 40 + 30 * Math.sin(i / 50), ease: 2.4, needsMe: false }, dt, i * dt);
    top = Math.min(top, m.y);
  }
  assert.ok(top >= roof(), `highest y ${top}, roof ${roof()}`);
  assert.ok(m.y < roof() + 40, `and it did fly up to the roof: ${m.y}`);
});

test('a firefly circling a home at the top edge never goes above the roof', () => {
  const T0 = 1.8e12, want = new Map(Array.from({ length: 8 }, (_, i) => [`https://github.com/o/r/pull/${i}`, { need: 'draft', seen: 0, since: 0 }]));
  const flies = new Map(); let top = Infinity;
  for (let i = 0; i < 60 * 30; i++) {
    swarm(flies, want, [100, VIEW.box[1] + 5], [34, 55], 1 / 60, T0 + i * 1000 / 60);
    for (const f of flies.values()) top = Math.min(top, f.y);
  }
  assert.ok(flies.size === 8 && top >= roof(), `highest y ${top}, roof ${roof()}`);
});

test('outside the app the roof is the window\'s top edge', async () => {
  document.body.classList.remove('app');
  const { vi } = await import('vitest');
  vi.resetModules();
  const scene = await import('../src/scene/scene');
  Object.assign(scene.VIEW, { px: 2, box: [-100, -50, 500, 400] });
  assert.strictEqual(scene.roof(), -50);
  document.body.classList.add('app');
});
