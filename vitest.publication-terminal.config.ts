import path from 'node:path';
export default {envDir:path.resolve(import.meta.dirname,'.codex-no-env-uc026'),resolve:{alias:{'@':path.resolve(import.meta.dirname,'src')}},test:{environment:'node',globals:false,include:['src/lib/uc-publication/__tests__/publication.test.ts'],fileParallelism:false,maxWorkers:1,minWorkers:1,testTimeout:15000,hookTimeout:15000}};
