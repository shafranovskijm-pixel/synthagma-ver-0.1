import { supabase } from "@/integrations/supabase/client";

export interface DocumentLifecycle {
  file_url: string | null;
  status?: string | null;
  deleted_at?: string | null;
  expires_at?: string | null;
}
export type DocumentState = "none" | "fileless" | "active" | "expiring" | "expired" | "archived" | "deleted" | "unconfirmed";

export function getOrgDocumentState(doc: DocumentLifecycle | undefined, now = new Date()): { state: DocumentState; daysLeft: number | null } {
  if (!doc) return { state: "none", daysLeft: null };
  if (doc.deleted_at) return { state: "deleted", daysLeft: null };
  if (doc.status === "archived") return { state: "archived", daysLeft: null };
  if (!doc.file_url?.trim()) return { state: "fileless", daysLeft: null };
  if (doc.status === "expired") return { state: "expired", daysLeft: null };
  if (doc.status && doc.status !== "active") return { state: "unconfirmed", daysLeft: null };
  if (!doc.expires_at) return { state: "active", daysLeft: null };
  const expiry = new Date(doc.expires_at + "T00:00:00");
  if (!Number.isFinite(expiry.getTime())) return { state: "unconfirmed", daysLeft: null };
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((expiry.getTime() - today.getTime()) / 86400000);
  return { state: days < 0 ? "expired" : days <= 30 ? "expiring" : "active", daysLeft: days };
}
export function isOrgDocumentReady(doc: DocumentLifecycle | undefined, now?: Date) {
  const { state } = getOrgDocumentState(doc, now);
  return state === "active" || state === "expiring";
}

export interface VersionCommitResult {
  document_id: string;
  revision: number;
  version_id: string;
  version_number: number;
  replayed: boolean;
}
export interface OrgDocumentClient {
  storage: { from(bucket: string): {
    upload(path: string, file: File, options: { upsert: false; contentType?: string }): Promise<{ error: unknown }>;
    getPublicUrl(path: string): { data: { publicUrl: string } };
  } };
  rpc(name: string, params: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}
export interface DocumentUploadOperation {
  documentId: string;
  organizationId: string;
  requestId: string;
  expectedRevision: number;
  file: File;
  path: string;
  staged: boolean;
  document: Record<string, unknown>;
  changeSummary: string | null;
}
export function createDocumentUploadOperation(input: {
  organizationId: string; documentId?: string; expectedRevision?: number; file: File;
  document?: Record<string, unknown>; changeSummary?: string;
}): DocumentUploadOperation {
  const documentId = input.documentId || crypto.randomUUID();
  const requestId = crypto.randomUUID();
  const ext = input.file.name.split(".").pop()?.toLowerCase();
  const safeExt = ext && /^[a-z0-9]{1,12}$/.test(ext) ? ext : "bin";
  return {
    documentId, requestId, organizationId: input.organizationId,
    expectedRevision: input.expectedRevision ?? 0, file: input.file, staged: false,
    path: `${input.organizationId}/versions/${documentId}/${requestId}.${safeExt}`,
    document: structuredClone(input.document ?? {}), changeSummary: input.changeSummary?.trim() || null,
  };
}
async function commit(params: Record<string, unknown>, client: OrgDocumentClient): Promise<VersionCommitResult> {
  const { data, error } = await client.rpc("commit_org_document_version", params);
  if (error) throw error;
  const result = data as VersionCommitResult | null;
  if (!result?.version_id || result.document_id !== params.p_document_id || typeof result.revision !== "number") {
    throw new Error("Не удалось подтвердить сохранение. Повторите запрос: предыдущий файл сохранён в истории.");
  }
  return result;
}
/** Keep this operation for retries. Never delete a staged blob after an uncertain RPC result:
 * the transaction may already have committed and its response may simply be lost. */
export async function saveDocumentUpload(operation: DocumentUploadOperation, client = supabase as unknown as OrgDocumentClient) {
  const bucket = client.storage.from("org-documents");
  if (!operation.staged) {
    const { error } = await bucket.upload(operation.path, operation.file, { upsert: false, contentType: operation.file.type || undefined });
    if (error) throw error;
    operation.staged = true;
  }
  return commit({
    p_document_id: operation.documentId, p_organization_id: operation.organizationId,
    p_request_id: operation.requestId, p_expected_revision: operation.expectedRevision,
    p_upload: { file_path: operation.path, file_url: bucket.getPublicUrl(operation.path).data.publicUrl,
      file_name: operation.file.name, file_size: operation.file.size, change_summary: operation.changeSummary },
    p_restore_version_id: null, p_document: operation.document,
  }, client);
}
export async function restoreDocumentFile(input: {
  documentId: string; organizationId: string; requestId: string; expectedRevision: number; versionId: string;
}, client = supabase as unknown as OrgDocumentClient) {
  return commit({
    p_document_id: input.documentId, p_organization_id: input.organizationId,
    p_request_id: input.requestId, p_expected_revision: input.expectedRevision,
    p_upload: null, p_restore_version_id: input.versionId, p_document: {},
  }, client);
}

