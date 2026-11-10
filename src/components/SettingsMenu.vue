<script setup lang="ts">
// The settings menu, inside the native #menu popover: the on/off switches, the lantern and ribbon pickers, the quiet hours and
// the day rollover, the GitHub section and the legend. It shows what the store holds (fed by the settings event) and
// changes a setting by POSTing it; the scene hears the settings event too and reacts itself (src/wiring.ts).
// An option's tip (the .tip after its row) docks just above the menu at the menu's width, like the recap's session card
// below its panel; with no room above (a short window) it sits at the window's top edge. A pointer over a row or keyboard
// focus in it shows its tip; aria-describedby links each control to its tip for screen readers.
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import { RIBBONS, STYLES, isRibbon, isStyleKey } from '../scene/lanterns';
import { notifying, setNotifying } from '../scene/notify';
import { post } from '../scene/scene';
import { useLanternStore } from '../stores/lantern';
import { hhmm, isTime, timeLabel } from '../types';
import type { Style } from '../types';
import GitHubPanel from './GitHubPanel.vue';
import ToggleSwitch from './ToggleSwitch.vue';

const store = useLanternStore();
const settings = computed(() => store.settings);
const styleKey = computed(() => settings.value.style !== undefined && isStyleKey(settings.value.style) ? settings.value.style : 'barrel');
const style = computed<Style>(() => STYLES[styleKey.value]);
const ribbon = computed(() => settings.value.ribbon !== undefined && isRibbon(settings.value.ribbon) ? settings.value.ribbon : 'cerulean');
const notify = ref(notifying());

// quiet from and quiet until: each an off | on switch with a time. Switched off, quiet from keeps showing the last time it had.
const fromTime = ref('22:00');
watch(() => settings.value.quietFrom, from => { if (isTime(from)) fromTime.value = hhmm(from); }, { immediate: true });
const endOn = computed(() => settings.value.quietEndOn !== false);
const endTime = computed(() => { const t = settings.value.quietEnd; return isTime(t) ? hhmm(t) : '08:00'; });
const dayStart = computed(() => { const t = settings.value.dayStart; return isTime(t) ? hhmm(t) : '00:00'; });
const until = computed(() => endOn.value ? `until ${timeLabel(endTime.value)}` : 'until you press it again');
const switches = computed(() => [
  { label: 'quiet from', tip: 'tip-from', key: 'quietFrom', on: isTime(settings.value.quietFrom), time: fromTime.value,
    set: (on: boolean) => post('/settings', { quietFrom: on ? fromTime.value : null }),
    text: 'Turns quiet on by itself every night at this time, even with no window open. It snoozes every session until quiet hours end.' },
  { label: 'quiet until', tip: 'tip-until', key: 'quietEnd', on: endOn.value, time: endTime.value,
    set: (on: boolean) => post('/settings', { quietEndOn: on }),
    text: 'Sets when quiet hours end and moths can call you again. Switch it off and quiet lasts until you press the moon.' },
]);

const onNotify = (on: boolean) => { notify.value = on; setNotifying(on); };
const postTime = (key: string, e: Event) => { if (e.target instanceof HTMLInputElement && e.target.value) post('/settings', { [key]: e.target.value }); };
const pick = (e: Event) => { if (e.target instanceof HTMLSelectElement) post('/settings', { style: e.target.value }); };

const first = useTemplateRef('first');
let menu: HTMLElement | null = null, tipped: HTMLElement | null = null;
function showTip(e: Event, on = true) {
  const row = on && e.target instanceof Element ? e.target.closest('#menu > :not(.tip)') : null, next = row?.nextElementSibling;
  const tip = next instanceof HTMLElement && next.matches('.tip') ? next : null;
  if (e.type === 'focusin' && !(e.target instanceof Element && e.target.matches(':focus-visible'))) return;
  if (tip === tipped || !menu) return;
  tipped?.classList.remove('show'); tipped = tip;
  if (!tip) return;
  const r = menu.getBoundingClientRect();
  tip.style.left = `${r.left}px`; tip.style.width = `${r.width}px`;
  tip.style.top = `${Math.max(8, r.top - 8 - tip.offsetHeight)}px`;
  tip.classList.add('show');
}
const hideTip = (e: Event) => showTip(e, false);
const onToggle = (e: Event) => { if ('newState' in e && e.newState === 'closed') showTip(e, false); };
const events: [string, (e: Event) => void][] = [['pointerover', showTip], ['focusin', showTip], ['pointerleave', hideTip], ['focusout', hideTip], ['toggle', onToggle]];
// the events fire on the popover, which is the first row's parent
onMounted(() => { menu = first.value?.$el.parentElement ?? null; for (const [type, f] of events) menu?.addEventListener(type, f); });
onBeforeUnmount(() => { for (const [type, f] of events) menu?.removeEventListener(type, f); });
</script>

