// Injected at document start by scripts/snapshots.swift: a deterministic lantern. Math.random is seeded, the clock
// (performance.now, Date) only moves when frames are stepped, timers and animation frames never fire (the driver calls
// frame() and the session text's tick itself), and a fake EventSource plays a fixture covering every kind of moth,
// firefly, wisp and ghost. The harness calls __drive() until it returns 'done'; each other answer names a snapshot to take.
// The page's query picks the scene: style=<lantern>, ambient for the second screen's view, hover to snap a hover card,
// chrome to snap the menu, stats, recap, a card and the dev panel instead of the later scene (with /stats from statsLog).
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
  window.fetch = url => Promise.resolve(new Response(String(url).endsWith('/stats') ? JSON.stringify(statsLog()) : '{}'));
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

  // frames at 60 a second, with the session text's 250ms timer ticking between them; LAST adds up the runs in the steps
  // below, so it ends as T at the last picture
  let LAST = T;
  const run = secs => {
    LAST += secs * 1000;
    return () => { for (let i = Math.round(secs * 60); i--;) { const was = Math.floor(T / 250); T += 1000 / 60; frame(T); if (Math.floor(T / 250) !== was) tickPages(); } };
  };
  // the session text is encoded and decoded off the clock: let the last picture land, draw the current one, let it land
  const settle = async () => { while (busy) await new Promise(r => realSetTimeout(r, 10)); };
  const snap = name => async () => { await settle(); tickPages(); await settle(); await new Promise(r => realSetTimeout(r, 50)); return name; };
  // On a lantern that scorches, move the wall clock (and nothing else) so sess-alpha's next scorch, found with the page's
  // own schedule, starts the hit plus 0.5s before the last picture, so it shows the sparks and the singe's first smoke.
  // On one whose flame smokes too (style.shine), the next such scorch with the flame's idle plume 2 to 3.5s in then.
  const catchScorch = () => {
    const st = STYLES[Q.get('style')];
    if (!st?.scorches) return;
    const u = wall + LAST - (SCORCH.hit + 0.5) * 1000, slots = st.shine ? 400 : 2;
    for (let d = 0; d <= slots * SCORCH.slot * 1000; d += 1000) {
      const e = scorchClock('sess-alpha', u + d), start = e && u + d - e.t * 1000;
      if (!e || start < u) continue;
      const smoke = st.shine && smokeAt(start + (SCORCH.hit + 0.5) * 1000, 0); // one the flame lets go however it burns
      if (!st.shine || smoke && smoke.t > 2 && smoke.t < 3.5) { wall += start - u; return; }
    }
    errs.push(`no scorch for sess-alpha within ${slots} slots`);
  };
  // GET /stats for the chrome scenes: today and the week before, each with four sessions that work, wait, snooze, sleep
  // and idle, the lantern violet and quiet for a while, a couple of PRs and badges
  const statsLog = () => {
    const H = 3600000, now = Date.now(), days = [], spans = [], gauges = [], prs = [];
    for (let i = 7; i >= 0; i--) {
      const start = now - 10 * H - i * 864e5, end = now - i * 864e5, at = h => start + h * H, id = n => `day${i}-${n}`;
      days.push({ start, end, warmMoths: 58 + 4 * i, warmLantern: 66 + 3 * i, medianWait: (3 + i) * MIN, slowWait: (20 + i) * MIN, waits: 9 + i,
        snoozedMs: 30 * MIN, sleepingMs: H, merged: i % 4, open: 5, stale: 12 + i, staleChange: i % 3 - 1, mothMs: 18 * H });
      spans.push(['server', start, end], ['violet', at(2), at(3)], ['quiet', at(8), at(9)]);
      [['alpha', 0, 10], ['bravo', 1, 9], ['charlie', 3.5, 8], ['delta', 6, 7.5]].forEach(([n, b, e]) =>
        spans.push(['alive', at(b), at(e), false, id(n), `Session ${n}`, `/Users/x/projects/${n}`]));
      spans.push(['waiting', at(2), at(3), null, id('bravo')], ['waiting', at(4), at(5), null, id('charlie')], ['snoozed', at(4), at(5), null, id('charlie')],
        ['waiting', at(6), at(7), null, id('bravo')], ['sleeping', at(6), at(7), null, id('bravo')]);
      prs.push([at(5), id('alpha'), 'https://github.com/acme/app/pull/1', 'merged', 'ready', 'PR 1: ready change'], [at(7), id('charlie'), 'https://github.com/acme/app/pull/3', null, 'changes', 'PR 3: changes change']);
      for (let t = start; t < end; t += 5 * MIN) gauges.push([t, 4, 2, 1, 0]);
    }
    const today = dayKey(now), before = dayKey(now - 864e5);
    return { days, spans, gauges, prs, tally: { warm_all_day: [3, today], revived: [1, before] }, achievements: [['revived', before], ['warm_all_day', today]], streak: 3, warmGoal: 70 };
  };
  // the chrome scenes: each panel opened over the barrel in turn, then closed (a function, as run() adds to LAST)
  const chrome = () => [
    () => { $('menu').showPopover(); $('help').open = true; }, snap('menu'), () => { $('menu').hidePopover(); },
    async () => { $('stats').showPopover(); await loadStats(); }, snap('stats'), () => { $('stats').hidePopover(); },
    async () => { await openRecap(6); }, snap('recap'), () => { $('recap').hidePopover(); },
    () => { enterZone(moths.get('sess-alpha').zone); }, run(0.1), snap('card'), () => { hideCard(); },
    () => { toggleDevPanel(); }, snap('dev'),
  ];
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
    ...(Q.has('chrome') ? chrome() : []),
    ...(Q.has('hover') ? [() => { enterZone(moths.get('sess-bravo').zone); }, snap('hover'), () => { hideCard(); }] : []),
    ...(Q.has('chrome') ? [] : [
      () => { emit('message', sessionsAt(1)); emit('stale', stale(true)); },
      run(14), snap('t20'), // T = LAST
    ]),
  ];
  window.__drive = async () => {
    while (steps.length && !errs.length) { const r = await steps.shift()(); if (r && !errs.length) return r; }
    return errs.length ? 'error: ' + errs.join(' | ') : 'done';
  };
})();
