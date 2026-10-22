// The GitHub section of the menu (src/components/GitHubPanel.vue): where PR status comes from, the connected accounts, and
// while an account is connecting the link, then a copy and a cancel icon button to its right, in that order.
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import GitHubPanel from '../src/components/GitHubPanel.vue';
import { useLanternStore } from '../src/stores/lantern';
import { parseSettings } from '../src/types';

let posts, store;
beforeEach(() => {
  posts = [];
  vi.stubGlobal('fetch', vi.fn(async (url, o) => { posts.push([url, JSON.parse(o.body)]); return new Response('{}'); }));
});
afterEach(() => vi.unstubAllGlobals());
const open = (github = { accounts: [], signIn: null }, settings = {}) => {
  const pinia = createPinia();
  store = useLanternStore(pinia);
  store.github = github; store.settings = parseSettings(settings);
  return mount(GitHubPanel, { global: { plugins: [pinia] } });
};

test('connecting shows copy then cancel as icon buttons to the right of the link; copy copies, cancel cancels', async () => {
  const copied = [];
  vi.stubGlobal('navigator', { clipboard: { writeText: t => { copied.push(t); return Promise.resolve(); } } });
  const w = open({ accounts: [], signIn: { url: 'https://github.com/login/device', code: 'ABCD-1234' } });
  expect(w.text()).toContain('ABCD-1234');
  const bar = w.findAll('div').find(d => d.element.children[0]?.localName === 'a' && d.element.children[0].href === 'https://github.com/login/device');
  expect(bar, 'the link has a row').toBeTruthy();
  const buttons = bar.findAll('button');
  expect(buttons.map(b => b.attributes('aria-label'))).toEqual(['Copy code', 'Cancel']);
  expect(buttons.every(b => b.find('svg').exists() && b.attributes('title'))).toBe(true);
  const before = buttons[0].html();
  await buttons[0].trigger('click'); await w.vm.$nextTick(); await w.vm.$nextTick();
  expect(copied).toEqual(['ABCD-1234']);
  expect(buttons[0].html()).not.toBe(before); // the icon turns into a check
  expect(buttons[0].attributes('title')).toBe('Copied');
  await buttons[1].trigger('click');
  expect(posts).toEqual([['/github', { cancel: true }]]);
});

test('with no sign-in under way it offers to connect, and says where status comes from', async () => {
  const w = open({ accounts: [], signIn: null });
  expect(w.find('.dim').text()).toBe('Not connected: fireflies only show PRs your sessions created, with no status colours.');
  await w.find('button').trigger('click');
  expect(posts).toEqual([['/github', { connect: true }]]);
  store.settings = parseSettings({ github: true });
  await w.vm.$nextTick();
  expect(w.find('.dim').text()).toContain('your local gh');
});

test('connected accounts are listed, a failing one asks to reconnect, and each can be disconnected', async () => {
  const w = open({ accounts: [{ login: 'dace', error: '' }, { login: 'acme', error: 'bad credentials' }], signIn: null });
  expect(w.find('.dim').text()).toContain('come from dace, acme every');
  const rows = w.findAll('.row');
  expect(rows.map(r => r.find('span').text())).toEqual(['dace', 'acme · reconnect']);
  expect(rows.map(r => r.find('span').classes('warn'))).toEqual([false, true]);
  await rows[1].find('button').trigger('click');
  expect(posts).toEqual([['/github', { disconnect: 'acme' }]]);
  expect(w.text()).toContain('Connect another account');
});
