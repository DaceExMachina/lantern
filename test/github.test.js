// The GitHub section of the menu while an account is connecting (page/github.js): the link, then a copy and a cancel icon
// button to its right, in that order. The page is plain classic scripts, so this runs it in a vm context with a stub DOM.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const el = tag => ({ tag, children: [], className: '', textContent: '', innerHTML: '', append(...c) { this.children.push(...c); }, replaceChildren(...c) { this.children = c; } });
const panel = el('section'), posts = [], copied = [];
const page = vm.createContext({ URLSearchParams, location: { search: '' }, document: { createElement: el, getElementById: () => panel, querySelectorAll: () => [] },
  fetch: (url, o) => posts.push([url, JSON.parse(o.body)]), navigator: { clipboard: { writeText: t => { copied.push(t); return Promise.resolve(); } } } });
for (const f of ['scene', 'dev', 'github']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'page', f + '.js'), 'utf8'), page, { filename: f + '.js' });
const find = (n, pred, out = []) => { if (pred(n)) out.push(n); n.children.forEach(c => find(c, pred, out)); return out; };

test('connecting shows copy then cancel as icon buttons to the right of the link; copy copies, cancel cancels', async () => {
  vm.runInContext(`github = { accounts: [], signIn: { url: 'https://github.com/login/device', code: 'ABCD-1234' } }; renderGitHub()`, page);
  const bar = find(panel, n => n.children.some(c => c.tag === 'a' && c.href === 'https://github.com/login/device'))[0];
  assert.ok(bar, 'the link has a row');
  const buttons = find(bar, n => n.tag === 'button');
  assert.deepStrictEqual(buttons.map(b => b.ariaLabel), ['Copy code', 'Cancel']);
  assert.ok(buttons.every(b => b.innerHTML.includes('<svg') && b.title === b.ariaLabel || b.title === 'Copied'));
  const before = buttons[0].innerHTML;
  buttons[0].onclick(); await Promise.resolve(); await Promise.resolve();
  assert.deepStrictEqual(copied, ['ABCD-1234']);
  assert.notStrictEqual(buttons[0].innerHTML, before, 'the icon turns into a check');
  buttons[1].onclick();
  assert.deepStrictEqual(posts, [['/github', { cancel: true }]]);
});
