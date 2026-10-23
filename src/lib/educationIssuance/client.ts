import { supabase } from '@/integrations/supabase/client';
import { captureCustomJournalScope, customJournalScopeCurrent, type CustomJournalScope } from '@/lib/customJournals/client';
import { sameCopyValue } from '@/lib/copyRegistry/value';
import { journalUuid } from '@/lib/customJournals/contract';
import * as c from './contract';
import type * as t from './types';
import { issuanceMessages } from './presentation';
export { issuanceMessages } from './presentation';

export class EducationIssuanceError extends Error {
  constructor(readonly code: t.IssuanceErrorCode = 'DEPENDENCY_UNAVAILABLE', readonly retryable = false) {
    super(issuanceMessages[code]); this.name = 'EducationIssuanceError';
  }
}
export function normalizeIssuanceError(error: unknown): EducationIssuanceError {
  if (error instanceof EducationIssuanceError) return error;
  const e = error as { code?: string; status?: number; message?: string; details?: string } | null;
  if (e?.code === '42501' || e?.status === 401 || e?.status === 403) return new EducationIssuanceError('ACCESS_DENIED');
  let value: unknown; try { value = JSON.parse(e?.message ?? ''); } catch { /* A transport failure is not a confirmed mutation failure. */ }
  const parsed = c.issuanceErrorSchema.safeParse(value);
  if (parsed.success) return new EducationIssuanceError(parsed.data.code, parsed.data.retryable);
  const domain = c.issuanceErrorSchema.shape.code.safeParse((e?.message ?? '').match(/EDUCATION_ISSUANCE_([A-Z_]+)/)?.[1]);
  if(domain.success)return new EducationIssuanceError(domain.data,domain.data==='DEPENDENCY_UNAVAILABLE'||domain.data==='ARTIFACT_RENDER_FAILED');
  if(e?.code==='22023')return new EducationIssuanceError('INVALID_INPUT');
  if (e?.code === 'PT409' || e?.code === '40001' || e?.code === '55P03' || e?.code === '40P01') return new EducationIssuanceError('REVISION_CONFLICT', true);
  return new EducationIssuanceError('DEPENDENCY_UNAVAILABLE', true);
}
export interface EducationIssuanceScope extends CustomJournalScope { issuanceScope: t.IssuanceScope }
export function captureIssuanceScope(organizationId: string, scope: t.IssuanceScope, current: () => boolean): EducationIssuanceScope {
  const parsed = c.issuanceScopeSchema.safeParse(structuredClone(scope));
  if (!parsed.success) throw new EducationIssuanceError('INVALID_INPUT');
  try { return { ...captureCustomJournalScope(organizationId, current), issuanceScope: Object.freeze(parsed.data as t.IssuanceScope) }; }
  catch { throw new EducationIssuanceError('ACCESS_DENIED'); }
}
export const issuanceScopeCurrent = (scope: EducationIssuanceScope) => customJournalScopeCurrent(scope);
export function requireIssuanceScope(scope: EducationIssuanceScope) {
  if (!issuanceScopeCurrent(scope)) throw new EducationIssuanceError('ACCESS_DENIED');
}
async function call(scope: EducationIssuanceScope, name: string, args: Record<string, unknown>) {
  requireIssuanceScope(scope);
  const { data, error } = await supabase.auth.getSession(); requireIssuanceScope(scope);
  if (error || data.session?.user.id !== scope.actorId || !data.session.access_token) throw new EducationIssuanceError('ACCESS_DENIED');
  const result = await supabase.rpc(name as never, args as never).setHeader('Authorization', 'Bearer ' + data.session.access_token);
  requireIssuanceScope(scope);
  if (result.status === 401 || result.status === 403) throw new EducationIssuanceError('ACCESS_DENIED');
  if (result.error) throw normalizeIssuanceError(result.error);
  const failure = c.issuanceErrorSchema.safeParse(result.data);
  if (failure.success) throw new EducationIssuanceError(failure.data.code, failure.data.retryable);
  return result.data;
}
function envelope(scope: EducationIssuanceScope, value: { organization_id: string; scope: t.IssuanceScope }) {
  if (value.organization_id !== scope.organizationId || !sameCopyValue(value.scope, scope.issuanceScope)) throw new EducationIssuanceError();
}
function exactIds(actual: string[], expected: string[]) {
  if (new Set(actual).size !== actual.length || actual.length !== expected.length || actual.some(id => !expected.includes(id))) throw new EducationIssuanceError();
}

