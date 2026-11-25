import { defineConfig } from 'vitest/config';
import path from 'node:path';

// The app resolves `@/*` to `src/*` through tsconfig paths; vitest needs the
// same mapping or a test cannot import the module it is testing.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
