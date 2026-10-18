import { supabase } from "@/integrations/supabase/client";
import { proxiedAssetUrl } from "@/utils/proxyFetch";

export type SignatureFileKind = "revision" | "source" | "scan" | "certificate";
interface Options { token: string; signatureId: string; kind: SignatureFileKind; revisionId?: string | null }
/** Tokens stay in a POST body. The server derives every bucket/key from the invitation. */
export async function getSignatureTokenFile({ token, signatureId, kind, revisionId = null }: Options): Promise<string> {
  const { data, error } = await supabase.functions.invoke("get-signature-file", {
    body: { token, kind, ...(kind === "revision" ? { revisionId } : {}) },
  });
  if (error) {
    let response: any;
    try { response = await error.context?.clone().json(); } catch { /* no usable authoritative response */ }
    const failure = new Error("Не удалось открыть файл по ссылке. Обновите документ или обратитесь к отправителю.");
    if (response?.code === "HISTORICAL_FILE_BINDING_UNVERIFIED") Object.assign(failure, { code: response.code });
    throw failure;
  }
  if (error || !data || data.signatureId !== signatureId || data.kind !== kind || data.expiresIn !== 60
    || typeof data.url !== "string" || !data.url.startsWith("https://")
    || kind === "revision" && revisionId !== null && data.revisionId !== revisionId) {
    throw new Error("Не удалось открыть файл по ссылке. Обновите документ или обратитесь к отправителю.");
  }
  return proxiedAssetUrl(data.url);
}

export function isHistoricalSignatureFileError(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === "HISTORICAL_FILE_BINDING_UNVERIFIED";
}

/** Legacy private reads use the user's JWT and existing RLS, never the broker's service role. */
export async function getAuthenticatedSignatureFile(locator: string, organizationId: string, bucket: "external-contracts" | "signed-documents" = "external-contracts"): Promise<string> {
  const { data: identity, error: identityError } = await supabase.auth.getUser();
  if (identityError || !identity.user) throw new Error("Для исторического файла требуется проверка привязки отправителем");
  let path = locator;
  if (/^https?:/i.test(path)) {
    const u = new URL(path), project = new URL(import.meta.env.VITE_SUPABASE_URL);
    if (u.protocol !== "https:" || u.origin !== project.origin || u.username || u.password || u.hash
      || /\\|(?:\/|%2f)(?:\.|%2e){1,2}(?=\/|%2f|\?|$)/i.test(path)) throw new Error("Исторический файл требует проверки привязки");
    const prefix = new RegExp(`^/storage/v1/object/(?:public|sign|authenticated)/${bucket}/(.+)$`);
    const match = prefix.exec(u.pathname); if (!match) throw new Error("Исторический файл требует проверки привязки");
    path = decodeURIComponent(match[1]);
  }
  if (!path.startsWith(`${organizationId}/`) || /[\\%?#\u0000-\u001f\u007f]/.test(path)
    || path.split("/").some(p => !p || p === "." || p === "..")) throw new Error("Исторический файл требует проверки привязки");
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) throw new Error("Для исторического файла требуется проверка привязки отправителем");
  return proxiedAssetUrl(data.signedUrl);
}

/** Download is read-only: missing artifacts are reported, never generated as a side effect. */
export async function downloadStoredSignatureArtifact(options: { token?: string | null; signatureId: string; organizationId: string; locator?: string | null }): Promise<void> {
  const { token, signatureId, organizationId, locator } = options;
  if (!locator) throw new Error("Сохранённый сертификат пока отсутствует. Загрузка не создаёт новое доказательство подписи.");
  const url = token ? await getSignatureTokenFile({ token, signatureId, kind: "certificate" }).catch(error => {
    if (!isHistoricalSignatureFileError(error)) throw error;
    return getAuthenticatedSignatureFile(locator, organizationId, "signed-documents");
  }) : await getAuthenticatedSignatureFile(locator, organizationId, "signed-documents");
  const response = await fetch(url);
  if (!response.ok) throw new Error("Не удалось прочитать сохранённый документ");
  const blob = await response.blob();
  if (!blob.size) throw new Error("Сохранённый файл пуст; требуется проверка отправителем");
  const mime = (response.headers.get("content-type") || blob.type).toLowerCase();
  const ext = mime.includes("pdf") ? "pdf" : mime.includes("html") ? "html" : "bin";
  const localUrl = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = localUrl; link.download = `signature-certificate-${signatureId}.${ext}`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(localUrl), 1000);
}

/** Refresh a short-lived URL at the user's download click, even after a long review. */
export async function downloadSignatureRevisionFile(options: { token: string; signatureId: string; organizationId: string; revisionId: string; locator: string; fileName: string }): Promise<void> {
  const { token, signatureId, organizationId, revisionId, locator, fileName } = options;
  const url = await getSignatureTokenFile({ token, signatureId, kind: "revision", revisionId }).catch(error => {
    if (!isHistoricalSignatureFileError(error)) throw error;
    return getAuthenticatedSignatureFile(locator, organizationId);
  });
  const response = await fetch(url);
  if (!response.ok) throw new Error("Не удалось прочитать файл версии");
  const blob = await response.blob(); if (!blob.size) throw new Error("Файл версии пуст");
  const localUrl = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = localUrl; link.download = fileName.replace(/[\\/\u0000-\u001f\u007f]/g, "_") || "document";
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(localUrl), 1000);
}
