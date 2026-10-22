<script setup lang="ts">
// The GitHub section of the settings menu: where PR status comes from, and connecting accounts through the Claude Lantern
// GitHub App (device flow). The dev panel's demo (src/scene/github.ts) shows it mid sign-in, with a made-up code.
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ghDemo, watchGhDemo } from '../scene/github';
import { post } from '../scene/scene';
import { useLanternStore } from '../stores/lantern';

const GH_DEMO_SIGN_IN = { url: 'https://github.com/login/device', code: 'WDJB-MJHT' };
const store = useLanternStore();
const demo = ref(ghDemo), copied = ref(false);
onBeforeUnmount(watchGhDemo(on => { demo.value = on; }));

const accounts = computed(() => store.github.accounts);
const signIn = computed(() => demo.value ? GH_DEMO_SIGN_IN : store.github.signIn);
watch(() => signIn.value?.code, () => { copied.value = false; });
// say plainly where PR status comes from right now
const source = computed(() => accounts.value.length ? `Checks, reviews and merge state come from ${accounts.value.map(a => a.login).join(', ')} every two minutes.`
  : store.settings.github ? 'Checks, reviews and merge state come from your local gh every two minutes.'
  : 'Not connected: fireflies only show PRs your sessions created, with no status colours.');

const copy = (code: string) => navigator.clipboard?.writeText(code).then(() => { copied.value = true; });
const cancel = () => { if (!demo.value) post('/github', { cancel: true }); };
</script>

<template>
  <section id="gh" aria-label="GitHub">
    <h3><svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg> GitHub pull requests</h3>
    <div class="dim">{{ source }}</div>
    <div v-for="a in accounts" :key="a.login" class="row">
      <span :class="{ warn: a.error }">{{ a.login + (a.error ? ' · reconnect' : '') }}</span>
      <button @click="post('/github', { disconnect: a.login })">disconnect</button>
    </div>
    <template v-if="signIn">
      <div class="dim">Enter this code on GitHub:</div>
      <div class="code">{{ signIn.code }}</div>
      <div class="row">
        <a :href="signIn.url" target="_blank" rel="noopener">Open github.com/login/device</a>
        <!-- two icon buttons, in the footer's corner-icon style, to the right of the link -->
        <span class="tools">
          <button class="icon" :title="copied ? 'Copied' : 'Copy code'" aria-label="Copy code" @click="copy(signIn.code)"><span class="face">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round">
              <path v-if="copied" d="M3 8.5l3.2 3.2L13 4.8"/>
              <template v-else><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3.5v-.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h.5"/></template>
            </svg></span></button>
          <button class="icon" title="Cancel" aria-label="Cancel" @click="cancel"><span class="face">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></span></button>
        </span>
      </div>
    </template>
    <button v-else @click="post('/github', { connect: true })">{{ accounts.length ? 'Connect another account' : 'Connect an account' }}</button>
    <div class="dim">Read-only: pull requests, checks and statuses. Tokens stay in your Keychain.</div>
    <a href="https://github.com/apps/lantern-pr/installations/new" target="_blank" rel="noopener">Install the app on your account or orgs</a>
  </section>
</template>
