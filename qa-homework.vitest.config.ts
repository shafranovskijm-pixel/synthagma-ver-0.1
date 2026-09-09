import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: fileURLToPath(new URL('./.codex-temp/qa-homework-cache/', import.meta.url)),
  test: {
    environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'],
    include: ['src/components/course-learning/__tests__/HomeworkSubmission.test.tsx',
      'src/components/course-learning/__tests__/TestAttemptStatus.test.tsx',
      'src/utils/__tests__/testAnswerKey.test.ts',
      'src/hooks/__tests__/useCourseLearning.test.ts',
      'src/components/organization/__tests__/HomeworkReviewDialog.test.tsx',
      'src/hooks/course-learning/__tests__/useCourseLearningFacade.cszReset.test.tsx'],
  },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
