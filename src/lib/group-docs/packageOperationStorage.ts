export interface PackageOperationScope { organizationId: string; groupId: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validPackageOperationId = (value: unknown): value is string => typeof value === "string" && uuid.test(value);
export function packageOperationStorageKey(scope: PackageOperationScope): string {
  return `sintagma:group-document-operation:v1:${encodeURIComponent(scope.organizationId)}:${encodeURIComponent(scope.groupId)}`;
}
export function packageOperationAcknowledgmentKey(scope: PackageOperationScope, operationId: string): string {
  if (!validPackageOperationId(operationId)) throw new Error("Некорректный идентификатор операции.");
  return `${packageOperationStorageKey(scope)}:ack:${operationId}`;
}
function storage(): Storage {
  try { return window.localStorage; } catch { throw new Error("Хранилище браузера недоступно. Сохранение пакета не отправлено: нельзя надёжно сохранить идентификатор операции."); }
}
function readOperationIndex(scope: PackageOperationScope): string | null {
  let value: string | null;
  try { value = storage().getItem(packageOperationStorageKey(scope)); }
  catch { throw new Error("Не удалось прочитать идентификатор операции из хранилища браузера. Новое сохранение отключено."); }
  if (value !== null && !validPackageOperationId(value)) {
    throw new Error("Сохранённый идентификатор операции повреждён. Новое сохранение отключено; обратитесь к администратору, не удаляйте запись до проверки.");
  }
  return value;
}
export function isStoredPackageOperationAcknowledged(scope: PackageOperationScope, operationId: string): boolean {
  let value: string | null;
  try { value = storage().getItem(packageOperationAcknowledgmentKey(scope, operationId)); }
  catch { throw new Error("Не удалось прочитать подтверждение операции из хранилища браузера. Новое сохранение отключено."); }
  if (value !== null && value !== operationId) {
    throw new Error("Сохранённое подтверждение операции повреждено. Новое сохранение отключено до проверки.");
  }
  return value === operationId;
}
export function readStoredPackageOperation(scope: PackageOperationScope): string | null {
  const operationId = readOperationIndex(scope);
  return operationId !== null && isStoredPackageOperationAcknowledged(scope, operationId) ? null : operationId;
}
/** Persist only the UUID before sending; reject a different observed unfinished intent. */
export function persistPackageOperation(scope: PackageOperationScope, operationId: string): void {
  if (!validPackageOperationId(operationId)) throw new Error("Некорректный идентификатор операции.");
  const previous = readStoredPackageOperation(scope);
  if (previous !== null && previous !== operationId) throw new Error("В другой вкладке обнаружена другая незавершённая операция. Перечитайте её состояние.");
  try {
    const target = storage();
    target.setItem(packageOperationStorageKey(scope), operationId);
    if (target.getItem(packageOperationStorageKey(scope)) !== operationId) throw new Error("storage readback mismatch");
  } catch {
    throw new Error("Не удалось надёжно сохранить идентификатор операции в браузере. Запрос сохранения не отправлен.");
  }
}
/**
 * Only a validated exact server acknowledgment authorizes this call. The shared
 * scope index is NEVER removed: another tab may already have installed a new ID.
 * UUID-scoped ACK values are immutable and contain no document/actor payload.
 */
export function clearAcknowledgedPackageOperation(scope: PackageOperationScope, operationId: string): boolean {
  if (!validPackageOperationId(operationId)) throw new Error("Некорректный идентификатор операции.");
  readOperationIndex(scope); // Validate existing storage; do not overwrite corrupt state.
  const alreadyAcknowledged = isStoredPackageOperationAcknowledged(scope, operationId);
  try {
    const target = storage();
    if (!alreadyAcknowledged) target.setItem(packageOperationAcknowledgmentKey(scope, operationId), operationId);
    if (!isStoredPackageOperationAcknowledged(scope, operationId)) throw new Error("storage ACK not confirmed");
    const after = readOperationIndex(scope);
    return after === null || after === operationId;
  } catch {
    throw new Error("Сервер подтвердил пакет, но сохранение подтверждения операции в браузере не удалось. Новую операцию пока не начинайте.");
  }
}