export function assertIssuanceEligibility(scope: EducationIssuanceScope, proof: NonNullable<t.IssuanceRecord["proof"]>) {
  const association = { organization_id: proof.organization_id, group_id: proof.group_id, enrollment_id: proof.enrollment_id, user_id: proof.user_id, course_id: proof.course_id };
  const outcome = proof.outcome_ref.scope;
  if (proof.organization_id !== scope.organizationId || scope.issuanceScope.kind === "group" && proof.group_id !== scope.issuanceScope.group_id ||
      !sameCopyValue(proof.admission_ref.scope, association) || !sameCopyValue(proof.admission_ref.program_ref, proof.program_ref) ||
      Object.entries(association).some(([key,value]) => outcome[key as keyof typeof outcome] !== value) ||
      outcome.program_enrollment_snapshot_id !== proof.program_ref.enrollment_snapshot_id || outcome.program_version_id !== proof.program_ref.version_id ||
      proof.identity_ref.user_id !== proof.user_id) throw new EducationIssuanceError();
}
export function assertIssuanceEvents(scope: EducationIssuanceScope, events: t.IssuanceEvent[]) {
  if (new Set(events.map(row=>row.id)).size !== events.length) throw new EducationIssuanceError();
  for (const event of events) {
    if (event.kind !== event.payload.kind) throw new EducationIssuanceError();
    if (event.payload.kind === "issued") {
      const {official,proof,proof_availability}=event.payload;
      assertFrozenFrdoFacts({official,frdo_facts:event.payload.frdo_facts,provenance:'controlled_issuance'} as t.IssuanceRecord);
      if (official.id !== event.record_id || official.organization_id !== scope.organizationId ||
          scope.issuanceScope.kind === "group" && official.group_id !== scope.issuanceScope.group_id ||
          (proof!==null)!==(proof_availability==="captured")) throw new EducationIssuanceError();
      if(proof) {
        assertIssuanceEligibility(scope,proof);
        if(proof.enrollment_id!==official.enrollment_id||proof.user_id!==official.user_id||proof.course_id!==official.course_id||proof.group_id!==official.group_id)throw new EducationIssuanceError();
      }
    }
  }
}

