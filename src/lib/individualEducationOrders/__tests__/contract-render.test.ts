import { describe, expect, it } from 'vitest';
import * as c from '../contract';
import { isIndividualOrderRenderVariables, renderIndividualEducationOrder } from '../../../../supabase/functions/_shared/individual-education-order-render';
import { approvedOrder, context, envelope, hash, preparedOrder, prepareAction, registeredOrder, savedOrder, stamp, uid, variables } from './fixtures';

describe('closed individual-order wire and actual-stage facts', () => {
  it.each(['actor_user_id', 'subject_user_id', 'course_id', 'number', 'html', 'proof', 'file_path'])('rejects caller %s in a staff preparation', key => {
    expect(c.individualOrderActionSchema.safeParse({ ...prepareAction(), [key]: 'never-trust' }).success).toBe(false);
  });
  it('requires real ready education facts and one protected source kind', () => {
    const action: any = prepareAction(); action.programme_choice.programme.file = { kind: 'url', url: 'https://example.invalid/file.pdf' }; expect(c.individualOrderActionSchema.safeParse(action).success).toBe(false);
    const order = preparedOrder(); order.programme_facts.program_type = 'internal_nonformal'; expect(c.individualOrderSchema.safeParse(order).success).toBe(false);
  });
  it.each(['decision', 'official_order_number', 'render'] as const)('does not accept an approved order without actual %s', key => {
    const order = approvedOrder(); order[key] = null; expect(c.individualOrderSchema.safeParse(order).success).toBe(false);
  });
  it('separates approval, trusted saved output, registration and signature assurance', () => {
    expect(c.individualOrderSchema.safeParse(approvedOrder()).success).toBe(true); expect(c.individualOrderSchema.safeParse(savedOrder()).success).toBe(true); expect(c.individualOrderSchema.safeParse(registeredOrder()).success).toBe(true);
    const order = registeredOrder(); order.artifact!.output_review = null; expect(c.individualOrderSchema.safeParse(order).success).toBe(false);
    expect(c.individualOrderSchema.safeParse({ ...registeredOrder(), signed: true }).success).toBe(false);
  });
  it('does not turn a completion decision into an early withdrawal, or technical progress into a decision', () => {
    const order = approvedOrder(); order.order_kind = 'early_withdrawal'; expect(c.individualOrderSchema.safeParse(order).success).toBe(false);
    expect(c.orderDecisionSchema.safeParse({ kind: 'complete', progress: 100, actual_outcome: 'passed' }).success).toBe(false);
  });
  it.each(['prepared', 'staged', 'saved'] as const)('accepts only coherent %s render context and SQL object identities', async stage => {
    const value = await context(stage); expect(c.orderRenderContextSchema.safeParse(value).success).toBe(true);
    if (stage === 'prepared') value.render_job.html_sha256 = hash; else value.staging.observed_object!.updated_at = '2026-11-23T12:00:00.123Z';
    expect(c.orderRenderContextSchema.safeParse(value).success).toBe(false);
  });
  it('permits a raw observed staging object before attestation without converting it to proof', async () => {
    const value = await context(), staged = await context('staged'); value.staging.observed_object = { ...staged.staging.observed_object!, provenance: { ...staged.staging.observed_object!.provenance, render_input_sha256: value.render_input_sha256 } };
    expect(c.orderRenderContextSchema.safeParse(value).success).toBe(true); expect(value.render_job.html_sha256).toBeNull(); expect(value.staging.proof).toBeNull();
    value.staging.observed_object.provenance.order_id = uid(999); expect(c.orderRenderContextSchema.safeParse(value).success).toBe(false);
  });
  it('rejects foreign output paths, lost staging observations and a forged registry source', async () => {
    const value = await context('saved'); value.output.file_path = uid(999) + '/elsewhere.pdf'; expect(c.orderRenderContextSchema.safeParse(value).success).toBe(false);
    const missing = await context('saved'); missing.staging.observed_object = null; expect(c.orderRenderContextSchema.safeParse(missing).success).toBe(false);
    const registered = registeredOrder(); registered.registry!.source.version_id = uid(999); expect(c.individualOrderSchema.safeParse(registered).success).toBe(false);
  });
  it('keeps an unavailable closed historical order readable without another approval or number', () => {
    const order = approvedOrder(); order.state = 'source_changed'; order.capabilities = { can_prepare: false, can_approve: false, can_render: false, can_register: false, can_open_source: false };
    expect(c.individualOrderSchema.safeParse(order).success).toBe(true); expect(order.official_order_number?.display).toBe('УЦ-1/2026');
  });
  it('rejects caller proof/paths in public rendering, while keeping trusted internal attestations closed', () => {
    const request = { version: 1, organization_id: uid(1), enrollment_id: uid(4), order_id: uid(6), expected_order_revision: 2, expected_order_sha256: hash, render_request_id: uid(41) };
    expect(c.orderRenderRequestSchema.safeParse({ ...request, proof: { renderer: 'browserless' } }).success).toBe(false);
    const proof = { kind: 'staging', object_id: uid(51), object_updated_at: stamp, html_sha256: hash, render_input_sha256: hash, byte_sha256: hash, byte_size: 600, renderer: 'browserless', renderer_revision: 'uc-individual-order-v1' };
    expect(c.orderTrustedAttestationSchema.safeParse(proof).success).toBe(true); expect(c.orderTrustedAttestationSchema.safeParse({ ...proof, caller_signed: true }).success).toBe(false);
  });
});

