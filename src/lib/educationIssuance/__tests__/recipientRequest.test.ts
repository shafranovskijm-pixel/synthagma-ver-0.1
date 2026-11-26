import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actor, group, hash, issuedRecord, org, request, uid } from './fixtures';
import { recipientIntent, recipientPolicy, recipientReply } from './recipientRequest.fixtures';
import type { PolicyVersion } from '@/lib/signatureAssurance/types';

const port = vi.hoisted(() => ({ current: true, actor: '00000000-0000-4000-8000-000000000001', session: vi.fn(), rpc: vi.fn(), verify: vi.fn(), verifier: vi.fn(), policies: vi.fn(), replies: [] as any[], after: null as (() => void) | null }));
vi.mock('@/utils/courseCache', () => ({ captureOfflineContext: () => ({ actorId: port.actor, revision: 1 }), isOfflineActorCurrent: () => port.current }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: port.session }, rpc: port.rpc } }));
vi.mock('@/lib/signatureAssurance/controlledSourceVerification', () => ({ prepareControlledSignatureSourceVerification: port.verifier }));
vi.mock('@/lib/signatureAssurance/client', async () => ({ ...await vi.importActual('@/lib/signatureAssurance/client'), readSignatureAssurance: port.policies }));
import { captureIssuanceScope } from '../client';
import { eligibleIssuedRecipientPolicy, issuedRecipientIntentSchema, issuedRecipientPayloadSchema, prepareIssuedRecipientRequest, readIssuedRecipientPolicies, readIssuedRecipientRequest, resumeIssuedRecipientRequest } from '../recipientRequest';
const scope = () => captureIssuanceScope(org, { kind: 'organization' }, () => true);
let policy: PolicyVersion;
beforeEach(async () => {
  vi.clearAllMocks(); port.current = true; port.actor = actor; port.after = null; port.replies = []; policy = await recipientPolicy();
  port.session.mockImplementation(async () => ({ data: { session: { user: { id: port.actor }, access_token: 'synthetic-token' } }, error: null }));
  port.rpc.mockImplementation(() => ({ setHeader: async () => { const value = port.replies.shift(); port.after?.(); return value?.error ? value : { data: value, error: null, status: 200 }; } }));
  port.verifier.mockImplementation(() => ({ run: port.verify }));
  port.verify.mockResolvedValue({ verification_record_id: uid(85), byte_sha256: hash, byte_size: 500 });
});

