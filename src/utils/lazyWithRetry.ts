import { lazy, ComponentType } from "react";
import { applicationUpdates } from './applicationUpdatePrompt';

/**
 * Retry one transient chunk failure. A release notice is advisory until the
 * user saves their open work and explicitly chooses to update this tab.
 *
 * Hardening notes:
 * - Never returns a never-resolving promise (would freeze Suspense forever).
 * - A second failure still reaches the existing ErrorBoundary recovery UI.
 * - No cache purge, automatic reload or never-resolving Suspense is scheduled.
 */
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
        applicationUpdates.available();
        throw retryError;
      }
    }
  });
}
