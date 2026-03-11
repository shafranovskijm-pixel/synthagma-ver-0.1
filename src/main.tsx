import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const isNative = typeof (window as any).Capacitor !== 'undefined';
const isPreview = window.location.hostname.includes('preview--') || window.location.hostname === 'localhost';

// In preview/dev: purge any leftover SW and caches, never re-register
// In production: register PWA service worker normally
(async () => {
  if (!isNative && 'serviceWorker' in navigator && isPreview) {
    const regs = await navigator.serviceWorker.getRegistrations();
    if (regs.length > 0) {
      for (const reg of regs) await reg.unregister();
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map(n => caches.delete(n)));
      }
      if (!sessionStorage.getItem('sw-purged-preview')) {
        sessionStorage.setItem('sw-purged-preview', '1');
        window.location.reload();
        return;
      }
    }
    // Never register SW in preview
    return;
  }

  if (!isNative && 'serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    if (regs.length > 0 && !sessionStorage.getItem('sw-purged')) {
      for (const reg of regs) await reg.unregister();
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map(n => caches.delete(n)));
      }
      sessionStorage.setItem('sw-purged', '1');
      window.location.reload();
      return;
    }
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
