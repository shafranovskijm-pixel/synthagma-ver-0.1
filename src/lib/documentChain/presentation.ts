import type { ChainAction, ChainSlot } from './contract';

export const chainSlotLabels: Record<ChainSlot['kind'], string> = { admission_order: 'Приказ о зачислении', completion_order: 'Приказ об отчислении', education_document: 'Документ об обучении' };
export const chainStateLabels: Record<ChainSlot['state'], string> = {
  not_created: 'Ещё не оформлен', needs_information: 'Нужно уточнить сведения', draft: 'Проект', in_review: 'На оформлении',
  registered: 'Зарегистрирован', issued: 'Выдан', legacy_unverified: 'Прежняя запись: основание не подтверждено',
  annulled: 'Аннулирован', not_applicable: 'Не требуется на этом этапе', unavailable: 'Не удалось подтвердить',
};
export function chainActionLabel(action: ChainAction, slot: ChainSlot): string {
  if (action.kind === 'open_source') return slot.source?.kind === 'admission_draft' ? 'Открыть проект' : slot.kind === 'education_document' ? 'Открыть документ' : 'Открыть приказ';
  return ({ choose_group: 'Выбрать группу', review_admission_draft: 'Уточнить сведения', review_group_program: 'Проверить программу группы', review_completion: 'Проверить завершение', review_issuance: 'Проверить выдачу' } as const)[action.kind];
}
