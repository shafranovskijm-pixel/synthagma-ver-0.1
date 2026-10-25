import{fileURLToPath}from'node:url';
export default{root:fileURLToPath(new URL('.',import.meta.url)),test:{environment:'node',maxWorkers:1,fileParallelism:false,include:['src/lib/archiveCases/__tests__/sealedRead.test.ts','src/lib/archiveCases/__tests__/sealedHttp.test.ts','src/lib/archiveCases/__tests__/restoreWorker.test.ts','src/lib/archiveCases/__tests__/restoreHttp.test.ts']}};
