/**
 * Унифицированные хелперы для Supabase Storage.
 *
 * Зачем: 65+ мест в коде вручную дёргают `supabase.storage.from(...)`,
 * формируют signed URL, обрабатывают ошибки. Хелперы дают:
 *  - единый API для public/private бакетов;
 *  - консистентную обработку ошибок (через getErrorMessage);
 *  - кэшируемый long-lived URL для печатей/подписей организации (1 год).
 *
 * Использование:
 *   import { getPublicUrl, getSignedUrl, uploadFile, getOrgStampUrl } from "@/lib/storage";
 *
 *   const url = getPublicUrl("course-files", "covers/abc.jpg");
 *   const signed = await getSignedUrl("billing-documents", path, 3600);
 *   const { path } = await uploadFile("course-files", file, "uploads/");
 */

import { supabase } from "@/integrations/supabase/client";

export interface UploadOptions {
  /** Префикс пути в бакете (например, `${orgId}/`) */
  prefix?: string;
  /** Свой контент-тайп; по умолчанию берётся из File.type */
  contentType?: string;
  /** Перезаписывать существующий файл */
  upsert?: boolean;
}

export interface UploadResult {
  path: string;
  fullPath: string;
}

/**
 * Получить публичный URL для файла в публичном бакете.
 * Не делает сетевого запроса.
 */
export function getPublicUrl(bucket: string, path: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Получить signed URL для файла в приватном бакете.
 * Возвращает null при ошибке.
 */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn = 3600
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[storage.getSignedUrl]", bucket, path, error.message);
    return null;
  }
  return data.signedUrl;
}

/**
 * Получить долгоживущий signed URL для печати/подписи организации (1 год).
 * Используется для отображения штампов в превью документов.
 * Кэшируется в памяти процесса по ключу bucket/path до перезагрузки.
 */
const orgStampCache = new Map<string, { url: string; expiresAt: number }>();

export async function getOrgStampUrl(
  bucket: string,
  path: string
): Promise<string | null> {
  const key = `${bucket}/${path}`;
  const cached = orgStampCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.url;
  }
  const oneYear = 60 * 60 * 24 * 365;
  const url = await getSignedUrl(bucket, path, oneYear);
  if (url) {
    orgStampCache.set(key, { url, expiresAt: Date.now() + oneYear * 1000 });
  }
  return url;
}

/**
 * Загрузить файл в бакет. Возвращает путь, по которому файл сохранён.
 */
export async function uploadFile(
  bucket: string,
  file: File | Blob,
  pathOrPrefix: string,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const isFullPath = pathOrPrefix.includes(".") || pathOrPrefix.endsWith("/") === false;
  let finalPath: string;
  if (isFullPath && !pathOrPrefix.endsWith("/")) {
    finalPath = pathOrPrefix;
  } else {
    const ext =
      file instanceof File && file.name.includes(".")
        ? file.name.split(".").pop()
        : "bin";
    const name = `${crypto.randomUUID()}.${ext}`;
    finalPath = `${pathOrPrefix}${name}`;
  }

  const { data, error } = await supabase.storage.from(bucket).upload(finalPath, file, {
    cacheControl: "3600",
    upsert: options.upsert ?? false,
    contentType: options.contentType ?? (file as File).type,
  });

  if (error) throw error;
  return { path: data.path, fullPath: `${bucket}/${data.path}` };
}

/**
 * Извлечь storage-путь из публичного URL или вернуть путь как есть.
 */
export function extractStoragePath(fileUrlOrPath: string, bucket: string): string {
  if (!fileUrlOrPath.startsWith("http")) return fileUrlOrPath;
  const marker = `/${bucket}/`;
  const idx = fileUrlOrPath.indexOf(marker);
  if (idx !== -1) return fileUrlOrPath.substring(idx + marker.length);
  return fileUrlOrPath;
}

/**
 * Открыть приватный файл в новой вкладке через signed URL.
 */
export async function openPrivateFile(
  bucket: string,
  fileUrlOrPath: string
): Promise<void> {
  const path = extractStoragePath(fileUrlOrPath, bucket);
  const url = await getSignedUrl(bucket, path);
  if (url) window.open(url, "_blank");
}

/**
 * Удалить файл из бакета.
 */
export async function removeFile(bucket: string, path: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}
