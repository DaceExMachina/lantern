<script setup lang="ts">
// What's playing on this Mac, from any app (app/NowPlaying.swift), bottom left just above the footer, with previous,
// play or pause, and next. It shows while an app has something up, playing or paused (so play is there to press), and
// is gone when nothing does. Without a cover it's just the words and the buttons.
// The dev panel's "now playing" (?fakeplaying) shows a made-up song; its buttons only change it here.
import { computed, shallowRef } from 'vue';
import { devToggle } from '../dev';
import { post } from '../scene/scene';
import { useLanternStore } from '../stores/lantern';
import type { NowPlaying } from '../types';

const store = useLanternStore();
const FAKE: NowPlaying = { title: 'Idyll of Sorrow', artist: 'ASC', app: 'Spotify', playing: true };
const fake = shallowRef<NowPlaying | null>(devToggle('Demo', 'fakeplaying', 'now playing', false, 'A made-up song in the now playing widget, whose buttons only change it here', v => { fake.value = v ? FAKE : null; }) ? FAKE : null);
const item = computed(() => fake.value ?? store.nowPlaying);
const art = computed(() => fake.value ? '/icon.png' : store.nowPlayingArt);
const by = computed(() => [item.value?.artist, item.value?.app].filter(Boolean).join(' · '));
function press(command: 'previous' | 'toggle' | 'next') {
  if (!fake.value) { post('/now-playing', { command }); return; }
  if (command === 'toggle') fake.value = { ...fake.value, playing: !fake.value.playing };
}
</script>

<template>
  <div v-if="item" id="nowPlaying" aria-label="Now playing">
    <img v-if="art" class="art" :src="art" alt="">
    <div class="what"><div class="title" :title="item.title">{{ item.title }}</div><div v-if="by" class="by">{{ by }}</div></div>
    <button aria-label="Previous" title="Previous" @click="press('previous')"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="currentColor"><path d="M3 3h1.6v10H3zM13 3v10L5.5 8z"/></svg></button>
    <button class="toggle" :aria-label="item.playing ? 'Pause' : 'Play'" :title="item.playing ? 'Pause' : 'Play'" @click="press('toggle')">
      <svg v-if="item.playing" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor"><path d="M4 3h2.6v10H4zM9.4 3H12v10H9.4z"/></svg>
      <svg v-else viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor"><path d="M4.5 2.5v11L13 8z"/></svg>
    </button>
    <button aria-label="Next" title="Next" @click="press('next')"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="currentColor"><path d="M11.4 3H13v10h-1.6zM3 3v10l7.5-5z"/></svg></button>
  </div>
</template>
