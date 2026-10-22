// The scene first: modules load in import order, and the dev panel lists its controls in the order they load.
import './wiring.js';
import './expose';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import StatsPanel from './components/StatsPanel.vue';
import { connect } from './events';
import { useLanternStore } from './stores/lantern';

const pinia = createPinia();
createApp(StatsPanel).use(pinia).mount('#stats'); // into the native popover, which keeps its attributes
connect(useLanternStore(pinia));
