// The invitation is a bearer token. Only PostgreSQL commits signing facts.
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "X-Sintagma-Function-Revision": "uc-foundation-20261018-v1" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
export async function signatureSha256(value: string | ArrayBuffer): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function signatureSourcePath(value: unknown, organizationId: string, supabaseUrl: string): string | null {
  if (typeof value !== "string") return null;
  let path = value;
  if (/^https?:/i.test(path)) {
    try {
      const url = new URL(path);
      if (url.origin !== new URL(supabaseUrl).origin) return null;
      const match = /^\/storage\/v1\/object\/(?:public|sign|authenticated)\/external-contracts\/(.+)$/.exec(url.pathname);
      if (!match) return null;
      path = decodeURIComponent(match[1]);
    } catch { return null; }
  }
  if (!path.startsWith(`${organizationId}/`) || path.includes("..") || path.includes("?") || path.includes("\\")) return null;
  return path;
}
interface Dependencies { db: any; supabaseUrl: string; generateCertificate(signatureId: string): Promise<void> }
export async function finalizeSignatureRequest(req: Request, { db, supabaseUrl, generateCertificate }: Dependencies): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Используйте POST" }, 405);
  try {
    let body: any;
    try { body = await req.json(); } catch { return json({ error: "Некорректный запрос" }, 400); }
    const method = body?.method ?? "pep";
    if (typeof body?.token !== "string" || body.token.length < 16 || body.token.length > 200
      || !["pep", "handwritten_scan"].includes(method) || !body.pepAgreement || typeof body.pepAgreement !== "object"
      || typeof body.pepAgreement.agreement_text !== "string" || body.pepAgreement.agreement_text.length > 100000
      || (method === "pep" && !/^[0-9a-f]{64}$/.test(body.documentHash ?? ""))) return json({ error: "Некорректные данные подписания" }, 400);
    const revisionProvided = Object.hasOwn(body, "expectedRevisionId");
    if (revisionProvided && body.expectedRevisionId !== null
      && (typeof body.expectedRevisionId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.expectedRevisionId))) return json({ error: "Некорректная версия" }, 400);
    const { data: signature, error } = await db.from("document_signatures")
      .select("id,organization_id,current_revision_id,deleted_at,status,signed_at")
      .eq("signature_token", body.token).maybeSingle();
    if (error) return json({ error: "Не удалось проверить документ" }, 503);
    if (!signature || signature.deleted_at) return json({ error: "Документ не найден" }, 404);
    let sourcePath: string | null = null, sourceHash: string | null = null;
    if (signature.current_revision_id) {
      const revision = await db.from("signature_revisions").select("file_url").eq("id", signature.current_revision_id)
        .eq("signature_id", signature.id).maybeSingle();
      if (revision.error || !revision.data) return json({ error: "Не удалось проверить версию" }, 503);
      if (revision.data.file_url) {
        sourcePath = signatureSourcePath(revision.data.file_url, signature.organization_id, supabaseUrl);
        if (!sourcePath) return json({ error: "Исходный файл требует проверки отправителем" }, 409);
        const original = await db.storage.from("external-contracts").download(sourcePath);
        if (original.error || !original.data || original.data.size > 25 * 1024 * 1024) return json({ error: "Исходный файл недоступен" }, 409);
        sourceHash = await signatureSha256(await original.data.arrayBuffer());
      }
    }
    let scanHash: string | null = null;
    if (method === "handwritten_scan") {
      const scanPath = body.handwrittenScanPath;
      const prefix = `${signature.organization_id}/signed-scans/${signature.id}-`;
      if (!revisionProvided || typeof scanPath !== "string" || !scanPath.startsWith(prefix) || scanPath.includes("..")
        || !/\.(pdf|png|jpe?g)$/i.test(scanPath)) return json({ error: "Обновите документ и приложите его подписанный скан" }, 409);
      const scan = await db.storage.from("external-contracts").download(scanPath);
      if (scan.error || !scan.data || scan.data.size === 0 || scan.data.size > 25 * 1024 * 1024
        || !["application/pdf", "image/png", "image/jpeg"].includes(scan.data.type)) return json({ error: "Подписанный скан недоступен или имеет неверный формат" }, 400);
      scanHash = await signatureSha256(await scan.data.arrayBuffer());
    }
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
    const result = await db.rpc("uc_finalize_signature", {
      p_token: body.token, p_document_hash: body.documentHash ?? null, p_agreement: body.pepAgreement, p_method: method,
      p_expected_revision_id: body.expectedRevisionId ?? null, p_revision_provided: revisionProvided,
      p_ip: ip, p_user_agent: req.headers.get("user-agent") || "unknown",
      p_scan_path: method === "handwritten_scan" ? body.handwrittenScanPath : null, p_scan_hash: scanHash,
      p_source_bucket: sourcePath ? "external-contracts" : null, p_source_path: sourcePath, p_source_hash: sourceHash,
    });
    if (result.error) {
      const status = ({ "40001": 409, "55000": 410, "P0002": 404, "42501": 403, "22023": 400, "23514": 409 } as Record<string, number>)[result.error.code] ?? 503;
      return json({ error: status === 409 ? "Версия или состояние документа изменились. Откройте документ заново."
        : status === 410 ? "Ссылка закрыта или срок подписания истёк" : "Не удалось завершить подписание" }, status);
    }
    const info = result.data;
    if (method === "pep" && info.certificateState !== "ready") {
      try { await generateCertificate(info.signatureId); info.certificateState = "ready"; }
      catch {
        const recorded = await db.from("document_signatures").update({ certificate_state: "failed", certificate_error: "Не удалось сформировать сертификат; повторите запрос" })
          .eq("id", info.signatureId).neq("certificate_state", "ready");
        info.certificateState = recorded.error ? "pending" : "failed";
      }
    }
    return json(info);
  } catch { return json({ error: "Не удалось завершить подписание" }, 500); }
}