<template>
  <label><select id="style" aria-label="Lantern style" aria-describedby="tip-style" :value="styleKey" @change="pick"><option v-for="(st, key) in STYLES" :key="key" :value="key">{{ st.name }}</option></select></label>
  <span class="tip" role="tooltip" id="tip-style">Picks the lantern for every window, the iTerm2 panel and the screensaver. Choose from the barrel, the round chōchin, the brass Moroccan and the pillar candle. Some of the options here only work on certain lanterns.</span>
  <div class="ribbon" :class="{ unavailable: !style.ribbon }"><span>ribbon</span><span id="ribbons" role="group" aria-label="Ribbon colour" aria-describedby="tip-ribbon"><button v-for="([name, [front]]) in Object.entries(RIBBONS)" :key="name" :title="name" :aria-label="`${name} ribbon`" :aria-pressed="name === ribbon" :disabled="!style.ribbon" :style="{ '--c': front }" @click="post('/settings', { ribbon: name })"></button></span></div>
  <span class="tip" role="tooltip" id="tip-ribbon">Colours the bookmark ribbon that hangs inside the barrel lantern. The other lanterns have no ribbon, so these are greyed out on them.</span>
  <ToggleSwitch ref="first" class="notify" label="notify when a session waits" :checked="notify" describedby="tip-notify" @change="onNotify">notify when a session waits</ToggleSwitch>
  <span class="tip" role="tooltip" id="tip-notify">Plays a soft chime and sends a system notification the moment a session starts waiting on you. The first time, your Mac may ask to allow notifications.</span>
  <ToggleSwitch label="show stale PRs" :checked="settings.stale !== false" describedby="tip-stale" @change="on => post('/settings', { stale: on })">show stale PRs</ToggleSwitch>
  <span class="tip" role="tooltip" id="tip-stale">Shows your open PRs that no session owns and nobody has touched for a week, as pale wisps drifting low in the scene. It needs GitHub status.</span>
  <ToggleSwitch :class="{ unavailable: !style.surface }" label="show session text" :checked="settings.lanternText !== 'off'" :disabled="!style.surface" describedby="tip-text" @change="on => post('/settings', { lanternText: on ? 'sessions' : 'off' })">show session text</ToggleSwitch>
  <span class="tip" role="tooltip" id="tip-text">Prints lines your sessions wrote onto the lantern's paper, fading in and out. Only the barrel and the round chōchin have paper, so it's greyed out on the Moroccan and the candle.</span>
  <ToggleSwitch label="now playing" :checked="settings.nowPlaying !== false" describedby="tip-playing" @change="on => post('/settings', { nowPlaying: on })">now playing</ToggleSwitch>
  <span class="tip" role="tooltip" id="tip-playing">Shows what's playing on this Mac, with previous, play or pause and next, above the footer. Switched off, Lantern stops asking your Mac what's playing.</span>
  <ToggleSwitch label="review requests" :checked="settings.reviews !== false" describedby="tip-reviews" @change="on => post('/settings', { reviews: on })">review requests</ToggleSwitch>
  <span class="tip" role="tooltip" id="tip-reviews">Shows the PRs waiting on your review as fireflies round the lantern, and the reviews button at the footer's left. Switched off, Lantern stops asking GitHub for them. It needs GitHub status.</span>
  <ToggleSwitch label="system stats" :checked="settings.systemStats !== false" describedby="tip-system" @change="on => post('/settings', { systemStats: on })">system stats</ToggleSwitch>
  <span class="tip" role="tooltip" id="tip-system">Shows your Mac's CPU and RAM at the top left, with a dropdown of what Lantern and your busiest sessions use. Switched off, Lantern stops measuring.</span>
  <template v-for="row in switches" :key="row.key">
    <ToggleSwitch :label="row.label" :checked="row.on" :describedby="row.tip" @change="row.set">{{ row.label }}<template #after><label><input type="time" :aria-label="row.label" :aria-describedby="row.tip" :value="row.time" :disabled="!row.on" @change="postTime(row.key, $event)"></label></template></ToggleSwitch>
    <span class="tip" role="tooltip" :id="row.tip">{{ row.text }}</span>
  </template>
  <label class="time">day rollover <input type="time" aria-describedby="tip-day" :value="dayStart" @change="postTime('dayStart', $event)"></label>
  <span class="tip" role="tooltip" id="tip-day">Sets when one day ends and the next begins in your stats, badges and recap. Set it later than midnight to keep late nights with the day they belong to.</span>
  <GitHubPanel />
  <details id="help">
    <summary>What's what?</summary>
    <p><b>Big moths</b> are your sessions and <b>small ones</b> are their agents. The more of them working, the brighter the flame.</p>
    <p>When a session <b>needs you</b>, its moth lands on the lantern and the light turns violet.</p>
    <p><b>Hover</b> a moth for a quick look, <b>click</b> it for its full card, and <b>double-click</b> it to open its session. Ghost moths and stale PRs work the same way: double-click a ghost to resume its session, or a wisp to open its session (or its PR, if no session made it). Click the card's header to jump to its session, or <b>right-click</b> the moth (or click the card's status) to snooze it. Do it again and it sleeps, snoozed until you wake it.</p>
    <p><b>Pin</b> a card to keep it open on the side, or <b>bookmark</b> it to find it again under the bookmark beside stats, even after it ends.</p>
    <p><b>Fireflies</b> are its PRs:<span class="key"><span class="swatch" style="background:var(--pr-ready)"></span>ready</span><span class="key"><span class="swatch" style="background:var(--pr-failing)"></span>failing</span><span class="key"><span class="swatch" style="background:var(--pr-changes)"></span>changes</span><span class="key"><span class="swatch" style="background:var(--pr-feedback)"></span>feedback</span><span class="key"><span class="swatch" style="background:var(--pr-draft)"></span>draft</span><span class="key"><span class="swatch" style="background:var(--pr-in-review)"></span>in review</span>. The faint moths and fireflies in the background are stale PRs and the sessions that made them.</p>
    <p>The <b>chart button</b> opens your stats, and the <b>moon</b> snoozes everything <span>{{ until }}</span>. Set <b>quiet from</b> to have it come on by itself each night.</p>
    <p>The <b>day rollover</b> is when a new day starts in your stats. Set it past midnight to keep late nights with the day before.</p>
    <p><a href="https://github.com/DaceExMachina/lantern/blob/main/docs/guide.md" target="_blank" rel="noopener">The full guide</a></p>
  </details>
</template>
