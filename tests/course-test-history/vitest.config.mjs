import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
 root:fileURLToPath(new URL('../..',import.meta.url)),
 esbuild:{jsx:'automatic'},
 resolve:{alias:[
  {find:'@/integrations/supabase/client',replacement:fileURLToPath(new URL('./client.port.ts',import.meta.url))},
  {find:'@',replacement:fileURLToPath(new URL('../../src',import.meta.url))},
 ]},
 test:{environment:'jsdom',globals:false,setupFiles:['./tests/course-test-history/setup.ts'],include:['tests/course-test-history/*.test.{ts,tsx}'],maxWorkers:1,minWorkers:1,fileParallelism:false,testTimeout:10000,hookTimeout:10000},
});
