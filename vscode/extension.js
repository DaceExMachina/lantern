// Lantern opens vscode://lantern.focus/focus?pid=<pid> to bring a session's terminal to the front: the pid is the shell that
// runs it. VS Code hands the link to its front window and focuses that window. Anything but that one number is ignored.
const vscode = require('vscode');

exports.activate = context => context.subscriptions.push(vscode.window.registerUriHandler({
  async handleUri(uri) {
    const pid = uri.path === '/focus' && /^pid=([0-9]{1,9})$/.exec(uri.query)?.[1];
    if (!pid) return;
    for (const t of vscode.window.terminals) if (await t.processId === Number(pid)) return t.show();
  },
}));