function assertFrozenFrdoFacts(row:t.IssuanceRecord) {
  const facts=row.frdo_facts,official=row.official;
  if(row.provenance==='controlled_issuance'&&!facts||row.provenance==='legacy_unverified'&&facts!==null)throw new EducationIssuanceError();
  if(!facts)return;
  if(facts.document_type!==official.document_type||facts.document_series!==official.document_series||facts.document_number!==official.document_number||facts.reg_number!==official.reg_number||facts.issue_date!==official.issue_date||facts.birth_date!==official.birth_date||facts.program_title!==official.specialty_name)throw new EducationIssuanceError();
  const expectedType=facts.program_type==='professional_training'?'qualification':facts.program_type==='dpo_retraining'?'diploma':'certificate';
  if(expectedType!==facts.document_type)throw new EducationIssuanceError();
  const missing=([['LAST_NAME',facts.last_name],['FIRST_NAME',facts.first_name],['BIRTH_DATE',facts.birth_date],['TRAINING_START_DATE',facts.training_start_date],['TRAINING_END_DATE',facts.training_end_date]] as const).filter(([,value])=>!value?.trim()).map(([key])=>key);
  exactIds(facts.missing,missing);
}
export function assertIssuanceRecords(scope: EducationIssuanceScope, rows: t.IssuanceRecord[]) {
  const ids = rows.map(row => row.official.id); if (new Set(ids).size !== ids.length) throw new EducationIssuanceError();
  for (const row of rows) {
    const official = row.official;
    if (official.organization_id !== scope.organizationId || scope.issuanceScope.kind === 'group' && official.group_id !== null && official.group_id !== scope.issuanceScope.group_id
      || (row.proof !== null) !== (row.proof_availability === 'captured') || row.provenance === 'legacy_unverified' && row.proof_availability !== 'legacy_unverified') throw new EducationIssuanceError();
    if(scope.issuanceScope.kind==='group'&&official.group_id===null&&(row.provenance!=='legacy_unverified'||!official.enrollment_id||!official.user_id||!official.course_id))throw new EducationIssuanceError();
    assertFrozenFrdoFacts(row);
    if (row.proof) assertIssuanceEligibility(scope, row.proof);
    if (row.proof && (row.proof.organization_id !== scope.organizationId || row.proof.enrollment_id !== official.enrollment_id || row.proof.user_id !== official.user_id || row.proof.course_id !== official.course_id || row.proof.group_id !== official.group_id)) throw new EducationIssuanceError();
  }
}
function withdrawal(scope: EducationIssuanceScope, rows: t.WithdrawalState[]) {
  if (new Set(rows.map(row => row.ref.enrollment_id)).size !== rows.length) throw new EducationIssuanceError();
  for (const row of rows) if (row.ref.organization_id !== scope.organizationId || scope.issuanceScope.kind === 'group' && row.ref.group_id !== scope.issuanceScope.group_id) throw new EducationIssuanceError();
}
function ascending(rows: string[], after: string | null, next: string | null) {
  let previous = after;
  for (const id of rows) { if (previous !== null && id <= previous) throw new EducationIssuanceError(); previous = id; }
  if (next !== null && (!rows.length || next !== previous)) throw new EducationIssuanceError();
}
export async function readEducationIssuance(scope: EducationIssuanceScope, input: t.IssuanceQuery): Promise<t.IssuanceRead> {
  const parse = c.issuanceQuerySchema.safeParse(structuredClone(input));
  if (!parse.success) throw new EducationIssuanceError('INVALID_INPUT');
  const query = parse.data as t.IssuanceQuery;
  const parsed = c.issuanceReadSchema.safeParse(await call(scope, 'read_education_issuance', { p_organization_id: scope.organizationId, p_scope: scope.issuanceScope, p_query: query }));
  if (!parsed.success) throw new EducationIssuanceError();
  const value = parsed.data as t.IssuanceRead; envelope(scope, value);
  if (value.kind !== query.kind) throw new EducationIssuanceError();
  const withdrawalRead = value.kind === 'withdrawal' || value.kind === 'withdrawal_preview' || value.kind === 'withdrawal_history';
  if (withdrawalRead ? !value.capabilities.can_read_withdrawal : !value.capabilities.can_read) throw new EducationIssuanceError('ACCESS_DENIED');
  if(value.kind === 'export' && !value.capabilities.can_export)throw new EducationIssuanceError('ACCESS_DENIED');
  if(value.kind==='templates' && query.kind==='templates') { if(value.items.length>query.limit)throw new EducationIssuanceError();ascending(value.items.map(row=>row.template.source.version_id),query.after_version_id,value.next_after_version_id); }
  if(value.kind==='preparations' && query.kind==='preparations') { if(value.items.length>query.limit)throw new EducationIssuanceError();ascending(value.items.map(row=>row.id),query.after_id,value.next_after_id); }
  if(value.kind==='preparation' && query.kind==='preparation') { if(value.preparation.id!==query.preparation_id)throw new EducationIssuanceError();assertIssuancePreparation(scope,value.preparation); }
  if (value.kind === 'candidates' && query.kind === 'candidates') {
    if (value.course_id !== query.course_id || value.items.length > query.limit || value.items.some(row => row.course_id !== query.course_id || row.eligibility_ref && (row.eligibility_ref.organization_id !== scope.organizationId || row.eligibility_ref.enrollment_id !== row.enrollment_id || row.eligibility_ref.user_id !== row.user_id || row.eligibility_ref.course_id !== row.course_id || row.eligibility_ref.group_id !== row.group_id))) throw new EducationIssuanceError();
    for (const row of value.items) { if(scope.issuanceScope.kind === "group" && row.group_id !== scope.issuanceScope.group_id) throw new EducationIssuanceError(); if(row.eligibility_ref)assertIssuanceEligibility(scope,row.eligibility_ref); }
    ascending(value.items.map(row => row.enrollment_id), query.after_enrollment_id, value.next_after_enrollment_id);
  }
  if (value.kind === 'records' && query.kind === 'records') {
    assertIssuanceRecords(scope, value.items); if (value.items.length > query.limit || query.course_id && value.items.some(row => row.official.course_id !== null && row.official.course_id !== query.course_id)) throw new EducationIssuanceError();
    ascending(value.items.map(row => row.official.id), query.after_id, value.next_after_id);
  }
  if (value.kind === 'record' && query.kind === 'record') { assertIssuanceRecords(scope, [value.record]); if (value.record.official.id !== query.record_id) throw new EducationIssuanceError(); }
  if (value.kind === 'preview_issue' && query.kind === 'preview_issue') {
    if (!sameCopyValue(value.preview.intent, query.intent)) throw new EducationIssuanceError();
    for(const row of value.preview.candidates){if(scope.issuanceScope.kind==="group"&&row.group_id!==scope.issuanceScope.group_id)throw new EducationIssuanceError();if(row.eligibility_ref)assertIssuanceEligibility(scope,row.eligibility_ref);}
    exactIds(value.preview.candidates.map(row => row.enrollment_id), query.intent.enrollment_ids);
    if (value.preview.candidates.some(row => row.course_id !== query.intent.course_id) || value.preview.ready !== value.preview.candidates.every(row => row.eligibility_ref !== null && row.blockers.length === 0)) throw new EducationIssuanceError();
  }
  if (value.kind === 'preview_change' && query.kind === 'preview_change') {
    assertIssuanceRecords(scope, [value.preview.record]);
    if (!sameCopyValue(value.preview.change, query.change) || value.preview.record.official.id !== query.change.record_id || value.preview.record.revision !== query.change.expected_revision || value.preview.record.state_hash !== query.change.expected_state_hash || value.preview.ready && value.preview.blockers.length) throw new EducationIssuanceError();
  }
  if (value.kind === 'withdrawal' && query.kind === 'withdrawal') { withdrawal(scope, [value.state]); if (value.state.ref.enrollment_id !== query.enrollment_id) throw new EducationIssuanceError(); }
  if (value.kind === 'withdrawal_preview' && query.kind === 'withdrawal_preview') {
    withdrawal(scope, value.preview.items);
    exactIds(value.preview.items.map(row => row.ref.enrollment_id), query.intent.enrollment_ids);
    if (!sameCopyValue(value.preview.intent, query.intent) || value.preview.ready && value.preview.items.some(row => !row.can_withdraw || row.state === 'withdrawn')) throw new EducationIssuanceError();
  }
  if (value.kind === 'history' && query.kind === 'history' || value.kind === 'withdrawal_history' && query.kind === 'withdrawal_history') {
    if (value.items.length > query.limit || query.ceiling_revision !== null && value.ceiling_revision !== query.ceiling_revision) throw new EducationIssuanceError();
    if (value.kind === 'history') assertIssuanceEvents(scope, value.items);
    if (value.kind === 'history' && query.kind === 'history' && (value.record_id !== query.record_id || value.items.some(row => row.record_id !== query.record_id))) throw new EducationIssuanceError();
    if (value.kind === 'withdrawal_history' && query.kind === 'withdrawal_history') { if (value.enrollment_id !== query.enrollment_id || value.items.some(row => row.enrollment_id !== query.enrollment_id)) throw new EducationIssuanceError(); for (const row of value.items) { withdrawal(scope, [row.before]); withdrawal(scope, [row.after]); } }
    let previous = query.before_revision ?? value.ceiling_revision + 1;
    for (const row of value.items) { if (row.revision >= previous || row.revision > value.ceiling_revision) throw new EducationIssuanceError(); previous = row.revision; }
    if (value.next_before_revision !== null && (!value.items.length || value.next_before_revision !== previous)) throw new EducationIssuanceError();
  }
  requireIssuanceScope(scope); return value;
}
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; }
/** Keep this exact operation after a timeout; a new UUID is a new operator decision. */
export function prepareEducationIssuanceMutation(scope: EducationIssuanceScope, input: t.IssuanceAction, requestId: string = crypto.randomUUID()) {
  requireIssuanceScope(scope);
  const parsed = c.issuanceActionSchema.safeParse(structuredClone(input));
  if (!parsed.success || !journalUuid.safeParse(requestId).success) throw new EducationIssuanceError('INVALID_INPUT');
  const action = freeze(parsed.data as t.IssuanceAction);
  if (action.action === 'issue_batch') { exactIds(action.items.map(row => row.enrollment_id), action.intent.enrollment_ids); if (action.items.some(row => row.expected_eligibility_ref.organization_id !== scope.organizationId || row.expected_eligibility_ref.enrollment_id !== row.enrollment_id || row.expected_eligibility_ref.course_id !== action.intent.course_id)) throw new EducationIssuanceError('INVALID_INPUT'); }
  if (action.action === 'withdraw_enrollments') { exactIds(action.items.map(row => row.enrollment_id), action.intent.enrollment_ids); if (action.items.some(row => row.organization_id !== scope.organizationId)) throw new EducationIssuanceError('INVALID_INPUT'); }
  const args = freeze({ p_organization_id: scope.organizationId, p_scope: scope.issuanceScope, p_request_id: requestId, p_action: action });
  return { requestId, action, run: async (): Promise<t.IssuanceMutation> => {
    const parsedResult = c.issuanceMutationSchema.safeParse(await call(scope, 'apply_education_issuance_action', args));
    if (!parsedResult.success) throw new EducationIssuanceError();
    const value = parsedResult.data as t.IssuanceMutation; envelope(scope, value);
    if(action.action!=='withdraw_enrollments'&&!value.capabilities.can_read)throw new EducationIssuanceError('ACCESS_DENIED'); assertIssuanceRecords(scope, value.records); withdrawal(scope, value.withdrawals);
    if (value.receipt.request_id !== requestId || value.receipt.action !== action.action) throw new EducationIssuanceError();
    const expectedEventCount=action.action==="withdraw_enrollments"?action.intent.enrollment_ids.length:action.action==="issue_batch"?action.items.length:action.change.action==="issue_duplicate"?2:1;
    if(value.receipt.event_ids.length!==expectedEventCount)throw new EducationIssuanceError();
    exactIds(value.receipt.record_ids, value.records.map(row => row.official.id));
    const affected = action.action === 'withdraw_enrollments' ? value.withdrawals.map(row => row.ref.enrollment_id) : [...new Set(value.records.map(row => row.official.enrollment_id).filter((id): id is string => id !== null))];
    exactIds(value.receipt.enrollment_ids, affected);
    if (action.action === 'withdraw_enrollments') {
      if (value.records.length || !value.capabilities.can_read_withdrawal) throw new EducationIssuanceError();
      exactIds(affected, action.intent.enrollment_ids);
      for (const row of value.withdrawals) { const original = action.items.find(item => item.enrollment_id === row.ref.enrollment_id)!; if (row.state !== 'withdrawn' || row.ref.user_id !== original.user_id || row.ref.course_id !== original.course_id || row.ref.revision < original.revision + 1 || !value.receipt.replayed && row.ref.revision !== original.revision + 1) throw new EducationIssuanceError(); }
    } else if (action.action === 'issue_batch') {
      if (value.withdrawals.length) throw new EducationIssuanceError(); exactIds(affected, action.intent.enrollment_ids);
      if (value.records.length !== action.items.length || value.records.some(row => row.provenance !== 'controlled_issuance' || row.official.document_status !== 'original' || row.official.course_id !== action.intent.course_id || row.official.issue_date !== action.intent.issue_date || row.official.document_series!==action.intent.document_series)) throw new EducationIssuanceError();
      for(const row of value.records){const expected=action.items.find(item=>item.enrollment_id===row.official.enrollment_id);if(!expected||row.official.user_id!==expected.expected_eligibility_ref.user_id||row.official.group_id!==expected.expected_eligibility_ref.group_id||row.artifact.artifact&&!sameCopyValue(row.artifact.artifact,expected.artifact))throw new EducationIssuanceError();}
    } else {
      const change = action.change, target = value.records.find(row => row.official.id === change.record_id);
      if (value.withdrawals.length || !target || target.revision < change.expected_revision + 1 || !value.receipt.replayed && target.revision !== change.expected_revision + 1) throw new EducationIssuanceError();
      if (change.action === 'issue_duplicate') { const duplicate = value.records.find(row => row.original_record_id === change.record_id); if (value.records.length !== 2 || !duplicate || duplicate.official.document_status !== 'duplicate' || duplicate.official.enrollment_id !== target.official.enrollment_id || duplicate.official.user_id!==target.official.user_id || duplicate.official.course_id!==target.official.course_id || duplicate.official.group_id!==target.official.group_id || duplicate.official.issue_date!==change.issue_date || duplicate.official.document_series!==change.document_series || 'artifact' in change && duplicate.artifact.artifact&&!sameCopyValue(duplicate.artifact.artifact,change.artifact)) throw new EducationIssuanceError(); }
      else if (value.records.length !== 1 || change.action === 'annul' && target.lifecycle !== 'annulled') throw new EducationIssuanceError();
    }
    requireIssuanceScope(scope); return value;
  } };
}
export type PreparedIssuanceMutation = ReturnType<typeof prepareEducationIssuanceMutation>;

