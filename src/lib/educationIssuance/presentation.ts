import type { IssuanceErrorCode, IssuanceEvent, IssuanceRecord, WithdrawalState } from './types';

export const issuanceMessages: Record<IssuanceErrorCode, string> = {
  INVALID_INPUT: 'Проверьте поля и точные зачисления.',
  ACCESS_DENIED: 'Текущий доступ к этой операции не подтверждён.',
  REVISION_CONFLICT: 'Данные изменились. Обновите проверку перед новым решением.',
  REQUEST_CONFLICT: 'Запрос уже использован с другими данными. Обновите проверку.',
  SOURCE_CHANGED: 'Исходные сведения изменились. Повторите предварительную проверку.',
  SOURCE_UNAVAILABLE: 'Точная исходная версия недоступна с текущими правами.',
  PREREQUISITE_MISSING: 'Не выполнены условия выдачи. Откройте причины в предварительной проверке.',
  REVIEW_REQUIRED: 'Требуется решение уполномоченного сотрудника по указанным основаниям.',
  LIMIT_EXCEEDED: 'Набор превышает технический предел операции. Разделите выбор; это не тарифный лимит.',
  DEPENDENCY_UNAVAILABLE: 'Результат запроса пока не подтверждён. Повторите тот же запрос.',
  NUMBER_PLAN_STALE: 'Номера изменились во время подготовки. Подготовьте новый файл; прежний файл не зарегистрирован как выданный.',
  ARTIFACT_UNAVAILABLE: 'Сохранённый итоговый файл недоступен или его неизменность не подтверждена. Обновите проверку.',
  ARTIFACT_REVIEW_REQUIRED: 'Сначала утвердите точную сохранённую версию итогового файла.',
  ARTIFACT_RENDER_FAILED: 'Не удалось сформировать проверенный PDF. Выдача не зарегистрирована.',
};
export const eventLabels: Record<IssuanceEvent['kind'], string> = {
  issued: 'Документ выдан', metadata_corrected: 'Исправлено примечание',
  handover_recorded: 'Зафиксирован факт вручения или отправки', handover_voided: 'Факт вручения отменён новой записью',
  duplicate_issued: 'Выдан связанный дубликат', annulled: 'Документ аннулирован',
};
export const documentTypeLabels = { certificate: 'Удостоверение', diploma: 'Диплом', qualification: 'Свидетельство' };
export function recordStatus(record: IssuanceRecord) {
  if (record.lifecycle === 'annulled') return 'Аннулирован';
  if (record.provenance === 'legacy_unverified') return 'Прежняя запись: основание выдачи не подтверждено';
  return record.official.document_status === 'duplicate' ? 'Дубликат' : 'Оригинал';
}
export function proofStatus(record: IssuanceRecord) {
  return record.proof_availability === 'captured' ? 'Основание зафиксировано сервером'
    : record.proof_availability === 'currently_unavailable' ? 'Основание недоступно с текущими правами'
    : 'Прежняя запись без проверяемого основания выдачи';
}
export function withdrawalStatus(state: WithdrawalState) {
  return state.state === 'withdrawn' ? 'Обучение прекращено; прежние результаты сохранены' : 'Обучение не прекращено';
}

export function handoverStatus(record:IssuanceRecord){
 const fact=record.latest_handover?.fact;
 return fact?({personal:'Передан лично ученику',representative:'Передан представителю',postal_dispatched:'Передан почтовому перевозчику',postal_delivered:'Зафиксирована почтовая доставка'} as const)[fact.kind]:'Передача не зафиксирована';
}
