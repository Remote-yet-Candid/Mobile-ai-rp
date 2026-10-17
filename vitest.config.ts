import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'scripts/**/*.test.ts', 'tests/**/*.test.ts'],
    testTimeout: 10000,
    maxWorkers: 2,
  },
});