export function assertIssuancePreparation(scope: EducationIssuanceScope, preparation: t.IssuancePreparation) {
  envelope(scope, preparation);
  if (preparation.created_by !== scope.actorId || preparation.items.some(item => scope.issuanceScope.kind === "group" && item.group_id !== scope.issuanceScope.group_id))
    throw new EducationIssuanceError("ACCESS_DENIED");
}
/** This creates only a private, unissued preparation. It never reserves or issues a number. */
export function prepareEducationIssuanceArtifacts(scope: EducationIssuanceScope, input:t.IssuancePreparationPlan, requestId:string=crypto.randomUUID()) {
  requireIssuanceScope(scope);
  const parsed=c.issuancePreparationPlanSchema.safeParse(structuredClone(input));
  if(!parsed.success||!journalUuid.safeParse(requestId).success)throw new EducationIssuanceError("INVALID_INPUT");
  const plan=freeze(parsed.data as t.IssuancePreparationPlan);
  if(plan.kind==="original"){
    exactIds(plan.items.map(row=>row.enrollment_id),plan.intent.enrollment_ids);
    for(const item of plan.items)assertIssuanceEligibility(scope,item.expected_eligibility_ref);
  }
  const args=freeze({p_organization_id:scope.organizationId,p_scope:scope.issuanceScope,p_request_id:requestId,p_plan:plan});
  return {requestId,plan,run:async():Promise<t.IssuancePreparationMutation>=>{
    const parsedResult=c.issuancePreparationMutationSchema.safeParse(await call(scope,"prepare_education_issuance_artifacts",args));
    if(!parsedResult.success)throw new EducationIssuanceError();
    const value=parsedResult.data as t.IssuancePreparationMutation;envelope(scope,value);assertIssuancePreparation(scope,value.preparation);
    if(value.receipt.request_id!==requestId||value.receipt.preparation_id!==value.preparation.id||value.preparation.kind!==plan.kind||!sameCopyValue(value.preparation.plan,plan))throw new EducationIssuanceError();
    if(plan.kind==="original"){
      exactIds(value.preparation.items.map(row=>row.enrollment_id),plan.intent.enrollment_ids);
      if(value.preparation.items.some(row=>row.course_id!==plan.intent.course_id||row.number_plan.issue_date!==plan.intent.issue_date||row.number_plan.document_series!==plan.intent.document_series))throw new EducationIssuanceError();
    }else if(value.preparation.items.length!==1||value.preparation.items[0].number_plan.issue_date!==plan.change.issue_date||value.preparation.items[0].number_plan.document_series!==plan.change.document_series)throw new EducationIssuanceError();
    requireIssuanceScope(scope);return value;
  }};
}
export type PreparedArtifactPreparation=ReturnType<typeof prepareEducationIssuanceArtifacts>;
export function artifactFinalRef(preparation:t.IssuancePreparation,itemId:string):t.IssuanceArtifactFinalRef {
  const item=preparation.items.find(row=>row.id===itemId);
  if(!item||item.status!=="approved_unissued"||!item.artifact?.output_review)
    throw new EducationIssuanceError("ARTIFACT_REVIEW_REQUIRED");
  const {output_review,...artifact}=item.artifact;
  return c.issuanceArtifactFinalRefSchema.parse({preparation_id:preparation.id,item_id:item.id,input_revision:item.input_revision,...artifact,output_review_id:output_review.id,output_review_revision:output_review.revision}) as t.IssuanceArtifactFinalRef;
}
