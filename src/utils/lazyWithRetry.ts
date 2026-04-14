import { lazy, ComponentType } from "react";

/**
 * Wrapper around React.lazy that retries failed dynamic imports once,
 * then forces a page reload to fetch fresh chunks after a new deployment.
 * Prevents infinite reload loops via sessionStorage flag.
 */
const RELOAD_FLAG = "chunk_reload_done";

export function lazyWithRetry<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await importFn();
    } catch (firstError) {
      // Retry once after a short delay
      try {
        await new Promise((r) => setTimeout(r, 1500));
        return await importFn();
      } catch (retryError) {
        // If we haven't reloaded yet in this session, do so now
        const alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG);
        if (!alreadyReloaded) {
          sessionStorage.setItem(RELOAD_FLAG, "1");
          window.location.reload();
          // Return a never-resolving promise to keep Suspense showing
          return new Promise(() => {});
        }
        // Already reloaded once — clear flag for next time and throw
        sessionStorage.removeItem(RELOAD_FLAG);
        throw retryError;
      }
    }
  });
}
