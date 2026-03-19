import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

declare const __BUILD_TIMESTAMP__: string;

const isNative = typeof (window as any).Capacitor !== 'undefined';
const isPreview = window.location.hostname.includes('preview--') || window.location.hostname === 'localhost';

const APP_VERSION_KEY = 'app-version';
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
  // In preview/dev: purge any leftover SW and caches, never re-register
  if (!isNative && isPreview) {
    await purgeAllCaches();
    return;
  }

  // Version-based cache busting: force refresh when a new build is deployed
  const storedVersion = localStorage.getItem(APP_VERSION_KEY);
  if (storedVersion !== currentVersion) {
    await purgeAllCaches();
    localStorage.setItem(APP_VERSION_KEY, currentVersion);
    if (storedVersion !== null) {
      // Only reload if there was a previous version (not first visit)
      window.location.reload();
      return;
    }
  }

  // Remote cache version check (admin-triggered forced refresh)
  try {
    const { checkRemoteCacheVersion } = await import('./utils/remoteCacheCheck');
    const needsReload = await checkRemoteCacheVersion();
    if (needsReload) {
      await purgeAllCaches();
      window.location.reload();
      return;
    }
  } catch {
    // Silently ignore — DB might be unreachable
  }

  // Register new SW only on production
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
