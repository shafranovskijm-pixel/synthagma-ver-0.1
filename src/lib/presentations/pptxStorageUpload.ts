export interface StorageUploadError {
  message?: string;
  error?: string;
  status?: number | string;
  statusCode?: number | string;
}

interface UploadResult<TError extends StorageUploadError> {
  error: TError | null;
}

interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
}

const TRANSIENT_STORAGE_MESSAGE =
  /too many connections|connection (?:pool|timeout|terminated|reset)|temporar(?:y|ily) unavailable|service unavailable|gateway timeout|fetch failed|network(?: request)? failed/i;

const TRANSIENT_STORAGE_STATUS_CODES = new Set([429, 500, 502, 503, 504, 544]);

function numericStatus(error: StorageUploadError): number | null {
  const candidate = error.statusCode ?? error.status;
  const parsed = typeof candidate === "number" ? candidate : Number.parseInt(String(candidate ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isTransientPresentationStorageError(error: StorageUploadError | null | undefined): boolean {
  if (!error) return false;

  const status = numericStatus(error);
  if (status !== null && TRANSIENT_STORAGE_STATUS_CODES.has(status)) return true;

  return TRANSIENT_STORAGE_MESSAGE.test(`${error.message ?? ""} ${error.error ?? ""}`);
}

export function presentationStorageErrorMessage(error: StorageUploadError): string {
  if (isTransientPresentationStorageError(error)) {
    return "Сервис презентаций временно перегружен. Повторите загрузку через 1–2 минуты";
  }

  return `Ошибка загрузки файла: ${error.message || error.error || "неизвестная ошибка"}`;
}

export async function uploadPresentationWithRetry<TError extends StorageUploadError>(
  upload: () => Promise<UploadResult<TError>>,
  options: RetryOptions = {},
): Promise<UploadResult<TError>> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 500);
  const sleep = options.sleep ?? ((delayMs: number) => new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, delayMs);
  }));

  let lastResult: UploadResult<TError> = { error: null };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    lastResult = await upload();
    if (!lastResult.error) return lastResult;

    if (!isTransientPresentationStorageError(lastResult.error) || attempt === maxAttempts) {
      return lastResult;
    }

    await sleep(baseDelayMs * 2 ** (attempt - 1));
  }

  return lastResult;
}
