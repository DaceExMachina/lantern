import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

const publicDir = resolve('public');

export default defineConfig({
  // Composition API only: drop the Options API and the production devtools and hydration extras from the Vue bundle
  define: { __VUE_OPTIONS_API__: false, __VUE_PROD_DEVTOOLS__: false, __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false },
  build: { modulePreload: { polyfill: false } },
  test: { include: ['test/**/*.spec.js'], environment: 'happy-dom' },
  plugins: [vue(), {
    // The scene's classic scripts live in public/, which Vite neither watches for `build --watch` nor reloads the page for
    // in dev, so edits there would otherwise go unseen.
    name: 'reload-on-public',
    buildStart() {
      for (const f of readdirSync(publicDir, { recursive: true, withFileTypes: true })) if (f.isFile()) this.addWatchFile(join(f.parentPath, f.name));
    },
    hotUpdate({ file }) {
      if (file.startsWith(publicDir + '/')) this.environment.hot.send({ type: 'full-reload' });
    },
  }],
});
