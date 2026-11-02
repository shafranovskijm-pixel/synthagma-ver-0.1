// Source-only candidate. Deploy with verify_jwt=false; every wake is HMAC-authenticated.
// Data-free readiness probe: exact service-role Bearer OR purpose-separated
// short-lived HMAC with a one-use backend nonce. Neither mode enables delivery.
import { createClient } from 'npm:@supabase/supabase-js@2.90.1';
import { createWorkerHttpHandler } from '../_shared/support-mcp-events/worker-http.ts';
import type { RpcClient } from '../_shared/support-mcp-events/delivery.ts';

const url=Deno.env.get('SUPABASE_URL');
const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if(!url||!key)throw new Error('worker_config_missing');
const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createWorkerHttpHandler({client:client as unknown as RpcClient,env:(name)=>Deno.env.get(name)}));
