import {defineConfig} from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import {fileURLToPath} from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),plugins:[react()],resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},test:{environment:'jsdom',globals:true,setupFiles:['./src/test/setup.ts'],include:['src/lib/admissionCases/__tests__/uploadErrors.test.tsx'],maxWorkers:1,fileParallelism:false}});
