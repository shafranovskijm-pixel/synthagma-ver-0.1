import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias: { 'npm:zod@3.25.76': 'zod', '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['supabase/tests/edge/signature-source-verification.test.ts', 'src/lib/signatureAssurance/__tests__/sourceVerification.test.ts'],
    maxWorkers: 1,
    fileParallelism: false,
  },
});
