// Injected at document start by scripts/snapshots.swift: a deterministic lantern. Math.random is seeded, the clock
// (performance.now, Date) only moves when frames are stepped, timers and animation frames never fire (the driver calls
// frame() and the session text's tick itself), and a fake EventSource plays a fixture covering every kind of moth,
// firefly, wisp and ghost. The harness calls __drive() until it returns 'done'; each other answer names a snapshot to take.
// The page's query picks the scene: style=<lantern>, ambient for the second screen's view, hover to snap a hover card,
// chrome to snap the menu, stats, recap, a card and the dev panel instead of the later scene (with /stats from statsLog),
// pinned to dock sess-alpha and sess-bravo in the sidebar and check the scene refitted beside it. morph runs
// test/morph.test.js's checks instead of taking pictures: its steps answer with the mouse events to send (test/morph/main.swift).
// sway, with screensaver, swings the lantern to the end of its swing and checks the page doesn't scroll (test/morph.test.js too).
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
    () => { $('menu').showPopover(); $('help').open = true; }, snap('menu'),
    () => { github = { accounts: [], signIn: { url: 'https://github.com/login/device', code: 'WDJB-MJHT' } }; renderGitHub(); }, snap('menu-github'), () => { $('menu').hidePopover(); },
    async () => { $('stats').showPopover(); await loadStats(); }, snap('stats'), () => { $('stats').hidePopover(); },
    async () => { await openRecap(6); }, snap('recap'), () => { $('recap').hidePopover(); },
    () => { enterZone(moths.get('sess-alpha').zone); }, run(0.1), snap('card'), () => { hideCard(); },
    () => { toggleDevPanel(); }, snap('dev'),
  ];
  // Hit areas fill their zones (CONTRIBUTING.md, "Button bars"): the PR toggle's is the rest of its header row (its top
  // and bottom right corners and just left of its icon), and each corner of the header's buttons, an agent row and a PR
  // row lands on that control, the header's out to the card's own corners.
  const hits = () => {
    const card = $('card'), row = card.querySelector('.phead').getBoundingClientRect(), tog = card.querySelector('.tog'), icon = tog.querySelector('svg').getBoundingClientRect();
    const probe = (el, what, points) => { for (const [where, x, y] of points) if (document.elementFromPoint(x, y)?.closest('a, button') !== el) errs.push(`${what}'s hit area misses its ${where}`); };
    probe(tog, 'the PR toggle', [['row\'s top-right corner', row.right - 1, row.top + 1], ['row\'s bottom-right corner', row.right - 1, row.bottom - 1], ['left of its icon', icon.left - 4, icon.top + icon.height / 2]]);
    const c = card.getBoundingClientRect();
    probe(card.querySelector('h3 .open'), 'the header\'s open button', [['card\'s top-left corner', c.left + 3, c.top + 3]]);
    probe(card.querySelector('h3 .chip'), 'the status pill', [['card\'s top-right corner', c.right - 3, c.top + 3]]);
    // a row's zone runs out to the edges of the band or tray it sits in, and the gap below it is half its own
    for (const [sel, what] of [['.agent', 'an agent row'], ['a.pr2', 'a PR row']]) {
      const el = card.querySelector(sel), face = el.querySelector('.face').getBoundingClientRect(), edge = el.closest('.tray').getBoundingClientRect();
      probe(el, what, [['tray\'s left edge', edge.left + 1, face.top + 2], ['tray\'s right edge', edge.right - 1, face.top + 2]]);
    }
    const [one, two] = [...card.querySelectorAll('a.pr2 .face')].map(f => f.getBoundingClientRect()), between = document.elementFromPoint(one.left + 10, (one.bottom + two.top) / 2);
    if (!between?.closest('a.pr2')) errs.push('the gap between two PR rows belongs to neither');
  };
  // With the sidebar docked, the scene has the rest of the window, and fitView has followed it (each frame,
  // since the window itself didn't resize): the viewBox has the scene's shape, the background canvas its size, and a
  // moth's hover area is where its moth is drawn.
  const refitted = () => {
    const svg = document.querySelector('svg'), r = svg.getBoundingClientRect(), dock = $('dock').getBoundingClientRect();
    const [, , w, h] = svg.getAttribute('viewBox').split(' ').map(Number), zone = moths.get('sess-bravo').zone;
    const at = new DOMPoint(zone.x, zone.y).matrixTransform(svg.getScreenCTM());
    if (Math.round(dock.width) !== 380 || Math.round(r.right) !== innerWidth - 380) errs.push(`the dock is ${dock.width} wide and the scene ends at ${r.right}`);
    if (Math.abs(w / h - r.width / r.height) > 1e-3) errs.push(`the viewBox is ${w}x${h} in a ${r.width}x${r.height} scene: not refitted`);
    if (Math.abs($('bg').width - r.width * devicePixelRatio * bgScale) > 1) errs.push(`the background is ${$('bg').width} px wide for a ${r.width} scene`);
    if (at.x > r.right || zoneAtPoint({ clientX: at.x, clientY: at.y }) !== zone) errs.push(`sess-bravo's hover area at ${at.x}, ${at.y} isn't its own`);
    // each section's pin owns the rest of its header: its top-right corner and just right of the pill
    for (const h3 of document.querySelectorAll('#dock h3')) {
      const head = h3.getBoundingClientRect(), chip = h3.querySelector('.chip').getBoundingClientRect(), pin = h3.querySelector('.pin');
      for (const [where, x, y] of [['top-right corner', head.right - 1, head.top + 1], ['bottom, just right of the pill', chip.right + 1, head.bottom - 1]])
        if (document.elementFromPoint(x, y)?.closest('.pin') !== pin) errs.push(`the pin's hit area misses its header's ${where}`);
    }
  };
  // A big card (6 agents, 10 PRs) redrawn the way the 500ms tick does (main.js), checked to keep what the browser holds.
  const morph = () => {
    const now = Date.now(), q = sel => $('card').querySelector(sel), fail = msg => errs.push(msg); // $ isn't defined yet
    const big = { id: 'sess-big', cwd: '/Users/x/projects/big', title: 'sess-big', state: 'working', activity: 'Editing', started: now - 50 * MIN, last: now,
      subagents: Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, type: 'Explore', description: `Agent ${i}`, activity: `Step ${i}`, started: now - (9 - i) * MIN, last: now })),
      github: Array.from({ length: 10 }, (_, i) => pr(200 + i, needs[i % 5])) };
    const mid = el => { const r = el.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; };
    let row, body, tog, open;
    const update = () => emit('message', [...sessionsAt(0), big]);
    // the patched children against a fresh build of the same render (its morph caught, not run)
    const fresh = (live, render) => {
      let kids = []; const real = window.morph;
      window.morph = (_, k) => { kids = k; }; render(); window.morph = real;
      const now = [...live.childNodes];
      return now.length === kids.length && now.every((n, i) => n.isEqualNode(kids[i]));
    };
    return [
      () => { emit('message', [...sessionsAt(0), big]); }, run(0.1),
      () => { enterZone(moths.get('sess-big').zone); }, run(0.1),
      () => { // keyboard focus on an agent row, through three redraws
        row = $('card').querySelectorAll('.agent')[2]; row.focus();
        if (document.activeElement !== row) return fail('the agent row didn\'t take focus');
        for (let i = 0; i < 3; i++) renderCard();
        if (document.activeElement !== row || !row.isConnected) fail(`focus lost in a redraw: ${document.activeElement?.className}`);
        row.blur();
      },
      () => { // scrolled down the body
        body = q('.cardBody');
        if (body.scrollHeight <= body.clientHeight) return fail('the card doesn\'t scroll, so the check would prove nothing');
        body.scrollTop = 40; renderCard();
        if (q('.cardBody').scrollTop !== 40) fail(`scroll lost in a redraw: ${q('.cardBody').scrollTop}`);
        body.scrollTop = 0;
      },
      () => { // the pointer on an agent row: WebKit won't apply :hover in a window that isn't key, and this one never is, so
        // check what hover hangs on, that the element under the pointer is still the same one after a redraw
        const [x, y] = mid($('card').querySelectorAll('.agent')[1]), under = document.elementFromPoint(x, y);
        if (!under?.closest('.agent')) return fail(`no agent row under its own middle: ${under?.className}`);
        renderCard();
        if (document.elementFromPoint(x, y) !== under || !under.isConnected) fail('a redraw swapped the element under the pointer, which loses its hover');
      },
      () => { tog = q('.tog'); tog.scrollIntoView({ block: 'nearest' }); open = !!prList['sess-big']; return `down ${mid(tog).join(' ')}`; },
      () => { renderCard(); return `up ${mid(tog).join(' ')}`; }, // the tick lands between press and release
      () => { if (!!prList['sess-big'] === open) fail('a press on the PR toggle across a redraw didn\'t toggle'); },
      () => { // the PRs are listed now: an overflow link's tip, after a redraw, sits beside the link on screen
        renderCard();
        const ov = q('.ov'), tip = $('prTip');
        ov.scrollIntoView({ block: 'nearest' }); ov.focus();
        const a = ov.getBoundingClientRect(), t = tip.getBoundingClientRect();
        if (!tip.matches('.show') || Math.abs(t.bottom + 8 - a.top) > 1 && Math.abs(t.top - 8 - a.bottom) > 1) fail(`the tip is at ${t.top}-${t.bottom}, its link at ${a.top}-${a.bottom}`);
        ov.blur();
      },
      () => { // an agent ends while a later one has focus: the focused row is still that agent's, and it all matches a fresh card
        row = [...$('card').querySelectorAll('.agent')].find(r => r.textContent.includes('Agent 2')); row.focus();
        big.subagents = big.subagents.filter(a => a.id !== 'b0'); update(); renderCard();
        if ($('card').querySelectorAll('.agent').length !== 5) return fail('the agent never ended on the card');
        if (!document.activeElement?.textContent.includes('Agent 2')) fail(`focus went to ${document.activeElement?.textContent} when an agent ended`);
        if (!fresh($('card'), renderCard)) fail('after an agent ended, the patched card differs from a fresh one');
        row.blur();
      },
      () => { // a PR above the focused one re-ranks below it, which moves the focused row
        const rows = [...$('card').querySelectorAll('a.pr2')], focused = rows[1], url = focused?.href, above = rows[0].href;
        if (!focused) return fail('no listed PRs to focus');
        focused.focus();
        big.github = big.github.map(p => p.url === above ? { ...p, need: 'changes' } : p); update(); renderCard();
        if ($('card').querySelectorAll('a.pr2')[0].href !== url) return fail('the re-rank didn\'t move the focused row up');
        if (document.activeElement?.href !== url) fail(`focus went to ${document.activeElement?.href || document.activeElement?.className} when a PR re-ranked`);
        if (!fresh($('card'), renderCard)) fail('after a PR re-ranked, the patched card differs from a fresh one');
        focused.blur();
      },
      () => { // another session's card, after this one closes, starts at the top
        body = q('.cardBody'); body.scrollTop = 40;
        hideCard(); enterZone(moths.get('sess-alpha').zone);
        if (q('.cardBody').scrollTop !== 0) fail(`sess-alpha's card opened scrolled to ${q('.cardBody').scrollTop}`);
        hideCard();
      },
      () => { // a pinned session ends, then comes back: the sidebar matches a fresh one each way (its class comes and goes)
        pinned = [{ id: 'sess-big' }, { id: 'sess-alpha' }]; renderSidebar();
        const stack = $('dock').children[0];
        for (const alpha of [false, true]) {
          emit('message', [...sessionsAt(0).filter(o => alpha || o.id !== 'sess-alpha'), big]); renderSidebar();
          if (stack.children[1]?.classList.contains('ended') === alpha) return fail(`sess-alpha's section is ${stack.children[1]?.className || 'unclassed'} with it ${alpha ? 'back' : 'gone'}`);
          if (!fresh(stack, renderSidebar)) fail(`with sess-alpha ${alpha ? 'back' : 'gone'}, the patched sidebar differs from a fresh one`);
        }
      },
    ];
  };
  // The screensaver has no footer under the scene, so the lantern's layers, turned as it swings, reach past the bottom of
  // the screen near the ends of a swing. The page must not scroll for that: a scrollbar narrows the scene, and fitView
  // refits everything to it, which shook the whole screen each time the scrollbar came or went.
  const sway = () => {
    let was;
    return [() => { was = fitted; swing.a = 6; swing.v = 0; }, run(1 / 60),
      async () => {
        await new Promise(r => realSetTimeout(r, 100)); // WebKit adds a scrollbar once it next lays out, between frames
        const layer = $('lanternLayer').getBoundingClientRect(), page = document.documentElement;
        if (layer.bottom <= innerHeight) return errs.push(`the swung lantern's layer ends at ${layer.bottom}, inside the ${innerHeight} px window, so the check would prove nothing`);
        if (page.scrollHeight > page.clientHeight) errs.push(`the swung lantern scrolls the page: ${page.scrollHeight} px in a ${page.clientHeight} px window`);
      },
      run(1 / 60), () => { if (fitted !== was) errs.push(`the scene refitted from ${was} to ${fitted} as the lantern swung`); }];
  };
  const steps = [
    () => {
      catchScorch();
      emit('settings', { style: Q.get('style') || 'barrel', lanternText: 'sessions', stale: true, github: true, quietUntil: 0, goals: {}, recapSeen: '9999-12-31', pinned: Q.has('pinned') ? [{ id: 'sess-alpha' }, { id: 'sess-bravo', chips: true }] : undefined });
      emit('reviews', [{ url: 'https://github.com/acme/app/pull/90', label: 'app#90', title: 'Review me' }, { url: 'https://github.com/acme/app/pull/91', label: 'app#91', title: 'Me too' }]);
      emit('stale', stale(false));
      emit('prose', words(3));
      emit('message', sessionsAt(0));
    },
    run(6),
    ...(Q.has('chrome') ? chrome() : []),
    ...(Q.has('pinned') ? [() => { renderSidebar(); }, run(0.1), refitted, snap('open')] : []),
    ...(Q.has('hover') ? [() => { enterZone(moths.get('sess-bravo').zone); }, snap('hover'), hits, () => { hideCard(); },
      // a stale PR's card and a ghost's, with their pills
      () => { enterZone([...wisps.values()][0].zone); }, snap('stale'), () => { hideCard(); enterZone([...ghosts.values()][0].zone); }, snap('ghost'), () => { hideCard(); }] : []),
    ...(Q.has('morph') ? morph() : []),
    ...(Q.has('sway') ? sway() : []),
    ...(Q.has('chrome') || Q.has('pinned') || Q.has('morph') || Q.has('sway') ? [] : [
      () => { emit('message', sessionsAt(1)); emit('stale', stale(true)); },
      run(14), snap('t20'), // T = LAST
    ]),
  ];
  // The harness may call __drive before the page's deferred scripts have run (they load over http), so wait for main.js, the
  // last of them, to have set lanternTick; a script that failed to load is reported by name instead of as a missing variable.
  addEventListener('error', e => { if (e.target?.src) errs.push(`${e.target.src} failed to load`); }, true);
  const ready = (async () => {
    for (let i = 0; i < 500 && typeof window.lanternTick !== 'function' && !errs.length; i++) await new Promise(r => realSetTimeout(r, 20));
    if (typeof window.lanternTick !== 'function' && !errs.length) errs.push('the page scripts never finished running');
  })();
  window.__drive = async () => {
    await ready;
    while (steps.length && !errs.length) { const r = await steps.shift()(); if (r && !errs.length) return r; }
    return errs.length ? 'error: ' + errs.join(' | ') : 'done';
  };
})();
