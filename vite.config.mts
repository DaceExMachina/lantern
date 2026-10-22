import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: { modulePreload: { polyfill: false } },
  test: { include: ['test/**/*.spec.js'], environment: 'happy-dom' },
});
