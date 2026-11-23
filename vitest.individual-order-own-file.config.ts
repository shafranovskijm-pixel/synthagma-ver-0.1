import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({ root: fileURLToPath(new URL('.', import.meta.url)), resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)), 'npm:zod@3.25.76': 'zod' } }, test: { environment: 'node', maxWorkers: 1, fileParallelism: false, include: ['supabase/tests/edge/individual-education-order-own-file.unit.test.ts'] } });
