// The Vue settings menu (src/components/SettingsMenu.vue): it shows the store's settings, changes one by POSTing /settings
// (the scene hears the settings event itself), and docks an option's tip above the menu while its row is hovered or focused.
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import SettingsMenu from '../src/components/SettingsMenu.vue';
import { useLanternStore } from '../src/stores/lantern';
import { parseSettings } from '../src/types';

let host, store, posts, menu;
beforeEach(() => {
  posts = [];
  vi.stubGlobal('fetch', vi.fn(async (url, o) => { posts.push([url, JSON.parse(o.body)]); return new Response('{}'); }));
  localStorage.clear();
  host = document.body.appendChild(document.createElement('div'));
});
afterEach(() => { host.remove(); vi.unstubAllGlobals(); });
const open = (settings = {}) => {
  const pinia = createPinia();
  store = useLanternStore(pinia);
  store.settings = parseSettings(settings);
  const w = mount(SettingsMenu, { attachTo: host, global: { plugins: [pinia] } });
  menu = w.find('label').element.parentElement; // VTU's wrapper stands in for the popover the page mounts it in
  menu.id = 'menu'; // the tips look for its rows by this id
  return w;
};
const row = (w, text) => w.findAll('label, .switch').find(r => r.text().includes(text));
const time = (w, text) => row(w, text).find('input[type=time]');
const QUIET = ['quiet from', 'quiet until'];
const pressed = w => Object.fromEntries(w.findAll('.pill').filter(p => QUIET.includes(p.attributes('aria-label'))).map(p => [p.attributes('aria-label'), p.findAll('button').map(b => b.attributes('aria-pressed')).join()]));
// the switch's two buttons, off then on: whether it reads on, and pressing one
const isOn = (w, text) => row(w, text).findAll('button')[1].attributes('aria-pressed') === 'true';
const flip = (w, text, on) => row(w, text).findAll('button')[on ? 1 : 0].trigger('click');

test('it shows the store\'s settings', async () => {
  const w = open({ style: 'chochin', ribbon: 'moss', lanternText: 'off', stale: false, quietFrom: '22:30', quietEnd: '7:15', dayStart: '4:00' });
  expect(isOn(w, 'show stale PRs')).toBe(false);
  expect(isOn(w, 'show session text')).toBe(false);
  expect(w.find('#style').element.value).toBe('chochin');
  expect(w.find('#ribbons [aria-pressed=true]').attributes('title')).toBe('moss');
  expect(pressed(w)).toEqual({ 'quiet from': 'false,true', 'quiet until': 'false,true' });
  expect(time(w, 'quiet from').element.value).toBe('22:30');
  expect(time(w, 'quiet until').element.value).toBe('07:15'); // padded: a time input takes nothing else
  expect(time(w, 'day rollover').element.value).toBe('04:00');
  expect(w.find('#help').text()).toContain('snoozes everything until 7:15am');
  store.settings = parseSettings({ stale: true, lanternText: 'sessions', quietEndOn: false });
  await w.vm.$nextTick();
  expect(isOn(w, 'show stale PRs')).toBe(true);
  expect(pressed(w)).toEqual({ 'quiet from': 'true,false', 'quiet until': 'true,false' });
  expect(time(w, 'quiet from').element.disabled).toBe(true);
  expect(time(w, 'quiet from').element.value).toBe('22:30'); // switched off, it keeps the time it had
  expect(w.find('#help').text()).toContain('snoozes everything until you press it again');
});

test('before the server says, it shows the barrel, the cerulean ribbon and the usual times', () => {
  const w = open();
  expect(w.find('#style').element.value).toBe('barrel');
  expect(w.find('#ribbons [aria-pressed=true]').attributes('title')).toBe('cerulean');
  expect([time(w, 'quiet from'), time(w, 'quiet until'), time(w, 'day rollover')].map(t => t.element.value)).toEqual(['22:00', '08:00', '00:00']);
  expect(w.find('#help').text()).toContain('snoozes everything until 8am');
});

test('each control POSTs its setting', async () => {
  const w = open({ stale: true, quietFrom: '22:30' });
  await flip(w, 'show stale PRs', false);
  await flip(w, 'show session text', false);
  await w.find('#style').setValue('candle');
  await w.find('#ribbons [title=plum]').trigger('click');
  await flip(w, 'quiet until', false);
  await flip(w, 'quiet from', false);
  for (const [text, value] of [['quiet until', '06:45'], ['day rollover', '03:30']]) { const t = time(w, text); t.element.value = value; await t.trigger('change'); }
  expect(posts).toEqual([
    ['/settings', { stale: false }], ['/settings', { lanternText: 'off' }], ['/settings', { style: 'candle' }], ['/settings', { ribbon: 'plum' }],
    ['/settings', { quietEndOn: false }], ['/settings', { quietFrom: null }], ['/settings', { quietEnd: '06:45' }], ['/settings', { dayStart: '03:30' }],
  ]);
});

