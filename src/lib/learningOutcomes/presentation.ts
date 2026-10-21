import type { OutcomeComponent, OutcomeEnvelope } from './contract';

export const machineEligibilityLabels: Record<NonNullable<OutcomeEnvelope['machine']>['eligibility'], string> = {
  eligible: 'Требования расчёта выполнены', not_eligible: 'Требования расчёта не выполнены',
  incomplete: 'Обучение ещё не завершено', unknown: 'Недостаточно подтверждённых сведений',
};
export const attestationDecisionLabels: Record<NonNullable<OutcomeEnvelope['last_decision']>['outcome'], string> = {
  passed: 'Аттестация пройдена', not_passed: 'Аттестация не пройдена', deferred: 'Решение отложено',
};
export const outcomeComponentLabels: Record<OutcomeComponent['status'], string> = {
  satisfied: 'Выполнено', not_satisfied: 'Не выполнено', not_started: 'Не начато', unknown: 'Требуется проверка',
};
export const outcomeComponentKindLabels: Record<OutcomeComponent['kind'], string> = {
  test: 'Тест', module_completion: 'Учебный модуль', human_assessment: 'Оценка ответственным',
};
export const outcomeRelationLabels: Record<OutcomeEnvelope['decision_relation'], string | null> = {
  no_decision: null, current_inputs: null,
  new_machine_requires_review: 'После решения получен новый расчёт. Предыдущее решение сохранено и требует повторной проверки.',
  source_changed: 'Исходные сведения изменились. Сохранённое решение требует повторной проверки.',
};
export function outcomeTimeLabel(value: string): string {
  return new Date(value).toLocaleString('ru-RU');
}
/** Display the original score; it never becomes a new threshold or attestation decision. */
export function originalGradeLabel(component: OutcomeComponent): string | null {
  const grade = component.original_grade;
  return grade ? `${grade.score}/${grade.max_score} · ${grade.original_passed ? 'сдан' : 'не сдан'} · проходной ${grade.original_passing_score}%` : null;
}
