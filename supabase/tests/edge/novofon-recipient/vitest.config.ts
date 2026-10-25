import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
const port = fileURLToPath(new URL('./deno-encoding-md5-port.ts', import.meta.url));
export default defineConfig({ root: fileURLToPath(new URL('.', import.meta.url)), resolve: { alias: [
  { find: "https://deno.land/std@0.224.0/encoding/hex.ts", replacement: port },
  { find: "https://deno.land/std@0.224.0/encoding/base64.ts", replacement: port },
  { find: "https://deno.land/std@0.224.0/crypto/mod.ts", replacement: port },
 ] }, test: { environment: 'node', include: ['classic-recipient.acceptance.ts'], testTimeout: 10000, maxWorkers: 1, fileParallelism: false, retry: 0, cache: false } });
