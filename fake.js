// Demo every lantern state without real sessions: node fake.js
const PORT = Number(process.env.LANTERN_PORT) || 7717;
const send = (session_id, hook_event_name, extra = {}) =>
  fetch(`http://127.0.0.1:${PORT}/event`, { method: 'POST', body: JSON.stringify({ session_id, hook_event_name, cwd: `/Users/demo/${session_id}`, ...extra }) });
const wait = s => new Promise(r => setTimeout(r, s * 1000));

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
    try { await fn?.(); } catch { console.error(`server not running on :${PORT}? start it with: node server.js`); process.exit(1); }
    await wait(secs);
  }
})();
