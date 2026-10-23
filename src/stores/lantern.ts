import { defineStore } from 'pinia';
import { computed, ref, shallowRef, watch } from 'vue';
import { post } from '../scene/scene';
import { parseSettings } from '../types';
import type { GitHub, Hovered, Pin, Review, Session, Settings, Stats } from '../types';

// No pinning where there's no room: windows under PIN_MIN wide, the iTerm panel and the screensavers.
const PIN_MIN = 800;

// What the chrome reads. Fed by src/events.ts, the scene's chrome.update (src/main.ts) and the recap's openRecap, which sets
// `recap`; nothing per-frame writes it. Arrays and
// parsed payloads are shallowRefs, so Vue never wraps them in proxies.
export const useLanternStore = defineStore('lantern', () => {
  // the scene's own (src/scene/live.ts chrome.update): its sessions and the hover card's target
  const sessions = shallowRef<Session[]>([]);
  const hovered = shallowRef<Hovered | null>(null);
  const expanded = ref(false); // whether a click expanded the card (card.ts expandCard)
  // the clock relative times count from, a second at a time
  const now = ref(Date.now());
  setInterval(() => { now.value = Date.now(); }, 1000);
  const settings = shallowRef<Settings>(parseSettings({}));
  const reviews = shallowRef<Review[]>([]); // PRs waiting on my review (GitHub status on)
  const link = ref<'connecting' | 'up' | 'offline'>('connecting'); // the event stream, as the status line tells it
  const github = shallowRef<GitHub>({ accounts: [], signIn: null });
  const stats = shallowRef<Stats | null>(null);
  const statsFailed = ref(false);
  // ---- the pinned sidebar
  // The pins are a setting, so every window agrees and they survive a restart; one shows at once and the settings event confirms it.
  const pinned = computed(() => settings.value.pinned ?? []);
  const width = ref(innerWidth);
  addEventListener('resize', () => { width.value = innerWidth; });
  const roomy = !document.body.matches('.panel, .screensaver, .ambient'); // fixed by the time the chrome mounts
  const pinnable = computed(() => roomy && width.value >= PIN_MIN);
  // every pinned session as this window last saw it, in pin order: one that ends stays, to be shown as it was, until unpinned
  const docked = shallowRef(new Map<string, Session>());
  watch([sessions, pinned], () => {
    const next = new Map<string, Session>();
    for (const { id } of pinned.value) { const s = sessions.value.find(o => o.id === id) ?? docked.value.get(id); if (s) next.set(id, s); }
    docked.value = next;
  }, { immediate: true, flush: 'sync' });
  // Only the pins this window can show go to the server (the one just pinned is live), so one nobody can see any more
  // doesn't linger.
  function setPins(next: Pin[]) {
    const pins = next.filter(p => docked.value.has(p.id) || sessions.value.some(o => o.id === p.id));
    settings.value = { ...settings.value, pinned: pins };
    post('/settings', { pinned: pins });
  }
  // the card's pin and the sidebar's: pins or unpins a session, newest at the bottom
  const togglePin = (id: string) => setPins(pinned.value.some(p => p.id === id) ? pinned.value.filter(p => p.id !== id) : [...pinned.value, { id }]);
  const recap = shallowRef<{ stats: Stats; i: number } | null>(null); // the day RecapPanel shows: day `i` of these stats
  return { sessions, hovered, expanded, pinned, pinnable, docked, setPins, togglePin, now, settings, reviews, link, github, stats, statsFailed, recap };
});
