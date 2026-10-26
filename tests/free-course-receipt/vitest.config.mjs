import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
  test: { environment: 'node', include: ['tests/free-course-receipt/free-course-receipt.test.ts'], maxWorkers: 1, minWorkers: 1, retry: 0, testTimeout: 15000 },
});
