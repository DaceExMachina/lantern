import { defineStore } from 'pinia';
import { computed, ref, shallowRef, watch } from 'vue';
import { post } from '../scene/scene';
import { parseSettings } from '../types';
import type { Desk, DeskRecord, GitHub, Hovered, NowPlaying, Pin, Review, Session, Settings, StalePR, Stats, Usage } from '../types';

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
  const stale = shallowRef<StalePR[]>([]); // my PRs no session owns, shown as wisps (the settings can hide them), so the reviews list leaves them out
  const desk = shallowRef<Desk>({ records: [], inbox: null }); // the review desk's records, newest first, and its session (ReviewsMenu.vue, ReviewDetail.vue)
  const review = ref<string | null>(null); // the PR whose desk record the detail panel shows (ReviewDetail.vue), by url
  const reviewsOpen = ref(false); // whether the reviews dropdown is open (ReviewsMenu.vue), which the now playing widget gives way to
  const link = ref<'connecting' | 'up' | 'offline'>('connecting'); // the event stream, as the status line tells it
  const github = shallowRef<GitHub>({ accounts: [], signIn: null });
  const stats = shallowRef<Stats | null>(null);
  const statsFailed = ref(false);
  const usage = shallowRef<Usage | null>(null); // CPU and memory, a sample every few seconds; null until one comes, and while the setting is off
  const nowPlaying = shallowRef<NowPlaying | null>(null); // what's playing on this Mac, and its cover (a data URL, or "")
  const nowPlayingArt = ref('');
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
  // ---- bookmarks: sessions to come back to, a setting like the pins. It takes only the ids, newest first; the server keeps
  // each one's title, folder and last activity (its settings event fills them in), so one that has ended can still be listed and resumed.
  const bookmarks = computed(() => settings.value.bookmarks ?? []);
  function toggleBookmark(id: string) {
    const next = bookmarks.value.some(b => b.id === id) ? bookmarks.value.filter(b => b.id !== id) : [{ id }, ...bookmarks.value];
    settings.value = { ...settings.value, bookmarks: next };
    post('/settings', { bookmarks: next.map(b => b.id) });
  }
  // ---- the review desk. What's news on a record: its newest post, and for an audit a new head once ready (a repeat request on the
  // same head isn't news; a mention's or follow-up's time stands in for the head). A mark remembers both as "head|post": opening a
  // record's detail marks it seen (reviewSeen), and a dot shows news since; dismissing it marks it too (dismissedReviews), hiding
  // it until there's news. Both are settings kept per PR, which the server prunes to listed PRs.
  const head = (r: DeskRecord) => r.kind === 'review' ? r.head ?? '' : r.at ?? '';
  const newSince = (r: DeskRecord, mark: string | undefined) => {
    const [was = '', wasPost = ''] = mark?.split('|') ?? [];
    return r.status === 'ready' && (mark === undefined || head(r) !== was) || !!r.lastActivity && r.lastActivity !== wasPost;
  };
  const markOf = (r: DeskRecord, mark: string | undefined) => `${r.status === 'ready' ? head(r) : mark?.split('|')[0] ?? ''}|${r.lastActivity ?? ''}`; // a head is marked only once its audit is ready
  const unread = (r: DeskRecord) => newSince(r, settings.value.reviewSeen?.[r.url]);
  const deskShown = computed(() => desk.value.records.filter(r => { const d = settings.value.dismissedReviews?.[r.url]; return d === undefined || newSince(r, d); }));
  const remember = (key: 'reviewSeen' | 'dismissedReviews', r: DeskRecord) => {
    const next = { ...settings.value[key], [r.url]: markOf(r, settings.value[key]?.[r.url]) };
    settings.value = { ...settings.value, [key]: next };
    post('/settings', { [key]: next });
  };
  const dismissReview = (r: DeskRecord) => remember('dismissedReviews', r);
  function openReview(r: DeskRecord) {
    review.value = r.url;
    if (unread(r)) remember('reviewSeen', r);
  }
  const recap = shallowRef<{ stats: Stats; i: number } | null>(null); // the day RecapPanel shows: day `i` of these stats
  // ---- review priorities: 0 (highest) to 3 (low), like a P0 bug, the default 2 isn't kept; the server drops a PR that left the list
  const reviewPriority = (url: string) => settings.value.reviewPriority?.[url] ?? 2;
  const setReviewPriority = (url: string, n: number) => {
    const next = { ...settings.value.reviewPriority, [url]: n };
    if (n === 2) delete next[url];
    settings.value = { ...settings.value, reviewPriority: next };
    post('/settings', { reviewPriority: next });
  };
  return { reviewPriority, setReviewPriority, sessions, hovered, expanded, pinned, pinnable, docked, setPins, togglePin, bookmarks, toggleBookmark, desk, deskShown, dismissReview, review, unread, openReview, now, settings, reviews, stale, reviewsOpen, link, github, stats, statsFailed, usage, recap, nowPlaying, nowPlayingArt };
});
