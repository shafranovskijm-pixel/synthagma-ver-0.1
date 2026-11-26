import '@testing-library/jest-dom/vitest';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import * as f from '@/lib/individualEducationIssuance/__tests__/fixtures';
const port = vi.hoisted(() => ({current: true, actor: '00000000-0000-4000-8000-000000000002', session: vi.fn(), rpc: vi.fn(), invoke: vi.fn(), preparation: null as any, context: null as any, changed: vi.fn()}));
vi.mock('@/utils/courseCache', () => ({captureOfflineContext: () => ({actorId: port.actor, revision: 1}), isOfflineActorCurrent: () => port.current,
  captureOfflineAuthRevision: () => 1, subscribeOfflineAuthRevision: () => () => {}}));
vi.mock('@/integrations/supabase/client', () => ({supabase: {auth: {getSession: port.session}, rpc: port.rpc, functions: {invoke: port.invoke}}}));
vi.mock('@/hooks/useDocumentActionPermissions', () => ({useDocumentActionPermissions: () => ({canWrite: true, canIssue: true, canSign: true, canSalesWrite: false})}));
vi.mock('@/lib/educationIssuance/client', () => ({captureIssuanceScope: () => null, readEducationIssuance: vi.fn()}));
vi.mock('@/lib/programFiles', () => ({createScopedOrgDocumentTransport: (s: any) => ({key: s.key})}));
vi.mock('@/components/organization/documents/OrgDocumentWorkflowPanel', () => ({OrgDocumentWorkflowPanel: () => null}));
vi.mock('@/components/organization/education-issuance/TemplateCreateDialog', () => ({IssuanceTemplateDialog: () => null}));
vi.mock('@/components/organization/education-issuance/RecordDialog', () => ({EducationIssuanceRecordDialog: () => null}));
import {IndividualEducationIssuanceDialog} from '../IndividualEducationIssuanceDialog';
beforeEach(() => {
  vi.clearAllMocks(); port.current = true; port.actor = f.actor; port.preparation = f.preparation();
  port.context = {...f.context(), eligibility_ref: f.eligibility(), completion_order: f.orderWitness(true), protocol_review: f.protocol(), blockers: [], capabilities: {...f.context().capabilities, can_prepare_artifact: true, can_issue: true}};
  port.session.mockResolvedValue({data: {session: {user: {id: f.actor}, access_token: 'SYNTHETIC'}}, error: null});
  port.rpc.mockImplementation((_name, args) => ({setHeader: async () => {
    const q = args.p_query;
    if (q.kind === 'context') return {data: {...f.envelope('context'), context: port.context}, error: null};
    if (q.kind === 'preparations') return {data: {...f.envelope(q.kind), items: [{id: port.preparation.id, kind: 'original', created_at: f.stamp, item_count: 1, prepared_count: 1, rendered_unissued_count: 0, approved_unissued_count: 0, consumed_count: 0, stale_count: 0}], next_after_id: null}, error: null};
    if (q.kind === 'preparation') return {data: {...f.envelope(q.kind), preparation: port.preparation}, error: null};
    throw Error('Unexpected read ' + q.kind);
  }}));
});
describe('real client plus dialog503 pending retention', () => {
  it('retryable typed errors keep the same pending operation and UUID until actual rendered result', async () => {
    port.invoke.mockImplementation(async () => {
      if (port.invoke.mock.calls.length < 3) return {data: null, error: {context: new Response(JSON.stringify({schema_version: 1, code: 'DEPENDENCY_UNAVAILABLE', retryable: port.invoke.mock.calls.length > 1, message: 'Fixed test error'}), {status: 503, headers: {'Content-Type': 'application/json'}})}};
      port.preparation = f.preparation('rendered_unissued');
      const body = port.invoke.mock.calls.at(-1)![1].body;
      return {data: {schema_version: 1, ...body, status: 'rendered_unissued', final_record_id: null, artifact: port.preparation.items[0].artifact}, error: null};
    });
    const row: any = {enrollment_id: f.enrollment, student_user_id: f.pupil, student_label: 'Synthetic learner', course_id: f.course, course_label: 'Synthetic course', group_id: null};
    render(<MemoryRouter><IndividualEducationIssuanceDialog organizationId={f.org} row={row} enabled accessKey="qa-retention" onChanged={port.changed} onClose={() => {}} onOpenOrders={() => {}}/></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', {name: 'Продолжить сохранённую подготовку'}));
    fireEvent.click(await screen.findByRole('button', {name: /^Продолжить$/}));
    fireEvent.click(await screen.findByRole('button', {name: 'Сформировать PDF'}));
    fireEvent.click(await screen.findByRole('button', {name: 'Проверить и повторить тот же запрос'}));
    await waitFor(() => expect(port.invoke).toHaveBeenCalledTimes(2));
    fireEvent.click(await screen.findByRole('button', {name: 'Проверить и повторить тот же запрос'}));
    await screen.findByText('PDF сохранён · нужно утверждение');
    expect(port.invoke).toHaveBeenCalledTimes(3); expect(port.changed).toHaveBeenCalledTimes(1);
    const bodies = port.invoke.mock.calls.map(call => call[1].body);
    expect(bodies[1]).toBe(bodies[0]); expect(bodies[2]).toBe(bodies[0]);
    expect(bodies[0].request_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.queryByRole('button', {name: 'Проверить и повторить тот же запрос'})).toBeNull();
  });
});
