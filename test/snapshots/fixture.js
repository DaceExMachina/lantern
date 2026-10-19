// Injected at document start by scripts/snapshots.swift: a deterministic lantern. Math.random is seeded, the clock
// (performance.now, Date) only moves when frames are stepped, timers and animation frames never fire (the driver calls
// frame() and the session text's tick itself), and a fake EventSource plays a fixture covering every kind of moth,
// firefly, wisp and ghost. The harness calls __drive() until it returns 'done'; each other answer names a snapshot to take.
// The page's query picks the scene: style=<lantern>, ambient for the second screen's view, hover to snap a hover card.
(() => {
  let seed = 0x5eed;
  Math.random = () => { // mulberry32
    let t = seed = (seed + 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  let T = 1000;
  const BASE = Date.parse('2026-10-18T15:00:00Z'), RealDate = Date, realSetTimeout = setTimeout;
  let wall = BASE; // the wall clock at T = 0. A scorching lantern's scene moves it (catchScorch); the stale PRs' dates stay on BASE
  performance.now = () => T;
  window.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(wall + T); } static now() { return wall + T; } };
  window.requestAnimationFrame = () => 0;
  window.setInterval = () => 0;
  window.setTimeout = () => 0;
  const errs = [];
  addEventListener('error', e => errs.push(`${e.message} @${(e.filename || '').split('/').pop()}:${e.lineno}`));
  // the WebGL background keeps its last frame, so a snapshot sees what frame() drew
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, opts) { return getContext.call(this, type, type === 'webgl' ? { ...opts, preserveDrawingBuffer: true } : opts); };
  let es;
  window.EventSource = class { constructor() { es = this; this.l = {}; } addEventListener(t, f) { (this.l[t] ||= []).push(f); } };
  const emit = (type, data) => { const e = { data: JSON.stringify(data) }; if (type === 'message') es.onmessage(e); else (es.l[type] || []).forEach(f => f(e)); };
  window.fetch = () => Promise.resolve(new Response('{}'));
  addEventListener('DOMContentLoaded', () => {
    const st = document.createElement('style');
    st.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
    document.head.append(st);
  });

  // ---- the fixture -----------------------------------------------------------
  const MIN = 60000, Q = new URLSearchParams(location.search);
  const pr = (n, need) => ({ url: `https://github.com/acme/app/pull/${n}`, need, label: `app#${n}`, title: `PR ${n}: ${need} change` });
  const words = i => [`The lantern hangs over the desk and every session is a moth around it, number ${i}.`,
    'When one of them needs an answer it lands on the paper and waits there quietly until somebody looks.'];
  // phase 0 at the start, phase 1 later: a PR merged, a snooze made permanent, an idle session gone
  const sessionsAt = phase => {
    const now = Date.now();
    const s = (id, o) => ({ id, cwd: `/Users/x/projects/${id.split('-')[1]}`, title: id, started: now - 50 * MIN, last: now - 30000, subagents: [], ...o });
    return [
      s('sess-alpha', { state: 'working', activity: 'Editing frame.js', prompt: 'Split frame into steps', ticks: phase ? 7 : 3, prose: words(1),
        subagents: [{ id: 'a1', type: 'opus-supervisor', description: 'Supervisor', activity: 'Reading' }, { id: 'a2', type: 'Explore', description: 'Search' }],
        github: [pr(1, 'ready'), pr(2, 'failing'), pr(3, 'changes'), pr(4, 'draft'), pr(5, 'waiting')] }),
      s('sess-bravo', { state: 'waiting', waitingSince: now - 20 * MIN, note: 'Needs approval', prose: words(2), // waited 15+ min: restless, hops
        github: phase ? [pr(6, 'ready')] : [pr(6, 'ready'), pr(7, 'changes')], forYou: { you: ['Merge ', { label: 'app#6', url: pr(6).url }], prs: [], questions: ['q'] } }),
      s('sess-charlie', { state: 'waiting', snoozed: true, forGood: !!phase, waitingSince: now - 3 * MIN, subagents: [{ id: 'c1', type: 'Explore', description: 'Agent' }] }),
      s('sess-delta', { state: 'working', parent: 'sess-alpha', activity: 'Side work' }), // a satellite
      s('sess-golf', { state: 'waiting', parent: 'sess-bravo', waitingSince: now - 2 * MIN }), // a satellite waiting: paused
      ...(phase ? [] : [s('sess-echo', { state: 'idle', created: [pr(8).url], forYou: { you: [{ label: 'app#8', url: pr(8).url }] } })]),
      s('sess-foxtrot', { state: 'waiting', error: 'API Error', waitingSince: now - MIN }),
    ];
  };
  // stale PRs: every colour, some made by old sessions (ghost moths), the rest loose wisps
  const owners = [0, 1, 2].map(i => ({ id: `old-${i}`, title: `Old session ${i}`, cwd: `/Users/x/projects/old${i}`, last: Date.now() - (10 + i) * 864e5 }));
  const needs = ['ready', 'failing', 'changes', 'draft', 'waiting'];
  const stale = drop => Array.from({ length: 34 }, (_, i) => ({ ...pr(100 + i, needs[i % 5]), updatedAt: new RealDate(BASE - (8 + i) * 864e5).toISOString(),
    owner: i % 4 === 0 ? owners[i % 3] : undefined })).filter((_, i) => !drop || i !== 33);

  // frames at 60 a second, with the session text's 250ms timer ticking between them
  const run = secs => () => { for (let i = Math.round(secs * 60); i--;) { const was = Math.floor(T / 250); T += 1000 / 60; frame(T); if (Math.floor(T / 250) !== was) tickPages(); } };
  // the session text is encoded and decoded off the clock: let the last picture land, draw the current one, let it land
  const settle = async () => { while (busy) await new Promise(r => realSetTimeout(r, 10)); };
  const snap = name => async () => { await settle(); tickPages(); await settle(); await new Promise(r => realSetTimeout(r, 50)); return name; };
  // On a lantern that scorches, move the wall clock (and nothing else) so sess-alpha's next scorch, found with the page's
  // own schedule, starts the hit plus 0.5s before the last picture, so it shows the puff, the sparks and the first smoke.
  // On one whose flame smokes too (style.shine), the next such scorch with the flame's smoke 2 to 3.5s into its curl then.
  const LAST = 21000;
  const catchScorch = () => {
    const st = STYLES[Q.get('style')];
    if (!st?.scorches) return;
    const u = wall + LAST - (SCORCH.hit + 0.5) * 1000, slots = st.shine ? 400 : 2;
    for (let d = 0; d <= slots * SCORCH.slot * 1000; d += 1000) {
      const e = scorchClock('sess-alpha', u + d), start = e && u + d - e.t * 1000;
      if (!e || start < u) continue;
      const smoke = st.shine && scorchClock('candle:smoke', start + (SCORCH.hit + 0.5) * 1000, SMOKE);
      if (!st.shine || smoke && smoke.t > 2 && smoke.t < 3.5) { wall += start - u; return; }
    }
    errs.push(`no scorch for sess-alpha within ${slots} slots`);
  };
  const steps = [
    () => {
      catchScorch();
      emit('settings', { style: Q.get('style') || 'barrel', lanternText: 'sessions', stale: true, github: true, quietUntil: 0, goals: {}, recapSeen: '9999-12-31' });
      emit('reviews', [{ url: 'https://github.com/acme/app/pull/90', label: 'app#90', title: 'Review me' }, { url: 'https://github.com/acme/app/pull/91', label: 'app#91', title: 'Me too' }]);
      emit('stale', stale(false));
      emit('prose', words(3));
      emit('message', sessionsAt(0));
    },
    run(6),
    ...(Q.has('hover') ? [() => { enterZone(moths.get('sess-bravo').zone); }, snap('hover'), () => { hideCard(); }] : []),
    () => { emit('message', sessionsAt(1)); emit('stale', stale(true)); },
    run(14), snap('t20'), // T = LAST
  ];
  window.__drive = async () => {
    while (steps.length && !errs.length) { const r = await steps.shift()(); if (r && !errs.length) return r; }
    return errs.length ? 'error: ' + errs.join(' | ') : 'done';
  };
})();
