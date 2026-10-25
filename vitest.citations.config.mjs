import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),test:{environment:'node',include:['tests/uc029-citations/citations.acceptance.ts'],maxWorkers:1,minWorkers:1,fileParallelism:false,testTimeout:15000,hookTimeout:15000}});
