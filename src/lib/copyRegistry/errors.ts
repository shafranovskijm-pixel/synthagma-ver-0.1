import { copyErrorCodeSchema, type CopyErrorCode } from './contract';

export class CopyRegistryError extends Error {
  constructor(readonly code: CopyErrorCode = 'DEPENDENCY_UNAVAILABLE') { super(code); this.name = 'CopyRegistryError'; }
}
export const copyRegistryMessages: Record<CopyErrorCode, string> = {
  ACCESS_DENIED: 'Доступ к реестру организации не подтверждён.',
  INVALID_INPUT: 'Проверьте обязательные поля, оригинал и получателя.',
  NOT_FOUND: 'Запись или сохранённая версия больше недоступны. Обновите реестр.',
  SOURCE_UNAVAILABLE: 'Оригинал или его версия недоступны с текущими правами. Выберите доступный оригинал.',
  REVISION_CONFLICT: 'Реестр изменил другой сотрудник. Обновите данные перед сохранением.',
  REQUEST_MISMATCH: 'Этот запрос уже использован с другими данными. Обновите реестр.',
  LIMIT_EXCEEDED: 'Данные превышают безопасный размер одной операции. Исходные записи не изменены.',
  IMPORT_CONFLICT: 'Условия переноса изменились. Повторите предпросмотр; исходные локальные записи сохранены.',
  DEPENDENCY_UNAVAILABLE: 'Результат пока не подтверждён. Повторите тот же запрос.',
};
export function normalizeCopyRegistryError(error: unknown): CopyRegistryError {
  if (error instanceof CopyRegistryError) return error;
  const value = error as { code?: unknown; message?: unknown; status?: unknown } | null;
  if (value?.code === '42501' || value?.status === 401 || value?.status === 403) return new CopyRegistryError('ACCESS_DENIED');
  const embedded = typeof value?.message === 'string' ? value.message.match(/COPY_REGISTRY_(INVALID_INPUT|ACCESS_DENIED|NOT_FOUND|SOURCE_UNAVAILABLE|REVISION_CONFLICT|REQUEST_MISMATCH|LIMIT_EXCEEDED|IMPORT_CONFLICT|DEPENDENCY_UNAVAILABLE)(?:\b|$)/)?.[1] : null;
  const parsed = copyErrorCodeSchema.safeParse(embedded ?? value?.code);
  return new CopyRegistryError(parsed.success ? parsed.data : 'DEPENDENCY_UNAVAILABLE');
}
