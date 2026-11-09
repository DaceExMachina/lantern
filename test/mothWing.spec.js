// A flying moth's wings are its session's colour (src/scene/frame.ts mothColour), so it matches its swatch in the usage dropdown and on its cards.
import { expect, test } from 'vitest';
import { tintFor } from '../src/scene/lanterns';

const id = '16f4be60-6a86-4906-8f17-618c85407e35';

// the moth's wings are its swatch: a working moth away from the lantern shows its tint, undimmed and unmixed
test('a flying moth is its session\'s colour', async () => {
  const { layOut } = await import('./page.js'); layOut();
  const { mothColour } = await import('../src/scene/frame'), { mix, MOTH_IDLE } = await import('../src/scene/lanterns');
  const session = { id: id, cwd: '/w', state: 'working' }, wing = { normal: [0, 0, 1], depth: 0 };
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g'), path = () => document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const m = { x: 0, y: 0, size: 1, g, back: path(), front: path(), session, cool: 0, tint: undefined };
  mothColour(m, false, wing, wing, 1 / 60);
  expect(g.style.getPropertyValue('--wing')).toBe(tintFor(session));
  expect(g.style.getPropertyValue('--wing')).not.toBe(mix(MOTH_IDLE, tintFor(session), 0.45));
});

// landed on the lantern, an idle session's moth is still its swatch with no edge; one that needs you is violet,
// darker toward a neutral, with an edge in its own tint
test('a landed idle moth is its tint, and one that needs you is violet with a tint edge', async () => {
  const { layOut } = await import('./page.js'); layOut();
  const { mothColour } = await import('../src/scene/frame'), { mix, MOTH_CALL } = await import('../src/scene/lanterns');
  const wing = { normal: [0, 0, 1], depth: 0 }, svg = tag => document.createElementNS('http://www.w3.org/2000/svg', tag);
  const landed = state => {
    const session = { id, cwd: '/w', state }, m = { x: 0, y: 0, size: 1, g: svg('g'), back: svg('path'), front: svg('path'), session, cool: 0, fold: 1, wasLanded: true };
    for (let i = 0; i < 200; i++) mothColour(m, true, wing, wing, 1 / 60);
    return m.g.style;
  };
  const idle = landed('idle'), calling = landed('waiting'), tint = tintFor({ id, cwd: '/w', state: 'idle' });
  expect(idle.getPropertyValue('--wing')).toBe(tint);
  expect(idle.getPropertyValue('--edge-width')).toBe('0.00');
  expect(calling.getPropertyValue('--wing')).toBe(mix(MOTH_CALL, '#2A2A2A', 0.45));
  expect(calling.getPropertyValue('--edge')).toBe(tint);
  expect(calling.getPropertyValue('--edge-width')).toBe('1.20');
});
