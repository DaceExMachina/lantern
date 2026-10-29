#!/usr/bin/env node
// npm run preview [-- style=chochin]: this checkout's page and server, with your real sessions, PRs and settings.
// It builds the app's server without its window, gives it a copy of the live app's data folder, and serves this
// checkout's page from a Vite dev server (hot reload) on a spare port, which hands the server's endpoints on to it. Claude Code's hooks only reach the app, so while the app runs the preview shows the
// app's sessions as the app streams them; without the app, it finds them once from their processes and transcripts.
// Your ~/.claude is only read, and the copy is thrown away when you stop it, so settings changed in the preview never
// reach the app. Three things do reach the world: it polls GitHub itself while it runs (on top of the app's polling),
// clicking a moth really focuses that terminal, and snoozing, sleeping or waking a moth changes it in the app (one the
// app doesn't answer fails).
// After changing app/*.swift, stop it and run it again; changes to the page reload by themselves.
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

// What app/Server.swift answers itself; Vite serves everything else.
const SERVER_ROUTES = '^/(events?|settings|snooze|stats|github|resume|focus|now-playing)$';

const ROOT = path.join(__dirname, '..');
const LIVE = path.join(os.homedir(), 'Library', 'Application Support', 'Lantern');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lantern-preview-'));
const BIN = path.join(tmp, 'server'), DATA = path.join(tmp, 'data');

execFileSync('swiftc', ['-Onone', '-suppress-warnings', '-o', BIN, ...fs.readdirSync(path.join(ROOT, 'app')).filter(f => f.endsWith('.swift') && f !== 'main.swift').map(f => 'app/' + f), 'test/server/main.swift'], { cwd: ROOT, stdio: 'inherit' });
// the now playing helper, beside the server, where it looks (app/NowPlaying.swift)
execFileSync('swiftc', ['-Onone', '-suppress-warnings', '-parse-as-library', '-emit-library', '-o', path.join(tmp, 'NowPlaying.dylib'), 'app/helper/NowPlayingHelper.swift'], { cwd: ROOT, stdio: 'inherit' });
fs.mkdirSync(DATA);
for (const f of ['settings.json', 'github-cache.json']) if (fs.existsSync(path.join(LIVE, f))) fs.copyFileSync(path.join(LIVE, f), path.join(DATA, f));
// The database is in WAL mode, so copying the file alone could miss recent writes; .backup takes a consistent snapshot.
if (fs.existsSync(path.join(LIVE, 'stats.sqlite'))) execFileSync('sqlite3', [path.join(LIVE, 'stats.sqlite'), `.backup '${path.join(DATA, 'stats.sqlite')}'`]);

const settings = fs.existsSync(path.join(DATA, 'settings.json')) ? JSON.parse(fs.readFileSync(path.join(DATA, 'settings.json'), 'utf8')) : {};
const MIRROR = `http://127.0.0.1:${settings.port || 7717}/events`;

const free = net.createServer().listen(0, '127.0.0.1', () => {
  const { port } = /** @type {net.AddressInfo} */ (free.address());
  free.close(async () => {
    const live = await fetch(MIRROR.replace('/events', '/stats')).then(() => true, () => false);
    if (!live) console.log(`The app isn't answering at ${MIRROR}, so the preview finds sessions itself and they won't update`);
    const child = spawn(BIN, [], { env: { ...process.env, LANTERN_PORT: String(port), LANTERN_DATA: DATA, LANTERN_WEB: ROOT, ...(live ? { LANTERN_MIRROR: MIRROR } : {}) }, stdio: 'inherit' });
    const query = process.argv.slice(2).map(a => a.replace(/^\?/, '')).join('&');
    const ready = () => fetch(`http://127.0.0.1:${port}/stats`).then(async () => {
      const { createServer } = await import('vite');
      const vite = await createServer({ root: ROOT, server: { host: '127.0.0.1', port: 0, proxy: { [SERVER_ROUTES]: { target: `http://127.0.0.1:${port}`, changeOrigin: true } } } });
      await vite.listen();
      console.log(`Lantern preview at ${vite.resolvedUrls?.local[0]}${query ? '?' + query : ''} (Ctrl-C stops it)`);
    }, () => setTimeout(ready, 100));
    ready();
    const stop = () => child.kill();
    process.on('SIGINT', stop).on('SIGTERM', stop);
    child.on('exit', code => { fs.rmSync(tmp, { recursive: true, force: true }); process.exit(code ?? 0); });
  });
});
