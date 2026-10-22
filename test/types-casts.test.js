// src/ is TypeScript without casts: narrow with guards, `in`, instanceof and validating parsers instead. A line that really
// needs one says why in a `// cast:` comment. It reads the code as TypeScript does (its syntax tree), so prose and strings
// that happen to say "as" never count.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const SRC = path.join(__dirname, '..', 'src');

const files = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : /\.(ts|vue)$/.test(e.name) ? [path.join(dir, e.name)] : []);

// a .vue file's code is its <script>; its template is markup and prose ("as the days go by")
const code = f => { const src = fs.readFileSync(f, 'utf8'); return f.endsWith('.vue') ? (src.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? '') : src; };

// every `as` but `as const`, `<T>x`, non-null `x!`, `any` and ts-ignore or ts-expect-error, as "file:line  the line"
function casts(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS), lines = text.split('\n'), found = [];
  const flag = (at, line = sf.getLineAndCharacterOfPosition(at).line) => {
    if (!lines[line].includes('// cast:')) found.push(`${path.relative(SRC, file)}:${line + 1}  ${lines[line].trim()}`);
  };
  const visit = node => {
    const asConst = ts.isAsExpression(node) && ts.isTypeReferenceNode(node.type) && node.type.typeName.getText(sf) === 'const';
    if (ts.isAsExpression(node) && !asConst || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node)
      || node.kind === ts.SyntaxKind.AnyKeyword) flag(node.getStart(sf));
    ts.forEachChild(node, visit);
  };
  visit(sf);
  lines.forEach((l, i) => { if (/@ts-ignore|@ts-expect-error/.test(l)) flag(0, i); });
  return found;
}

test('src/ has no casts, non-null assertions, any or ts-ignore', () => {
  assert.deepStrictEqual(files(SRC).flatMap(f => casts(f, code(f))), [], 'narrow instead of casting, or explain the one unavoidable cast with a `// cast:` comment on its line');
});
