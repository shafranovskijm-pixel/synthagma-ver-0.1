import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit } from '../_shared/rate-limiter.ts';
import { createCourseInvitationHandler } from './handler.ts';
const url = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth: {persistSession: false, autoRefreshToken: false}});
serve(createCourseInvitationHandler({admin, caller: header => createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {global: {headers: {Authorization: header}}, auth: {persistSession: false, autoRefreshToken: false}}), apiKey: () => Deno.env.get('RESEND_API_KEY'), network: fetch, rate: key => checkRateLimit(key, {maxRequests: 10, windowSeconds: 60}), log: event => console.warn(event)}));
