// Demo every lantern state without real sessions, on a throwaway server (7718 unless LANTERN_PORT says otherwise).
// 7717 is the real app, where fake sessions would land in your stats for good, so that needs --live.
const PORT = Number(process.env.LANTERN_PORT) || 7718;
const START = (port = PORT) => `open -n -a Lantern --env LANTERN_PORT=${port} --env LANTERN_DATA="$(mktemp -d)"`;
if (PORT === 7717 && !process.argv.includes('--live')) {
  console.error(`:7717 is your real lantern; fake sessions would stay in its stats. Pass --live to do it anyway, or start a throwaway one:\n  ${START(7718)}`);
  process.exit(1);
}
const send = (session_id, hook_event_name, extra = {}) =>
  fetch(`http://127.0.0.1:${PORT}/event`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id, hook_event_name, cwd: `/Users/demo/${session_id}`, ...extra }) });
const wait = s => new Promise(r => setTimeout(r, s * 1000));

/** @type {[string, number, (() => Promise<unknown>)?][]} */
const steps = [
  ['nothing going on: dim ember, sway, flicker', 3],
  ['moth flies in', 3, () => send('blog', 'UserPromptSubmit')],
  ['two more sessions brighten it', 4, async () => { await send('api', 'PreToolUse', { tool_name: 'Bash' }); await send('docs', 'UserPromptSubmit'); }],
  ['a supervisor (medium moth) and two subagents (small moths)', 5, async () => {
    await send('api', 'SubagentStart', { agent_id: 'sup', agent_type: 'opus-supervisor' });
    await send('api', 'SubagentStart', { agent_id: 'a1', agent_type: 'sonnet-implement' });
    await send('api', 'SubagentStart', { agent_id: 'a2', agent_type: 'Explore' });
  }],
  ['five working: fully lit', 4, async () => { await send('infra', 'PreToolUse'); await send('site', 'PreToolUse'); }],
  ['"docs" hits a permission prompt: moth lands, flame turns violet', 6, () => send('docs', 'Notification', { notification_type: 'permission_prompt' })],
  ['you answer it: back to work', 4, () => send('docs', 'PostToolUse')],
  ['subagents finish', 3, () => Promise.all(['sup', 'a1', 'a2'].map(agent_id => send('api', 'SubagentStop', { agent_id })))],
  ['"blog" finishes its turn and waits for you', 5, () => send('blog', 'Stop')],
  ['sessions end: moths fly off', 4, () => Promise.all(['blog', 'api', 'docs', 'infra', 'site'].map(id => send(id, 'SessionEnd')))],
];

(async () => {
  for (const [label, secs, fn] of steps) {
    console.log(label);
    try { await fn?.(); } catch { console.error(`no lantern on :${PORT}? start a throwaway one with:\n  ${START()}`); process.exit(1); }
    await wait(secs);
  }
})();
