// The scene first: modules load in import order, and the dev panel lists its controls in the order they load.
import './wiring';
import './expose';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import DevPanel from './components/DevPanel.vue';
import RecapPanel from './components/RecapPanel.vue';
import StatsPanel from './components/StatsPanel.vue';
import { connect } from './events';
import { useLanternStore } from './stores/lantern';

const pinia = createPinia();
createApp(StatsPanel).use(pinia).mount('#stats'); // into the native popovers, which keep their attributes
createApp(RecapPanel).use(pinia).mount('#recap');
createApp(DevPanel).mount(document.body.appendChild(document.createElement('div'))); // the dev panel is fixed, so its wrapper takes no room
connect(useLanternStore(pinia));