describe('pure programme-kind-specific order layout', () => {
  it.each((['professional_training', 'dpo_upskilling', 'dpo_retraining'] as const).flatMap(programme => (['admission', 'completion', 'early_withdrawal'] as const).map(kind => [programme, kind] as const)))('renders %s / %s from exact facts without a dummy group', (programme, kind) => {
    const value = variables(); value.programme_type = programme; value.programme_type_label = c.programmeTypeLabels[programme]; value.order_kind = kind;
    const html = renderIndividualEducationOrder(value); expect(html).toContain(c.programmeTypeLabels[programme]); expect(html).toContain('УЦ-1/2026'); expect(html).not.toContain('Присвоить группе'); expect(html).not.toContain('Закрыть курс'); expect(html).not.toContain('выдать');
    if (programme === 'professional_training') expect(html).not.toContain('повышения квалификации');
    expect(html).toContain(kind === 'admission' ? 'О зачислении на обучение' : kind === 'completion' ? 'в связи с завершением обучения' : 'О досрочном прекращении образовательных отношений');
  });
  it('escapes every supplied text field and never inserts a stamp, URL, executable markup or automatic signature claim', () => {
    const value = variables(); value.organization_name = '<img src="https://foreign.invalid/a">'; value.student_full_name = '<script>bad()</script>'; value.grounds_text = 'Основание <b>не HTML</b>'; value.issuer_authority_basis.provision = '<svg onload="bad()">';
    const html = renderIndividualEducationOrder(value); expect(html).not.toContain('<img'); expect(html).not.toContain('<script>'); expect(html).not.toContain('<svg'); expect(html).toContain('&lt;script&gt;'); expect(html).toContain('&lt;b&gt;не HTML&lt;/b&gt;'); expect(html).toContain('Подпись и печать этим файлом автоматически не подтверждаются');
  });
  it('is deterministic and distinguishes document date, effect date and recorded decision time', () => {
    const value = variables(), before = structuredClone(value); value.document_date = '2026-11-22'; value.effective_date = '2026-12-01';
    const first = renderIndividualEducationOrder(value); expect(first).toBe(renderIndividualEducationOrder(value)); expect(first).toContain('от 22.11.2026'); expect(first).toContain('с 01.12.2026'); expect(first).toContain(stamp); expect(before.official_order_number).toBe(value.official_order_number);
  });
  it.each(['missing_issuer', 'unknown_markup', 'wrong_programme_label', 'invalid_date', 'invalid_recorded_date', 'foreign_basis_kind'] as const)('rejects %s instead of supplying defaults', damage => {
    const value: any = variables(); if (damage === 'missing_issuer') value.issuer_name = ''; if (damage === 'unknown_markup') value.stamp_html = '<img>'; if (damage === 'wrong_programme_label') value.programme_type_label = 'Повышение квалификации'; if (damage === 'invalid_date') value.document_date = '2026-02-30'; if (damage === 'invalid_recorded_date') value.decision_recorded_at = '2026-02-30T12:00:00Z'; if (damage === 'foreign_basis_kind') value.issuer_authority_basis.source.kind = 'public_url';
    expect(isIndividualOrderRenderVariables(value)).toBe(false); expect(c.orderRenderVariablesSchema.safeParse(value).success).toBe(false); expect(() => renderIndividualEducationOrder(value)).toThrow('INDIVIDUAL_ORDER_RENDER_INPUT_INVALID');
  });
});
