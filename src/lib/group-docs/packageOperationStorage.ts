export interface PackageOperationScope { organizationId: string; groupId: string }
export type PackageOperationFillMode = "data" | "blank";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validPackageOperationId = (value: unknown): value is string => typeof value === "string" && uuid.test(value);
export function packageOperationStorageKey(scope: PackageOperationScope): string {
  return `sintagma:group-document-operation:v1:${encodeURIComponent(scope.organizationId)}:${encodeURIComponent(scope.groupId)}`;
}
export function packageOperationAcknowledgmentKey(scope: PackageOperationScope, operationId: string): string {
  if (!validPackageOperationId(operationId)) throw new Error("Некорректный идентификатор операции.");
  return `${packageOperationStorageKey(scope)}:ack:${operationId}`;
}
function packageOperationContractIdsKey(scope: PackageOperationScope, operationId: string): string {
  if (!validPackageOperationId(operationId)) throw new Error("Некорректный идентификатор операции.");
  return `${packageOperationStorageKey(scope)}:contracts:${operationId}`;
}
function canonicalContractIds(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("Список договоров должен содержать только UUID.");
  for (const contractId of value) {
    if (!validPackageOperationId(contractId)) throw new Error("Список договоров должен содержать только UUID.");
  }
  return [...new Set((value as string[]).map(contractId => contractId.toLowerCase()))].sort();
}
const sameContractIds = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);
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
function readPackageOperationMetadata(scope: PackageOperationScope, operationId: string): {
  contractIds: string[]; fillMode: PackageOperationFillMode | null;
} | null {
  const key = packageOperationContractIdsKey(scope, operationId);
  let value: string | null;
  try { value = storage().getItem(key); }
  catch { throw new Error("Не удалось прочитать список договоров операции из хранилища браузера. Сохранение пакета отключено."); }
  if (value === null) return null;
  try {
    const metadata = JSON.parse(value);
    const expectedKeys = metadata?.version === 2
      ? "contractIds,fillMode,groupId,operationId,organizationId,version"
      : "contractIds,groupId,operationId,organizationId,version";
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)
      || Object.keys(metadata).sort().join(",") !== expectedKeys
      || (metadata.version !== 1 && metadata.version !== 2) || metadata.organizationId !== scope.organizationId
      || metadata.groupId !== scope.groupId || metadata.operationId !== operationId) {
      throw new Error("contract metadata scope mismatch");
    }
    if (metadata.version === 2 && metadata.fillMode !== "data" && metadata.fillMode !== "blank") {
      throw new Error("invalid package fill mode");
    }
    const ids = canonicalContractIds(metadata.contractIds);
    if (!sameContractIds(ids, metadata.contractIds)) throw new Error("noncanonical contract metadata");
    return { contractIds: ids, fillMode: metadata.version === 2 ? metadata.fillMode : null };
  } catch {
    throw new Error("Сохранённый список договоров операции повреждён или относится к другой операции. Сохранение пакета отключено до проверки.");
  }
}
/** null is legacy/missing metadata; [] is an explicitly persisted empty selection. */
export function readPackageOperationContractIds(scope: PackageOperationScope, operationId: string): string[] | null {
  return readPackageOperationMetadata(scope, operationId)?.contractIds ?? null;
}
/** Legacy metadata has no proven mode: never infer blank or data for a retry. */
export function readPackageOperationFillMode(scope: PackageOperationScope, operationId: string): PackageOperationFillMode | null {
  return readPackageOperationMetadata(scope, operationId)?.fillMode ?? null;
}
/** Persist immutable UUID selection and optional mode before the shared UUID index. */
export function persistPackageOperation(scope: PackageOperationScope, operationId: string, contractIds?: readonly string[], fillMode?: PackageOperationFillMode): void {
  if (!validPackageOperationId(operationId)) throw new Error("Некорректный идентификатор операции.");
  if (fillMode !== undefined && fillMode !== "data" && fillMode !== "blank") throw new Error("Некорректный режим заполнения пакета.");
  if (fillMode !== undefined && contractIds === undefined) throw new Error("Для сохранения режима нужен явный список UUID договоров, в том числе пустой.");
  const ids = contractIds === undefined ? undefined : canonicalContractIds(contractIds);
  const previous = readStoredPackageOperation(scope);
  if (previous !== null && previous !== operationId) throw new Error("В другой вкладке обнаружена другая незавершённая операция. Перечитайте её состояние.");
  if (ids !== undefined) {
    const stored = readPackageOperationMetadata(scope, operationId);
    if (stored !== null && !sameContractIds(stored.contractIds, ids)) {
      throw new Error("Список договоров уже сохранён для этой операции и не может быть изменён. Проверьте исходную операцию.");
    }
    if (fillMode !== undefined) {
      if ((stored !== null && stored.fillMode === null) || (stored === null
        && (readOperationIndex(scope) === operationId || isStoredPackageOperationAcknowledged(scope, operationId)))) {
        throw new Error("Режим старой операции не сохранён. Назначать его задним числом нельзя; сначала проверьте исходную операцию.");
      }
      if (stored !== null && stored.fillMode !== fillMode) {
        throw new Error("Режим заполнения уже сохранён для этой операции и не может быть изменён.");
      }
    }
    try {
      if (stored === null) {
        storage().setItem(packageOperationContractIdsKey(scope, operationId), JSON.stringify({
          version: fillMode === undefined ? 1 : 2, organizationId: scope.organizationId, groupId: scope.groupId,
          operationId, contractIds: ids, ...(fillMode === undefined ? {} : { fillMode }),
        }));
      }
      const confirmed = readPackageOperationMetadata(scope, operationId);
      if (confirmed === null || !sameContractIds(confirmed.contractIds, ids)
        || confirmed.fillMode !== (fillMode ?? stored?.fillMode ?? null)) throw new Error("contract metadata readback mismatch");
    } catch {
      throw new Error("Не удалось надёжно сохранить список договоров операции в браузере. Запрос сохранения не отправлен.");
    }
    // Metadata persistence must not overwrite another tab's newly observed intent.
    const current = readStoredPackageOperation(scope);
    if (current !== null && current !== operationId) throw new Error("В другой вкладке обнаружена другая незавершённая операция. Перечитайте её состояние.");
  }
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
