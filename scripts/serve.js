// Builds the page into a temp folder (so a Lantern.app watching dist/ never sees it) and serves that over http on a spare
// port, for the harnesses that load it in WebKit: scripts/snapshots.js and test/morph.test.js.
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** @returns {Promise<{ url: string, close: () => Promise<void> }>} */
async function serveBuild() {
  const { build, preview } = await import('vite');
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lantern-dist-'));
  await build({ root: ROOT, logLevel: 'warn', build: { outDir, emptyOutDir: true } });
  const server = await preview({ root: ROOT, logLevel: 'warn', build: { outDir }, preview: { host: '127.0.0.1', port: 0 } });
  const url = /** @type {string} */ (server.resolvedUrls?.local[0]);
  return { url, close: async () => { await server.close(); fs.rmSync(outDir, { recursive: true, force: true }); } };
}

module.exports = { serveBuild };
