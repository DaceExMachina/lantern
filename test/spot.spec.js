// Hovering a bookmark lights its moth (src/scene/spot.ts): the flame turned down with the light and paper, the other moths
// dulled toward grey and faded as a whole, their threads faded, every other light that flies at half, all easing back once
// the row lets go. A bookmark with no moth or ghost on screen changes nothing.
import assert from 'node:assert';
import { afterEach, test, vi } from 'vitest';
import { layOut } from './page.js';

afterEach(() => vi.restoreAllMocks());

const load = async (o = {}) => {
  layOut(); vi.resetModules();
  const [{ live }, state, frame, lanterns, spot, fireflies] = await Promise.all(['live', 'state', 'frame', 'lanterns', 'spot', 'fireflies'].map(f => import(`../src/scene/${f}.ts`)));
  lanterns.applyStyle('barrel');
  live.raw = [{ id: 'api', state: 'working', subagents: [], ...o.api }, { id: 'blog', state: 'working', subagents: [], ...o.blog }];
  live.reviews = o.reviews ?? [];
  state.sync();
  let t = performance.now(); // the frame's clock starts there; from 0 the first frame's dt would be negative, and a slow worker sends the moth off to millions
  const play = seconds => { for (let i = 0; i < seconds * 60; i++) frame.frame(t += 1000 / 60); };
  play(2);
  return { live, spot, play, fireflies };
};
// a moth's opacity (its wings' group, so one wing never shows through the other) and its thread's, as drawn
const look = (live, id) => { const m = live.moths.get(id); return { wings: Number(m.back.parentElement.getAttribute('opacity')), thread: Number(m.thread.getAttribute('stroke-opacity')) }; };
// how colourful a wing is: its channels' spread (a grey has none)
const spread = path => { const v = (path.style.fill.match(/\d+/g) ?? []).slice(0, 3).map(Number), h = path.style.fill.startsWith('#') ? [1, 3, 5].map(i => parseInt(path.style.fill.slice(i, i + 2), 16)) : v; return Math.max(...h) - Math.min(...h); };

test('pointing at a bookmark lights its moth and dims the others and their threads; letting go puts them back', async () => {
  const { live, play } = await load();
  assert.deepStrictEqual(look(live, 'blog'), { wings: 1, thread: 1 }, 'nothing dimmed before');
  const blog = live.moths.get('blog'), colourful = spread(blog.back);
  live.spot = 'api';
  play(1.5);
  assert.deepStrictEqual(look(live, 'api'), { wings: 1, thread: 1 }, 'the one pointed at stays as it is');
  const dimmed = look(live, 'blog');
  assert.ok(dimmed.wings < 0.7 && dimmed.wings > 0 && dimmed.thread < 0.7, `the other fades as a whole: ${JSON.stringify(dimmed)}`);
  assert.deepStrictEqual([blog.back, blog.front].map(p => p.getAttribute('fill-opacity')), [null, null], 'not wing by wing');
  assert.ok(spread(blog.back) < colourful * 0.6, `and dulls toward grey: ${colourful} to ${spread(blog.back)}`);
  live.spot = null;
  play(2);
  assert.deepStrictEqual(look(live, 'blog'), { wings: 1, thread: 1 }, 'and comes back');
});

test('a bookmark whose session has no moth or ghost on screen dims nothing', async () => {
  const { live, play } = await load();
  live.spot = 'ended-long-ago';
  play(1.5);
  assert.deepStrictEqual([look(live, 'api'), look(live, 'blog')], [{ wings: 1, thread: 1 }, { wings: 1, thread: 1 }]);
});

test('pointing at a bookmark can turn the flame right down, below the idle ember, the paper and light with it, then back up', async () => {
  const { live, spot, play } = await load();
  spot.spotLook.flame = 0.06; // near the slider's low end (its default is the ember, 0.3), so the paper goes dark
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

// Every other light that flies drops to a third: the other moth's fireflies and the review fireflies round the lamp, while the
// one pointed at keeps its own. Told apart by colour (each PR need has its own), with the clock held so nothing swells.
test('pointing at a bookmark drops every other light that flies to a third, and leaves its own fireflies full', async () => {
  const pr = (n, need) => ({ url: `https://github.com/o/r/pull/${n}`, label: `#${n}`, title: null, need });
  const { live, play, fireflies } = await load({ api: { github: [pr(1, 'ready')] }, blog: { github: [pr(2, 'failing')] }, reviews: [pr(3, 'draft')] });
  play(6); // flown in
  vi.spyOn(Date, 'now').mockReturnValue(Date.now()); // nothing swells from here
  const glow = () => { // one frame's lights (the page's stand-in for WebGL never draws them, so nothing clears them between frames)
    live.flyLightN = 0; play(1 / 60);
    const by = {};
    for (let i = 0; i < live.flyLightN; i++) {
      const [g, r, gr, b] = [3, 4, 5, 6].map(k => fireflies.flyLights[7 * i + k]);
      if (g <= 0) continue; // a bloom (haze), not a firefly
      const col = '#' + [r, gr, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
      by[col] = (by[col] ?? 0) + g;
    }
    return by;
  };
  const before = glow();
  live.spot = 'api';
  play(2);
  const after = glow(), { ready, failing, draft } = fireflies.FLY, k = c => after[c] / before[c];
  assert.ok(Math.abs(k(ready) - 1) < 0.02, `its own stay full: ${k(ready)}`);
  assert.ok(Math.abs(k(failing) - 0.33) < 0.02, `the other moth's drop to a third: ${k(failing)}`);
  assert.ok(Math.abs(k(draft) - 0.33) < 0.02, `and the lamp's: ${k(draft)}`);
});

// The bloom is in the colour the moth shows, here a snoozed moth's that waits (part violet, part plain), not its own tint.
test('the bloom round the one pointed at takes the colour it shows, a snoozed one\'s included, centred where its wings meet', async () => {
  const { live, spot, play } = await load({ api: { state: 'waiting', snoozed: true } });
  live.spot = 'api';
  play(1.5);
  live.flyLightN = 0; play(1 / 60);
  const m = live.moths.get('api'), shown = m.g.style.getPropertyValue('--wing');
  const hazes = [];
  const { flyLights } = await import('../src/scene/fireflies.ts');
  let at = null;
  for (let i = 0; i < live.flyLightN; i++) if (flyLights[7 * i + 3] < 0) { hazes.push('#' + [4, 5, 6].map(k => Math.round(flyLights[7 * i + k] * 255).toString(16).padStart(2, '0')).join('')); at = [flyLights[7 * i], flyLights[7 * i + 1]]; }
  assert.deepStrictEqual(hazes, [spot.bloomColour(shown).toLowerCase()], 'one bloom, from the colour it shows');
  // centred where its wings meet: their hinge, (-2, -6) on the moth, scaled and turned with it
  const t = (m.tilt ?? 0) * Math.PI / 180, hinge = [m.x + m.size * (-2 * Math.cos(t) + 6 * Math.sin(t)), m.y + m.size * (-2 * Math.sin(t) - 6 * Math.cos(t))];
  assert.ok(Math.hypot(at[0] - hinge[0], at[1] - hinge[1]) < 0.01, `at the wings' hinge: ${at} for ${hinge}`);
  assert.notStrictEqual(hazes[0], spot.bloomColour(m.tint).toLowerCase(), 'which a snoozed one\'s isn\'t its own tint');
});
