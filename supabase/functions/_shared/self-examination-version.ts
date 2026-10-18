import { AccessError, type AccessDb } from "./privileged-access.ts";

type VersionDb = AccessDb & { storage: { from(bucket: string): any } };
export async function prepareSelfExaminationVersion(db: VersionDb, organizationId: string, requestId: string, orderId: string | null) {
  const summary = orderId ? `Самообследование: заказ ${orderId}` : "Самообследование: ручное формирование";
  const previous = await db.from("org_document_versions").select("document_id,file_url,request_payload,document_metadata")
    .eq("organization_id", organizationId).eq("request_id", requestId).maybeSingle();
  if (previous.error) throw new AccessError(503, "Не удалось проверить сохранённую версию отчёта");
  if (previous.data) {
    if (previous.data.document_metadata?.type !== "self_examination_report" ||
        previous.data.request_payload?.upload?.change_summary !== summary) {
      throw new AccessError(409, "Идентификатор запроса уже использован для другого документа");
    }
    return { requestId, summary, documentId: previous.data.document_id as string, expectedRevision: 0,
      replayUrl: previous.data.file_url as string };
  }
  // Read the schema and current revision before AI work. An old deployment or
  // ambiguous catalogue row fails without generating or replacing any file.
  const current = await db.from("org_documents").select("id,document_revision")
    .eq("organization_id", organizationId).eq("type", "self_examination_report").is("deleted_at", null).maybeSingle();
  if (current.error) throw new AccessError(409, "Не удалось определить текущий отчёт. Обновите список документов");
  return { requestId, summary, documentId: current.data?.id ?? crypto.randomUUID(),
    expectedRevision: current.data?.document_revision ?? 0, replayUrl: null };
}

export async function saveSelfExaminationVersion(db: VersionDb, organizationId: string,
  operation: Awaited<ReturnType<typeof prepareSelfExaminationVersion>>, html: string, year: number) {
  const path = `${organizationId}/versions/${operation.documentId}/${operation.requestId}.html`;
  const blob = new Blob([html], { type: "text/html" });
  const upload = await db.storage.from("org-documents").upload(path, blob, { contentType: "text/html", upsert: false });
  if (upload.error) throw new AccessError(409, "Файл отчёта не сохранён. Прежний документ доступен без изменений");
  const commit = await db.rpc("commit_org_document_version", {
    p_document_id: operation.documentId, p_organization_id: organizationId, p_request_id: operation.requestId,
    p_expected_revision: operation.expectedRevision, p_restore_version_id: null,
    p_upload: { file_path: path, file_name: `Самообследование ${year}.html`, file_size: blob.size, change_summary: operation.summary },
    p_document: { name: `Отчёт о результатах самообследования ${year}`, type: "self_examination_report" },
  });
  // Never remove a staged blob after an uncertain commit response: the DB may
  // already reference it. A retry with this requestId checks the saved version.
  if (commit.error || !commit.data?.version_id) throw new AccessError(409,
    `Не удалось подтвердить сохранение версии. Повторите запрос с идентификатором ${operation.requestId}`);
  const saved = await db.from("org_document_versions").select("file_url").eq("id", commit.data.version_id).single();
  if (saved.error || !saved.data?.file_url) throw new AccessError(503, "Версия сохранена, но её ссылку пока не удалось получить");
  return saved.data.file_url as string;
}
