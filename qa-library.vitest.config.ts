import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: fileURLToPath(new URL('./.codex-temp/qa-library-cache/', import.meta.url)),
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/api/__tests__/courseLibrary.test.ts',
      'src/components/course-library/__tests__/CourseLibraryUiFlows.test.tsx',
      'src/components/course-library/__tests__/CourseLibraryReader.test.tsx',
      'src/lib/__tests__/courseLibrary.test.ts'],
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
