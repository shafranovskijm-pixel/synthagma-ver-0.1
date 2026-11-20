import { createClient } from 'npm:@supabase/supabase-js@2.90.1';
import { createDeadlinePrivateFetch, createRtnPublisherTransport } from './news-publisher-http-client.ts';
import type { NewsWorkerClient } from './news-worker.ts';
import { reconcileRtnNewsArchive } from './news-archive-worker.ts';

/** Separate news composition. Existing question-bank runtime is unchanged. */
export function createRtnNewsRuntime() {
  const url = Deno.env.get('SUPABASE_URL'), anon = Deno.env.get('SUPABASE_ANON_KEY'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !key) throw new Error('RTN_NEWS_SERVICE_CONFIGURATION_REQUIRED');
  const auth = { persistSession: false, autoRefreshToken: false };
  // A fresh SDK client is scoped to this work deadline. upload FileOptions does
  // not forward a signal; the supported global.fetch boundary really does.
  const privateClient = (deadlineAt: number, signal?: AbortSignal) => createClient(url, key, {
    auth, global: { fetch: createDeadlinePrivateFetch(fetch, url, deadlineAt, signal) },
  }) as unknown as NewsWorkerClient;
  return {
    user: (authorization: string, deadlineAt: number, signal: AbortSignal) => createClient(url, anon, {
      auth, global: { fetch: createDeadlinePrivateFetch(fetch, url, deadlineAt, signal), headers: { Authorization: authorization } },
    }) as never,
    createWork: (deadlineAt: number, signal: AbortSignal) => {
      const service = privateClient(deadlineAt, signal);
      const transport = createRtnPublisherTransport({
        rpc: service,
        fetcher: (input, init) => fetch(input, init as RequestInit & { client: Deno.HttpClient }),
        createHttpClient: typeof Deno.createHttpClient === 'function' ? options => Deno.createHttpClient(options) : undefined,
      });
      return {
        service,
        forRssClaim: (claim: Parameters<typeof transport.forRssClaim>[0]) => transport.forRssClaim(claim, signal),
        reconcileArchive: () => reconcileRtnNewsArchive({ service, privateClient, transport }, deadlineAt, signal),
      };
    },
  };
}
