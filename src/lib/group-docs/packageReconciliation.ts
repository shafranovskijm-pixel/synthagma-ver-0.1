import { supabase } from "@/integrations/supabase/client";
import type { GroupDocumentRow } from "@/hooks/useGroupDocuments";

interface Reply { data: unknown; error: unknown; count: number | null }
interface Query extends PromiseLike<Reply> {
  select(columns: "*", options: { count: "exact" }): Query;
  eq(column: string, value: string): Query;
  order(column: "id", options: { ascending: true }): Query;
  range(from: number, to: number): Query;
}
export interface PackageReconciliationClient { from(table: "group_documents"): Query }
export interface ReconciledGroupDocuments {
  documents: GroupDocumentRow[];
  currentVersion: number | null;
}
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const optionalText = (value: unknown) => value === null || value === undefined || typeof value === "string";
const fail = (): never => { throw new Error("Список документов не подтверждён. Повтор формирования остаётся отключён; перечитайте список ещё раз."); };

/** Explicit read-only reconciliation. A successful void refresh is not evidence. */
export async function reconcileGroupDocumentPackage(
  scope: { organizationId: string; groupId: string },
  client: PackageReconciliationClient = supabase as unknown as PackageReconciliationClient,
): Promise<ReconciledGroupDocuments> {
  if (!scope.organizationId || !scope.groupId) fail();
  const documents: GroupDocumentRow[] = [];
  const ids = new Set<string>();
  const batchVersions = new Map<string, number>();
  let total: number | undefined;
  for (let offset = 0; ; offset += 100) {
    const reply = await client.from("group_documents").select("*", { count: "exact" })
      .eq("organization_id", scope.organizationId).eq("group_id", scope.groupId).eq("status", "active")
      .order("id", { ascending: true }).range(offset, offset + 99);
    if (reply.error || !Array.isArray(reply.data) || !Number.isSafeInteger(reply.count) || Number(reply.count) < 0) return fail();
    if (total === undefined) total = Number(reply.count);
    if (reply.count !== total || reply.data.length !== Math.min(100, Math.max(0, total - offset))) fail();
    for (const row of reply.data) {
      if (!object(row) || !text(row.id) || ids.has(row.id) || row.organization_id !== scope.organizationId
        || row.group_id !== scope.groupId || row.status !== "active" || !text(row.doc_type) || !text(row.name)
        || !text(row.created_at) || !Number.isFinite(Date.parse(row.created_at)) || !(row.variables === null || object(row.variables))
        || !optionalText(row.file_path) || !optionalText(row.html) || !optionalText(row.document_number)
        || !optionalText(row.document_date) || (row.document_date && !Number.isFinite(Date.parse(String(row.document_date)))) || !optionalText(row.package_batch_id)
        || (row.variables_snapshot != null && !object(row.variables_snapshot))) fail();
      if (typeof row.package_batch_id === "string" && row.package_batch_id) {
        if (!Number.isSafeInteger(row.package_version) || Number(row.package_version) < 1 || typeof row.is_current !== "boolean") fail();
        const version = Number(row.package_version);
        const existing = batchVersions.get(row.package_batch_id);
        if (existing !== undefined && existing !== version) fail();
        batchVersions.set(row.package_batch_id, version);
      }
      ids.add(row.id);
      documents.push({ ...row, variables: row.variables ?? {} } as unknown as GroupDocumentRow);
    }
    if (documents.length === total) break;
  }
  documents.sort((left, right) => right.created_at.localeCompare(left.created_at) || left.id.localeCompare(right.id));
  const versions = documents.filter(row => row.package_batch_id && row.is_current).map(row => row.package_version!);
  return { documents, currentVersion: versions.length ? Math.max(...versions) : null };
}
