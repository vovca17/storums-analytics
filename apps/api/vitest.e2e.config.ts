import { defineConfig } from 'vitest/config';

/** E2E: поднимает собранный API (dist) на тестовой базе и ходит в него по HTTP. */
export default defineConfig({
  test: {
    include: ['test/**/*.e2e.ts'],
    globalSetup: ['test/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
