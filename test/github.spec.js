// The GitHub section of the menu while an account is connecting (src/scene/github.ts): the link, then a copy and a cancel
// icon button to its right, in that order.
import assert from 'node:assert';
import { test, vi } from 'vitest';
import { live } from '../src/scene/live';
import { renderGitHub } from '../src/scene/github';

test('connecting shows copy then cancel as icon buttons to the right of the link; copy copies, cancel cancels', async () => {
  const posts = [], copied = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((url, o) => { posts.push([url, JSON.parse(o.body)]); return Promise.resolve(); });
  vi.stubGlobal('navigator', { clipboard: { writeText: t => { copied.push(t); return Promise.resolve(); } } });
  live.github = { accounts: [], signIn: { url: 'https://github.com/login/device', code: 'ABCD-1234' } };
  renderGitHub();
  const bar = [...document.querySelectorAll('#gh div')].find(d => [...d.children].some(c => c.localName === 'a' && c.href === 'https://github.com/login/device'));
  assert.ok(bar, 'the link has a row');
  const buttons = [...bar.querySelectorAll('button')];
  assert.deepStrictEqual(buttons.map(b => b.ariaLabel), ['Copy code', 'Cancel']);
  assert.ok(buttons.every(b => b.innerHTML.includes('<svg') && b.title === b.ariaLabel || b.title === 'Copied'));
  const before = buttons[0].innerHTML;
  buttons[0].click(); await Promise.resolve(); await Promise.resolve();
  assert.deepStrictEqual(copied, ['ABCD-1234']);
  assert.notStrictEqual(buttons[0].innerHTML, before, 'the icon turns into a check');
  buttons[1].click();
  assert.deepStrictEqual(posts, [['/github', { cancel: true }]]);
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
