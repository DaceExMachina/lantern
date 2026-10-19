// The GitHub section of the settings menu: connecting accounts through the Claude Lantern GitHub App (device flow).

// ---- GitHub panel: connect accounts through the Claude Lantern GitHub App (device flow) ------------------------
let github = { accounts: [], signIn: null }, usingGh = false;
const GH_LOGO = '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>';
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
  if (github.signIn) {
    const link = make('a', 'Open github.com/login/device'); link.href = github.signIn.url; link.target = '_blank'; link.rel = 'noopener';
    const copy = make('button', 'copy code'); copy.onclick = () => navigator.clipboard?.writeText(github.signIn.code).then(() => { copy.textContent = 'copied'; });
    const cancel = make('button', 'cancel'); cancel.onclick = () => post('/github', { cancel: true });
    const actions = make('div', '', 'row'); actions.append(copy, cancel);
    nodes.push(make('div', 'Enter this code on GitHub:', 'dim'), make('div', github.signIn.code, 'code'), link, actions);
  } else {
    const connect = make('button', github.accounts.length ? 'Connect another account' : 'Connect an account');
    connect.onclick = () => post('/github', { connect: true });
    nodes.push(connect);
  }
  const install = make('a', 'Install the app on your account or orgs'); install.href = 'https://github.com/apps/lantern-pr/installations/new'; install.target = '_blank'; install.rel = 'noopener';
  nodes.push(make('div', 'Read-only: pull requests, checks and statuses. Tokens stay in your Keychain.', 'dim'), install);
  panel.replaceChildren(...nodes);
}
