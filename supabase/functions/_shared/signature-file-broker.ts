import { signatureSha256 } from "./signature-finalizer.ts";

export const SIGNATURE_FILE_REVISION = "uc-token-files-20261018-v1";
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "X-Sintagma-Function-Revision": SIGNATURE_FILE_REVISION, "Cache-Control": "no-store, max-age=0" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...headers, "Content-Type": "application/json" } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const kinds = ["revision", "source", "scan", "certificate"];
const LIMIT = 25 * 1024 * 1024;
interface Context { signature_id: string; organization_id: string; status: string; kind: string; revision_id: string | null;
  bucket: string; locator: string; expected_hash: string | null; file_name: string | null; file_mime: string | null;
  signed_source_bucket: string | null; signed_source_path: string | null; signed_revision_id: string | null; provenance_path: string }
export interface SignatureFileDependencies { createDb(): any; supabaseUrl: string; serviceConfigured: boolean; now?: () => Date }

/** Parse a DB locator, never fetch it. No external URL or caller-selected key. */
export function signatureFileStoragePath(locator: unknown, bucket: string, org: string, projectUrl: string): string | null {
  if (typeof locator !== "string" || locator.length > 4000 || !["external-contracts", "signed-documents"].includes(bucket) || !uuid.test(org)) return null;
  let path = locator;
  if (/^https?:/i.test(path)) {
    try {
      // URL() normalizes dot segments; reject them before that normalization.
      if (/\\|[\u0000-\u0020\u007f]/.test(path) || /(?:\/|%2f)(?:\.|%2e){1,2}(?=\/|%2f|\?|$)/i.test(path)) return null;
      const u = new URL(path), project = new URL(projectUrl);
      if (u.origin !== project.origin || u.protocol !== "https:" || u.username || u.password || u.hash || /%(?:2e|2f|5c)/i.test(u.pathname)) return null;
      const prefix = new RegExp(`^/storage/v1/object/(?:public|sign|authenticated)/${bucket}/(.+)$`);
      const match = prefix.exec(u.pathname); if (!match) return null;
      path = decodeURIComponent(match[1]);
    } catch { return null; }
  }
  if (!path.startsWith(`${org}/`) || path.length > 2000 || /[\\%?#\u0000-\u001f\u007f]/.test(path)
    || path.split("/").some(s => !s || s === "." || s === "..")) return null;
  return path;
}
function checkedContext(data: any, kind: string): data is Context {
  return !!data && uuid.test(data.signature_id ?? "") && uuid.test(data.organization_id ?? "") && data.kind === kind
    && (data.revision_id === null || uuid.test(data.revision_id ?? "")) && typeof data.locator === "string"
    && data.bucket === (kind === "certificate" ? "signed-documents" : "external-contracts")
    && typeof data.provenance_path === "string"
    && (data.expected_hash === null || /^[0-9a-f]{64}$/.test(data.expected_hash ?? ""));
}
function deniedCode(code: string) { return ({ P0002: 404, "55000": 410, "42501": 403, "22023": 400 } as Record<string, number>)[code] ?? 503; }
export async function signatureFileRequest(req: Request, deps: SignatureFileDependencies): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return json({ error: "Используйте POST" }, 405);
  try {
    if (Number(req.headers.get("content-length") || 0) > 4096) return json({ error: "Некорректный запрос" }, 413);
    const text = await req.text(); if (text.length > 4096) return json({ error: "Некорректный запрос" }, 413);
    let body: any; try { body = JSON.parse(text); } catch { return json({ error: "Некорректный запрос" }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(k => !["token", "kind", "revisionId"].includes(k))
      || typeof body.token !== "string" || body.token.length < 16 || body.token.length > 200 || /\s/.test(body.token)) return json({ error: "Некорректный запрос" }, 400);
    const kind = body.kind ?? "revision", revisionId = body.revisionId ?? null;
    if (!kinds.includes(kind) || revisionId !== null && (!uuid.test(revisionId) || kind !== "revision")) return json({ error: "Некорректный файл или версия" }, 400);
    if (!deps.serviceConfigured || !deps.supabaseUrl) return json({ error: "Просмотр документа временно недоступен" }, 503);
    const db = deps.createDb();
    const args = { p_token: body.token, p_kind: kind, p_revision_id: revisionId };
    const context = await db.rpc("uc_signature_file_context", args);
    if (context.error?.code === "P0010") return json({ error: "Для файла требуется проверка исторической привязки отправителем", code: "HISTORICAL_FILE_BINDING_UNVERIFIED" }, 409);
    if (context.error) return json({ error: "Файл недоступен по этой ссылке" }, deniedCode(context.error.code));
    const c = context.data;
    if (!checkedContext(c, kind)) return json({ error: "Не удалось подтвердить файл" }, 503);
    if (revisionId && c.revision_id !== revisionId) return json({ error: "Версия изменилась. Откройте документ заново" }, 409);
    const path = signatureFileStoragePath(c.locator, c.bucket, c.organization_id, deps.supabaseUrl);
    if (!path || path !== c.provenance_path) return json({ error: "Файл требует проверки отправителем" }, 409);
    if ((kind === "revision" || kind === "source") && !path.startsWith(`${c.organization_id}/signature-files/${c.signature_id}/`)) return json({ error: "Файл не связан с этой подписью" }, 409);
    if (kind === "scan" && (!c.expected_hash || !path.startsWith(`${c.organization_id}/signed-scans/${c.signature_id}-`))) return json({ error: "Скан не связан с этой подписью" }, 409);
    if (kind === "certificate" && (!c.expected_hash || path !== `${c.organization_id}/certificates/${c.signature_id}.html`)) return json({ error: "Артефакт требует проверки отправителем" }, 409);
    if (kind === "source" && c.status === "signed" && !c.expected_hash) return json({ error: "Нет сохранённого доказательства исходного файла" }, 409);
    if (c.expected_hash && kind === "revision" && c.revision_id === c.signed_revision_id) {
      const signedPath = signatureFileStoragePath(c.signed_source_path, c.signed_source_bucket || "", c.organization_id, deps.supabaseUrl);
      if (c.bucket !== c.signed_source_bucket || path !== signedPath) return json({ error: "Исходный файл не совпадает с подписанной версией" }, 409);
    }
    const file = await db.storage.from(c.bucket).download(path);
    if (file.error || !file.data || file.data.size === 0 || file.data.size > LIMIT) return json({ error: "Файл отсутствует или недоступен" }, 409);
    const hash = await signatureSha256(await file.data.arrayBuffer());
    if (c.expected_hash && hash !== c.expected_hash) return json({ error: "Файл не совпадает с сохранённым доказательством" }, 409);
    // Recheck revocation, expiry, version and pointers after reading the bytes.
    const current = await db.rpc("uc_signature_file_context", args);
    if (current.error) return json({ error: "Ссылка больше недоступна" }, deniedCode(current.error.code));
    if (!checkedContext(current.data, kind) || JSON.stringify(current.data) !== JSON.stringify(c)) return json({ error: "Версия изменилась. Откройте документ заново" }, 409);
    const signed = await db.storage.from(c.bucket).createSignedUrl(path, 60);
    const url = signed.data?.signedUrl;
    if (signed.error || typeof url !== "string" || signatureFileStoragePath(url, c.bucket, c.organization_id, deps.supabaseUrl) !== path) return json({ error: "Не удалось открыть файл" }, 503);
    return json({ signatureId: c.signature_id, revisionId: c.revision_id, kind, url, expiresIn: 60,
      expiresAt: new Date((deps.now?.() ?? new Date()).getTime() + 60000).toISOString(), sha256: hash });
  } catch { return json({ error: "Не удалось открыть файл" }, 503); }
}
