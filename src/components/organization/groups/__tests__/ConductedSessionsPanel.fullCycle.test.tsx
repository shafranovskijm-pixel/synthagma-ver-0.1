import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { useGroupEducationFacts } from '@/hooks/useGroupEducationFacts';

const api = vi.hoisted(() => ({
  listConductedSessions: vi.fn(), readFullConductedSession: vi.fn(),
  readSessionDraft: vi.fn(), prepareSessionMutation: vi.fn(),
}));
vi.mock('@/lib/conductedSessions/client', () => ({
  ...api, sessionError: (error: unknown) => error,
  sessionErrorMessage: { DEPENDENCY_UNAVAILABLE: 'Проверка не подтверждена' },
}));
vi.mock('@/lib/groupEducationFacts/client', () => ({
  captureEducationScope: (organizationId: string, groupId: string, current: () => boolean, courseId: string) => ({ organizationId, groupId, current, courseId }),
  educationScopeCurrent: (scope: { current: () => boolean }) => scope.current(),
}));

import { ConductedSessionsPanel } from '../ConductedSessionsPanel';
import { compatibleArtifactSnapshot, envelope, id, scope } from '@/lib/groupEducationFacts/__tests__/fixtures';
import { detail, hash, receipt } from '@/lib/conductedSessions/__tests__/fixtures';

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  api.listConductedSessions.mockResolvedValue({ schema_version: 1, scope, sessions: [], next_after_id: null });
});

describe('group → conducted session → current result → saved document draft', () => {
  it('sends explicit attendance and then pins the education draft to the confirmed session revision and exact pupil', async () => {
    const snapshot = compatibleArtifactSnapshot(), confirmed = detail();
    const outcome = confirmed.outcomes[0].outcome!;
    outcome.decision_relation = 'current_inputs';
    outcome.last_decision = {
      id: id(91), machine_result_id: outcome.machine!.id, outcome: 'passed',
      learner_summary: 'Синтетический результат проверен преподавателем', recorded_at: confirmed.version.recorded_at,
      supersedes_id: null, staff_reason: 'Синтетическое служебное основание', actor_id: id(40), basis: 'machine',
    };
    const facts = {
      envelope: envelope(), calendarValue: { calendar: snapshot.projection.calendar }, scopeCurrent: () => true,
      invalidateAccess: vi.fn(), busy: false, pending: false,
      mutate: vi.fn().mockResolvedValue({ receipt: { snapshot_id: snapshot.header.id } }),
      snapshot: vi.fn().mockResolvedValue(snapshot),
    } as unknown as ReturnType<typeof useGroupEducationFacts>;
    api.readFullConductedSession.mockResolvedValue(confirmed);
    api.prepareSessionMutation.mockImplementation((_scope, _revision, action) => ({
      action,
      run: vi.fn().mockResolvedValue(action.action === 'confirm_session' ? receipt() : {
        schema_version: 1, receipt: {
          ...receipt().receipt, action: 'create_draft', draft_id: id(70), draft_revision: 1, draft_hash: hash,
        },
      }),
    }));
    render(<ConductedSessionsPanel organizationId={scope.organization_id} groupId={scope.group_id} facts={facts} />);
    const lesson = snapshot.projection.calendar.lessons[0];
    fireEvent.change(screen.getByLabelText('Занятие для подтверждения'), { target: { value: lesson.lesson_id } });
    fireEvent.change(screen.getByLabelText('Фактическое начало занятия со смещением'), { target: { value: confirmed.version.starts_at } });
    fireEvent.change(screen.getByLabelText('Фактическое окончание занятия со смещением'), { target: { value: confirmed.version.ends_at } });
    fireEvent.change(screen.getByLabelText('Фактические академические часы'), { target: { value: confirmed.version.academic_hours } });
    fireEvent.change(screen.getByLabelText('Основание занятия'), { target: { value: 'Проверка проведённого синтетического занятия' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Зафиксировать состав на начало занятия' })); });
    expect(facts.mutate).toHaveBeenCalledWith(expect.objectContaining({
      action: 'capture_roster_snapshot', purpose: 'lesson_roster',
      calendar_version_id: snapshot.header.calendar_version_id, expected_calendar_hash: snapshot.header.calendar_hash,
      as_of: { kind: 'at', at: confirmed.version.starts_at, timezone: envelope().state!.timezone },
    }));
    expect(screen.getByLabelText('Посещение: Учебная подпись')).toHaveValue('');
    expect(api.prepareSessionMutation).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Посещение: Учебная подпись'), { target: { value: 'present' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Подтверждаю фактическое проведение и каждую отметку посещения' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Подтвердить проведённое занятие' })); });
    expect(api.prepareSessionMutation).toHaveBeenNthCalledWith(1, expect.objectContaining({
      organizationId: scope.organization_id, groupId: scope.group_id, courseId: scope.course_id,
    }), 0, {
      action: 'confirm_session', calendar_version_id: snapshot.header.calendar_version_id,
      calendar_hash: snapshot.header.calendar_hash, lesson_id: lesson.lesson_id, snapshot_id: snapshot.header.id,
      starts_at: confirmed.version.starts_at, ends_at: confirmed.version.ends_at,
      academic_hours: confirmed.version.academic_hours, teacher_user_id: lesson.teacher_user_id,
      attendance: [{ user_id: snapshot.rows[0].user_id, status: 'present' }],
      reason: 'Проверка проведённого синтетического занятия', human_attested: true,
    });
    expect(api.readFullConductedSession).toHaveBeenCalledWith(expect.objectContaining({ organizationId: scope.organization_id, groupId: scope.group_id }), confirmed.session.id);
    expect(await screen.findByText('Результат: Синтетический результат проверен преподавателем')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'В черновик' }));
    fireEvent.change(screen.getByLabelText('Вид черновика занятия'), { target: { value: 'education_document' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик для проверки' })); });
    expect(api.prepareSessionMutation).toHaveBeenNthCalledWith(2, expect.objectContaining({
      organizationId: scope.organization_id, groupId: scope.group_id, courseId: scope.course_id,
    }), confirmed.version.revision, {
      action: 'create_draft', session_id: confirmed.session.id, expected_content_hash: confirmed.version.content_hash,
      kind: 'education_document', expected_draft_revision: 0, student_ids: [snapshot.rows[0].user_id],
      reason: 'Проверка проведённого синтетического занятия', human_review_required: true,
    });
    await waitFor(() => expect(screen.getByLabelText('ID сохранённого черновика занятия')).toHaveValue(id(70)));
    expect(screen.getByRole('button', { name: 'Документ об обучении, редакция 1' })).toBeInTheDocument();
    expect(screen.getByText(/Выдача, подпись и регистрация остаются отдельными действиями человека/)).toBeInTheDocument();
  });
});
