import { createClient } from 'npm:@supabase/supabase-js@2.90.1';
import { createWithRtnNewsFetch } from './news-http-client.ts';
import type { NewsWorkerClient } from './news-worker.ts';

/** Separate news composition. Existing question-bank runtime is unchanged. */
export function createRtnNewsRuntime() {
  const url = Deno.env.get('SUPABASE_URL'), anon = Deno.env.get('SUPABASE_ANON_KEY'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !key) throw new Error('RTN_NEWS_SERVICE_CONFIGURATION_REQUIRED');
  const auth = { persistSession: false, autoRefreshToken: false };
  // Bound SDK headers AND response-body consumption through the native signal.
  // This is ordinary application transport, never a browser or TLS bypass.
  const sdkFetch: typeof fetch = (input, init = {}) => fetch(input, {
    ...init, signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
  });
  return {
    service: createClient(url, key, { auth, global: { fetch: sdkFetch } }) as unknown as NewsWorkerClient,
    user: (authorization: string) => createClient(url, anon, { auth, global: { fetch: sdkFetch, headers: { Authorization: authorization } } }) as never,
    withNewsFetch: createWithRtnNewsFetch({
      fetcher: (input, init) => fetch(input, init as RequestInit & { client: Deno.HttpClient }),
      createHttpClient: typeof Deno.createHttpClient === 'function' ? options => Deno.createHttpClient(options) : undefined,
    }),
  };
}
