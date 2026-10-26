import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('..',import.meta.url)),esbuild:{jsx:'automatic'},resolve:{alias:{'@':fileURLToPath(new URL('../src',import.meta.url))}},test:{environment:'jsdom',globals:false,include:['tests/course-test-report-students-tab.test.tsx'],maxWorkers:1,minWorkers:1,fileParallelism:false,testTimeout:10000,hookTimeout:10000}});
