import { createPinia } from 'pinia';
import { createApp } from 'vue';
import StatsPanel from './components/StatsPanel.vue';
import { connect } from './events';
import { useLanternStore } from './stores/lantern';

const pinia = createPinia();
createApp(StatsPanel).use(pinia).mount('#stats'); // into the native popover, which keeps its attributes
connect(useLanternStore(pinia));
