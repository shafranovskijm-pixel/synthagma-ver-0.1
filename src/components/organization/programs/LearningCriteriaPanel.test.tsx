import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as f from '@/lib/learningOutcomes/__tests__/fixtures';
import { LearningCriteriaPanel } from './LearningCriteriaPanel';

const mock = vi.hoisted(() => ({ hook: vi.fn(), controller: {} as any }));
vi.mock('@/hooks/useLearningCriteria', () => ({ useLearningCriteria: (...args: unknown[]) => { mock.hook(...args); return mock.controller; } }));
beforeEach(() => {
  vi.clearAllMocks(); mock.controller = { viewKey: 'current-actor', actorId: f.actor, data: f.criteriaEnvelope([]), options: f.criteriaOptions(),
    loading: false, error: null, operationError: null, busy: false, pending: false, reload: vi.fn(), mutate: vi.fn().mockResolvedValue(true), retryPending: vi.fn() };
});
afterEach(cleanup);
function openEditor() {
  render(<LearningCriteriaPanel organizationId={f.organization} courseId={f.course} programVersionId={f.scope.program_version_id} />);
  fireEvent.click(screen.getByRole('button', { name: 'Открыть критерии' }));
  fireEvent.click(screen.getByRole('button', { name: 'Создать черновик критериев' }));
}
const notes = () => {
  fireEvent.change(screen.getByRole('combobox', { name: 'Независимая проверка' }), { target: { value: 'no' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Примечание к критериям' }), { target: { value: 'Основание из программы центра' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Основание сохранения критериев' }), { target: { value: 'Подготовить критерии на рассмотрение' } });
};
describe('criteria forms require explicit centre choices', () => {
  it('is lazy and can save an explicitly incomplete draft without a fabricated assessment or person', () => {
    openEditor();
    expect(screen.getByRole('combobox', { name: 'Основная оценка' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Проверяющий критерии' })).toHaveValue('');
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сохранить черновик критериев' })).toBeDisabled();
    notes(); fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик критериев' }));
    const command = mock.controller.mutate.mock.calls[0][0];
    expect(command.definition.main).toBeNull(); expect(command.definition.reviewer_id).toBeNull(); expect(command.definition.eligible_decider_ids).toEqual([]);
    expect(command.action).toBe('save_criteria_version'); expect(mock.controller.mutate).toHaveBeenCalledTimes(1);
  });
  it('uses actual options and preserves a chosen fractional threshold exactly in basis points', () => {
    openEditor(); notes();
    fireEvent.change(screen.getByRole('combobox', { name: 'Основная оценка' }), { target: { value: 'test' } });
    expect(screen.getByRole('combobox', { name: 'Основная оценка: пересдачи' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Основная оценка: правило зачёта' })).toHaveValue('');
    fireEvent.change(screen.getByRole('combobox', { name: 'Основная оценка: тест' }), { target: { value: f.id(70) } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Основная оценка: пересдачи' }), { target: { value: 'best_percent' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Основная оценка: правило зачёта' }), { target: { value: 'percent' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Основная оценка: проходной процент' }), { target: { value: '70.01' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Основная оценка: округление' }), { target: { value: 'none' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Проверяющий критерии' }), { target: { value: f.actor } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Другой ответственный' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик критериев' }));
    expect(mock.controller.mutate.mock.calls[0][0].definition.main).toMatchObject({ lesson_id: f.id(70), retake_policy: 'best_percent', pass_rule: { kind: 'percent', threshold_basis_points: 7001, rounding: 'none' } });
    expect(mock.controller.mutate.mock.calls[0][0].definition.eligible_decider_ids).toEqual([f.id(72)]);
  });
  it('does not expose approval for a different reviewer or permit independent self-approval', () => {
    mock.controller.data = f.criteriaEnvelope([f.criteriaVersion({ reviewer_id: f.actor, definition: f.criteriaDefinition({ reviewer_id: f.actor,
      independent_review_required: true, main: { kind: 'human_assessment', component_id: f.id(90), label: 'Практическая оценка' }, eligible_decider_ids: [f.actor] }) })]);
    render(<LearningCriteriaPanel organizationId={f.organization} courseId={f.course} programVersionId={f.scope.program_version_id} />);
    fireEvent.click(screen.getByRole('button', { name: 'Открыть критерии' }));
    fireEvent.change(screen.getByRole('textbox', { name: `Основание утверждения ${f.id(60)}` }), { target: { value: 'Попытка утвердить собственный черновик' } });
    expect(screen.getByRole('button', { name: 'Утвердить проверенную версию критериев' })).toBeDisabled();
    expect(mock.controller.mutate).not.toHaveBeenCalled();
  });
  it('offers only a new clone for a draft owned by another author', () => {
    mock.controller.data = f.criteriaEnvelope([f.criteriaVersion({ created_by: f.id(72) })]);
    render(<LearningCriteriaPanel organizationId={f.organization} courseId={f.course} programVersionId={f.scope.program_version_id} />);
    fireEvent.click(screen.getByRole('button', { name: 'Открыть критерии' }));
    expect(screen.queryByRole('button', { name: 'Редактировать черновик' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Создать новый черновик на основе этой версии' }));
    notes(); fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик критериев' }));
    expect(mock.controller.mutate.mock.calls[0][0]).toMatchObject({ action: 'save_criteria_version', draft_id: null, expected_revision: 0 });
  });
});
