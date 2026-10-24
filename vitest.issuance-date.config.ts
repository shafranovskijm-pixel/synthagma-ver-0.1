import {defineConfig} from 'vitest/config';
export default defineConfig({test:{environment:'node',include:['src/lib/educationIssuance/__tests__/date.test.ts'],pool:'forks',maxWorkers:1,fileParallelism:false,testTimeout:10000,hookTimeout:10000}});
