import { AccessError, checked, requireUuid, type AccessDb } from "./privileged-access.ts";
export type OcrKind = "passport" | "snils";
export type OcrInput = { documentId?: string; filePath?: string; organizationId?: string; studentUserId?: string; kind?: OcrKind };
export type OcrSource = { id: string; organizationId: string; userId: string; kind: OcrKind; path: string };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const kind = (v: unknown): v is OcrKind => v === "passport" || v === "snils";
function isIdentityPath(path: string): boolean {
  return path.length <= 1500 && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\//i.test(path)
    && !/[\\%?#\u0000-\u001f\u007f]/.test(path) && !path.split("/").some(s => !s || s === "." || s === "..");
}
export function parseOcrInput(value: unknown): OcrInput {
  if (!object(value) || Object.keys(value).some(k => !["documentId", "organizationId", "studentUserId", "doc_type", "file_path"].includes(k))) throw new AccessError(400, "Некорректный запрос распознавания");
  const result: OcrInput = {};
  if (value.documentId !== undefined) result.documentId = requireUuid(value.documentId, "документ");
  if (value.organizationId !== undefined) result.organizationId = requireUuid(value.organizationId, "организация");
  if (value.studentUserId !== undefined) result.studentUserId = requireUuid(value.studentUserId, "ученик");
  if (value.doc_type !== undefined) {
    if (!kind(value.doc_type)) throw new AccessError(400, "Неподдерживаемый тип документа");
    result.kind = value.doc_type;
  }
  if (value.file_path !== undefined) {
    if (typeof value.file_path !== "string" || !isIdentityPath(value.file_path)) throw new AccessError(400, "Некорректная ссылка на документ");
    result.filePath = value.file_path;
  }
  if (!result.documentId && !result.filePath) throw new AccessError(400, "Укажите документ для распознавания");
  return result;
}
/** Every query/RPC uses the original caller. Service credentials are never authority. */
export async function requireOcrSource(db: AccessDb, input: OcrInput): Promise<OcrSource> {
  let query = db.from("student_identity_documents").select("id,organization_id,user_id,type,file_path");
  query = input.documentId ? query.eq("id", input.documentId) : query.eq("file_path", input.filePath);
  const rows = checked<any[]>(await query.limit(2));
  if (!Array.isArray(rows) || rows.length === 0) throw new AccessError(404, "Документ недоступен");
  if (rows.length !== 1) throw new AccessError(409, "Не удалось однозначно определить документ. Обновите страницу");
  const row = rows[0];
  if (!object(row) || !kind(row.type) || typeof row.file_path !== "string" || !isIdentityPath(row.file_path)) throw new AccessError(409, "Источник документа требует проверки");
  let id: string, organizationId: string, userId: string;
  try { id = requireUuid(row.id, "документ"); organizationId = requireUuid(row.organization_id, "организация"); userId = requireUuid(row.user_id, "ученик"); }
  catch { throw new AccessError(409, "Источник документа требует проверки"); }
  if (row.file_path.split("/")[0].toLowerCase() !== userId || input.documentId && input.documentId !== id
    || input.filePath && input.filePath !== row.file_path || input.organizationId && input.organizationId !== organizationId
    || input.studentUserId && input.studentUserId !== userId || input.kind && input.kind !== row.type) throw new AccessError(409, "Источник документа изменился. Обновите страницу");
  const results = await Promise.all([
    db.rpc("uc_document_has_action", { p_org: organizationId, p_action: "write" }),
    db.rpc("can_access_organization", { _organization_id: organizationId, _permission: "students.write" }),
    db.rpc("uc_document_student_scope_allowed", { p_org: organizationId, p_user: userId }),
  ]);
  if (results.some(result => checked(result) !== true)) throw new AccessError(403, "Нет права распознавать документы этого ученика");
  return { id, organizationId, userId, kind: row.type, path: row.file_path };
}
export function requireSameOcrSource(before: OcrSource, current: OcrSource) {
  if (JSON.stringify(before) !== JSON.stringify(current)) throw new AccessError(409, "Источник документа изменился. Обновите страницу");
}
export const MAX_OCR_BYTES = 10 * 1024 * 1024;
export function ocrMime(bytes: Uint8Array): string {
  if (!bytes.length || bytes.length > MAX_OCR_BYTES) throw new AccessError(422, "Документ пуст или превышает 10 МБ");
  const has = (...values: number[]) => values.every((v, i) => bytes[i] === v);
  if (has(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf";
  if (has(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (has(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (has(0x47, 0x49, 0x46, 0x38) && [0x37, 0x39].includes(bytes[4]) && bytes[5] === 0x61) return "image/gif";
  if (has(0x52, 0x49, 0x46, 0x46) && [0x57, 0x45, 0x42, 0x50].every((v, i) => bytes[i + 8] === v)) return "image/webp";
  if (has(0x42, 0x4d)) return "image/bmp";
  throw new AccessError(422, "Поддерживаются PDF и изображения документов");
}
const digits = (v: unknown, count: number) => typeof v === "string" && v.replace(/\D/g, "").length === count ? v.replace(/\D/g, "") : null;
function date(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/^(\d{2})[.\/-](\d{2})[.\/-](\d{4})$/, "$3-$2-$1");
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s ? s : null;
}
export function normalizedOcrResult(raw: unknown, source: OcrSource) {
  if (!object(raw)) throw new AccessError(502, "Не удалось распознать документ");
  const snils = digits(raw.snils, 11), series = digits(raw.passport_series, 4), number = digits(raw.passport_number, 6), department = digits(raw.passport_department_code, 6);
  const issuer = typeof raw.passport_issued_by === "string" ? raw.passport_issued_by.replace(/\s+/g, " ").trim().slice(0, 4000) : "";
  return { documentId: source.id, doc_type: source.kind,
    snils: source.kind === "snils" && snils ? `${snils.slice(0, 3)}-${snils.slice(3, 6)}-${snils.slice(6, 9)} ${snils.slice(9)}` : null,
    birth_date: date(raw.birth_date), passport_series: source.kind === "passport" && series ? `${series.slice(0, 2)} ${series.slice(2)}` : null,
    passport_number: source.kind === "passport" ? number : null, passport_issue_date: source.kind === "passport" ? date(raw.passport_issue_date) : null,
    passport_issued_by: source.kind === "passport" ? issuer || null : null,
    passport_department_code: source.kind === "passport" && department ? `${department.slice(0, 3)}-${department.slice(3)}` : null,
    confidence: typeof raw.confidence === "number" && Number.isFinite(raw.confidence) && raw.confidence >= 0 && raw.confidence <= 1 ? raw.confidence : null };
}
