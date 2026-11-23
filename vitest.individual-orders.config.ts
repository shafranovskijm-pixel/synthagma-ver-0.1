import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({ root: fileURLToPath(new URL('.', import.meta.url)), resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)), 'npm:zod@3.25.76': 'zod' } },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'], maxWorkers: 1, fileParallelism: false, include: ['src/lib/individualEducationOrders/__tests__/*.test.ts', 'supabase/tests/edge/individual-education-order-contract-mirror.test.ts'] } });
