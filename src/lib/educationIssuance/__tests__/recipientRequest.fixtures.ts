import type { PolicyVersion } from '@/lib/signatureAssurance/types';
import { evidenceSha256 } from '@/lib/signatureAssurance/validation';
import type { IssuedRecipientIntent } from '../recipientRequest';
import { actor, course, enrollment, group, hash, issuedRecord, org, pupil, stamp, uid } from './fixtures';

export async function recipientPolicy(): Promise<PolicyVersion> {
  const agreementText = 'Синтетические правила получения электронной копии. Не политика клиента.';
  const raw = { version: 1 as const, classification: { document_type: 'education_document' as const, subtype: 'electronic_copy_receipt', party_role: 'student' as const },
    method: 'authenticated_account_confirmation' as const, purpose: 'account_pep' as const, identity_requirement: 'account_control' as const, authority_requirement: 'self' as const,
    basis: { kind: 'agreement' as const, explanation: 'Синтетическое основание для технической проверки.', sources: [], document_references: [] },
    agreement: { kind: 'pep_agreement' as const, version: 'test-v1', text: agreementText, sha256: await evidenceSha256(agreementText) }, consent: null,
    limitations: 'Подтверждение электронной копии не означает вручение бумажного документа.' };
  const body_json = JSON.stringify(raw), body_sha256 = await evidenceSha256(body_json);
  const body = structuredClone(raw), disclosure = { kind: 'complete' as const, redacted_reference_count: 0, redacted_content_count: 0, complete_private_evidence_verified: false };
  const projection_json = JSON.stringify({ body, body_sha256, disclosure });
  return { id: uid(70), family_id: uid(71), organization_id: org, version: 1, body, body_json, body_sha256, projection_json, projection_sha256: await evidenceSha256(projection_json), disclosure,
    created_at: stamp, created_by: actor, decision: { id: uid(72), revision: 4, state: 'centre_accepted', server_at: stamp, actor_user_id: actor,
      reason: 'Синтетическое решение для теста.', authority: { kind: 'self', declaration: null, document_reference: null, verification: 'not_verified' }, source_limits_acknowledged: true } };
}
export function recipientIntent(policy: PolicyVersion, state: IssuedRecipientIntent['state'] = 'draft'): IssuedRecipientIntent {
  const verified = ['source_verified', 'bound', 'pending', 'confirmed', 'rejected'].includes(state), bound = ['bound', 'pending', 'confirmed', 'rejected'].includes(state), sent = ['pending', 'confirmed', 'rejected'].includes(state);
  return { id: uid(80), context: { organization_id: org, record_id: uid(52), subject_user_id: pupil, enrollment_id: enrollment, course_id: course, group_id: group },
    source: { record_revision: 1, record_state_sha256: hash, artifact: issuedRecord().artifact.artifact! },
    policy: { version_id: policy.id, body_sha256: policy.body_sha256, decision_revision: policy.decision.revision, classification: structuredClone(policy.body.classification) },
    signature: { id: uid(81), document_revision_id: null, document_html_sha256: 'b'.repeat(64), expires_at: '2026-12-23T12:00:00Z', sent_at: sent ? stamp : null },
    operation_ids: { verification_request_id: uid(82), bind_request_id: uid(83), activation_request_id: uid(84) }, payload_sha256: 'c'.repeat(64), state,
    proof_record_id: verified ? uid(85) : null, binding_id: bound ? uid(86) : null,
    confirmation_event: state === 'confirmed' ? { id: uid(87), revision: 2, conclusion: 'policy_eligible_account_confirmation', server_at: stamp } : null,
    capabilities: { can_resume: ['draft', 'source_verified', 'bound'].includes(state), can_open_staff_evidence: true } };
}
export const recipientReply = (kind: 'prepare' | 'read' | 'activate', intent: IssuedRecipientIntent | null, actorId = actor) => ({ version: 1, ok: true, organization_id: org, actor_user_id: actorId, kind, intent });
