import { createClient } from 'npm:@supabase/supabase-js@2.90.1';
import { createSignatureSourceHttpHandler } from './http.ts';
import { canonicalSignatureStorageReader, SignatureSourceError, type SignatureSourceFailure } from './worker.ts';

const codes = new Set<SignatureSourceFailure>([
  'ACCESS_DENIED', 'INVALID_INPUT', 'NOT_FOUND', 'REVISION_CONFLICT', 'REQUEST_CONFLICT',
  'SOURCE_UNAVAILABLE', 'SOURCE_CHANGED', 'CLOSED', 'EXPIRED', 'LIMIT_EXCEEDED', 'DEPENDENCY_UNAVAILABLE',
]);

Deno.serve(createSignatureSourceHttpHandler(originalJwt => {
  const projectUrl = Deno.env.get('SUPABASE_URL');
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!projectUrl || !publicKey || !serviceKey) throw new SignatureSourceError('DEPENDENCY_UNAVAILABLE');
  const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
  const service = createClient(projectUrl, serviceKey, { auth: authOptions });
  return {
    async observeOriginalActor(signal) {
      if (signal.aborted) return null;
      const caller = createClient(projectUrl, publicKey, {
        auth: authOptions,
        global: {
          headers: { Authorization: 'Bearer ' + originalJwt },
          fetch: (url, init) => fetch(url, { ...init, signal }),
        },
      });
      const { data, error } = await caller.auth.getUser(originalJwt);
      return !signal.aborted && !error ? data.user?.id ?? null : null;
    },
    async service(input, signal) {
      const { data, error } = await service.rpc('uc_signature_assurance_verify_controlled_source_service', input).abortSignal(signal);
      if (error) {
        const match = /^SIGNATURE_EVIDENCE_([A-Z_]+)$/.exec(error.message ?? '');
        throw new SignatureSourceError(match && codes.has(match[1] as SignatureSourceFailure) ? match[1] as SignatureSourceFailure : 'DEPENDENCY_UNAVAILABLE');
      }
      return data;
    },
    readCanonicalObject: canonicalSignatureStorageReader(projectUrl, serviceKey),
  };
}));
