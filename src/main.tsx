import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

declare const __BUILD_TIMESTAMP__: string;

const isNative = typeof (window as any).Capacitor !== 'undefined';

const APP_VERSION_KEY = 'app-version';
const RELOAD_GUARD_KEY = 'force-refresh-guard';
const currentVersion = typeof __BUILD_TIMESTAMP__ !== 'undefined' ? __BUILD_TIMESTAMP__ : 'dev';

async function purgeAllCaches() {
  if ('caches' in window) {
    const names = await caches.keys();
    await Promise.all(names.map(n => caches.delete(n)));
  }
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) await reg.unregister();
  }
}

(async () => {
  // Version-based cache busting — works for both preview and production
  const storedVersion = localStorage.getItem(APP_VERSION_KEY);

  if (storedVersion !== null && storedVersion !== currentVersion) {
    // Guard against infinite reload loops
    const guard = sessionStorage.getItem(RELOAD_GUARD_KEY);
    if (guard !== currentVersion) {
      await purgeAllCaches();
      localStorage.setItem(APP_VERSION_KEY, currentVersion);
      sessionStorage.setItem(RELOAD_GUARD_KEY, currentVersion);
      window.location.reload();
      return;
    }
    // Already reloaded for this version — continue normally
    sessionStorage.removeItem(RELOAD_GUARD_KEY);
  }

  // Store current version on first visit
  localStorage.setItem(APP_VERSION_KEY, currentVersion);

  // Remote cache version check (admin-triggered forced refresh)
  try {
    const { checkRemoteCacheVersion } = await import('./utils/remoteCacheCheck');
    const needsReload = await checkRemoteCacheVersion();
    if (needsReload) {
      const guard = sessionStorage.getItem(RELOAD_GUARD_KEY);
      if (guard !== 'remote-' + currentVersion) {
        await purgeAllCaches();
        sessionStorage.setItem(RELOAD_GUARD_KEY, 'remote-' + currentVersion);
        window.location.reload();
        return;
      }
      sessionStorage.removeItem(RELOAD_GUARD_KEY);
    }
  } catch {
    // Silently ignore — DB might be unreachable
  }

  // Register SW only on production (not preview, not native)
  const isPreview = window.location.hostname.includes('preview--') || window.location.hostname === 'localhost';
  if (!isNative && !isPreview && import.meta.env.PROD) {
    import('virtual:pwa-register').then(({ registerSW }) => {
      const updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
          updateSW(true);
        },
        onRegistered(registration) {
          if (registration) {
            setInterval(() => registration.update(), 30 * 1000);
          }
        },
      });
    }).catch(() => {});
  }
})();

const root = document.getElementById("root")!;

createRoot(root).render(<App />);
