import { createClient } from '@supabase/supabase-js';
import { withSupportEventsProtocol } from './protocol.ts';
import { createRuntimeBackend, type EventRpcClient, type EventUserClient } from './runtime-backend.ts';

type Fallback = (request: Request) => Promise<Response>;
type RuntimeGlobal = typeof globalThis & { Deno?: { env: { get(name: string): string | undefined } } };
function env(name: string): string | undefined {
  const runtime = globalThis as RuntimeGlobal;
  return runtime.Deno?.env.get(name) ?? (typeof process !== 'undefined' ? process.env[name] : undefined);
}
function requireEnv(name: string): string {
  const value = env(name);
  if (!value) throw new Error('event_configuration_unavailable');
  return value;
}
function databaseUrl(): string {
  const url = new URL(requireEnv('SUPABASE_URL'));
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('event_configuration_unavailable');
  return url.href.replace(/\/$/, '');
}
/** Called by the deterministic post-build wrapper; the SDK OAuth handler is preserved. */
export function withSupportMcpEvents(fallback: Fallback): Fallback {
  let service: EventRpcClient | undefined;
  const backend = createRuntimeBackend({
    env,
    serviceClient() {
      service ??= createClient(databaseUrl(), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }) as unknown as EventRpcClient;
      return service;
    },
    userClient(originalBearer) {
      const key = env('SUPABASE_PUBLISHABLE_KEY') || requireEnv('SUPABASE_ANON_KEY');
      return createClient(databaseUrl(), key, {
        global: { headers: { Authorization: `Bearer ${originalBearer}` } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }) as unknown as EventUserClient;
    },
  });
  // The endpoint's metadata URL derives from trusted configuration, never the request Host.
  let metadataUrl: string;
  try { metadataUrl = `${databaseUrl()}/functions/v1/mcp/.well-known/oauth-protected-resource`; }
  catch { return fallback; }
  return withSupportEventsProtocol(fallback, backend, metadataUrl);
}