test('quiet from switched on posts the time it shows; a cleared time posts nothing', async () => {
  const w = open({});
  await flip(w, 'quiet from', true);
  const t = time(w, 'quiet until');
  t.element.value = ''; await t.trigger('change');
  expect(posts).toEqual([['/settings', { quietFrom: '22:00' }]]);
});

test('the notify switch is remembered by the browser, not posted', async () => {
  vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission: 'granted' }));
  vi.stubGlobal('AudioContext', vi.fn());
  const w = open({});
  await flip(w, 'notify when', true);
  expect(localStorage.getItem('lantern-notify')).toBe('1');
  await flip(w, 'notify when', false);
  expect(localStorage.getItem('lantern-notify')).toBe('0');
  expect(posts).toEqual([]);
});

test('on the candle the session text and ribbon controls grey out, and come back on the barrel', async () => {
  const w = open({ style: 'candle' });
  const text = row(w, 'show session text'), ribbon = w.find('.ribbon');
  expect(text.findAll('button').every(b => b.element.disabled)).toBe(true);
  expect(text.classes()).toContain('unavailable');
  expect(ribbon.classes()).toContain('unavailable');
  expect(w.findAll('#ribbons button').length).toBe(6);
  expect(w.findAll('#ribbons button').every(b => b.element.disabled)).toBe(true);
  store.settings = parseSettings({ style: 'barrel' });
  await w.vm.$nextTick();
  expect(text.findAll('button').every(b => !b.element.disabled)).toBe(true);
  expect(ribbon.classes()).not.toContain('unavailable');
  expect(w.findAll('#ribbons button').every(b => !b.element.disabled)).toBe(true);
});

test('a hovered row shows its tip docked above the menu; leaving, or closing the menu, puts it away', async () => {
  const w = open({});
  menu.getBoundingClientRect = () => ({ left: 100, top: 300, width: 260, height: 200 });
  const stale = row(w, 'show stale PRs'), tip = w.find('#tip-stale');
  await stale.find('button').trigger('pointerover');
  expect(tip.classes()).toContain('show');
  expect(tip.element.style.left).toBe('100px');
  expect(tip.element.style.width).toBe('260px');
  await w.find('#style').trigger('pointerover');
  expect(tip.classes()).not.toContain('show');
  expect(w.find('#tip-style').classes()).toContain('show');
  menu.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'closed' }));
  expect(w.find('#tip-style').classes()).not.toContain('show');
});

test('every option\'s tip follows its row, and the controls point at them', () => {
  const w = open({});
  const tips = w.findAll('.tip');
  expect(tips.length).toBe(10);
  for (const t of tips) {
    const prev = t.element.previousElementSibling;
    expect(prev.matches('.tip'), t.attributes('id')).toBe(false);
    expect(prev.querySelector(`[aria-describedby="${t.attributes('id')}"]`) ?? (prev.getAttribute('aria-describedby') === t.attributes('id') ? prev : null), t.attributes('id')).not.toBeNull();
  }
});

// the switch is one component (src/components/ToggleSwitch.vue), the quiet hours' off | on pair; every on/off row in the menu uses it
test('every on/off row is the one off | on switch, and the menu has no checkbox', async () => {
  const w = open({ nowPlaying: false });
  const rows = ['notify when', 'show stale PRs', 'show session text', 'now playing', 'review requests', 'quiet from', 'quiet until'].map(t => row(w, t));
  for (const r of rows) {
    expect(r.classes(), r.text()).toContain('switch');
    expect(r.find('.pill').attributes('role'), r.text()).toBe('group');
    expect(r.findAll('button').map(b => b.text()), r.text()).toEqual(['off', 'on']);
  }
  expect(w.findAll('input[type=checkbox]').length, 'no checkbox in the menu').toBe(0);
  expect(w.findAll('.pill').length).toBe(7);
  expect(isOn(w, 'now playing')).toBe(false);
  expect(isOn(w, 'review requests'), 'on unless the server says false').toBe(true);
});

test('the now playing and review requests switches post their setting', async () => {
  const w = open({});
  await flip(w, 'now playing', false);
  await flip(w, 'review requests', false);
  await flip(w, 'review requests', true);
  expect(posts).toEqual([['/settings', { nowPlaying: false }], ['/settings', { reviews: false }], ['/settings', { reviews: true }]]);
});
