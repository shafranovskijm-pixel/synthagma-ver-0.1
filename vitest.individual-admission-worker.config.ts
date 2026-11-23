import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)), 'npm:zod@3.25.76': 'zod' } },
  test: { environment: 'node', fileParallelism: false, maxWorkers: 1, testTimeout: 15000, include: [
    'supabase/tests/edge/individual-admission-evidence-v2.test.ts',
    'supabase/tests/edge/__tests__/admission-case-evidence-commit.test.ts',
    'supabase/tests/edge/__tests__/admission-case-evidence-file.test.ts',
  ] },
});
