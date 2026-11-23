import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actor, applyReply, approveAction, approvedOrder, choice, context, course, enrollment, envelope, hash, orderId, orderReply, org, preparedOrder, prepareAction, pupil, registerAction, registeredOrder, renderReply, request, savedOrder, source, uid, witness } from './fixtures';
const port = vi.hoisted(() => ({ current: true, actor: '00000000-0000-4000-8000-000000000002', session: vi.fn(), user: vi.fn(), rpc: vi.fn(), invoke: vi.fn(), registryRead: vi.fn(), workflow: vi.fn(), replies: [] as any[], after: null as (() => void) | null }));
vi.mock('@/utils/courseCache', () => ({ captureOfflineContext: () => ({ actorId: port.actor, revision: 1 }), isOfflineActorCurrent: () => port.current }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: port.session, getUser: port.user }, rpc: port.rpc, functions: { invoke: port.invoke } } }));
vi.mock('@/lib/documentRegistry/client', () => ({ captureDocumentRegistryScope: (organizationId: string, registryScope: unknown, current: () => boolean) => ({ organizationId, actorId: port.actor, accessRevision: 1, registryScope, current }), readDocumentRegistry: port.registryRead }));
vi.mock('@/lib/orgDocumentWorkflow', () => ({ parseWorkflowEnvelope: port.workflow }));
import { captureIndividualOrderScope, chooseIndividualOrderProgramme, prepareIndividualEducationOrderAction, prepareIndividualOrderRender, readIndividualEducationOrder, readIndividualOrderBasisReviews, readIndividualOrderProgrammeChoices, readIndividualOrderSourceChoices } from '../client';
const scope = () => captureIndividualOrderScope(org, enrollment, { subjectUserId: pupil, courseId: course }, () => true);
beforeEach(() => {
  vi.clearAllMocks(); port.current = true; port.actor = actor; port.after = null; port.replies = [];
  port.session.mockImplementation(async () => ({ data: { session: { user: { id: port.actor }, access_token: 'synthetic-token' } }, error: null }));
  port.user.mockImplementation(async () => ({ data: { user: { id: port.actor } }, error: null }));
  port.rpc.mockImplementation(() => ({ setHeader: async () => { const next = port.replies.shift(); port.after?.(); return next?.error ? next : { data: next, error: null, status: 200 }; } }));
  port.invoke.mockResolvedValue({ data: renderReply(), error: null });
});

