import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
const local = path => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  root: local("../../"),
  esbuild: { jsx: "automatic" },
  resolve: { alias: [
    { find: "@/integrations/supabase/publicCatalogClient", replacement: local("./public-catalog.port.ts") },
    { find: "@/integrations/supabase/client", replacement: local("./ports.tsx") },
    { find: "./CourseComments", replacement: local("./ports.tsx") },
    { find: "@", replacement: local("../../src") },
  ] },
  test: {
    environment: "jsdom", setupFiles: ["tests/course-material-passport/setup.ts"],
    include: ["tests/course-material-passport/passport-source.test.ts", "tests/course-material-passport/passport-card.test.tsx", "tests/course-material-passport/public-catalog-platform-scope.test.ts"],
    maxWorkers: 1, minWorkers: 1, fileParallelism: false, testTimeout: 15000,
  },
});
