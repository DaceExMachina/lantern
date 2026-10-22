// src/ is TypeScript without casts: narrow with guards, `in`, instanceof and validating parsers instead. A line that really
// needs one says why in a `// cast:` comment.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const CAST = /\bas\s+(?!const\b)\w|[\w)\]]!(?:[.)\];,]|$)|:\s*any\b|<any>|@ts-ignore|@ts-expect-error/;

const files = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : /\.(ts|vue)$/.test(e.name) ? [path.join(dir, e.name)] : []);

// a .vue file's code is its <script>; its template is markup and prose ("as the days go by")
const code = f => { const src = fs.readFileSync(f, 'utf8'); return f.endsWith('.vue') ? (src.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? '') : src; };

test('src/ has no casts, non-null assertions, any or ts-ignore', () => {
  const found = files(SRC).flatMap(f => code(f).split('\n').filter(l => CAST.test(l) && !l.includes('// cast:')).map(l => `${path.relative(SRC, f)}  ${l.trim()}`));
  assert.deepStrictEqual(found, [], 'narrow instead of casting, or explain the one unavoidable cast with a `// cast:` comment on its line');
});
