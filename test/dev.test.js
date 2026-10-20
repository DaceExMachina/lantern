// The dev panel (page/dev.js): a control's value comes from the URL and goes back into it, and the backtick opens and
// closes the panel unless you're typing. Run in a vm context with a stub DOM holding only what the panel builds.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const node = tag => {
  const n = { tag, style: {}, children: [], hidden: false, append: (...cs) => { n.children.push(...cs); }, matches: () => false };
  return n;
};
const load = search => {
  const location = { search, pathname: '/' };
  const page = vm.createContext({ URLSearchParams, location, Option: function (t) { this.text = this.value = t; },
    history: { replaceState: (_, __, url) => { location.search = url.slice(1); } },
    document: { createElement: node, body: node('body') } });
  for (const f of ['scene', 'dev']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'page', f + '.js'), 'utf8'), page, { filename: f + '.js' });
  return { page, location, run: code => vm.runInContext(code, page) };
};
// every node under n, depth first
const all = n => [n, ...(n.children || []).flatMap(c => typeof c === 'object' ? all(c) : [])];

test('a control reads its value from the URL, writes changes back, and drops it at the default', () => {
  const { page, location, run } = load('?speed=2.5&dev');
  run('let speed = devSlider("Temporary", "speed", "speed", 0, 5, 0.1, 1, "How fast", v => { speed = v; })');
  assert.strictEqual(run('speed'), 2.5, 'read from the URL');
  run('toggleDevPanel()');
  const input = all(page.document.body).find(n => n.tag === 'input');
  assert.ok(input, 'the panel has the slider');
  input.value = '4'; input.oninput();
  assert.strictEqual(run('speed'), 4);
  assert.strictEqual(location.search, '?speed=4&dev');
  input.value = '1'; input.oninput();
  assert.strictEqual(location.search, '?dev', 'the default is left out');
});

test('the backtick opens and closes the panel, but not while typing in a text field', () => {
  const { run } = load('');
  const key = (target = { matches: () => false }) => run('devKey')({ key: '`', target });
  key();
  assert.strictEqual(run('devPanel && !devPanel.hidden'), true, 'opens');
  key({ matches: sel => sel.includes('input:not') });
  assert.strictEqual(run('devPanel.hidden'), false, 'typing a backtick leaves it open');
  key();
  assert.strictEqual(run('devPanel.hidden'), true, 'closes');
});