describe('durable issued-copy request boundary', () => {
  it('prepares the exact saved PDF and account association with a stable retry and no caller proof or token', async () => {
    const record = issuedRecord(), operation = prepareIssuedRecipientRequest(scope(), record, policy, 30, request);
    record.artifact.artifact!.byte_sha256 = 'f'.repeat(64); policy.decision.revision = 99;
    port.replies.push({ error: { message: 'lost result' }, status: 0 }); await expect(operation.run()).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
    port.replies.push(recipientReply('prepare', recipientIntent(await recipientPolicy()))); const result = await operation.run();
    expect(result.id).toBe(uid(80)); expect(port.rpc.mock.calls[0]).toEqual(port.rpc.mock.calls[1]);
    expect(port.rpc.mock.calls[0][1]).toEqual({ p_organization_id: org, p_request_id: request, p_payload: operation.payload });
    expect(operation.payload.expected_artifact.byte_sha256).toBe(hash); expect(operation.payload.policy.decision_revision).toBe(4);
    expect(JSON.stringify(operation.payload)).not.toMatch(/actor|recipient_email|token|trusted_service|html_text/);
  });
  it('shares one in-flight prepare for a double click', async () => {
    port.replies.push(recipientReply('prepare', recipientIntent(policy))); const op = prepareIssuedRecipientRequest(scope(), issuedRecord(), policy, 30, request);
    const first = op.run(), second = op.run(); expect(first).toBe(second); await first; expect(port.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(['legacy', 'annulled', 'no_pdf', 'no_learner'] as const)('never prepares from %s record', condition => {
    const record = issuedRecord(); if (condition === 'legacy') { record.provenance = 'legacy_unverified'; record.proof_availability = 'legacy_unverified'; record.proof = null; record.frdo_facts = null; }
    if (condition === 'annulled') record.lifecycle = 'annulled'; if (condition === 'no_pdf') record.artifact = { availability: 'currently_unavailable', artifact: null }; if (condition === 'no_learner') record.official.user_id = null;
    expect(() => prepareIssuedRecipientRequest(scope(), record, policy, 30, request)).toThrow(); expect(port.rpc).not.toHaveBeenCalled();
  });
  it('rejects unaccepted or foreign rules without changing a decision', () => {
    policy.decision.state = 'reviewed'; expect(eligibleIssuedRecipientPolicy(policy)).toBe(false);
    expect(() => prepareIssuedRecipientRequest(scope(), issuedRecord(), policy, 30, request)).toThrow();
    policy.decision.state = 'centre_accepted'; policy.organization_id = uid(999); expect(() => prepareIssuedRecipientRequest(scope(), issuedRecord(), policy, 30, request)).toThrow(); expect(port.rpc).not.toHaveBeenCalled();
  });
  it('rejects actor/policy/HTML/trusted-proof extension keys and impossible green stages', () => {
    const op = prepareIssuedRecipientRequest(scope(), issuedRecord(), policy, 30, request);
    for (const key of ['actor_user_id', 'recipient_user_id', 'document_html', 'proof']) expect(issuedRecipientPayloadSchema.safeParse({ ...op.payload, [key]: uid(900) }).success).toBe(false);
    const intent = recipientIntent(policy, 'pending'); intent.proof_record_id = null; expect(issuedRecipientIntentSchema.safeParse(intent).success).toBe(false);
    const confirmed = recipientIntent(policy, 'confirmed'); confirmed.confirmation_event = null; expect(issuedRecipientIntentSchema.safeParse(confirmed).success).toBe(false);
  });
  it.each(['actor', 'org', 'kind', 'extra'] as const)('rejects a wrong %s envelope', async condition => {
    const reply: any = recipientReply('read', recipientIntent(policy)); if (condition === 'actor') reply.actor_user_id = uid(999); if (condition === 'org') reply.organization_id = uid(999); if (condition === 'kind') reply.kind = 'prepare'; if (condition === 'extra') reply.token = 'never-expose';
    port.replies.push(reply); await expect(readIssuedRecipientRequest(scope(), { kind: 'record', record_id: uid(52) })).rejects.toThrow();
  });
  it('rejects a different learner in the same record or a foreign group', async () => {
    const intent = recipientIntent(policy); intent.context.subject_user_id = uid(998); port.replies.push(recipientReply('read', intent));
    await expect(readIssuedRecipientRequest(scope(), { kind: 'record', record_id: uid(52) }, issuedRecord())).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
    port.replies.push(recipientReply('read', recipientIntent(policy)));
    await expect(readIssuedRecipientRequest(captureIssuanceScope(org, { kind: 'group', group_id: uid(999) }, () => true), { kind: 'record', record_id: uid(52) })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });
  it('rejects a substituted PDF, policy or subject in a prepare response', async () => {
    for (const damage of [(v: any) => { v.source.artifact.byte_sha256 = 'f'.repeat(64); }, (v: any) => { v.policy.decision_revision = 5; }, (v: any) => { v.context.subject_user_id = uid(999); }]) {
      const intent = recipientIntent(policy); damage(intent); port.replies.push(recipientReply('prepare', intent)); await expect(prepareIssuedRecipientRequest(scope(), issuedRecord(), policy, 30, request).run()).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
    }
  });
  it('does not use a stale actor session or apply a late response after revocation', async () => {
    port.session.mockResolvedValueOnce({ data: { session: { user: { id: uid(999) }, access_token: 'synthetic' } }, error: null });
    await expect(readIssuedRecipientRequest(scope(), { kind: 'record', record_id: uid(52) })).rejects.toMatchObject({ code: 'ACCESS_DENIED' }); expect(port.rpc).not.toHaveBeenCalled();
    port.replies.push(recipientReply('read', recipientIntent(policy))); port.after = () => { port.current = false; };
    await expect(readIssuedRecipientRequest(scope(), { kind: 'record', record_id: uid(52) })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });
  it('keeps only accepted account-PEP education policies and exposes the next real page', async () => {
    const wrong = structuredClone(policy); wrong.body.method = 'bearer_invitation_confirmation'; wrong.id = uid(900);
    port.policies.mockResolvedValue({ result: { kind: 'policy_list', policies: [wrong, policy], next_after_id: uid(901) }, capabilities: { can_draft_policy: true, can_accept_policy: true, can_bind_signature: false } });
    await expect(readIssuedRecipientPolicies(scope())).resolves.toMatchObject({ items: [{ id: policy.id }], nextAfterId: uid(901), canPrepare: true });
    expect(port.policies.mock.calls[0][1]).toEqual({ kind: 'policy_list', after_id: null, limit: 100 });
  });
  it.each([
    ['draft only',true,false,false],['accept only',false,true,false],['no authority',false,false,false],
    ['bind cannot replace acceptance',true,false,true],['bind cannot replace draft',false,true,true],['bind alone cannot grant authority',false,false,true],
  ] as const)('does not prepare an issued-copy request with %s',async(_label,canDraft,canAccept,canBind)=>{
    port.policies.mockResolvedValue({result:{kind:'policy_list',policies:[policy],next_after_id:null},capabilities:{can_draft_policy:canDraft,can_accept_policy:canAccept,can_bind_signature:canBind}});
    await expect(readIssuedRecipientPolicies(scope())).resolves.toMatchObject({items:[{id:policy.id}],nextAfterId:null,canPrepare:false});
    expect(port.rpc).not.toHaveBeenCalled();expect(port.verifier).not.toHaveBeenCalled();
  });
  it('allows accepted-policy creation authority even when the list has no signature-specific bind capability',async()=>{
    for(const canBind of [false,true]){port.policies.mockResolvedValue({result:{kind:'policy_list',policies:[policy],next_after_id:null},capabilities:{can_draft_policy:true,can_accept_policy:true,can_bind_signature:canBind}});
      await expect(readIssuedRecipientPolicies(scope())).resolves.toMatchObject({canPrepare:true});}
    expect(port.rpc).not.toHaveBeenCalled();expect(port.verifier).not.toHaveBeenCalled();
  });
  it('rejects a policy-list response after current actor authority was revoked during the await',async()=>{
    const captured=scope();port.policies.mockImplementation(async()=>{port.current=false;return{result:{kind:'policy_list',policies:[policy],next_after_id:null},capabilities:{can_draft_policy:true,can_accept_policy:true,can_bind_signature:false}};});
    await expect(readIssuedRecipientPolicies(captured)).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(port.rpc).not.toHaveBeenCalled();expect(port.verifier).not.toHaveBeenCalled();
  });

});

describe('real-byte verification and server-owned activation resume', () => {
  it('uses persisted verification/activation IDs and requires the actual saved proof before activation', async () => {
    const draft = recipientIntent(policy); port.replies.push(recipientReply('read', draft), recipientReply('read', recipientIntent(policy, 'source_verified')), recipientReply('activate', recipientIntent(policy, 'pending')));
    await expect(resumeIssuedRecipientRequest(scope(), draft)).resolves.toMatchObject({ state: 'pending' });
    expect(port.verifier.mock.calls[0]).toEqual([expect.objectContaining({ organizationId: org }), { signatureId: uid(81), party: 'recipient', documentRevisionId: null, documentHtmlSha256: 'b'.repeat(64) }, uid(82)]);
    expect(port.rpc.mock.calls[2]).toEqual(['activate_issued_recipient_request', { p_organization_id: org, p_intent_id: uid(80), p_request_id: uid(84), p_expected_payload_sha256: 'c'.repeat(64) }]);
    expect(port.rpc.mock.calls.map(call => call[0])).not.toContain('apply_signature_assurance');
  });
  it.each(['source_verified', 'bound'] as const)('resumes %s after reload with no actor-bound source verification replay', async state => {
    const saved = recipientIntent(policy, state); port.actor = uid(991); const newStaff = scope();
    port.replies.push(recipientReply('read', saved, port.actor), recipientReply('activate', recipientIntent(policy, 'pending'), port.actor));
    await expect(resumeIssuedRecipientRequest(newStaff, saved)).resolves.toMatchObject({ state: 'pending' }); expect(port.verifier).not.toHaveBeenCalled();
  });
  it.each(['pending', 'confirmed', 'closed', 'source_changed', 'source_unavailable'] as const)('reads %s truthfully without another activation or byte request', async state => {
    const saved = recipientIntent(policy, state); port.replies.push(recipientReply('read', saved));
    await expect(resumeIssuedRecipientRequest(scope(), saved)).resolves.toMatchObject({ state }); expect(port.rpc).toHaveBeenCalledTimes(1); expect(port.verifier).not.toHaveBeenCalled();
  });
  it('recovers a lost activation result through read without replaying activation or source verification', async () => {
    const saved = recipientIntent(policy, 'source_verified'); port.replies.push(recipientReply('read', saved), { error: { message: 'unknown activation result' }, status: 0 });
    await expect(resumeIssuedRecipientRequest(scope(), saved)).rejects.toThrow();
    port.replies.push(recipientReply('read', recipientIntent(policy, 'pending'))); await expect(resumeIssuedRecipientRequest(scope(), saved)).resolves.toMatchObject({ state: 'pending' });
    expect(port.rpc.mock.calls.filter(call => call[0] === 'activate_issued_recipient_request')).toHaveLength(1); expect(port.verifier).not.toHaveBeenCalled();
  });
  it('rejects mismatched real bytes or a missing/different stored proof without activating', async () => {
    const draft = recipientIntent(policy); port.replies.push(recipientReply('read', draft)); port.verify.mockResolvedValueOnce({ verification_record_id: uid(85), byte_sha256: 'f'.repeat(64), byte_size: 500 });
    await expect(resumeIssuedRecipientRequest(scope(), draft)).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
    port.replies.push(recipientReply('read', draft), recipientReply('read', recipientIntent(policy))); await expect(resumeIssuedRecipientRequest(scope(), draft)).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
    expect(port.rpc.mock.calls.filter(call => call[0] === 'activate_issued_recipient_request')).toHaveLength(0);
  });
  it('rejects a changed durable operation or source between resume and activation', async () => {
    const draft = recipientIntent(policy), changed = recipientIntent(policy, 'source_verified'); changed.operation_ids.activation_request_id = uid(999);
    port.replies.push(recipientReply('read', draft), recipientReply('read', changed)); await expect(resumeIssuedRecipientRequest(scope(), draft)).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
    expect(port.rpc.mock.calls.filter(call => call[0] === 'activate_issued_recipient_request')).toHaveLength(0);
  });
  it('keeps terminal requests readable when staff closed a draft before any source proof or binding', async () => {
    for (const state of ['rejected', 'revoked', 'expired', 'closed'] as const) {
      const saved = recipientIntent(policy, state); saved.proof_record_id = null; saved.binding_id = null; saved.signature.sent_at = null; saved.confirmation_event = null;
      port.replies.push(recipientReply('read', saved)); await expect(resumeIssuedRecipientRequest(scope(), saved)).resolves.toMatchObject({ state, proof_record_id: null, binding_id: null });
    }
    expect(port.verifier).not.toHaveBeenCalled(); expect(port.rpc.mock.calls.filter(call => call[0] === 'activate_issued_recipient_request')).toHaveLength(0);
  });
});
