/**
 * Force client refresh: unregister all service workers, clear Cache Storage,
 * clear all version/guard keys, and do a hard reload.
 */

const MANUAL_GUARD_KEY = '__manual_refresh_guard';

export async function forceClientRefresh(): Promise<void> {
  // Prevent infinite reload loops — allow only once per session
  if (sessionStorage.getItem(MANUAL_GUARD_KEY)) {
    sessionStorage.removeItem(MANUAL_GUARD_KEY);
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

  // Clear all version/guard keys used by bootstrap and main.tsx
  localStorage.removeItem('app-version');
  localStorage.removeItem('remote-cache-ver');
  localStorage.removeItem('__asset_id');

  // Clear all session guards to allow fresh detection
  const keysToRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key && (key.startsWith('__purge_') || key.startsWith('__build_') || key.startsWith('__remote_') || key === '__sw_recovery_attempted')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(k => sessionStorage.removeItem(k));

  // Set guard before reload
  sessionStorage.setItem(MANUAL_GUARD_KEY, '1');

  // Hard reload
  window.location.reload();
}
