// The dev panel: src/dev.ts keeps the control registry and the open state, src/components/DevPanel.vue draws the rows.
// A control's value comes from the URL and goes back into it, double-click resets it, and the backtick opens and closes
// the panel unless you're typing. Each test loads the page afresh at its own URL.
import { mount } from '@vue/test-utils';
import { expect, test, vi } from 'vitest';
import { layOut } from './page.js';

const load = async search => {
  layOut(search); vi.resetModules();
  const dev = await import('../src/dev'), { default: DevPanel } = await import('../src/components/DevPanel.vue');
  return { dev, DevPanel };
};

test('a slider reads its value from the URL, writes changes back, and drops it at the default', async () => {
  const { dev, DevPanel } = await load('?speed=2.5&dev');
  let speed = dev.devSlider('Temporary', 'speed', 'speed', 0, 5, 0.1, 1, 'How fast', v => { speed = v; });
  expect(speed).toBe(2.5);
  dev.toggleDevPanel();
  const w = mount(DevPanel);
  const input = w.find('input[type=range]');
  expect(input.element.value).toBe('2.5');
  expect(w.find('.shown').text()).toBe('2.5');
  await input.setValue('4');
  expect(speed).toBe(4);
  expect(location.search).toBe('?speed=4&dev');
  expect(w.find('.shown').text()).toBe('4');
  await input.setValue('1');
  expect(location.search).toBe('?dev');
});

test('double-clicking a row puts it back to its default, and a live slider reads "live"', async () => {
  const { dev, DevPanel } = await load('?zoom=3&flip&dev');
  let zoom = 0, flip = false;
  dev.devSlider('A', 'zoom', 'zoom', 0, 5, 1, null, 'Zoom', v => { zoom = v; });
  dev.devToggle('A', 'flip', 'flip', false, 'Flip', v => { flip = v; });
  dev.toggleDevPanel();
  const w = mount(DevPanel), labels = w.findAll('label');
  expect(w.find('input[type=checkbox]').element.checked).toBe(true);
  await labels[0].trigger('dblclick');
  expect(zoom).toBe(null);
  expect(w.find('.shown').text()).toBe('live');
  expect(location.search).toBe('?flip&dev');
  await labels[1].trigger('dblclick');
  expect(flip).toBe(false);
  expect(w.find('input[type=checkbox]').element.checked).toBe(false);
  expect(location.search).toBe('?dev');
});

test('selects and buttons: a select writes its option, a button runs its action; sections keep their first-used order', async () => {
  const { dev, DevPanel } = await load('?dev');
  let mode = '', ran = 0;
  dev.devSelect('B', 'mode', 'mode', ['x', 'y'], 'x', 'Mode', v => { mode = v; });
  dev.devButton('A', 'go', 'Go', () => { ran++; });
  dev.devToggle('B', 'on', 'on', false, 'On', () => {});
  dev.toggleDevPanel();
  const w = mount(DevPanel);
  expect(w.findAll('summary').map(s => s.text())).toEqual(['B', 'A']);
  expect(w.findAll('details')[0].findAll('label').length).toBe(2);
  await w.find('select').setValue('y');
  expect(mode).toBe('y');
  expect(location.search).toBe('?dev&mode=y');
  await w.find('button').trigger('click');
  expect(ran).toBe(1);
});

test('the backtick opens and closes the panel, but not while typing in a text field', async () => {
  const { dev, DevPanel } = await load('');
  dev.devButton('A', 'go', 'Go', () => {});
  const w = mount(DevPanel, { attachTo: document.body });
  const key = (target = document.body) => dev.devKey({ key: '`', target });
  expect(w.find('.dev').exists()).toBe(false);
  key(); await w.vm.$nextTick();
  expect(w.find('.dev').isVisible()).toBe(true);
  key(Object.assign(document.createElement('input'), { type: 'text' })); await w.vm.$nextTick();
  expect(w.find('.dev').isVisible()).toBe(true);
  key(); await w.vm.$nextTick();
  expect(w.find('.dev').isVisible()).toBe(false);
  w.unmount();
});
