import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  test: { environment: 'node', include: ['src/hooks/course-learning/__tests__/markLessonProgress.test.ts'], maxWorkers: 1, minWorkers: 1, retry: 0, testTimeout: 15000 },
});
