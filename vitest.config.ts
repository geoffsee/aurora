import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/worker-runtime/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    environment: 'happy-dom',
  },
});