describe('actual selection and cross-context boundary', () => {
  it('reads bounded approved programme choices, carries server hashes and permits no user-pasted selection shortcut', async () => {
    port.replies.push({ ...envelope('programme_choices'), choices: [choice()], next_after_version_id: null });
    const result = await readIndividualOrderProgrammeChoices(scope()); expect(result.choices).toHaveLength(1);
    expect(port.rpc.mock.calls[0]).toEqual(['read_individual_education_order', { p_organization_id: org, p_enrollment_id: enrollment, p_query: { version: 1, kind: 'programme_choices', after_version_id: null, limit: 100 } }]);
    expect(() => chooseIndividualOrderProgramme(scope(), result.choices[0])).toThrow();
    const selected = chooseIndividualOrderProgramme(scope(), result.choices[0], 'Явный выбор для этого обучения'); expect(selected.programme.snapshot_sha256).toBe(choice().programme.snapshot_sha256);
    const bound = choice(); bound.course_binding_revision = 5; expect(chooseIndividualOrderProgramme(scope(), bound)).toMatchObject({ kind: 'course_binding', expected_binding_revision: 5 });
    bound.course_id = uid(999); expect(() => chooseIndividualOrderProgramme(scope(), bound)).toThrow();
  });
  it.each(['actor', 'org', 'pupil', 'course', 'enrollment', 'unknown_key'] as const)('rejects a wrong %s envelope instead of displaying another context', async damage => {
    const reply: any = orderReply(preparedOrder()); if (damage === 'actor') reply.actor_user_id = uid(999); if (damage === 'org') reply.organization_id = uid(999); if (damage === 'pupil') reply.subject_user_id = uid(999); if (damage === 'course') reply.course_id = uid(999); if (damage === 'enrollment') reply.enrollment_id = uid(999); if (damage === 'unknown_key') reply.token = 'untrusted';
    port.replies.push(reply); await expect(readIndividualEducationOrder(scope(), { version: 1, kind: 'order', order_id: orderId })).rejects.toThrow();
  });
  it('rejects unordered/duplicate choice IDs and an unrelated row hidden under the correct envelope', async () => {
    const row = choice(); port.replies.push({ ...envelope('programme_choices'), choices: [row, row], next_after_version_id: row.id });
    await expect(readIndividualOrderProgrammeChoices(scope())).rejects.toThrow();
    row.organization_id = uid(999); port.replies.push({ ...envelope('programme_choices'), choices: [row], next_after_version_id: null }); await expect(readIndividualOrderProgrammeChoices(scope())).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
  });
  it('requires a genuine matching session and discards a late reply after access changes', async () => {
    port.session.mockResolvedValueOnce({ data: { session: { user: { id: uid(999) }, access_token: 'synthetic' } }, error: null });
    await expect(readIndividualEducationOrder(scope(), { version: 1, kind: 'summary' })).rejects.toMatchObject({ code: 'ACCESS_DENIED' }); expect(port.rpc).not.toHaveBeenCalled();
    port.replies.push(orderReply(preparedOrder())); port.after = () => { port.current = false; };
    await expect(readIndividualEducationOrder(scope(), { version: 1, kind: 'order', order_id: orderId })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });
  it('uses actual private source choices and approved review IDs, never an arbitrary file URL or current-version substitute', async () => {
    port.registryRead.mockResolvedValueOnce({ kind: 'sources', sources: [{ label: 'Заявление', source: source() }], next_after_id: null });
    const choices = await readIndividualOrderSourceChoices(scope()); expect(choices.choices[0].source).toEqual(source());
    port.registryRead.mockResolvedValueOnce({ kind: 'source', source: { label: 'Точная версия', source: source() } }); port.replies.push({ actual: 'workflow' });
    port.workflow.mockReturnValue({ cycles: [{ id: uid(50), version_id: source().version_id, state: 'approved', revision: 4, approval: { number: 'ТЕСТ-1', date: '2026-11-20' } }, { id: uid(51), version_id: uid(999), state: 'approved', revision: 4, approval: { number: 'Иная версия', date: '2026-11-20' } }] });
    const reviews = await readIndividualOrderBasisReviews(scope(), source()); expect(reviews).toHaveLength(1); expect(reviews[0]).toMatchObject({ review_id: uid(50), review_revision: 4 });
    expect(port.rpc.mock.calls[0]).toEqual(['get_org_document_workflow', { p_document_id: source().document_id }]);
    await expect(readIndividualOrderBasisReviews(scope(), { kind: 'url', url: 'https://example.invalid/file' } as any)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
  it('does not reuse a source choice whose canonical protected version changed', async () => {
    port.registryRead.mockResolvedValue({ kind: 'source', source: { label: 'Чужая версия', source: { ...source(), content_hash: 'f'.repeat(64) } } });
    await expect(readIndividualOrderBasisReviews(scope(), source())).rejects.toMatchObject({ code: 'SOURCE_CHANGED' }); expect(port.rpc).not.toHaveBeenCalled();
  });
});

describe('actual decisions, idempotent commands and existing numbering', () => {
  it('freezes one preparation and retries the same unknown request without calling a client allocator', async () => {
    const action = prepareAction(), operation = prepareIndividualEducationOrderAction(scope(), null, action, request);
    action.grounds = 'Изменённый несохранённый текст'; port.replies.push({ error: { message: 'unknown transport' }, status: 0 }); await expect(operation.run()).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
    port.replies.push(applyReply(preparedOrder(), 1, true)); await operation.run(); expect(port.rpc.mock.calls[0]).toEqual(port.rpc.mock.calls[1]);
    expect(port.rpc.mock.calls[0][1].p_expected_revision).toBe(0); expect(port.rpc.mock.calls[0][1].p_action.grounds).toBe(preparedOrder().grounds); expect(port.rpc.mock.calls.map(call => call[0])).toEqual(['apply_individual_education_order', 'apply_individual_education_order']);
  });
  it('deduplicates a double approval click and preserves the actual returned official number on an exact retry', async () => {
    const operation = prepareIndividualEducationOrderAction(scope(), preparedOrder(), approveAction(), request); port.replies.push(applyReply(approvedOrder(), 2));
    const first = operation.run(), second = operation.run(); expect(first).toBe(second); await expect(first).resolves.toMatchObject({ order: { official_order_number: { display: 'УЦ-1/2026' }, registry: null } });
    port.replies.push(applyReply(approvedOrder(), 2, true)); await operation.run(); expect(port.rpc.mock.calls[0]).toEqual(port.rpc.mock.calls[1]);
  });
  it('does not approve an unprivileged record, substituted programme or technical completion claim', () => {
    const record = preparedOrder(); record.capabilities.can_approve = false; expect(() => prepareIndividualEducationOrderAction(scope(), record, approveAction(), request)).toThrow();
    const action: any = approveAction(); action.expected_programme.version_id = uid(999); expect(() => prepareIndividualEducationOrderAction(scope(), preparedOrder(), action, request)).toThrow();
    expect(() => prepareIndividualEducationOrderAction(scope(), preparedOrder(), { ...approveAction(), progress: 100 } as any, request)).toThrow(); expect(port.rpc).not.toHaveBeenCalled();
  });
  it('registers only the reviewed exact artifact and distinguishes official order number from actual registry ID', async () => {
    const operation = prepareIndividualEducationOrderAction(scope(), savedOrder(), registerAction(), request); port.replies.push(applyReply(registeredOrder(), 5));
    await expect(operation.run()).resolves.toMatchObject({ order: { official_order_number: { display: 'УЦ-1/2026' }, registry: { registration_id: 'РЕГ-2026/000021' } } });
    const bad: any = registerAction(); bad.expected_artifact.byte_sha256 = 'f'.repeat(64); expect(() => prepareIndividualEducationOrderAction(scope(), savedOrder(), bad, request)).toThrow();
    expect(() => prepareIndividualEducationOrderAction(scope(), savedOrder(), { ...registerAction(), pdf_review_confirmed: false } as any, request)).toThrow();
  });
  it('rejects an approval or registration green reply that substitutes frozen identity, PDF or number', async () => {
    const changed = approvedOrder(); changed.identity_snapshot.full_name = 'Чужое имя'; port.replies.push(applyReply(changed, 2)); await expect(prepareIndividualEducationOrderAction(scope(), preparedOrder(), approveAction(), request).run()).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
    const numbered = registeredOrder(); numbered.official_order_number!.display = 'УЦ-2/2026'; numbered.official_order_number!.sequence_number = 2; port.replies.push(applyReply(numbered, 5)); await expect(prepareIndividualEducationOrderAction(scope(), savedOrder(), registerAction(), request).run()).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
  });
  it('keeps missing facts explicit and raw backend details private', async () => {
    port.replies.push({ version: 1, ok: false, code: 'PREREQUISITE_MISSING', missing_facts: ['PROGRAM_REQUIRED'] });
    await expect(prepareIndividualEducationOrderAction(scope(), null, prepareAction(), request).run()).rejects.toMatchObject({ code: 'PREREQUISITE_MISSING', missingFacts: ['PROGRAM_REQUIRED'] });
    port.replies.push({ error: { message: 'PRIVATE_OBJECT_PATH_NEVER_RENDER' }, status: 500 });
    await expect(readIndividualEducationOrder(scope(), { version: 1, kind: 'summary' })).rejects.not.toThrow('PRIVATE_OBJECT_PATH_NEVER_RENDER');
  });
});

describe('durable renderer handshake and truthful object observation', () => {
  it('uses the persisted approved-generation request, real actor and server saved artifact without allocating a number', async () => {
    const operation = prepareIndividualOrderRender(scope(), approvedOrder()); port.replies.push(orderReply(approvedOrder()), orderReply(savedOrder()));
    const first = operation.run(), second = operation.run(); expect(first).toBe(second); await expect(first).resolves.toMatchObject({ state: 'rendered_unregistered' });
    expect(port.invoke).toHaveBeenCalledTimes(1); expect(port.invoke.mock.calls[0][0]).toBe('individual-education-order-artifact');
    expect(port.invoke.mock.calls[0][1].body).toEqual({ version: 1, organization_id: org, enrollment_id: enrollment, order_id: orderId, expected_order_revision: 2, expected_order_sha256: '2'.repeat(64), render_request_id: uid(41) });
    expect(port.user).toHaveBeenCalledWith('synthetic-token'); expect(port.rpc.mock.calls.map(call => call[0])).toEqual(['read_individual_education_order', 'read_individual_education_order']);
  });
  it('recovers an unknown render result from the durable saved source without invoking Browserless again', async () => {
    const operation = prepareIndividualOrderRender(scope(), approvedOrder()); port.replies.push(orderReply(approvedOrder())); port.invoke.mockResolvedValueOnce({ data: null, error: { message: 'unknown render result' } });
    await expect(operation.run()).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' }); port.replies.push(orderReply(savedOrder()));
    await expect(operation.run()).resolves.toMatchObject({ state: 'rendered_unregistered' }); expect(port.invoke).toHaveBeenCalledTimes(1); expect(operation.requestId).toBe(uid(41));
  });
  it('allows another currently authorized staff account to read the already saved generation without replaying actor-bound work', async () => {
    port.actor = uid(999); const ownScope = scope(); const reply = orderReply(savedOrder()); reply.actor_user_id = port.actor; port.replies.push(reply);
    await expect(prepareIndividualOrderRender(ownScope, approvedOrder()).run()).resolves.toMatchObject({ state: 'rendered_unregistered' }); expect(port.invoke).not.toHaveBeenCalled();
  });
  it('rejects a changed approved generation before any remote rendering and a mismatched saved PDF after it', async () => {
    const changed = approvedOrder(); changed.render!.generation = 2; port.replies.push(orderReply(changed)); await expect(prepareIndividualOrderRender(scope(), approvedOrder()).run()).rejects.toMatchObject({ code: 'SOURCE_CHANGED' }); expect(port.invoke).not.toHaveBeenCalled();
    const forged = renderReply(); forged.artifact!.byte_sha256 = 'f'.repeat(64); port.invoke.mockResolvedValue({ data: forged, error: null }); port.replies.push(orderReply(approvedOrder()), orderReply(savedOrder()));
    await expect(prepareIndividualOrderRender(scope(), approvedOrder()).run()).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
  });
  it('validates the exact canonical JSON literal without trying to regenerate PostgreSQL formatting', async () => {
    const renderContext = await context('staged'); const original = renderContext.render_input_json;
    port.replies.push({ ...envelope('render_context'), render_context: renderContext });
    await expect(readIndividualEducationOrder(scope(), { version: 1, kind: 'render_context', order_id: orderId, expected_revision: 2, expected_state_sha256: '2'.repeat(64), render_request_id: uid(41) })).resolves.toMatchObject({ render_context: { render_input_json: original } });
    renderContext.render_input_json += ' '; port.replies.push({ ...envelope('render_context'), render_context: renderContext });
    await expect(readIndividualEducationOrder(scope(), { version: 1, kind: 'render_context', order_id: orderId, expected_revision: 2, expected_state_sha256: '2'.repeat(64), render_request_id: uid(41) })).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
  });
  it('rejects a render request for another authenticated actor before the Edge call', async () => {
    port.replies.push(orderReply(approvedOrder())); port.user.mockResolvedValue({ data: { user: { id: uid(999) } }, error: null });
    await expect(prepareIndividualOrderRender(scope(), approvedOrder()).run()).rejects.toMatchObject({ code: 'ACCESS_DENIED' }); expect(port.invoke).not.toHaveBeenCalled();
  });
});
