import { lazy, ComponentType } from "react";

/**
 * Wrapper around React.lazy that retries failed dynamic imports, then forces
 * a one-shot full purge + reload to fetch fresh chunks after a new deployment.
 *
 * Hardening notes:
 * - Never returns a never-resolving promise (would freeze Suspense forever).
 * - Triggers the reload only once per session (sessionStorage guard).
 * - On a second failure after reload, throws so the parent ErrorBoundary
 *   can render a recovery UI instead of a silent infinite spinner.
 */
const RELOAD_FLAG = "chunk_reload_done";

async function purgeCachesAndSW(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
  } catch {
    // ignore — best effort
  }
}

export function lazyWithRetry<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await importFn();
    } catch {
      // Wait briefly and try once more (handles transient network/CDN blips)
      try {
        await new Promise((r) => setTimeout(r, 1500));
        return await importFn();
      } catch (retryError) {
        const alreadyReloaded = (() => {
          try {
            return sessionStorage.getItem(RELOAD_FLAG) === "1";
          } catch {
            return false;
          }
        })();

        if (!alreadyReloaded) {
          try {
            sessionStorage.setItem(RELOAD_FLAG, "1");
          } catch {
            // ignore
          }
          // Purge caches + SW so the reload fetches fresh chunks.
          await purgeCachesAndSW();
          // Schedule the reload but DO NOT block forever — re-throw so
          // Suspense unwinds to the ErrorBoundary if the reload is somehow
          // suppressed by the browser. The reload will normally win the race.
          setTimeout(() => {
            try {
              window.location.reload();
            } catch {
              // ignore
            }
          }, 0);
          throw retryError;
        }

        // Already reloaded once this session — give up gracefully and let
        // the ErrorBoundary render a friendly recovery screen.
        try {
          sessionStorage.removeItem(RELOAD_FLAG);
        } catch {
          // ignore
        }
        throw retryError;
      }
    }
  });
}
