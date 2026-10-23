import path from 'node:path';
export default {envDir:path.resolve(import.meta.dirname,'.codex-no-env-ad04'),resolve:{alias:{'@':path.resolve(import.meta.dirname,'src')}},test:{environment:'node',globals:false,include:['supabase/tests/edge/admission-sealed-observation.test.ts'],fileParallelism:false,maxWorkers:1,minWorkers:1,testTimeout:15000,hookTimeout:15000}};
