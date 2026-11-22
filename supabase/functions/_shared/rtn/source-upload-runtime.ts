import { createClient } from 'npm:@supabase/supabase-js@2.90.1';
import { createRtnRuntime } from './runtime.ts';
import { createSourceUploadPrivateFetch } from './source-upload-private-fetch.ts';
import type { SourceUploadWork } from './source-upload-handler.ts';

/** A new private SDK scope; the existing source worker/Auth/TLS transports are
 * unchanged. Its canonical normalizer is reused, never its official fetch. */
export function createRtnSourceUploadRuntime() {
  const url = Deno.env.get('SUPABASE_URL'), anon = Deno.env.get('SUPABASE_ANON_KEY'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !key) throw new Error('RTN_UPLOAD_CONFIGURATION_REQUIRED');
  const normalize = createRtnRuntime().normalize;
  const auth = { persistSession: false, autoRefreshToken: false };
  return {
    createWork(deadlineAt: number, signal: AbortSignal): SourceUploadWork {
      const privateFetch = createSourceUploadPrivateFetch(fetch, url, deadlineAt, signal);
      return {
        service: createClient(url, key, { auth, global: { fetch: privateFetch } }) as unknown as SourceUploadWork['service'],
        user: (authorization: string) => createClient(url, anon, { auth,
          global: { fetch: privateFetch, headers: { Authorization: authorization } } }) as unknown as ReturnType<SourceUploadWork['user']>,
        normalize,
      };
    },
  };
}
