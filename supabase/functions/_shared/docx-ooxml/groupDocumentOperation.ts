export interface GroupDocumentOperationScope {
  actorId: string;
  organizationId: string;
  groupId: string;
  operationId: string;
}
interface RpcReply { data: unknown; error: unknown }
export interface GroupDocumentOperationClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcReply>;
}
export interface GroupDocumentOperationReceipt {
  operationId: string;
  batch: { batch_id: string; batch_version: number; inserted_count: number };
  document: {
    doc_type: "class_journal"; name: string; file_path: string; docx_sha256: string;
    pdf_status?: string | null; template_version_label?: string | null;
  };
  warnings: string[];
}
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

export function validateGroupDocumentOperationReceipt(value: unknown, scope: GroupDocumentOperationScope): GroupDocumentOperationReceipt {
  const prefix = `organizations/${scope.organizationId}/group-documents/${scope.groupId}/`;
  if (!object(value) || value.operationId !== scope.operationId || !object(value.batch) || !object(value.document)
    || !nonempty(value.batch.batch_id) || !Number.isSafeInteger(value.batch.batch_version) || Number(value.batch.batch_version) < 1
    || value.batch.inserted_count !== 9 || value.document.doc_type !== "class_journal"
    || !nonempty(value.document.name) || !nonempty(value.document.file_path) || !value.document.file_path.startsWith(prefix)
    || typeof value.document.docx_sha256 !== "string" || !/^[A-F0-9]{64}$/.test(value.document.docx_sha256)
    || !Array.isArray(value.warnings) || !value.warnings.every(warning => typeof warning === "string")) {
    throw new Error("Сервер не подтвердил сохранение полной партии для этой операции. Повтор допустим только с тем же идентификатором.");
  }
  return value as unknown as GroupDocumentOperationReceipt;
}

const rpcScope = (scope: GroupDocumentOperationScope) => ({
  p_actor_id: scope.actorId, p_organization_id: scope.organizationId,
  p_group_id: scope.groupId, p_operation_id: scope.operationId,
});

/** Null means no COMMITTED receipt, not cancellation or permission for a new ID. */
export async function readGroupDocumentOperation(client: GroupDocumentOperationClient, scope: GroupDocumentOperationScope) {
  const result = await client.rpc("get_goreltech_document_operation", rpcScope(scope));
  if (result.error) throw new Error("Не удалось проверить состояние операции. Обновление серверной схемы и прав должно быть завершено до сохранения.");
  if (result.data === null) return null;
  return validateGroupDocumentOperationReceipt(result.data, scope);
}

/** Exactly one write invocation. A lost RPC reply is reconciled by operation ID, never by an empty list. */
export async function persistGroupDocumentOperation(
  client: GroupDocumentOperationClient,
  scope: GroupDocumentOperationScope,
  documents: unknown[],
  warnings: string[],
): Promise<GroupDocumentOperationReceipt> {
  let result: RpcReply;
  try {
    result = await client.rpc("create_goreltech_group_document_batch_once", {
      ...rpcScope(scope), p_docs: documents, p_warnings: warnings,
    });
  } catch (error) {
    result = { data: null, error };
  }
  if (!result.error) return validateGroupDocumentOperationReceipt(result.data, scope);
  const committed = await readGroupDocumentOperation(client, scope);
  if (committed) return committed;
  throw new Error("Ответ базы не подтверждён. Операция ещё могла выполняться; Word-файлы сохранены для сверки. Проверьте состояние или повторите тот же запрос без смены идентификатора.");
}
