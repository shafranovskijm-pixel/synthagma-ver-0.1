import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { failure, hash, uuid } from './contract.ts';
import { SignatureEvidenceError, signatureAssuranceScopeCurrent, type SignatureAssuranceScope } from './client.ts';
import type { SigningParty } from './types.ts';

const selectionSchema = z.object({
  signatureId: uuid,
  party: z.enum(['sender', 'recipient']),
  documentRevisionId: uuid.nullable(),
  documentHtmlSha256: hash,
}).strict();
const resultSchema = z.object({
  version: z.literal(1), ok: z.literal(true), kind: z.literal('source_verified'),
  verification_request_id: uuid, verification_record_id: uuid,
  outcome: z.enum(['applied', 'replayed']), verified_at: z.string().max(64).datetime({ offset: false }),
  organization_id: uuid, signature_id: uuid, chosen_party: z.enum(['sender', 'recipient']),
  document_revision_id: uuid.nullable(), document_html_sha256: hash,
  byte_sha256: hash, byte_size: z.number().int().min(1).max(20 * 1024 * 1024),
}).strict();
export interface SignatureSourceSelection {
  signatureId: string; party: SigningParty; documentRevisionId: string | null; documentHtmlSha256: string;
}
export type SignatureSourceVerification = z.infer<typeof resultSchema>;
const current = (scope: SignatureAssuranceScope) => {
  if (!signatureAssuranceScopeCurrent(scope)) throw new SignatureEvidenceError('ACCESS_DENIED');
};

/** One stable technical request. It never creates a signature or policy/agreement decision. */
export function prepareSignatureSourceVerification(scope: SignatureAssuranceScope, value: SignatureSourceSelection, requestId = crypto.randomUUID()) {
  const capturedScope = Object.freeze({ ...scope });
  current(capturedScope);
  const parsed = selectionSchema.safeParse(structuredClone(value));
  if (!parsed.success || !uuid.safeParse(requestId).success) throw new SignatureEvidenceError('INVALID_INPUT');
  const selected = Object.freeze(parsed.data);
  const body = Object.freeze({
    version: 1, action: 'verify_source', verification_request_id: requestId,
    address: Object.freeze({ kind: 'authenticated_signature', organization_id: capturedScope.organizationId, signature_id: selected.signatureId, chosen_party: selected.party }),
    expected_document_revision_id: selected.documentRevisionId, document_html_sha256: selected.documentHtmlSha256,
  });
  let inFlight: Promise<SignatureSourceVerification> | null = null;
  const execute = async (): Promise<SignatureSourceVerification> => {
    current(capturedScope);
    const session = await supabase.auth.getSession(); current(capturedScope);
    const jwt = session.data.session?.access_token;
    if (session.error || !jwt || session.data.session?.user.id !== capturedScope.actorId) throw new SignatureEvidenceError('ACCESS_DENIED');
    const verified = await supabase.auth.getUser(jwt); current(capturedScope);
    if (verified.error || verified.data.user?.id !== capturedScope.actorId) throw new SignatureEvidenceError('ACCESS_DENIED');
    const response = await supabase.functions.invoke('signature-source-verification', { headers: { Authorization: 'Bearer ' + jwt }, body, timeout: 60000 });
    current(capturedScope);
    let data: unknown = response.data;
    if (response.error) {
      const context = (response.error as { context?: unknown }).context;
      if (context instanceof Response) {
        try { data = await context.clone().json(); } catch { data = null; }
        current(capturedScope);
      }
      const denied = failure.safeParse(data);
      throw new SignatureEvidenceError(denied.success ? denied.data.code : 'DEPENDENCY_UNAVAILABLE');
    }
    const denied = failure.safeParse(data);
    if (denied.success) throw new SignatureEvidenceError(denied.data.code);
    const checked = resultSchema.safeParse(data);
    if (!checked.success) throw new SignatureEvidenceError('DEPENDENCY_UNAVAILABLE');
    const result = checked.data;
    if (result.verification_request_id !== requestId || result.organization_id !== capturedScope.organizationId
      || result.signature_id !== selected.signatureId || result.chosen_party !== selected.party
      || result.document_revision_id !== selected.documentRevisionId || result.document_html_sha256 !== selected.documentHtmlSha256) {
      throw new SignatureEvidenceError('SOURCE_CHANGED');
    }
    current(capturedScope);
    return Object.freeze(result);
  };
  return Object.freeze({
    requestId, selection: selected,
    run(): Promise<SignatureSourceVerification> {
      current(capturedScope);
      if (!inFlight) inFlight = execute().catch(error => {
        if (error instanceof SignatureEvidenceError) throw error;
        throw new SignatureEvidenceError('DEPENDENCY_UNAVAILABLE');
      }).finally(() => { inFlight = null; });
      return inFlight;
    },
  });
}
