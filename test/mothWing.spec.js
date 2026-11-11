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

// landed on the lantern, a moth that needs you is still its swatch; idle and snoozed ones go plain (the pre-tint resting
// look: near-white, a touch of violet, backlit toward the dark indigo)
test('a landed moth that needs you keeps its tint; idle and snoozed ones go plain', async () => {
  const { layOut } = await import('./page.js'); layOut();
  const { mothColour } = await import('../src/scene/frame'), { mix, MOTH_IDLE, MOTH_CALL } = await import('../src/scene/lanterns');
  const wing = { normal: [0, 0, 1], depth: 0 }, svg = tag => document.createElementNS('http://www.w3.org/2000/svg', tag);
  const landed = session => {
    const m = { x: 0, y: 0, size: 1, g: svg('g'), back: svg('path'), front: svg('path'), session: { id, cwd: '/w', ...session }, cool: 0, fold: 1, wasLanded: true };
    for (let i = 0; i < 200; i++) mothColour(m, true, wing, wing, 1 / 60);
    return m.g.style.getPropertyValue('--wing');
  }, plain = cool => mix(mix(MOTH_IDLE, MOTH_CALL, cool), '#2B2440', 0.45);
  expect(landed({ state: 'waiting' })).toBe(tintFor({ id }));
  expect(landed({ state: 'idle' })).toBe(plain(0.15));
  expect(landed({ state: 'waiting', snoozed: true })).toBe(plain(0.5));
});
