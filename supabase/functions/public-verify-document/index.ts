import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { publicVerificationRequest } from '../_shared/public-document-verifier.ts';
Deno.serve((req) => publicVerificationRequest(req, () => createClient(
  Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)));
