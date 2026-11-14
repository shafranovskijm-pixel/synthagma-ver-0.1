// Candidate template only. Import paths are adjusted during a reviewed release.
// This file has not been executed against a real environment.
import { createClient } from 'npm:@supabase/supabase-js@2.90.1';
import { createNpaRuntime, type NpaCreateClient } from '../_shared/rtn-npa/runtime.ts';
import { createNpaUserHandler } from '../_shared/rtn-npa/http-handler.ts';

// Supabase Edge exposes this optional global; ordinary Deno has the fallback.
declare const EdgeRuntime: { waitUntil(task: Promise<unknown>): void };

const runtime = createNpaRuntime({
  url: Deno.env.get('SUPABASE_URL') ?? '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
}, { createClient: createClient as unknown as NpaCreateClient, officialFetch: fetch, projectFetch: fetch });

Deno.serve(createNpaUserHandler({
  user: runtime.user,
  execute: runtime.execute,
  // Documented runtime primitive only, never a browser capability flag.
  ...(typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function'
    ? { waitUntil: (task: Promise<unknown>) => EdgeRuntime.waitUntil(task) } : {}),
  onBackgroundError: () => console.error('RTN_NPA_BACKGROUND_EXECUTION_UNCERTAIN'),
}));
