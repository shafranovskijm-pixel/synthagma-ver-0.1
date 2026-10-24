import { describe, expect, it } from 'vitest';
import { deadlineSchema } from '../contract';
import { projectPendingFrdoDeadline } from '../deadlineProjection';

describe('checked FRDO source orientation never becomes an approved deadline', () => {
  it('keeps PO in working days with its exact checked source and no date/calendar authority', () => {
    const value = projectPendingFrdoDeadline('po', 'ordinary_rf', '2026-10-24');
    expect(deadlineSchema.parse(value)).toEqual(value);
    expect(value).toMatchObject({ verification: 'source_checked_pending_consolidation', stream: 'po', rule: { rule_id: 'ordinary_po_3_working', period: 3, unit: 'working_days' }, candidate_due_date: null, calendar_sha256: null, official_source_sha256: '94be025cb314e8dc8004e945371d2d1e4597a1770259157e7a3858ad820571f8' });
    expect(value.message).toMatch(/ещё не утверждены/); expect(value).not.toHaveProperty('due_date'); expect(value).not.toHaveProperty('policy');
  });
  it('keeps DPO in calendar days with the effective-date caveat and distinct checked source', () => {
    const value = projectPendingFrdoDeadline('dpo', 'ordinary_rf', '2026-10-24');
    expect(deadlineSchema.parse(value)).toEqual(value);
    expect(value).toMatchObject({ verification: 'source_checked_pending_consolidation', stream: 'dpo', rule: { rule_id: 'ordinary_dpo_30_calendar_from_20250901', period: 30, unit: 'calendar_days' }, candidate_due_date: null, calendar_sha256: null, official_source_sha256: '6f8165496ac970f0dc8b6319334272b492643a7ce0d31e554d9403c021626bb3' });
    expect(value.message).toContain('01.09.2025'); expect(value.message).toContain('не включая день выдачи');
  });
  it('shows only a pending orientation at the exact 2025-09-01 boundary', () => {
    expect(projectPendingFrdoDeadline('dpo', 'ordinary_rf', '2025-09-01')).toMatchObject({ verification: 'source_checked_pending_consolidation', candidate_due_date: null });
  });
  it('does not apply the DPO 30-day orientation to historical or transition issuance', () => {
    expect(projectPendingFrdoDeadline('dpo', 'ordinary_rf', '2025-08-31')).toMatchObject({ verification: 'pending_primary_current_law', due_date: null, policy_ref: null });
    expect(projectPendingFrdoDeadline('dpo', 'ordinary_rf', '2025-08-31')).not.toHaveProperty('rule');
  });
  it('also leaves historical PO pending instead of inferring an older rule from the current source', () => {
    const value = projectPendingFrdoDeadline('po', 'ordinary_rf', '2024-01-01');
    expect(value).toMatchObject({ verification: 'pending_primary_current_law', due_date: null }); expect(value.message).toContain('историческая');
  });
  it('rejects a calendar-shaped but impossible date without normalizing it into a deadline', () => {
    const value = projectPendingFrdoDeadline('dpo', 'ordinary_rf', '2026-02-30');
    expect(value).toMatchObject({ verification: 'pending_primary_current_law', due_date: null }); expect(value).not.toHaveProperty('rule');
  });
  it('does not infer a missing issue date from today, planned classes or completion', () => {
    const value = projectPendingFrdoDeadline('po', 'ordinary_rf', null);
    expect(value).toMatchObject({ verification: 'pending_primary_current_law', due_date: null }); expect(value.message).toContain('точная дата выдачи');
  });
  it('requires issuer evidence before presenting an ordinary PO rule', () => {
    const value = projectPendingFrdoDeadline('po', 'unconfirmed', '2026-10-24');
    expect(deadlineSchema.parse(value)).toMatchObject({ verification: 'pending_primary_current_law', issuer_regime: 'unconfirmed', due_date: null });
    expect(value).not.toHaveProperty('rule'); expect(value.message).toContain('документ о режиме');
  });
  it('does not relabel a joint institution as ordinary or calculate its separate 5/60-day regime', () => {
    const value = projectPendingFrdoDeadline('dpo', 'joint_rf_foreign', '2026-10-24');
    expect(deadlineSchema.parse(value)).toMatchObject({ verification: 'pending_primary_current_law', issuer_regime: 'joint_rf_foreign', due_date: null });
    expect(value).not.toHaveProperty('rule'); expect(value.message).toContain('не поддерживается');
  });
});
