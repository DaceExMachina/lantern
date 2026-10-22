import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Composition API only: drop the Options API and the production devtools and hydration extras from the Vue bundle
  define: { __VUE_OPTIONS_API__: false, __VUE_PROD_DEVTOOLS__: false, __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false },
  build: { modulePreload: { polyfill: false } },
  // the scene's tests run minutes of frames, some over hundreds of fresh pages, which a slow CI runner can take a while over
  test: { include: ['test/**/*.spec.js'], environment: 'happy-dom', setupFiles: ['test/setup.js'], testTimeout: 120_000 },
  plugins: [vue()],
});
