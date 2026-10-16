// Type-checks the JS with tsc (no build, no emit). The page's inline <script> is pulled out of
// index.html into .check/page.js first, padded with blank lines so tsc's line numbers match index.html.
const fs = require('fs');
const { spawnSync } = require('child_process');
const html = fs.readFileSync('index.html', 'utf8');
const start = html.indexOf('<script>') + '<script>'.length;
const end = html.lastIndexOf('</script>');
const lines = html.slice(0, start).split('\n').length - 1;
fs.mkdirSync('.check', { recursive: true });
fs.writeFileSync('.check/page.js', '// @ts-check\n' + '\n'.repeat(lines - 1) + html.slice(start, end));
let failed = false;
for (const project of ['tsconfig.json', 'tsconfig.page.json']) {
  const r = spawnSync('npx', ['tsc', '-p', project], { stdio: 'inherit' });
  if (r.status) failed = true;
}
process.exit(failed ? 1 : 0);
