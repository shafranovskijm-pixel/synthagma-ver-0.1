import { supabase } from "@/integrations/supabase/client";
import { proxiedAssetUrl } from "@/utils/proxyFetch";
import { captureSignatureRead, signatureAuthorization, type SignatureReadOptions } from '@/lib/signatureClientScope';

export type SignatureFileKind = "revision" | "source" | "scan" | "certificate";
interface Options extends SignatureReadOptions { token: string; signatureId: string; kind: SignatureFileKind; revisionId?: string | null }
/** Tokens stay in a POST body. The server derives every bucket/key from the invitation. */
export async function getSignatureTokenFile(options: Options): Promise<string> {
  const { token, signatureId, kind, revisionId = null } = options;
  const read = captureSignatureRead(options), { bearer } = await signatureAuthorization(read, false);
  read.active();
  const { data, error } = await read.wait(supabase.functions.invoke("get-signature-file", {
    headers: { Authorization: bearer },
    body: { token, kind, ...(kind === "revision" ? { revisionId } : {}) },
  }));
  if (error) {
    let response: any;
    try { response = await read.wait(error.context?.clone().json()); } catch { /* no usable authoritative response */ }
    read.active();
    const failure = new Error("Не удалось открыть файл по ссылке. Обновите документ или обратитесь к отправителю.");
    if (response?.code === "HISTORICAL_FILE_BINDING_UNVERIFIED") Object.assign(failure, { code: response.code });
    throw failure;
  }
  if (error || !data || data.signatureId !== signatureId || data.kind !== kind || data.expiresIn !== 60
    || typeof data.url !== "string" || !data.url.startsWith("https://")
    || kind === "revision" && revisionId !== null && data.revisionId !== revisionId) {
    throw new Error("Не удалось открыть файл по ссылке. Обновите документ или обратитесь к отправителю.");
  }
  read.active(); return proxiedAssetUrl(data.url);
}

export function isHistoricalSignatureFileError(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === "HISTORICAL_FILE_BINDING_UNVERIFIED";
}

/** Legacy private reads use the user's JWT and existing RLS, never the broker's service role. */
export async function getAuthenticatedSignatureFile(locator: string, organizationId: string, bucket: "external-contracts" | "signed-documents" = "external-contracts", options: SignatureReadOptions = {}): Promise<string> {
  const read = captureSignatureRead(options);
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
  const { bearer } = await signatureAuthorization(read);
  const project = new URL(import.meta.env.VITE_SUPABASE_URL), key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (project.protocol !== 'https:' || !key || !['external-contracts', 'signed-documents'].includes(bucket)) throw new Error('Не удалось проверить доступ к файлу.');
  const objectPath = `/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
  read.active();
  const response = await read.wait(fetch(`${project.origin}/storage/v1/object/sign${objectPath}`, {
    method: 'POST', headers: { Authorization: bearer, apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 60 }), signal: options.signal, redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer',
  }));
  if (!response.ok) throw new Error('Для исторического файла требуется проверка привязки отправителем');
  const reader = response.body?.getReader(); if (!reader) throw new Error('Не удалось проверить ссылку на файл.');
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { read.active(); const item = await read.wait(reader.read()); if (item.done) break; size += item.value.length;
    if (size > 32768) throw new Error('Не удалось проверить ссылку на файл.'); chunks.push(item.value); } }
  finally { void reader.cancel().catch(() => undefined); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let data: { signedURL?: unknown }; try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw new Error('Не удалось проверить ссылку на файл.'); }
  if (typeof data.signedURL !== 'string' || !data.signedURL.startsWith('/object/sign/')) throw new Error('Не удалось проверить ссылку на файл.');
  const signed = new URL(`${project.origin}/storage/v1${data.signedURL}`);
  if (signed.origin !== project.origin || signed.pathname !== `/storage/v1/object/sign${objectPath}` || signed.hash || signed.username || signed.password
    || signed.searchParams.getAll('token').length !== 1 || !signed.searchParams.get('token') || [...signed.searchParams.keys()].some(k => k !== 'token')) throw new Error('Не удалось проверить ссылку на файл.');
  read.active(); return proxiedAssetUrl(signed.href);
}

/** Download is read-only: missing artifacts are reported, never generated as a side effect. */
export async function downloadStoredSignatureArtifact(options: SignatureReadOptions & { token?: string | null; signatureId: string; organizationId: string; locator?: string | null }): Promise<void> {
  const { token, signatureId, organizationId, locator } = options;
  const read = captureSignatureRead(options), child = { signal: options.signal, assertCurrent: read.active };
  if (!locator) throw new Error("Сохранённый сертификат пока отсутствует. Загрузка не создаёт новое доказательство подписи.");
  const url = token ? await getSignatureTokenFile({ token, signatureId, kind: "certificate", ...child }).catch(error => {
    if (!isHistoricalSignatureFileError(error)) throw error;
    return getAuthenticatedSignatureFile(locator, organizationId, "signed-documents", child);
  }) : await getAuthenticatedSignatureFile(locator, organizationId, "signed-documents", child);
  read.active(); const response = await read.wait(fetch(url, { signal: options.signal, credentials: 'omit', referrerPolicy: 'no-referrer' }));
  if (!response.ok) throw new Error("Не удалось прочитать сохранённый документ");
  const blob = await read.wait(response.blob()); read.active();
  if (!blob.size) throw new Error("Сохранённый файл пуст; требуется проверка отправителем");
  const mime = (response.headers.get("content-type") || blob.type).toLowerCase();
  const ext = mime.includes("pdf") ? "pdf" : mime.includes("html") ? "html" : "bin";
  const localUrl = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = localUrl; link.download = `signature-certificate-${signatureId}.${ext}`;
  try { read.active(); document.body.appendChild(link); link.click(); }
  finally { link.remove(); setTimeout(() => URL.revokeObjectURL(localUrl), 1000); }
}

/** Refresh a short-lived URL at the user's download click, even after a long review. */
export async function downloadSignatureRevisionFile(options: SignatureReadOptions & { token?: string | null; signatureId: string; organizationId: string; revisionId: string; locator: string; fileName: string }): Promise<void> {
  const { token, signatureId, organizationId, revisionId, locator, fileName } = options;
  const read = captureSignatureRead(options), child = { signal: options.signal, assertCurrent: read.active };
  const url = token ? await getSignatureTokenFile({ token, signatureId, kind: "revision", revisionId, ...child }).catch(error => {
    if (!isHistoricalSignatureFileError(error)) throw error;
    return getAuthenticatedSignatureFile(locator, organizationId, 'external-contracts', child);
  }) : await getAuthenticatedSignatureFile(locator, organizationId, 'external-contracts', child);
  read.active(); const response = await read.wait(fetch(url, { signal: options.signal, credentials: 'omit', referrerPolicy: 'no-referrer' }));
  if (!response.ok) throw new Error("Не удалось прочитать файл версии");
  const blob = await read.wait(response.blob()); read.active(); if (!blob.size) throw new Error("Файл версии пуст");
  const localUrl = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = localUrl; link.download = fileName.replace(/[\\/\u0000-\u001f\u007f]/g, "_") || "document";
  try { read.active(); document.body.appendChild(link); link.click(); }
  finally { link.remove(); setTimeout(() => URL.revokeObjectURL(localUrl), 1000); }
}
