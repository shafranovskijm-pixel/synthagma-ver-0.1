import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
 envDir: '.unused-test-environment',
 resolve:{alias:[{find:'@',replacement:fileURLToPath(new URL('./src',import.meta.url))},{find:'npm:zod@3.25.76',replacement:fileURLToPath(new URL('./node_modules/zod/index.js',import.meta.url))}]},
 test:{globals:true,environment:'jsdom',setupFiles:['./src/test/setup.ts'],include:['src/api/__tests__/erroneousCourseAssignment.test.ts','src/api/__tests__/enrollments.test.ts','src/components/organization/__tests__/CancelCourseAssignmentButton.test.tsx','src/api/__tests__/students.retained-assignment.test.ts'],fileParallelism:false,maxWorkers:1},
});
