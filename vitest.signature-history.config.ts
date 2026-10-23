import{defineConfig}from'vitest/config';
import{fileURLToPath}from'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),resolve:{alias:{'npm:zod@3.25.76':'zod','@':fileURLToPath(new URL('./src',import.meta.url))}},test:{environment:'node',include:['src/lib/signatureAssurance/__tests__/decisionHistory.test.ts'],maxWorkers:1,fileParallelism:false}});
