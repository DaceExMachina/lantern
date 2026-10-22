<script setup lang="ts">
// The settings menu, inside the native #menu popover: the switches, the lantern and ribbon pickers, the quiet hours and
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

const checked = (e: Event) => e.target instanceof HTMLInputElement && e.target.checked;
const onNotify = (e: Event) => { notify.value = checked(e); setNotifying(notify.value); };
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
onMounted(() => { menu = first.value?.parentElement ?? null; for (const [type, f] of events) menu?.addEventListener(type, f); });
onBeforeUnmount(() => { for (const [type, f] of events) menu?.removeEventListener(type, f); });
</script>

<template>
  <label ref="first" class="notify"><input type="checkbox" aria-describedby="tip-notify" :checked="notify" @change="onNotify"> notify me when a session needs me</label>
  <span class="tip" role="tooltip" id="tip-notify">Plays a soft chime and sends a system notification the moment a session starts waiting on you. The first time, your Mac may ask to allow notifications.</span>
  <label><input type="checkbox" aria-describedby="tip-stale" :checked="settings.stale !== false" @change="post('/settings', { stale: checked($event) })"> show stale PRs</label>
  <span class="tip" role="tooltip" id="tip-stale">Shows your open PRs that no session owns and nobody has touched for a week, as pale wisps drifting low in the scene. It needs GitHub status.</span>
  <label :class="{ unavailable: !style.surface }"><input type="checkbox" aria-describedby="tip-text" :checked="settings.lanternText !== 'off'" :disabled="!style.surface" @change="post('/settings', { lanternText: checked($event) ? 'sessions' : 'off' })"> show session text</label>
  <span class="tip" role="tooltip" id="tip-text">Prints lines your sessions wrote onto the lantern's paper, fading in and out. Only the barrel and the round chōchin have paper, so it's greyed out on the Moroccan and the candle.</span>
  <label><select id="style" aria-label="Lantern style" aria-describedby="tip-style" :value="styleKey" @change="pick"><option v-for="(st, key) in STYLES" :key="key" :value="key">{{ st.name }}</option></select></label>
  <span class="tip" role="tooltip" id="tip-style">Picks the lantern for every window, the iTerm2 panel and the screensaver. Choose from the barrel, the round chōchin, the brass Moroccan and the pillar candle. Some of the options here only work on certain lanterns.</span>
  <div class="ribbon" :class="{ unavailable: !style.ribbon }"><span>ribbon</span><span id="ribbons" role="group" aria-label="Ribbon colour" aria-describedby="tip-ribbon"><button v-for="([name, [front]]) in Object.entries(RIBBONS)" :key="name" :title="name" :aria-label="`${name} ribbon`" :aria-pressed="name === ribbon" :disabled="!style.ribbon" :style="{ '--c': front }" @click="post('/settings', { ribbon: name })"></button></span></div>
  <span class="tip" role="tooltip" id="tip-ribbon">Colours the bookmark ribbon that hangs inside the barrel lantern. The other lanterns have no ribbon, so these are greyed out on them.</span>
  <template v-for="row in switches" :key="row.key">
    <div class="time switch"><span>{{ row.label }}</span><span class="pill" role="group" :aria-label="row.label" :aria-describedby="row.tip"><button :aria-pressed="!row.on" @click="row.set(false)"><span>off</span></button><button :aria-pressed="row.on" @click="row.set(true)"><span>on</span></button></span><label><input type="time" :aria-label="row.label" :aria-describedby="row.tip" :value="row.time" :disabled="!row.on" @change="postTime(row.key, $event)"></label></div>
    <span class="tip" role="tooltip" :id="row.tip">{{ row.text }}</span>
  </template>
  <label class="time">day rollover <input type="time" aria-describedby="tip-day" :value="dayStart" @change="postTime('dayStart', $event)"></label>
  <span class="tip" role="tooltip" id="tip-day">Sets when one day ends and the next begins in your stats, badges and recap. Set it later than midnight to keep late nights with the day they belong to.</span>
  <GitHubPanel />
  <details id="help">
    <summary>What's what?</summary>
    <p><b>Big moths</b> are your sessions and <b>small ones</b> are their agents. The more of them working, the brighter the flame.</p>
    <p>When a session <b>needs you</b>, its moth lands on the lantern and the light turns violet.</p>
    <p><b>Hover</b> a moth for a quick look, <b>click</b> it for its full card, and <b>double-click</b> it to open its session. Click the card's header to jump to its session, or <b>right-click</b> the moth (or click the card's status) to snooze it. Do it again and it sleeps, snoozed until you wake it.</p>
    <p><b>Pin</b> a card to keep it open on the side.</p>
    <p><b>Fireflies</b> are its PRs:<span class="key"><span class="swatch" style="background:var(--pr-ready)"></span>ready</span><span class="key"><span class="swatch" style="background:var(--pr-failing)"></span>failing</span><span class="key"><span class="swatch" style="background:var(--pr-changes)"></span>changes</span><span class="key"><span class="swatch" style="background:var(--pr-feedback)"></span>feedback</span><span class="key"><span class="swatch" style="background:var(--pr-draft)"></span>draft</span><span class="key"><span class="swatch" style="background:var(--pr-in-review)"></span>in review</span>. The faint moths and fireflies in the background are stale PRs and the sessions that made them.</p>
    <p>The <b>chart button</b> opens your stats, and the <b>moon</b> snoozes everything <span>{{ until }}</span>. Set <b>quiet from</b> to have it come on by itself each night.</p>
    <p>The <b>day rollover</b> is when a new day starts in your stats. Set it past midnight to keep late nights with the day before.</p>
    <p><a href="https://github.com/DaceExMachina/lantern/blob/main/docs/guide.md" target="_blank" rel="noopener">The full guide</a></p>
  </details>
</template>
