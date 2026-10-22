#!/usr/bin/env node
// npm run snapshots [-- --update]: builds the page, serves it over http, and runs scripts/snapshots.swift against it.
const { spawn } = require('child_process');
const path = require('path');
const { serveBuild } = require('./serve');

(async () => {
  const { url, close } = await serveBuild();
  // async, because this process serves the page the harness loads
  spawn('swift', ['scripts/snapshots.swift', url, ...process.argv.slice(2)], { cwd: path.join(__dirname, '..'), stdio: 'inherit' })
    .on('exit', async code => { await close(); process.exit(code ?? 1); });
})();
