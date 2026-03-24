/**
 * Force client refresh: unregister all service workers, clear Cache Storage,
 * clear version keys, and do a hard reload.
 */

const RELOAD_GUARD_KEY = 'force-refresh-guard';

export async function forceClientRefresh(): Promise<void> {
  // Prevent infinite reload loops
  const guard = sessionStorage.getItem(RELOAD_GUARD_KEY);
  if (guard === 'pending') {
    // Already did one forced reload this session — abort
    sessionStorage.removeItem(RELOAD_GUARD_KEY);
    return;
  }

  // Unregister all service workers
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      await reg.unregister();
    }
  }

  // Clear all Cache Storage entries
  if ('caches' in window) {
    const names = await caches.keys();
    await Promise.all(names.map(n => caches.delete(n)));
  }

  // Clear version keys so main.tsx picks up the new build
  localStorage.removeItem('app-version');
  localStorage.removeItem('remote-cache-ver');

  // Set guard before reload
  sessionStorage.setItem(RELOAD_GUARD_KEY, 'pending');

  // Hard reload (bypass browser cache)
  window.location.reload();
}
