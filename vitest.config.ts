import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**', 'src/rustscript/**', 'src/constants.ts'],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 60,
        lines: 80,
      },
    },
  },
});
