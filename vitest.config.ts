// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/core/**',
        'src/rustscript/**',
        'src/constants.ts',
        'src/client/**',
        'src/agent/**',
      ],
      exclude: ['**/*.test.ts', '**/*.md', '**/LICENSE'],
      thresholds: {
        statements: 38,
        branches: 29,
        functions: 42,
        lines: 40,
      },
    },
  },
});
