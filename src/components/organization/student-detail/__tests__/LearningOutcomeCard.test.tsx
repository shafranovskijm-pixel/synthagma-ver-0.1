import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as f from '@/lib/learningOutcomes/__tests__/fixtures';
import { LearningOutcomeCard } from '../LearningOutcomeCard';

const mock = vi.hoisted(() => ({ hook: vi.fn(), controller: {} as any }));
vi.mock('@/hooks/useLearningOutcome', () => ({ useLearningOutcome: (...args: unknown[]) => { mock.hook(...args); return mock.controller; } }));
const props = { organizationId: f.organization, studentUserId: f.learner, courseId: f.course, enrollmentId: f.enrollment };
beforeEach(() => {
  vi.clearAllMocks();
  mock.controller = { viewKey: 'synthetic-current-actor', data: f.outcome(), selected: f.scope, associations: f.associations(),
    loading: false, error: null, busy: false, pending: false, operationError: null, refresh: vi.fn(), refreshAssociations: vi.fn(),
    selectAssociation: vi.fn(), capture: vi.fn(), decide: vi.fn(), loadDecisionOptions: vi.fn(), decisionOptions: null, retryPending: vi.fn() };
});
afterEach(cleanup);
const open = () => { render(<LearningOutcomeCard {...props} />); fireEvent.click(screen.getByRole('button', { name: 'Итог обучения и аттестация' })); };

