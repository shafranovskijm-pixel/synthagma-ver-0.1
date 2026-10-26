import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
export default defineConfig({
  root: projectRoot,
  resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/free-course-catalog/setup.tsx'],
    include: ['tests/free-course-catalog/free-course-catalog.test.tsx'],
    maxWorkers: 1, minWorkers: 1, retry: 0, testTimeout: 15000,
  },
});
