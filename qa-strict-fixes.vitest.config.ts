import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  plugins: [react()], root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: fileURLToPath(new URL('./.codex-temp/qa-strict-fixes-cache/', import.meta.url)),
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'],
    include: ['src/utils/__tests__/safeInvoke.body.test.ts', 'src/components/course-builder/__tests__/ImageBlock.generated-url.test.tsx'] },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
