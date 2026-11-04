// The scene first: modules load in import order, and the dev panel lists its controls in the order they load.
import './wiring';
import './expose';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import DevPanel from './components/DevPanel.vue';
import ReviewsMenu from './components/ReviewsMenu.vue';
import UsageMenu from './components/UsageMenu.vue';
import RecapPanel from './components/RecapPanel.vue';
import NowPlaying from './components/NowPlaying.vue';
import PinnedDock from './components/PinnedDock.vue';
import SessionCard from './components/SessionCard.vue';
import SettingsMenu from './components/SettingsMenu.vue';
import StatsPanel from './components/StatsPanel.vue';
import StatusLine from './components/StatusLine.vue';
import { connect } from './events';
import { chrome, live } from './scene/live';
import { sessions } from './scene/state';
import { useLanternStore } from './stores/lantern';

const pinia = createPinia();
// each into its native popover, which keeps its attributes
createApp(StatsPanel).use(pinia).mount('#stats');
createApp(RecapPanel).use(pinia).mount('#recap');
createApp(DevPanel).mount(document.body.appendChild(document.createElement('div'))); // the dev panel is fixed, so its wrapper takes no room
createApp(SettingsMenu).use(pinia).mount('#menu');
createApp(SessionCard).use(pinia).mount('#card'); // the scene shows, hides and places #card (src/scene/card.ts)
createApp(PinnedDock).use(pinia).mount('#dock .stack');
createApp(StatusLine).use(pinia).mount('#statusSlot'); // display: contents, so the line is the footer's own grid item
createApp(NowPlaying).use(pinia).mount('#nowPlayingSlot'); // display: contents; the widget places itself above the footer
createApp(UsageMenu).use(pinia).mount('#usageSlot'); // display: contents; the readout places itself at the top left, its dropdown opens under it
createApp(ReviewsMenu).use(pinia).mount('#reviewsSlot'); // display: contents; the button places itself at the footer's left, its dropdown flies up from it
const store = useLanternStore(pinia);
// the scene's side of the store: copied over after a sync and when the card's target changes, never per frame
chrome.update = () => { store.sessions = sessions; store.hovered = live.hovered; store.expanded = live.expanded; store.detail = live.detail; store.now = Date.now(); };
connect(store);
