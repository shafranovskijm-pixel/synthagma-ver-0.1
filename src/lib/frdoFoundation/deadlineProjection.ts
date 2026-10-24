import type { z } from 'zod';
import type { deadlineSchema } from './contract';
import type { Stream } from './types';

type Deadline = z.infer<typeof deadlineSchema>;
type IssuerRegime = 'unconfirmed' | 'ordinary_rf' | 'joint_rf_foreign';

/** Checked source bytes are an orientation, not approval of a current complete
 * legal rule. This projection never calculates a date, upgrades the issuer,
 * changes a frozen packet or accepts caller-supplied policy/calendar authority. */
export function projectPendingFrdoDeadline(stream: Stream, issuerRegime: IssuerRegime, issueDate: string | null | undefined): Deadline {
  const label = stream === 'po' ? 'ПО' : 'ДПО';
  const pending = (message: string): Deadline => ({
    verification: 'pending_primary_current_law', stream, issuer_regime: issuerRegime,
    due_date: null, policy_ref: null, message,
  });
  if (issuerRegime === 'unconfirmed') return pending(`${label}: сначала нужен документ о режиме учреждения и проверка применимой нормы. Срок не рассчитан.`);
  if (issuerRegime === 'joint_rf_foreign') return pending(`${label}: специальный режим совместных учреждений не поддерживается этим стандартным экспортом; нужны отдельная проверка нормы и порядка. Срок не рассчитан.`);
  const parsed = typeof issueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(issueDate)
    ? new Date(issueDate + 'T00:00:00.000Z') : null;
  if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== issueDate) {
    return pending(`${label}: нужна точная дата выдачи из сохранённых сведений документа и проверка применимой нормы. Срок не рассчитан.`);
  }
  if (issueDate! < '2025-09-01') return pending(`${label}: для этой даты выдачи требуется историческая или переходная редакция нормы. Текущий ориентир не применён; срок не рассчитан.`);
  if (stream === 'po') return {
    verification: 'source_checked_pending_consolidation', stream,
    rule: { rule_id: 'ordinary_po_3_working', issuer_regime: 'ordinary_rf', stream, period: 3, unit: 'working_days' },
    candidate_due_date: null,
    official_source_sha256: '94be025cb314e8dc8004e945371d2d1e4597a1770259157e7a3858ad820571f8',
    calendar_sha256: null,
    message: 'ПО: в проверенном источнике — 3 рабочих дня после дня выдачи. Полная применимая редакция и правило ещё не утверждены; срок не рассчитан. Для расчёта нужны действующая норма, явное утверждение и официальный календарь.',
  };
  return {
    verification: 'source_checked_pending_consolidation', stream,
    rule: { rule_id: 'ordinary_dpo_30_calendar_from_20250901', issuer_regime: 'ordinary_rf', stream, period: 30, unit: 'calendar_days' },
    candidate_due_date: null,
    official_source_sha256: '6f8165496ac970f0dc8b6319334272b492643a7ce0d31e554d9403c021626bb3',
    calendar_sha256: null,
    message: 'ДПО: в проверенном источнике — 30 календарных дней со дня выдачи, не включая день выдачи; изменение действует с 01.09.2025. Полная применимая редакция и правило ещё не утверждены; срок не рассчитан.',
  };
}
