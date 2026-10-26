import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { defineConfig } from 'vitest/config';
const root = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root, test: { environment: 'node', include: ['notification.acceptance.ts'], maxWorkers: 1, minWorkers: 1, fileParallelism: false },
  resolve: { alias: [
    { find: 'https://deno.land/std@0.168.0/http/server.ts', replacement: resolve(root, 'ports/serve.ts') },
    { find: 'https://esm.sh/@supabase/supabase-js@2', replacement: resolve(root, 'ports/sdk.ts') },
    { find: '../_shared/smtp-sender.ts', replacement: resolve(root, 'ports/smtp.ts') },
  ] },
});
