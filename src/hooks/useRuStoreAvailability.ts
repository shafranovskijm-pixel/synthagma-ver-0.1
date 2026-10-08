import { useEffect, useState } from "react";
import { ANDROID_APP, RUSTORE_AVAILABILITY_URL, RUSTORE_PUBLIC_URL } from "@/constants/androidApp";

export const RUSTORE_MAX_CHECK_AGE_MS = 24 * 60 * 60 * 1000;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10 * 1000;

interface VerifiedRuStoreAvailability {
  url: typeof RUSTORE_PUBLIC_URL;
  expiresAt: number;
}

// A console URL or a successful HTTP response alone is not a published listing.
export function getVerifiedRuStoreAvailability(
  data: unknown,
  now = Date.now(),
): VerifiedRuStoreAvailability | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const value = data as Record<string, unknown>;
  if (
    value.schemaVersion !== 1 ||
    value.available !== true ||
    value.status !== "available" ||
    value.packageName !== ANDROID_APP.packageName ||
    value.url !== RUSTORE_PUBLIC_URL ||
    typeof value.checkedAt !== "string"
  ) return null;

  const checkedAt = Date.parse(value.checkedAt);
  if (!Number.isFinite(checkedAt) || checkedAt > now || now - checkedAt > RUSTORE_MAX_CHECK_AGE_MS) {
    return null;
  }
  return { url: RUSTORE_PUBLIC_URL, expiresAt: checkedAt + RUSTORE_MAX_CHECK_AGE_MS };
}

export function useRuStoreAvailability(): string | null {
  const [storeUrl, setStoreUrl] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let currentRequest: AbortController | null = null;
    let requestTimeout: ReturnType<typeof setTimeout> | undefined;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;

    const refresh = async () => {
      currentRequest?.abort();
      clearTimeout(requestTimeout);
      const request = new AbortController();
      currentRequest = request;
      const timeout = setTimeout(() => request.abort(), REQUEST_TIMEOUT_MS);
      requestTimeout = timeout;

      try {
        const response = await fetch(RUSTORE_AVAILABILITY_URL, {
          signal: request.signal,
          cache: "no-store",
          credentials: "omit",
        });
        if (!response.ok) throw new Error("Store availability could not be checked");
        const data: unknown = await response.json();
        if (disposed || request !== currentRequest || request.signal.aborted) return;

        const verified = getVerifiedRuStoreAvailability(data);
        clearTimeout(expiryTimer);
        setStoreUrl(verified?.url ?? null);
        if (verified) {
          expiryTimer = setTimeout(() => setStoreUrl(null), Math.max(0, verified.expiresAt - Date.now()));
        }
      } catch {
        if (!disposed && request === currentRequest) {
          clearTimeout(expiryTimer);
          setStoreUrl(null);
        }
      } finally {
        clearTimeout(timeout);
      }
    };

    const handleFocus = () => { void refresh(); };
    void refresh();
    const interval = setInterval(() => { void refresh(); }, REFRESH_INTERVAL_MS);
    window.addEventListener("focus", handleFocus);

    return () => {
      disposed = true;
      currentRequest?.abort();
      clearTimeout(requestTimeout);
      clearInterval(interval);
      clearTimeout(expiryTimer);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  return storeUrl;
}
