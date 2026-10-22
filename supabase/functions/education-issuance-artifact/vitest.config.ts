import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';

// Genuine installed Zod implementation; production Deno keeps its exact npm pin.
export default defineConfig({
  root: fileURLToPath(new URL('../../../', import.meta.url)),
  resolve: {alias: {'npm:zod@3.25.76': fileURLToPath(new URL('../../../node_modules/zod/index.js', import.meta.url))}},
  test: {environment: 'node', include: ['supabase/tests/edge/__tests__/education-issuance-*.test.ts',
    'supabase/tests/edge/__tests__/faithful-pdf.test.ts'], maxWorkers: 1, fileParallelism: false},
});
