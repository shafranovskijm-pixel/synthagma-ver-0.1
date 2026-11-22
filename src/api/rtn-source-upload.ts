import { supabase } from "@/integrations/supabase/client";

export const RTN_SOURCE_FILE_BYTES = 16 * 1024 * 1024;
export interface RtnManualSourceImportCapability {
  version: "rtn-manual-intake-v1";
  attestation_version: "official-current-location-v1";
  max_file_bytes: 16777216;
}
export interface RtnSourceImportDescriptor {
  id: string; code: string; title: string; page_url: string; document_url: string;
  parser: "industrial-pdf" | "energy-xlsx"; source_generation: number;
}
export interface RtnSourceUploadMetadata {
  sourceId: string;
  intakeRequestId: string;
  expectedSourceGeneration: number;
  publicationPageUrl: string;
  documentUrl: string;
  attestationVersion: "official-current-location-v1";
}
export interface RtnSourceUploadRequest {
  metadata: RtnSourceUploadMetadata;
  file: File;
  parser: RtnSourceImportDescriptor["parser"];
}
export interface RtnSourceUploadReceipt {
  intake_id: string; request_id: string; source_id: string; revision_id: string;
  sha256: string; byte_size: number; received_at: string; acquisition_method: "admin_upload";
  replayed: boolean; normalization_required: boolean; accepted_generation: number; still_current: boolean;
  automatic_verification_advanced: false;
}
type UploadErrorCode = "invalid" | "auth" | "forbidden" | "conflict" | "historical" | "too_large" | "unsupported" | "unavailable" | "invalid_response";
export class RtnSourceUploadError extends Error {
  constructor(readonly code: UploadErrorCode, message: string, readonly uncertain = false) { super(message); this.name = "RtnSourceUploadError"; }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }

