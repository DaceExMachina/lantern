// Fireflies: one per PR, swarming around their moth's home.

// ---- fireflies -----------------------------------------------------------------
// One per PR, keyed by its URL. The colour says what it needs; one that's no longer wanted (merged, say) drifts
// off into the dark and fades. Failing checks blink faster. Drafts are amber, and one waiting on review is sky blue.
const FLY = { ready: '#C8F48A', failing: '#FF9E8C', changes: '#FFAA6E', draft: '#FFD27A', review: '#E8F48A', mention: '#E8F48A', quiet: '#8CCBFF' };
// A firefly's glow is three stacked circles (wide glow, halo, bright core); each frame gives them a spot and a
// [fill, opacity] apiece.
const fireflyGlow = () => [18, 8, 2.8].map(r => el('circle', { r }));
const paintGlow = (circles, x, y, look) => circles.forEach((c, i) => { put(c, 'cx', x.toFixed(1)); put(c, 'cy', y.toFixed(1)); put(c, 'fill', look[i][0]); put(c, 'opacity', look[i][1].toFixed(2)); });
const lanternFlies = new Map(); // reviews requested from me hang around the lantern itself
function swarm(flies, want, [cx, cy], [rMin, rMax], dt, s) {
  for (const [url, need] of want) if (!flies.has(url)) {
    const rand = seeded(hash(url)); // the same firefly path in every window
    const f = { a: rand() * 6.28, r: rMin + rand() * (rMax - rMin), w: (0.3 + rand() * 0.3) * (rand() < 0.5 ? -1 : 1), ph: rand() * 10, n: fireflyGlow() };
    $('flies').append(...f.n);
    flies.set(url, f);
  }
  for (const [url, f] of flies) {
    if (want.has(url)) { f.need = want.get(url); f.gone = undefined; } else f.gone ??= 0;
    if (f.gone !== undefined) {
      f.gone += dt / 2.5; f.r += 70 * dt;
      if (f.gone >= 1) { f.n.forEach(c => c.remove()); flies.delete(url); continue; }
    }
    f.a += f.w * dt;
    const x = f.x = cx + Math.cos(f.a) * f.r + Math.sin(s * 0.9 + f.ph) * 6, y = f.y = cy + Math.sin(f.a) * f.r * 0.7 + Math.cos(s * 1.3 + f.ph) * 5;
    const glow = (0.55 + 0.45 * Math.max(0, Math.sin(s * (f.need === 'failing' ? 2.6 : 1.1) + f.ph)) ** 4) * (1 - (f.gone || 0)); // fireflies blink
    const col = FLY[f.need] || FLY.quiet;
    const look = [[col, 0.16 * glow], [col, 0.6 * glow], [mix(col, '#FFFFFF', 0.6), Math.min(1, 0.7 + 0.3 * glow) * (1 - (f.gone || 0))]];
    paintGlow(f.n, x, y, look);
  }
}
