// Fireflies: one per PR, swarming around their moth's home.

// ---- fireflies -----------------------------------------------------------------
// One per PR, keyed by its URL. The colour says what it needs; one that's no longer wanted (merged, say) drifts
// off into the dark and fades. Failing checks swell faster. Drafts are amber, and one waiting on review is sky blue.
const FLY = { ready: '#C8F48A', failing: '#FF9E8C', changes: '#FFAA6E', draft: '#FFD27A', review: '#E8F48A', mention: '#E8F48A', quiet: '#8CCBFF' };
// A firefly is light, drawn by the background shader (background.js) under the SVG scene: a white-hot core in a bloom
// of its colour, fading into a deeper, more saturated haze, adding up where glows cross. Each frame the fireflies and
// the stale wisps (stale.js) leave theirs in flyLights (x, y, radius, brightness, r, g, b apiece) for it to draw.
const FIREFLY_BLOOM = 50; // the bloom's radius, in scene units, at a swell's midpoint
const FLY_LIGHTS_MAX = 128, flyLights = new Float32Array(FLY_LIGHTS_MAX * 7);
let flyLightN = 0;
const addFlyLight = (x, y, r, glow, col) => { if (flyLightN < FLY_LIGHTS_MAX) flyLights.set([x, y, r, glow, ...hex(col).map(v => v / 255)], 7 * flyLightN++); };
// Always lit, easing a bit brighter over a second or two and back, on each firefly's own slow, uneven rhythm (two waves
// that never line up the same way twice); failing checks swell faster. 0 to 1, at `s` seconds.
const fireflySwell = (s, ph, rate = 1.1) => Math.max(0, 0.6 * Math.sin(s * rate * 0.9 + ph) + 0.4 * Math.sin(s * rate * 0.37 + ph * 2.3)) ** 2;
// The same light as a picture, for the badge flash's canvas (flash.js), which sits above everything and adds these on
// ('lighter'): the shader's falloff in background.js worked out once per colour, `size` px across. Keep the two in step.
function bloomSprite(col, size) {
  const c = document.createElement('canvas'), g = c.getContext('2d');
  c.width = c.height = size;
  const img = g.createImageData(size, size), v = hex(col).map(x => x / 255), m = Math.max(...v), deep = v.map(x => Math.min(1, Math.max(0, m - (m - x) * 1.8)));
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const d = Math.hypot((i + 0.5) / size - 0.5, (j + 0.5) / size - 0.5) * 2, edge = Math.max(0, 1 - d);
    const core = Math.exp(-d * d * 1500), peak = Math.exp(-d * d * 400), inner = Math.exp(-d * d * 60), wide = Math.exp(-d * d * 10), tail = edge * edge / (1 + d * d * 150);
    const white = Math.min(1, peak * 1.5);
    const light = v.map((x, k) => (x + (1 - x) * 0.85) * 1.6 * core + (x + (1 - x) * white) * (1.2 * peak + 0.7 * inner) + x * 0.5 * wide + deep[k] * 0.6 * tail);
    const a = Math.min(1, Math.max(...light)), o = 4 * (j * size + i);
    light.forEach((x, k) => img.data[o + k] = a ? Math.min(255, x / a * 255) : 0); img.data[o + 3] = a * 255; // the picture holds the light premultiplied
  }
  g.putImageData(img, 0, 0);
  return c;
}
const lanternFlies = new Map(); // reviews requested from me hang around the lantern itself
function swarm(flies, want, [cx, cy], [rMin, rMax], dt, s) {
  for (const [url, need] of want) if (!flies.has(url)) {
    const rand = seeded(hash(url)); // the same firefly path in every window
    const f = { a: rand() * 6.28, r: rMin + rand() * (rMax - rMin), w: (0.3 + rand() * 0.3) * (rand() < 0.5 ? -1 : 1), ph: rand() * 10 };
    flies.set(url, f);
  }
  for (const [url, f] of flies) {
    if (want.has(url)) { f.need = want.get(url); f.gone = undefined; } else f.gone ??= 0;
    if (f.gone !== undefined) {
      f.gone += dt / 2.5; f.r += 70 * dt;
      if (f.gone >= 1) { flies.delete(url); continue; }
    }
    f.a += f.w * dt;
    // the one a landed moth's thread is tied to (f.near) eases in to a small orbit near the cluster's middle, still moving
    f.k = (f.k ?? 1) + ((f.near ? 0.2 : 1) - (f.k ?? 1)) * Math.min(1, dt * 1.5);
    const x = f.x = cx + Math.cos(f.a) * f.r * f.k + Math.sin(s * 0.9 + f.ph) * 6, y = f.y = cy + Math.sin(f.a) * f.r * f.k * 0.7 + Math.cos(s * 1.3 + f.ph) * 5;
    const swell = fireflySwell(s, f.ph, f.need === 'failing' ? 2.6 : 1.1); // and the bloom widens as it swells
    addFlyLight(x, y, FIREFLY_BLOOM * (0.75 + 0.45 * swell), (0.6 + 0.4 * swell) * (1 - (f.gone || 0)), FLY[f.need] || FLY.quiet);
  }
}
