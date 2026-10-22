// The page is plain classic scripts sharing one global scope (index.html), so a top-level name declared in two of them
// stops the later script from loading at all ("Can't create duplicate variable"), and everything it defines is missing.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('no top-level name is declared by two page scripts', () => {
  const dir = path.join(__dirname, '..', 'public', 'page'), seen = new Map();
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    // top-level lines only: declarations at column 0, and every name in a `const a = .., b = ..` list on that line
    for (const [, kind, rest] of source.matchAll(/^(const|let|var|function|class|async function)\s+(.*)$/gm)) {
      const names = /function|class/.test(kind) ? [rest.match(/^\*?\s*([\w$]+)/)[1]]
        : [...rest.replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}|'[^']*'|`[^`]*`|"[^"]*"/g, '').matchAll(/(?:^|,)\s*([\w$]+)\s*(?==(?!>)|,|;|$)/g)].map(m => m[1]);
      for (const name of names) {
        assert.ok(!seen.has(name) || seen.get(name) === file, `'${name}' is declared in both ${seen.get(name)} and ${file}`);
        seen.set(name, file);
      }
    }
  }
  assert.ok(seen.size > 100, `only found ${seen.size} names`);
});
