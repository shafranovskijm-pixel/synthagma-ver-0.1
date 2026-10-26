import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
  esbuild: { jsx: 'automatic' },
  test: { environment: 'jsdom', setupFiles: ['tests/homework-html/setup.ts'], include: ['tests/homework-html/homework-html.test.tsx'], maxWorkers: 1, minWorkers: 1, retry: 0, testTimeout: 15000 },
});
