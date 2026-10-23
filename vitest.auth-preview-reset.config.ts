import{defineConfig}from'vitest/config';
import{fileURLToPath}from'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),esbuild:{jsx:'automatic'},resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},test:{environment:'jsdom',include:['src/hooks/__tests__/useAuth.previewReset.test.tsx','src/hooks/__tests__/useAuth.staffRefresh.test.tsx','src/hooks/__tests__/useAuth.offlinePrivacy.test.tsx'],maxWorkers:1,fileParallelism:false}});
