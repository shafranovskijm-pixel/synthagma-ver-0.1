import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url)),'npm:zod@3.25.76':'zod'}},test:{environment:'jsdom',globals:true,setupFiles:['./src/test/setup.ts'],maxWorkers:1,fileParallelism:false,include:['src/lib/individualEducationIssuance/__tests__/*.test.ts','src/components/organization/individual-education-issuance/__tests__/*.test.tsx','supabase/tests/edge/individual-admission-evidence-contract-mirror.test.ts']}});
