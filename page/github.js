// The GitHub section of the settings menu: connecting accounts through the Claude Lantern GitHub App (device flow).

// ---- GitHub panel: connect accounts through the Claude Lantern GitHub App (device flow) ------------------------
let github = { accounts: [], signIn: null }, usingGh = false;
const GH_LOGO = '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>';
const GH_COPY = '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3.5v-.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h.5"/>';
const GH_CHECK = '<path d="M3 8.5l3.2 3.2L13 4.8"/>', GH_CANCEL = '<path d="M4 4l8 8M12 4l-8 8"/>';
// the dev panel's way to see the connecting state without a real sign-in; its cancel posts nothing
const GH_DEMO_SIGN_IN = { url: 'https://github.com/login/device', code: 'WDJB-MJHT' };
let ghDemo = devToggle('Demo', 'ghconnect', 'GitHub connecting', false, 'Show the GitHub menu mid sign-in, with a made-up code', v => { ghDemo = v; renderGitHub(); });
function renderGitHub() {
  const panel = $('gh'), make = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
  const heading = make('h3'); heading.innerHTML = GH_LOGO + ' GitHub pull requests';
  // say plainly where PR status comes from right now
  const source = github.accounts.length ? `Checks, reviews and merge state come from ${github.accounts.map(a => a.login).join(', ')} every two minutes.`
    : usingGh ? 'Checks, reviews and merge state come from your local gh every two minutes.'
    : 'Not connected: fireflies only show PRs your sessions created, with no status colours.';
  const nodes = [heading, make('div', source, 'dim')];
  for (const a of github.accounts) {
    const row = make('div', '', 'row'), name = make('span', a.login + (a.error ? ' · reconnect' : ''), a.error ? 'warn' : '');
    const off = make('button', 'disconnect'); off.onclick = () => post('/github', { disconnect: a.login });
    row.append(name, off); nodes.push(row);
  }
  const signIn = ghDemo ? GH_DEMO_SIGN_IN : github.signIn;
  if (signIn) {
    const link = make('a', 'Open github.com/login/device'); link.href = signIn.url; link.target = '_blank'; link.rel = 'noopener';
    // two icon buttons, in the footer's corner-icon style, to the right of the link
    const face = d => `<span class="face"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round">${d}</svg></span>`;
    const icon = (label, d, onclick) => { const b = make('button', '', 'icon'); b.title = b.ariaLabel = label; b.innerHTML = face(d); b.onclick = onclick; return b; };
    const copy = icon('Copy code', GH_COPY, () => navigator.clipboard?.writeText(signIn.code).then(() => { copy.innerHTML = face(GH_CHECK); copy.title = 'Copied'; }));
    const cancel = icon('Cancel', GH_CANCEL, () => { if (!ghDemo) post('/github', { cancel: true }); });
    const tools = make('span', '', 'tools'); tools.append(copy, cancel);
    const bar = make('div', '', 'row'); bar.append(link, tools);
    nodes.push(make('div', 'Enter this code on GitHub:', 'dim'), make('div', signIn.code, 'code'), bar);
  } else {
    const connect = make('button', github.accounts.length ? 'Connect another account' : 'Connect an account');
    connect.onclick = () => post('/github', { connect: true });
    nodes.push(connect);
  }
  const install = make('a', 'Install the app on your account or orgs'); install.href = 'https://github.com/apps/lantern-pr/installations/new'; install.target = '_blank'; install.rel = 'noopener';
  nodes.push(make('div', 'Read-only: pull requests, checks and statuses. Tokens stay in your Keychain.', 'dim'), install);
  panel.replaceChildren(...nodes);
}
