import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
 root:fileURLToPath(new URL('../..',import.meta.url)),
 define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://platform.example')},
 esbuild:{jsx:'automatic'},
 resolve:{alias:{'@':fileURLToPath(new URL('../../src',import.meta.url))}},
 test:{environment:'jsdom',environmentOptions:{jsdom:{url:'https://sintagma.example/'}},globals:false,setupFiles:['./tests/file-preview-timeout/setup.tsx'],include:['tests/file-preview-timeout/dialog.test.tsx'],maxWorkers:1,minWorkers:1,fileParallelism:false,testTimeout:15000,hookTimeout:15000},
});