describe('outcome card preserves the technical result and human decision distinction', () => {
  it('leaves private outcome loading lazy until the course panel is explicitly opened', () => {
    render(<LearningOutcomeCard {...props} />);
    expect(mock.hook).not.toHaveBeenCalled();
    expect(screen.queryByText('Расчёт по критериям')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Итог обучения и аттестация' }));
    expect(mock.hook).toHaveBeenCalledWith(f.organization, f.learner, f.course, f.enrollment, true, '');
    expect(screen.getByText('Расчёт по критериям')).toBeInTheDocument();
  });
  it('an eligible calculation does not claim attestation passed or create a human decision', () => {
    open();
    expect(screen.getByText('Требования расчёта выполнены')).toBeInTheDocument();
    expect(screen.getByText('Решение об аттестации ещё не записано.')).toBeInTheDocument();
    expect(screen.queryByText('Аттестация пройдена')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /выдать|протокол|аттестация пройдена/i })).not.toBeInTheDocument();
    expect(mock.controller.capture).not.toHaveBeenCalled();
  });
  it('shows unknown prerequisites without inventing a threshold, criteria or a save action', () => {
    mock.controller.data = f.outcome({ criteria_ref: null, machine: null, prerequisites: ['Нужно утвердить критерии программы'] });
    open();
    expect(screen.getByText('Нужно утвердить критерии программы')).toBeInTheDocument();
    expect(screen.getByText('Утверждённые критерии для этого зачисления пока не закреплены.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Сохранить расчёт' })).not.toBeInTheDocument();
    expect(screen.queryByText(/70%/)).not.toBeInTheDocument();
  });
  it('retains the recorded decision when its inputs changed, without displaying private staff reasons', () => {
    mock.controller.data = f.outcome({ machine: { ...f.outcome().machine!, source_fresh: false }, decision_relation: 'source_changed',
      last_decision: { id: f.id(30), machine_result_id: f.id(10), outcome: 'passed', learner_summary: 'Проверка организации завершена',
        recorded_at: f.instant, supersedes_id: null, staff_reason: 'PRIVATE INTERNAL NOTE', actor_id: f.actor, basis: 'machine' } });
    open();
    expect(screen.getByText('Аттестация пройдена')).toBeInTheDocument();
    expect(screen.getByText('Исходные сведения изменились. Сохранённое решение требует повторной проверки.')).toBeInTheDocument();
    expect(screen.queryByText('PRIVATE INTERNAL NOTE')).not.toBeInTheDocument();
  });
  it('shows the original attempt score and threshold without turning an unknown component into zero', () => {
    mock.controller.data = f.outcome({ machine: { ...f.outcome().machine!, components: [{ component_id: f.id(40), kind: 'test', status: 'unknown',
      reason_code: 'SOURCE_REQUIRES_REVIEW', selected_source_hash: f.hash, provenance: 'bound_context', original_grade: {
        attempt_id: f.id(41), session_id: f.id(42), started_at: f.instant, completed_at: f.instant,
        score: 8, max_score: 20, original_passed: false, original_passing_score: 70,
      } }, { component_id: f.id(43), kind: 'human_assessment', status: 'unknown', reason_code: 'HUMAN_ASSESSMENT_REQUIRED',
        selected_source_hash: null, provenance: 'unavailable', original_grade: null }] } });
    open();
    expect(screen.getByText('Исходная попытка: 8/20 · не сдан · проходной 70%')).toBeInTheDocument();
    expect(screen.getAllByText('Требуется проверка')).toHaveLength(2);
    expect(screen.queryByText(/0\/0/)).not.toBeInTheDocument();
  });
  it('requires an explicit capture reason and locks new captures during an uncertain request', () => {
    const view = render(<LearningOutcomeCard {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Итог обучения и аттестация' }));
    expect(screen.getByRole('button', { name: 'Сохранить расчёт' })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Основание расчёта' }), { target: { value: 'Проверяем завершённое обучение' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить расчёт' }));
    expect(mock.controller.capture).toHaveBeenCalledWith('Проверяем завершённое обучение');
    mock.controller = { ...mock.controller, pending: true };
    view.rerender(<LearningOutcomeCard {...props} />);
    expect(screen.getByRole('button', { name: 'Сохранить расчёт' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить сохранение итога' }));
    expect(mock.controller.retryPending).toHaveBeenCalledOnce();
  });
  it('unknown machine evidence allows deferral and requires explicit current-condition review before passing', () => {
    mock.controller.data = f.outcome({ capabilities: { can_capture: true, can_decide: true }, machine: { ...f.outcome().machine!, eligibility: 'unknown',
      components: [{ component_id: f.id(90), kind: 'module_completion', status: 'satisfied', reason_code: 'CURRENT_MODULE_CONDITION_OBSERVED',
        original_grade: null, selected_source_hash: f.hash, provenance: 'current_condition_observed' }] } });
    const view = render(<LearningOutcomeCard {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Итог обучения и аттестация' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Основание решения' }), { target: { value: 'machine' } });
    expect(screen.getByRole('option', { name: 'Аттестация пройдена' })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Аттестация не пройдена' })).toBeDisabled();
    mock.controller.data = { ...mock.controller.data, machine: { ...mock.controller.data.machine, eligibility: 'eligible' } };
    view.rerender(<LearningOutcomeCard {...props} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Решение об аттестации' }), { target: { value: 'passed' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Служебное основание решения' }), { target: { value: 'Применимость проверена' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Пояснение решения ученику' }), { target: { value: 'Итог подтверждён' } });
    expect(screen.getByRole('button', { name: 'Сохранить решение организации' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Учебный модуль 1: проверена применимость к этому зачислению' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить решение организации' }));
    expect(mock.controller.decide).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'passed', basis: 'machine', reviewed_current_component_ids: [f.id(90)],
      recognized_component_ids: [], recognition_file_version_id: null }));
  });
  it('recognition uses only actual allowed components and the selected approved document version', () => {
    mock.controller.data = f.outcome({ capabilities: { can_capture: true, can_decide: true }, machine: { ...f.outcome().machine!, eligibility: 'unknown', components: [
      { component_id: f.id(91), kind: 'human_assessment', status: 'unknown', reason_code: 'HUMAN_ASSESSMENT_REQUIRED', original_grade: null, selected_source_hash: null, provenance: 'unavailable' },
    ] } });
    mock.controller.decisionOptions = { schema_version: 1, scope: f.scope, allowed_component_ids: [f.id(91)], files: [{ version_id: f.id(73), document_name: 'Реальное согласованное основание' }] };
    open();
    fireEvent.change(screen.getByRole('combobox', { name: 'Основание решения' }), { target: { value: 'recognition' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Оценка ответственным 1: признать по выбранному основанию' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Согласованное основание признания' }), { target: { value: f.id(73) } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Решение об аттестации' }), { target: { value: 'passed' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Служебное основание решения' }), { target: { value: 'Проверено согласованное основание' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Пояснение решения ученику' }), { target: { value: 'Результат признан ответственным' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить решение организации' }));
    expect(mock.controller.decide).toHaveBeenCalledWith(expect.objectContaining({ basis: 'recognition', recognized_component_ids: [f.id(91)], recognition_file_version_id: f.id(73) }));
  });
  it('keeps the original pending action retry visible after a read error removes all outcome data', () => {
    mock.controller = { ...mock.controller, data: null, error: 'DEPENDENCY_UNAVAILABLE', pending: true };
    open();
    expect(screen.queryByText('Расчёт по критериям')).not.toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Повторить сохранение итога' });
    expect(retry).toBeEnabled(); fireEvent.click(retry);
    expect(mock.controller.retryPending).toHaveBeenCalledTimes(1);
    expect(mock.controller.capture).not.toHaveBeenCalled(); expect(mock.controller.decide).not.toHaveBeenCalled();
  });
  it('recognition cannot pass stale inputs or leave an unsatisfied component without recognition', () => {
    const first = { component_id: f.id(91), kind: 'human_assessment' as const, status: 'unknown' as const, reason_code: 'HUMAN_ASSESSMENT_REQUIRED',
      original_grade: null, selected_source_hash: null, provenance: 'unavailable' as const };
    const other = { ...first, component_id: f.id(92) };
    mock.controller.data = f.outcome({ capabilities: { can_capture: true, can_decide: true }, machine: { ...f.outcome().machine!, source_fresh: false,
      eligibility: 'unknown', components: [first, other] } });
    mock.controller.decisionOptions = { schema_version: 1, scope: f.scope, allowed_component_ids: [f.id(91), f.id(92)], files: [{ version_id: f.id(73), document_name: 'Реальное основание' }] };
    const view = render(<LearningOutcomeCard {...props} />); fireEvent.click(screen.getByRole('button', { name: 'Итог обучения и аттестация' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Основание решения' }), { target: { value: 'recognition' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Оценка ответственным 1: признать по выбранному основанию' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Согласованное основание признания' }), { target: { value: f.id(73) } });
    expect(screen.getByRole('option', { name: 'Аттестация пройдена' })).toBeDisabled();
    mock.controller.data = { ...mock.controller.data, machine: { ...mock.controller.data.machine, source_fresh: true } };
    view.rerender(<LearningOutcomeCard {...props} />);
    expect(screen.getByRole('option', { name: 'Аттестация пройдена' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Оценка ответственным 2: признать по выбранному основанию' }));
    expect(screen.getByRole('option', { name: 'Аттестация пройдена' })).toBeEnabled();
    expect(mock.controller.decide).not.toHaveBeenCalled();
  });
});
