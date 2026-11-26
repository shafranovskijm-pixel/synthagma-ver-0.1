import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { sameCopyValue } from '@/lib/copyRegistry/value';
import { classification, conclusion, hash, utc, uuid } from '@/lib/signatureAssurance/contract';
import { normalizeSignatureEvidenceError, readSignatureAssurance } from '@/lib/signatureAssurance/client';
import { prepareControlledSignatureSourceVerification } from '@/lib/signatureAssurance/controlledSourceVerification';
import type { PolicyVersion } from '@/lib/signatureAssurance/types';
import { issuanceArtifactFinalRefSchema, issuanceRecordSchema } from './contract';
import { assertIssuanceRecords, issuanceScopeCurrent, type EducationIssuanceScope } from './client';
import type { IssuanceRecord } from './types';

const recordRevision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const assuranceRevision = z.number().int().min(1).max(2147483646);
export const issuedRecipientErrorCode = z.enum(['ACCESS_DENIED', 'INVALID_INPUT', 'RECIPIENT_CONTACT_REQUIRED', 'POLICY_REQUIRED', 'POLICY_NOT_ACCEPTED', 'POLICY_CHANGED', 'SOURCE_CHANGED', 'SOURCE_UNAVAILABLE', 'REQUEST_CONFLICT', 'REVISION_CONFLICT', 'CLOSED', 'EXPIRED', 'DEPENDENCY_UNAVAILABLE']);
export type IssuedRecipientErrorCode = z.infer<typeof issuedRecipientErrorCode>;
export const issuedRecipientMessages: Record<IssuedRecipientErrorCode, string> = {
  ACCESS_DENIED: 'Доступ к запросу не подтверждён.', INVALID_INPUT: 'Проверьте выбранные правила и срок подтверждения.',
  RECIPIENT_CONTACT_REQUIRED: 'В учётной записи ученика нужен действующий email. Запрос ещё не отправлен.',
  POLICY_REQUIRED: 'Выберите принятые правила ПЭП.', POLICY_NOT_ACCEPTED: 'Организация ещё не приняла подходящие правила ПЭП.',
  POLICY_CHANGED: 'Правила изменились. Обновите сведения и выберите принятую редакцию.',
  SOURCE_CHANGED: 'Версия документа изменилась. Обновите карточку; прежний запрос сохранён.',
  SOURCE_UNAVAILABLE: 'Закреплённый PDF сейчас недоступен. Подтверждение получения не отправлено.',
  REQUEST_CONFLICT: 'Этот запрос связан с другими данными. Обновите сведения перед продолжением.',
  REVISION_CONFLICT: 'Сведения изменились. Проверьте состояние перед продолжением.',
  CLOSED: 'Запрос закрыт. История подтверждений сохранена.', EXPIRED: 'Срок подтверждения истёк. История запроса сохранена.',
  DEPENDENCY_UNAVAILABLE: 'Результат пока не подтверждён. Проверьте состояние сохранённого запроса.',
};
export class IssuedRecipientError extends Error {
  constructor(readonly code: IssuedRecipientErrorCode = 'DEPENDENCY_UNAVAILABLE') { super(issuedRecipientMessages[code]); this.name = 'IssuedRecipientError'; }
}
const failure = z.object({ version: z.literal(1), ok: z.literal(false), code: issuedRecipientErrorCode }).strict();
export const issuedRecipientPolicySchema = z.object({ version_id: uuid, body_sha256: hash, decision_revision: assuranceRevision }).strict();
export const issuedRecipientPayloadSchema = z.object({
  version: z.literal(1), record_id: uuid, expected_record_revision: recordRevision, expected_record_state_sha256: hash,
  expected_artifact: issuanceArtifactFinalRefSchema, policy: issuedRecipientPolicySchema,
  purpose: z.literal('electronic_copy_receipt'), expires_days: z.number().int().min(1).max(90),
}).strict();
const querySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('record'), record_id: uuid }).strict(),
  z.object({ kind: z.literal('intent'), intent_id: uuid }).strict(),
]);
export const issuedRecipientIntentSchema = z.object({
  id: uuid,
  context: z.object({ organization_id: uuid, record_id: uuid, subject_user_id: uuid, enrollment_id: uuid, course_id: uuid, group_id: uuid.nullable() }).strict(),
  source: z.object({ record_revision: recordRevision, record_state_sha256: hash, artifact: issuanceArtifactFinalRefSchema }).strict(),
  policy: issuedRecipientPolicySchema.extend({ classification }).strict(),
  signature: z.object({ id: uuid, document_revision_id: z.null(), document_html_sha256: hash, expires_at: utc, sent_at: utc.nullable() }).strict(),
  operation_ids: z.object({ verification_request_id: uuid, bind_request_id: uuid, activation_request_id: uuid }).strict(),
  payload_sha256: hash,
  state: z.enum(['draft', 'source_verified', 'bound', 'pending', 'confirmed', 'rejected', 'expired', 'revoked', 'source_changed', 'source_unavailable', 'closed']),
  proof_record_id: uuid.nullable(), binding_id: uuid.nullable(),
  confirmation_event: z.object({ id: uuid, revision: assuranceRevision, conclusion, server_at: utc }).strict().nullable(),
  capabilities: z.object({ can_resume: z.boolean(), can_open_staff_evidence: z.boolean() }).strict(),
}).strict().superRefine((value, ctx) => {
  const invalid = value.policy.classification.document_type !== 'education_document' || value.policy.classification.party_role === 'sender'
    || value.binding_id !== null && value.proof_record_id === null
    || value.confirmation_event !== null && value.binding_id === null
    || value.state === 'draft' && (value.proof_record_id !== null || value.binding_id !== null || value.signature.sent_at !== null || value.confirmation_event !== null)
    || value.state === 'source_verified' && (value.proof_record_id === null || value.binding_id !== null || value.signature.sent_at !== null || value.confirmation_event !== null)
    || value.state === 'bound' && (value.proof_record_id === null || value.binding_id === null || value.signature.sent_at !== null || value.confirmation_event !== null)
    || ['pending', 'confirmed'].includes(value.state) && (value.proof_record_id === null || value.binding_id === null || value.signature.sent_at === null)
    || value.state === 'confirmed' && (value.confirmation_event === null || value.confirmation_event.conclusion !== 'policy_eligible_account_confirmation')
    || value.capabilities.can_resume && !['draft', 'source_verified', 'bound'].includes(value.state)
    || new Set([value.operation_ids.verification_request_id, value.operation_ids.bind_request_id, value.operation_ids.activation_request_id]).size !== 3;
  if (invalid) ctx.addIssue({ code: 'custom', message: 'Inconsistent issued-copy request facts' });
});
export type IssuedRecipientIntent = z.infer<typeof issuedRecipientIntentSchema>;
export type IssuedRecipientPayload = z.infer<typeof issuedRecipientPayloadSchema>;
const success = z.object({ version: z.literal(1), ok: z.literal(true), organization_id: uuid, actor_user_id: uuid, kind: z.enum(['prepare', 'read', 'activate']), intent: issuedRecipientIntentSchema.nullable() }).strict();
const current = (scope: EducationIssuanceScope) => { if (!issuanceScopeCurrent(scope)) throw new IssuedRecipientError('ACCESS_DENIED'); };
const freeze = <T>(value: T): T => { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); } return value; };
export function normalizeIssuedRecipientError(error: unknown): IssuedRecipientError {
  if (error instanceof IssuedRecipientError) return error;
  const raw = error as { code?: string; status?: number; message?: string } | null;
  if (raw?.code === '42501' || raw?.status === 401 || raw?.status === 403) return new IssuedRecipientError('ACCESS_DENIED');
  const domain = issuedRecipientErrorCode.safeParse(raw?.message?.match(/ISSUED_RECIPIENT_([A-Z_]+)(?:\b|$)/)?.[1]);
  if (domain.success) return new IssuedRecipientError(domain.data);
  if (raw?.code === '22023') return new IssuedRecipientError('INVALID_INPUT');
  if (raw?.code === '40001' || raw?.code === 'PT409') return new IssuedRecipientError('REVISION_CONFLICT');
  const signature = normalizeSignatureEvidenceError(error);
  const mapped = issuedRecipientErrorCode.safeParse(signature.code);
  return new IssuedRecipientError(mapped.success ? mapped.data : 'DEPENDENCY_UNAVAILABLE');
}
async function call(scope: EducationIssuanceScope, kind: 'prepare' | 'read' | 'activate', name: string, args: Record<string, unknown>) {
  current(scope); const session = await supabase.auth.getSession(); current(scope);
  if (session.error || session.data.session?.user.id !== scope.actorId || !session.data.session.access_token) throw new IssuedRecipientError('ACCESS_DENIED');
  const result = await supabase.rpc(name as never, args as never).setHeader('Authorization', 'Bearer ' + session.data.session.access_token); current(scope);
  if (result.status === 401 || result.status === 403) throw new IssuedRecipientError('ACCESS_DENIED');
  if (result.error) throw normalizeIssuedRecipientError(result.error);
  const denied = failure.safeParse(result.data); if (denied.success) throw new IssuedRecipientError(denied.data.code);
  const parsed = success.safeParse(result.data);
  if (!parsed.success || parsed.data.organization_id !== scope.organizationId || parsed.data.actor_user_id !== scope.actorId || parsed.data.kind !== kind) throw new IssuedRecipientError();
  const intent = parsed.data.intent;
  if (intent && (intent.context.organization_id !== scope.organizationId || scope.issuanceScope.kind === 'group' && intent.context.group_id !== scope.issuanceScope.group_id)) throw new IssuedRecipientError('ACCESS_DENIED');
  return intent ? freeze(intent) : null;
}
export function issuedRecipientRecordAvailable(scope: EducationIssuanceScope, record: IssuanceRecord): boolean {
  try {
    current(scope); const parsed = issuanceRecordSchema.safeParse(record); if (!parsed.success) return false;
    assertIssuanceRecords(scope, [record]);
    return record.capabilities.can_read && record.provenance === 'controlled_issuance' && record.lifecycle === 'active' && record.revision > 0
      && record.artifact.availability === 'available' && !!record.artifact.artifact && !!record.official.user_id && !!record.official.enrollment_id && !!record.official.course_id;
  } catch { return false; }
}
export function eligibleIssuedRecipientPolicy(policy: PolicyVersion): boolean {
  return policy.decision.state === 'centre_accepted' && policy.body.classification.document_type === 'education_document' && policy.body.classification.party_role !== 'sender'
    && policy.body.method === 'authenticated_account_confirmation' && policy.body.purpose === 'account_pep' && policy.body.identity_requirement === 'account_control' && policy.body.authority_requirement === 'self';
}
export async function readIssuedRecipientPolicies(scope: EducationIssuanceScope, afterId: string | null = null) {
  current(scope); const value = await readSignatureAssurance(scope, { kind: 'policy_list', after_id: afterId, limit: 100 }); current(scope);
  if (value.result.kind !== 'policy_list') throw new IssuedRecipientError();
  return { items: value.result.policies.filter(eligibleIssuedRecipientPolicy), nextAfterId: value.result.next_after_id, canPrepare: value.capabilities.can_draft_policy && value.capabilities.can_accept_policy };
}
export async function readIssuedRecipientRequest(scope: EducationIssuanceScope, input: z.infer<typeof querySchema>, record?: IssuanceRecord) {
  current(scope); const query = querySchema.safeParse(structuredClone(input)); if (!query.success) throw new IssuedRecipientError('INVALID_INPUT');
  if (record) {
    if (!issuanceRecordSchema.safeParse(record).success || query.data.kind !== 'record' || query.data.record_id !== record.official.id) throw new IssuedRecipientError('INVALID_INPUT');
    try { assertIssuanceRecords(scope, [record]); } catch { throw new IssuedRecipientError('ACCESS_DENIED'); }
  }
  const intent = await call(scope, 'read', 'read_issued_recipient_request', { p_organization_id: scope.organizationId, p_query: query.data });
  if (intent && (query.data.kind === 'record' ? intent.context.record_id !== query.data.record_id : intent.id !== query.data.intent_id)) throw new IssuedRecipientError('SOURCE_CHANGED');
  if (intent && record && (intent.context.subject_user_id !== record.official.user_id || intent.context.enrollment_id !== record.official.enrollment_id || intent.context.course_id !== record.official.course_id || intent.context.group_id !== record.official.group_id)) throw new IssuedRecipientError('SOURCE_CHANGED');
  return intent;
}
function sameIntentSource(before: IssuedRecipientIntent, after: IssuedRecipientIntent) {
  return before.id === after.id && sameCopyValue(before.context, after.context) && sameCopyValue(before.source, after.source) && sameCopyValue(before.policy, after.policy)
    && before.signature.id === after.signature.id && before.signature.document_html_sha256 === after.signature.document_html_sha256
    && before.signature.expires_at === after.signature.expires_at && sameCopyValue(before.operation_ids, after.operation_ids) && before.payload_sha256 === after.payload_sha256;
}
export function prepareIssuedRecipientRequest(scope: EducationIssuanceScope, record: IssuanceRecord, policy: PolicyVersion, expiresDays: number, requestId: string = crypto.randomUUID()) {
  current(scope);
  if (!issuedRecipientRecordAvailable(scope, record)) throw new IssuedRecipientError('SOURCE_UNAVAILABLE');
  if (policy.organization_id !== scope.organizationId || !eligibleIssuedRecipientPolicy(policy)) throw new IssuedRecipientError('POLICY_NOT_ACCEPTED');
  const parsed = issuedRecipientPayloadSchema.safeParse({ version: 1, record_id: record.official.id, expected_record_revision: record.revision, expected_record_state_sha256: record.state_hash,
    expected_artifact: structuredClone(record.artifact.artifact), policy: { version_id: policy.id, body_sha256: policy.body_sha256, decision_revision: policy.decision.revision }, purpose: 'electronic_copy_receipt', expires_days: expiresDays });
  if (!parsed.success || !uuid.safeParse(requestId).success) throw new IssuedRecipientError('INVALID_INPUT');
  const payload = freeze(parsed.data), selected = freeze({ user: record.official.user_id, enrollment: record.official.enrollment_id, course: record.official.course_id, group: record.official.group_id, classification: structuredClone(policy.body.classification) });
  let inFlight: Promise<IssuedRecipientIntent> | null = null;
  const execute = async () => {
    const intent = await call(scope, 'prepare', 'prepare_issued_recipient_request', { p_organization_id: scope.organizationId, p_request_id: requestId, p_payload: payload });
    if (!intent || intent.context.record_id !== payload.record_id || intent.context.subject_user_id !== selected.user || intent.context.enrollment_id !== selected.enrollment || intent.context.course_id !== selected.course || intent.context.group_id !== selected.group
      || intent.source.record_revision !== payload.expected_record_revision || intent.source.record_state_sha256 !== payload.expected_record_state_sha256 || !sameCopyValue(intent.source.artifact, payload.expected_artifact)
      || intent.policy.version_id !== payload.policy.version_id || intent.policy.body_sha256 !== payload.policy.body_sha256 || intent.policy.decision_revision !== payload.policy.decision_revision || !sameCopyValue(intent.policy.classification, selected.classification)) throw new IssuedRecipientError('SOURCE_CHANGED');
    return intent;
  };
  return Object.freeze({ requestId, payload, run() { current(scope); if (!inFlight) inFlight = execute().catch(error => { throw normalizeIssuedRecipientError(error); }).finally(() => { inFlight = null; }); return inFlight; } });
}
/** Read first on every resume. A proof/binding survives reload and is never replayed as a different actor's verification. */
export async function resumeIssuedRecipientRequest(scope: EducationIssuanceScope, selected: IssuedRecipientIntent): Promise<IssuedRecipientIntent> {
  current(scope); const checked = issuedRecipientIntentSchema.safeParse(selected); if (!checked.success) throw new IssuedRecipientError('INVALID_INPUT');
  let intent = await readIssuedRecipientRequest(scope, { kind: 'intent', intent_id: checked.data.id });
  if (!intent || !sameIntentSource(checked.data, intent)) throw new IssuedRecipientError('SOURCE_CHANGED');
  if (!intent.capabilities.can_resume) return intent;
  if (intent.state === 'draft') {
    // The persisted ID passed the canonical UUID schema; the existing helper infers its default UUID template type.
    const proof = await prepareControlledSignatureSourceVerification(scope, { signatureId: intent.signature.id, party: 'recipient', documentRevisionId: null, documentHtmlSha256: intent.signature.document_html_sha256 }, intent.operation_ids.verification_request_id as ReturnType<typeof crypto.randomUUID>).run(); current(scope);
    if (proof.byte_sha256 !== intent.source.artifact.byte_sha256 || proof.byte_size !== intent.source.artifact.byte_size) throw new IssuedRecipientError('SOURCE_CHANGED');
    const saved = await readIssuedRecipientRequest(scope, { kind: 'intent', intent_id: intent.id });
    if (!saved || !sameIntentSource(intent, saved) || saved.proof_record_id !== proof.verification_record_id) throw new IssuedRecipientError('SOURCE_CHANGED');
    intent = saved;
  }
  if (!intent.capabilities.can_resume) return intent;
  if (!['source_verified', 'bound'].includes(intent.state) || !intent.proof_record_id) throw new IssuedRecipientError('SOURCE_UNAVAILABLE');
  const active = await call(scope, 'activate', 'activate_issued_recipient_request', { p_organization_id: scope.organizationId, p_intent_id: intent.id, p_request_id: intent.operation_ids.activation_request_id, p_expected_payload_sha256: intent.payload_sha256 });
  if (!active || !sameIntentSource(intent, active) || !['pending', 'confirmed', 'rejected', 'expired', 'revoked', 'closed'].includes(active.state)) throw new IssuedRecipientError('SOURCE_CHANGED');
  return active;
}
