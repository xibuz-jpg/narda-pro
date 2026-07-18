import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    // Nest-integration specs that need a DB are excluded from unit runs.
    exclude: ['**/*.e2e-spec.ts', 'node_modules', 'dist'],
  },
});
