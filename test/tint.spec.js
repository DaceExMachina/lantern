// A session's tint (src/scene/lanterns.ts tintFor): the colour of its moth and of its swatches. It comes from the id alone, so it never
// changes, and sessions in one folder (most of a day's work) still spread over the whole colour wheel.
import { expect, test } from 'vitest';
import { hex, tintFor } from '../src/scene/lanterns';

const hueOf = c => { const [r, g, b] = hex(c).map(v => v / 255), mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  return Math.round((mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60); };
// the ids of a real day's sessions: five of the eight worked in one folder
const ids = ['c0223694-dbd3-47d3-99d4-c889a060f541', 'faed2829-e4d4-4424-af95-6132d8df5924', '6cf161fb-cbf1-48f9-a297-2fca57da4a44', '16f4be60-6a86-4906-8f17-618c85407e35',
  'b242ddbd-d292-4911-a09d-6d6b01147c2e', '870c63fb-cbd3-43fa-8f4b-0aeaf83bb2e1', '61917df1-4b2c-4e20-b413-cc6c479afa20', 'bc4ddf03-81b2-43ea-b810-210412d2a636'];

test('sessions in one folder spread over the wheel, pinks, reds and purples included', () => {
  const hues = ids.map(id => hueOf(tintFor({ id, cwd: '/Users/dace/momentum/extension' })));
  expect(new Set(hues).size, `hues ${hues}`).toBeGreaterThanOrEqual(6);
  expect(Math.max(...hues) - Math.min(...hues), `hues ${hues}`).toBeGreaterThanOrEqual(240);
  expect(hues.some(h => h >= 270 && h <= 340 || h <= 15), `a purple, pink or red in ${hues}`).toBe(true);
});

test('a tint is the same for a session wherever it runs', () => {
  expect(tintFor({ id: ids[0], cwd: '/a' })).toBe(tintFor({ id: ids[0], cwd: '/b' }));
});
