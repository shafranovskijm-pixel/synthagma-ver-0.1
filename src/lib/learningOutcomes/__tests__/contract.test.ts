import { describe, expect, it } from 'vitest';
import { learningCriteriaOptionsSchema, learningDecisionOptionsSchema, outcomeEnvelopeSchema, outcomeMutationSchema, outcomeScopeSchema } from '../contract';
import * as f from './fixtures';

describe('strict canonical learning outcome wire', () => {
  it('retains server microseconds and separates an eligible calculation from a human decision', () => {
    const value = outcomeEnvelopeSchema.parse(f.outcome());
    expect(value.machine?.eligibility).toBe('eligible');
    expect(value.last_decision).toBeNull();
    expect(value.criteria_ref?.approved_at).toBe(f.instant);
  });
  it('rejects a learner projection containing private staff decision fields or decision authority', () => {
    const decision = { id: f.id(30), machine_result_id: f.id(10), outcome: 'passed', learner_summary: 'Подтверждено',
      recorded_at: f.instant, supersedes_id: null, staff_reason: 'PRIVATE', actor_id: f.actor, basis: 'machine' };
    expect(outcomeEnvelopeSchema.safeParse(f.outcome({ audience: 'learner', last_decision: decision as never,
      decision_relation: 'current_inputs', capabilities: { can_capture: true, can_decide: false } })).success).toBe(false);
    expect(outcomeEnvelopeSchema.safeParse({ ...f.outcome(), audience: 'learner', capabilities: { can_capture: true, can_decide: true } }).success).toBe(false);
  });
  it.each([
    { revision: Number.MAX_SAFE_INTEGER + 1 },
    { scope: { ...f.scope, group_id: null } },
    { criteria_ref: { ...f.criteria, content_hash: 'A'.repeat(64) } },
    { unexpected_private_field: 'must not pass' },
    { machine: { ...f.outcome().machine, criteria_ref: { ...f.criteria, revision: 2 } } },
    { machine: { ...f.outcome().machine, revision_created: 3 } },
  ])('rejects an unconfirmed or overbroad envelope %j', patch => {
    expect(outcomeEnvelopeSchema.safeParse({ ...f.outcome(), ...patch }).success).toBe(false);
  });
  it('rejects duplicate components, unbounded input and current-input claims without the corresponding machine result', () => {
    const component = { component_id: f.id(31), kind: 'test', status: 'unknown', reason_code: 'NO_BOUND_ATTEMPT',
      original_grade: null, selected_source_hash: null, provenance: 'unavailable' };
    expect(outcomeEnvelopeSchema.safeParse({ ...f.outcome(), machine: { ...f.outcome().machine, components: [component, component] } }).success).toBe(false);
    expect(outcomeEnvelopeSchema.safeParse({ ...f.outcome(), prerequisites: Array(51).fill('Не хватает сведений') }).success).toBe(false);
    expect(outcomeEnvelopeSchema.safeParse({ ...f.outcome(), decision_relation: 'current_inputs' }).success).toBe(false);
    expect(outcomeScopeSchema.safeParse({ ...f.scope, group_name: 'not a scope identity' }).success).toBe(false);
  });
  it('does not accept a different or invented receipt action', () => {
    const result = f.mutation();
    expect(outcomeMutationSchema.safeParse({ ...result, receipt: { ...result.receipt, action: 'issue_document' } }).success).toBe(false);
  });
  it('preserves existing padded display labels without treating them as canonical authority input', () => {
    const raw = f.criteriaOptions(); raw.lessons[0].title = '  Сохранённое название теста  ';
    raw.humans[0].display_name = '  Имя сотрудника  '; raw.files[0].document_name = '  Название документа  ';
    const value = learningCriteriaOptionsSchema.parse(raw);
    expect(value.lessons[0].title).toBe(raw.lessons[0].title);
    expect(value.humans[0].display_name).toBe(raw.humans[0].display_name);
    expect(value.files[0].document_name).toBe(raw.files[0].document_name);
    expect(learningDecisionOptionsSchema.parse({ schema_version: 1, scope: f.scope, allowed_component_ids: [], files: raw.files }).files[0].document_name).toBe(raw.files[0].document_name);
    expect(learningCriteriaOptionsSchema.safeParse({ ...raw, lessons: [{ ...raw.lessons[0], title: '   ' }] }).success).toBe(false);
    expect(learningCriteriaOptionsSchema.safeParse({ ...raw, humans: [{ ...raw.humans[0], display_name: 'x'.repeat(501) }] }).success).toBe(false);
  });
});
