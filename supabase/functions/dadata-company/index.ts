import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit } from '../_shared/rate-limiter.ts';
import { createDadataCompanyHandler } from './handler.ts';
const url = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth: {persistSession: false, autoRefreshToken: false}});
serve(createDadataCompanyHandler({admin, caller: header => createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {global: {headers: {Authorization: header}}, auth: {persistSession: false, autoRefreshToken: false}}), apiKey: () => Deno.env.get('DADATA_API_KEY'), network: fetch, rate: key => checkRateLimit(key, {maxRequests: 60, windowSeconds: 60}), log: event => console.warn(event)}));
