// The dev panel (src/dev.ts): a control's value comes from the URL and goes back into it, and the backtick opens and
// closes the panel unless you're typing. Each test loads the page afresh at its own URL.
import assert from 'node:assert';
import { test, vi } from 'vitest';
import { layOut } from './page.js';

const load = async search => { layOut(search); vi.resetModules(); return import('../src/dev'); };

test('a control reads its value from the URL, writes changes back, and drops it at the default', async () => {
  const dev = await load('?speed=2.5&dev');
  let speed = dev.devSlider('Temporary', 'speed', 'speed', 0, 5, 0.1, 1, 'How fast', v => { speed = v; });
  assert.strictEqual(speed, 2.5, 'read from the URL');
  dev.toggleDevPanel();
  const input = /** @type {HTMLInputElement} */ (document.querySelector('body > div input'));
  assert.ok(input, 'the panel has the slider');
  input.value = '4'; input.dispatchEvent(new Event('input'));
  assert.strictEqual(speed, 4);
  assert.strictEqual(location.search, '?speed=4&dev');
  input.value = '1'; input.dispatchEvent(new Event('input'));
  assert.strictEqual(location.search, '?dev', 'the default is left out');
});

test('the backtick opens and closes the panel, but not while typing in a text field', async () => {
  const dev = await load('');
  const key = (target = document.body) => dev.devKey(/** @type {any} */ ({ key: '`', target }));
  const panel = () => document.querySelector('body > div[style*="--z-overlay"]');
  assert.strictEqual(panel(), null, 'no panel until the backtick');
  key();
  assert.ok(panel() && !(/** @type {HTMLElement} */ (panel())).hidden, 'opens');
  const field = document.createElement('input');
  key(field);
  assert.strictEqual((/** @type {HTMLElement} */ (panel())).hidden, false, 'typing a backtick leaves it open');
  key();
  assert.strictEqual((/** @type {HTMLElement} */ (panel())).hidden, true, 'closes');
});
