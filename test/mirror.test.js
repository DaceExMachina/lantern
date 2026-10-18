// server.js in mirror mode (LANTERN_MIRROR): reads come from a live app, writes never reach it.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

test('mirror mode relays the live stream with its own page version, and keeps writes local', async t => {
  const posts = [];
  const live = http.createServer((req, res) => {
    if (req.method === 'POST') { posts.push(req.url); return res.writeHead(204).end(); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('retry: 2000\nevent: version\ndata: LIVE\n\nevent: graveyard\ndata: [{"label":"x#1"}]\n\ndata: [{"id":"moth"}]\n\n');
  }).listen(0, '127.0.0.1');
  await new Promise(r => live.on('listening', r));
  const port = 7900 + Math.floor(Math.random() * 90);
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, LANTERN_PORT: String(port), LANTERN_MIRROR: `http://127.0.0.1:${live.address().port}` },
  });
  t.after(() => { server.kill(); live.close(); live.closeAllConnections(); });
  await new Promise(r => server.stdout.once('data', r));

  const stream = await new Promise(done => http.get(`http://127.0.0.1:${port}/events`, res => {
    let text = '';
    res.on('data', c => { text += c; if (text.includes('"moth"')) { res.destroy(); done(text); } });
  }));
  assert.match(stream, /"id":"moth"/);
  assert.match(stream, /"label":"x#1"/);
  assert.match(stream, /retry: 2000/);
  assert.doesNotMatch(stream, /LIVE/, "the live app's page version would reload the preview whenever the live page changed");
  assert.match(stream, /event: version\ndata: \d/);

  for (const url of ['/snooze', '/settings', '/focus']) {
    const status = await new Promise(done => http.request(`http://127.0.0.1:${port}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => done(res.statusCode)).end('{"id":"moth","snoozed":true}'));
    assert.equal(status, 204);
  }
  assert.deepStrictEqual(posts, []);
});
