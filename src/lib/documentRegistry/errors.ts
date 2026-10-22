import { registryErrorCodeSchema, type RegistryErrorCode } from './contract';
export const registryMessages: Record<RegistryErrorCode, string> = {
  INVALID_INPUT: 'Проверьте обязательные поля, файл и выбранные связи.', ACCESS_DENIED: 'Доступ к этому действию больше не подтверждён. Обновите кабинет.',
  NOT_FOUND: 'Запись недоступна с текущими правами.', SOURCE_UNAVAILABLE: 'Сохранённая версия файла недоступна. История регистрации сохранена.',
  SOURCE_CHANGED: 'Источник изменился. Выберите и проверьте актуальную версию.', CONTEXT_MISMATCH: 'Выбранные ученик, зачисление, договор и получатель не образуют подтверждённую связь.',
  CONTEXT_CHANGED: 'Учебные или договорные сведения изменились. Обновите выбор и проверьте его снова.', REVISION_CONFLICT: 'Запись изменена другим сотрудником. Обновите и проверьте её перед исправлением.',
  REQUEST_MISMATCH: 'Для этого запроса уже сохранено другое действие. Завершите предыдущий запрос.', LIMIT_EXCEEDED: 'Объём превышает безопасный предел операции. Неполная выгрузка не создана.',
  DEPENDENCY_UNAVAILABLE: 'Результат запроса пока не подтверждён. Повторите тот же запрос, чтобы не создавать повторную запись.',
};
export class DocumentRegistryError extends Error { constructor(readonly code: RegistryErrorCode = 'DEPENDENCY_UNAVAILABLE') { super(registryMessages[code]); this.name = 'DocumentRegistryError'; } }
export function normalizeRegistryError(value: unknown): DocumentRegistryError {
  if (value instanceof DocumentRegistryError) return value;
  const error = value as { code?: unknown; message?: unknown; status?: unknown } | null;
  if (error?.code === '42501' || error?.status === 401 || error?.status === 403) return new DocumentRegistryError('ACCESS_DENIED');
  const match = typeof error?.message === 'string' ? error.message.match(/DOCUMENT_REGISTRY_([A-Z_]+)/) : null;
  const parsed = registryErrorCodeSchema.safeParse(match?.[1]);
  if (parsed.success) return new DocumentRegistryError(parsed.data);
  if (error?.code === 'PT409') return new DocumentRegistryError('REVISION_CONFLICT');
  return new DocumentRegistryError();
}
