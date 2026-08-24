import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname, '..'),
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/electron/security/**/*.ts', 'src/shared/types.ts'],
    },
    testTimeout: 10000,
  },
});
