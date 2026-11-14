// Candidate template only. Managed job proposal: rtn-normative-source-check,
// cron 30 * * * *, function rtn-npa-cron,
// static body {"task":"rtn-npa-reconciliation"}. No job is created by this file.
import { createClient } from 'npm:@supabase/supabase-js@2.90.1';
import { createNpaRuntime, type NpaCreateClient } from '../_shared/rtn-npa/runtime.ts';
import { createNpaScheduledHandler } from '../_shared/rtn-npa/http-handler.ts';
// Reuse this generated helper exactly; do not copy/edit its authentication.
import { authenticateCronRequest } from '../_shared/cron-auth.ts';

const runtime = createNpaRuntime({
  url: Deno.env.get('SUPABASE_URL') ?? '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
}, { createClient: createClient as unknown as NpaCreateClient, officialFetch: fetch, projectFetch: fetch });

Deno.serve(createNpaScheduledHandler({
  authenticate: authenticateCronRequest,
  enqueueDue: runtime.enqueueDue,
  execute: runtime.execute,
}));
