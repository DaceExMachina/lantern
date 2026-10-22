// The scene first: modules load in import order, and the dev panel lists its controls in the order they load.
import './wiring';
import './expose';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import DevPanel from './components/DevPanel.vue';
import RecapPanel from './components/RecapPanel.vue';
import SettingsMenu from './components/SettingsMenu.vue';
import StatsPanel from './components/StatsPanel.vue';
import { connect } from './events';
import { useLanternStore } from './stores/lantern';

const pinia = createPinia();
// each into its native popover, which keeps its attributes
createApp(StatsPanel).use(pinia).mount('#stats');
createApp(RecapPanel).use(pinia).mount('#recap');
createApp(DevPanel).mount(document.body.appendChild(document.createElement('div'))); // the dev panel is fixed, so its wrapper takes no room
createApp(SettingsMenu).use(pinia).mount('#menu');
connect(useLanternStore(pinia));
