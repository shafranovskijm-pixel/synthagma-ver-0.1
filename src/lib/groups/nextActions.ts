import type { ReadinessStage } from './releaseReadiness';

export type GroupNextActionTarget = 'members' | 'settings' | 'requisites' | 'journals' | 'documents' | 'refresh';
export interface GroupNextAction {
  target: GroupNextActionTarget;
  title: string;
  reason: string;
  label: string;
  enabled: boolean;
  unavailableReason?: string;
}
interface Input {
  participants: ReadinessStage;
  learning: ReadinessStage;
  courseId: string | null;
  missingOrganizationFields: readonly string[];
  missingGroupFields: readonly string[];
  permissions: Record<Exclude<GroupNextActionTarget, 'refresh'>, boolean>;
}
const brief = (items: readonly string[]) => items.slice(0, 3).join(', ') + (items.length > 3 ? ` и ещё ${items.length - 3}` : '');

/** Navigation suggestions only. Never infer approval, qualification or issuance
 * from a date, file count or course progress. Existing workspaces own all writes. */
export function groupNextActions(input: Input): GroupNextAction[] {
  const result: GroupNextAction[] = [];
  const add = (target: GroupNextActionTarget, title: string, reason: string, label: string) => {
    if (result.some(item => item.target === target)) return;
    const enabled = target === 'refresh' || input.permissions[target];
    result.push({ target, title, reason, label, enabled,
      ...(!enabled ? { unavailableReason: 'Нет доступа к этому действию. Обратитесь к администратору центра.' } : {}),
    });
  };
  if (input.participants.status === 'unknown' || input.learning.status === 'unknown') {
    add('refresh', 'Проверьте сведения группы', 'Не удалось подтвердить часть данных. Отсутствие сведений не означает, что обучение не проводилось.', 'Обновить сведения');
  }
  if (input.participants.status === 'blocked') {
    add('members', 'Уточните состав группы', input.participants.detail, 'Открыть участников');
  }
  if (!input.courseId) {
    add('settings', 'Укажите курс группы', 'Курс группы пока не выбран. Проверьте программу и сведения группы.', 'Настройки группы');
  }
  if (input.missingOrganizationFields.length) {
    add('requisites', 'Дополните реквизиты центра', `Нужно проверить: ${brief(input.missingOrganizationFields)}.`, 'Открыть реквизиты');
  }
  if (input.missingGroupFields.length) {
    add('documents', 'Проверьте данные документов', `Нужно проверить: ${brief(input.missingGroupFields)}.`, 'Документы этой группы');
  }
  if (input.learning.status !== 'unknown' && input.courseId && input.participants.status !== 'blocked') {
    add('journals', input.learning.status === 'ready' ? 'Проверьте результаты обучения' : 'Проверьте ход обучения',
      input.learning.status === 'ready'
        ? 'Завершение курса отмечено. Решение об аттестации, выдача документа и его вручение проверяются отдельно.'
        : input.learning.detail,
      'Журналы этой группы');
  }
  if (!result.some(item => item.target === 'documents')) {
    add('documents', 'Проверьте документы группы', 'Откройте сохранённые версии и их состояние. Черновик, регистрация, подпись и вручение — отдельные действия.', 'Документы этой группы');
  }
  return result.slice(0, 3);
}

interface PreparationInput {
  kind: 'snapshot' | 'drafts';
  busy: boolean;
  pending: boolean;
  sourceKnown: boolean;
  canCapture: boolean;
  hasSource: boolean;
  hasReason?: boolean;
  missingDateNames?: readonly string[];
  prerequisites?: readonly string[];
}
/** Describes existing disabled conditions; does not replace or relax them. */
export function documentPreparationReason(input: PreparationInput): string | null {
  if (input.busy) return 'Дождитесь завершения текущего действия.';
  if (input.pending) return 'Предыдущий запрос ещё не подтверждён. Используйте повтор того же запроса.';
  if (!input.sourceKnown) return 'Сведения состава и календаря пока не подтверждены. Обновите сведения группы.';
  if (input.kind === 'snapshot' && !input.hasReason) return 'Укажите основание фиксации состава.';
  if (!input.canCapture) return input.prerequisites?.length
    ? brief(input.prerequisites)
    : 'Фиксация состава сейчас недоступна. Проверьте сведения группы или обратитесь к администратору центра.';
  if (!input.hasSource) return input.kind === 'snapshot'
    ? 'Сначала подготовьте опубликованный календарь группы.'
    : 'Сначала подтвердите снимок состава и проверьте данные группы.';
  if (input.missingDateNames?.length) return `Укажите даты документов: ${brief(input.missingDateNames)}.`;
  return null;
}