export function officialSourceUploadUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !["gosnadzor.ru", "www.gosnadzor.ru"].includes(url.hostname) || url.username || url.password || url.port || url.search || url.hash) return null;
    const path = decodeURIComponent(url.pathname);
    if (!path.startsWith("/service/list/Safety certification/") && !path.startsWith("/energy/energy/")) return null;
    return url.href;
  } catch { return null; }
}
export function isRtnManualImportCapability(value: unknown): value is RtnManualSourceImportCapability {
  return record(value) && value.version === "rtn-manual-intake-v1" && value.attestation_version === "official-current-location-v1" && value.max_file_bytes === RTN_SOURCE_FILE_BYTES;
}
export function isRtnSourceImportDescriptor(value: unknown): value is RtnSourceImportDescriptor {
  return record(value) && typeof value.id === "string" && UUID.test(value.id) && typeof value.code === "string" && typeof value.title === "string"
    && typeof value.page_url === "string" && !!officialSourceUploadUrl(value.page_url) && typeof value.document_url === "string" && !!officialSourceUploadUrl(value.document_url)
    && ["industrial-pdf", "energy-xlsx"].includes(String(value.parser)) && Number.isSafeInteger(value.source_generation) && (value.source_generation as number) >= 0;
}
function confirmedTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const day = value.slice(0, 10);
  return new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
}
async function historicalErrorCode(response: unknown): Promise<string | null> {
  if (!(response instanceof Response) || !response.body) return null;
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0, pendingRead: Promise<ReadableStreamReadResult<Uint8Array>> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("deadline")), 1000); });
  const release = () => { try { reader.releaseLock(); } catch { /* A timed-out pending read releases after cancellation. */ } };
  try {
    while (true) {
      pendingRead = reader.read(); const part = await Promise.race([pendingRead, deadline]); pendingRead = null;
      if (part.done) break;
      size += part.value.byteLength; if (size > 2048) return null; chunks.push(part.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
    const data: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return record(data) && data.error === "RTN_IMPORT_HISTORICAL_REVISION_REQUIRES_REVIEW" ? data.error : null;
  } catch { return null; }
  finally {
    clearTimeout(timer); void reader.cancel().catch(() => undefined);
    if (pendingRead) void pendingRead.then(release, release); else release();
  }
}
function failure(status?: number, errorCode?: string | null): RtnSourceUploadError {
  if (status === 409 && errorCode === "RTN_IMPORT_HISTORICAL_REVISION_REQUIRES_REVIEW") return new RtnSourceUploadError("historical", "Этот файл уже заменён другой редакцией. Нужна отдельная проверка возврата; текущая редакция не изменена.");
  switch (status) {
    case 400: return new RtnSourceUploadError("invalid", "Проверьте файл, источник и подтверждение происхождения.");
    case 401: return new RtnSourceUploadError("auth", "Сессия истекла. Войдите снова перед загрузкой.");
    case 403: return new RtnSourceUploadError("forbidden", "Загружать официальные оригиналы может действующий администратор платформы.");
    case 409: return new RtnSourceUploadError("conflict", "Редакция источника изменилась или уже обрабатывается. Обновите сведения перед новой загрузкой.");
    case 413: return new RtnSourceUploadError("too_large", "Оригинал должен быть не больше 16 МБ.");
    case 415: return new RtnSourceUploadError("unsupported", "Нужен исходный PDF или XLSX, соответствующий выбранному источнику.");
    default: return new RtnSourceUploadError("unavailable", "Результат загрузки пока не подтверждён. Повторите ту же загрузку; новый запрос создавать не нужно.", true);
  }
}

/** Binary intake is separate from the existing JSON normalization/review API. */
export async function uploadRtnOfficialFile(request: RtnSourceUploadRequest, signal?: AbortSignal): Promise<RtnSourceUploadReceipt> {
  const { metadata, file, parser } = request;
  if (!UUID.test(metadata.sourceId) || !UUID.test(metadata.intakeRequestId) || !Number.isSafeInteger(metadata.expectedSourceGeneration) || metadata.expectedSourceGeneration < 0
    || metadata.attestationVersion !== "official-current-location-v1" || !officialSourceUploadUrl(metadata.publicationPageUrl) || !officialSourceUploadUrl(metadata.documentUrl)) throw failure(400);
  if (!file || file.size <= 0 || !Number.isSafeInteger(file.size)) throw failure(400);
  if (file.size > RTN_SOURCE_FILE_BYTES) throw failure(413);
  if (!(parser === "industrial-pdf" && /\.pdf$/i.test(file.name) || parser === "energy-xlsx" && /\.xlsx$/i.test(file.name))) throw failure(415);
  let localHash: string;
  try {
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength !== file.size || signal?.aborted) throw new Error("file_changed");
    localHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(value => value.toString(16).padStart(2, "0")).join("");
  } catch { throw new RtnSourceUploadError("invalid", "Не удалось проверить выбранный файл на устройстве. Выберите оригинал ещё раз."); }
  if (signal?.aborted) throw new RtnSourceUploadError("invalid", "Загрузка отменена до отправки файла.");
  const body = new FormData();
  body.append("metadata", JSON.stringify({
    sourceId: metadata.sourceId, intakeRequestId: metadata.intakeRequestId, expectedSourceGeneration: metadata.expectedSourceGeneration,
    publicationPageUrl: metadata.publicationPageUrl, documentUrl: metadata.documentUrl, attestationVersion: metadata.attestationVersion,
  }));
  body.append("file", file);
  try {
    // The SDK supplies the multipart boundary. A timeout is uncertain, never permission for a new request ID.
    const result = await supabase.functions.invoke<unknown>("rtn-source-upload", { body, timeout: 100_000, ...(signal ? { signal } : {}) });
    if (result.error) {
      const context = record(result.error) && record(result.error.context) ? result.error.context : null;
      const response = result.response ?? context;
      const status = result.response?.status ?? (context && typeof context.status === "number" ? context.status : undefined);
      throw failure(status, status === 409 ? await historicalErrorCode(response) : null);
    }
    const data = result.data;
    if (!record(data) || !["intake_id", "request_id", "source_id", "revision_id"].every(key => typeof data[key] === "string" && UUID.test(data[key] as string))
      || data.request_id !== metadata.intakeRequestId || data.source_id !== metadata.sourceId || data.sha256 !== localHash
      || data.byte_size !== file.size || !confirmedTimestamp(data.received_at) || data.acquisition_method !== "admin_upload"
      || typeof data.replayed !== "boolean" || typeof data.normalization_required !== "boolean" || typeof data.still_current !== "boolean"
      || !Number.isSafeInteger(data.accepted_generation) || (data.accepted_generation as number) < 0 || data.automatic_verification_advanced !== false) {
      throw new RtnSourceUploadError("invalid_response", "Не удалось подтвердить квитанцию для выбранного файла. Повторите ту же загрузку, сохранив запрос.", true);
    }
    return data as unknown as RtnSourceUploadReceipt;
  } catch (error) {
    if (error instanceof RtnSourceUploadError) throw error;
    throw failure();
  }
}
