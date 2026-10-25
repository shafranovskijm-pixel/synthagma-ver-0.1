import{defineConfig}from'vitest/config';
import{fileURLToPath}from'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),test:{environment:'node',maxWorkers:1,fileParallelism:false,include:['src/lib/archiveCases/__tests__/contract.test.ts','src/lib/archiveCases/__tests__/worker.test.ts','src/lib/archiveCases/__tests__/http.test.ts']}});
