/**
 * Предпросмотр договора: скачивание PDF из приватного бакета через SDK
 * и превращение в object URL. Публичным бакет НЕ делаем.
 */
import { extractStoragePath } from "@/utils/storageHelpers";

export const CONTRACT_BUCKET = "billing-documents";

/** Нормализует значение file_path/file_url в storage-путь внутри бакета. */
export function resolveContractStoragePath(
  filePathOrUrl: string | null | undefined,
): string | null {
  if (!filePathOrUrl) return null;
  const path = extractStoragePath(filePathOrUrl, CONTRACT_BUCKET);
  return path || null;
}

/**
 * Скачивает PDF договора и возвращает object URL.
 * Бросает ошибку с человеческим сообщением при неудаче.
 */
export async function loadContractPdfObjectUrl(
  client: any,
  filePathOrUrl: string | null | undefined,
): Promise<string> {
  const path = resolveContractStoragePath(filePathOrUrl);
  if (!path) throw new Error("Файл договора не найден");

  const { data, error } = await client.storage.from(CONTRACT_BUCKET).download(path);
  if (error || !data) {
    throw new Error(error?.message || "Не удалось загрузить документ");
  }
  const blob = data instanceof Blob ? data : new Blob([data], { type: "application/pdf" });
  return URL.createObjectURL(blob);
}

/** Безопасно освобождает object URL. */
export function revokeObjectUrl(url: string | null | undefined): void {
  if (!url) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    /* noop */
  }
}
