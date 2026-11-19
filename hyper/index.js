// Lantern sends the pid of the shell running a session, as one line on focus.sock next to this file. The window running
// that shell comes to the front and shows its tab and pane, then this hangs up. Anything but a pid is ignored.
const net = require('net');
const fs = require('fs');
const path = require('path');

const SOCKET = path.join(__dirname, 'focus.sock');
let server;

exports.onApp = app => {
  if (server) return; // Hyper calls this again whenever its plugins change
  fs.rmSync(SOCKET, { force: true }); // left over from a Hyper that quit without closing it
  server = net.createServer(c => c.once('data', data => {
    const pid = Number(/^([0-9]{1,9})\n$/.exec(data)?.[1]);
    for (const win of app.getWindows()) {
      for (const [uid, session] of win.sessions) {
        if (pid && session.pty?.pid === pid) {
          win.focus();
          win.rpc.emit('lantern focus', uid);
        }
      }
    }
    c.end();
  }));
  server.listen(SOCKET, () => fs.chmodSync(SOCKET, 0o600));
};

exports.onUnload = () => {
  server?.close();
  server = undefined;
};

// The window's side: select the session, which also selects its tab. Hyper reloads plugins in place, so the listener goes with it.
let select;
exports.onRendererWindow = win => {
  select = uid => win.store.dispatch({ type: 'SESSION_SET_ACTIVE', uid });
  win.rpc.on('lantern focus', select);
};
exports.onRendererUnload = win => win.rpc.removeListener('lantern focus', select);
