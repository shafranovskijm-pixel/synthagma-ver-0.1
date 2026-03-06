import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Force clear old caches on load
if ('caches' in window) {
  caches.keys().then(names => {
    names.forEach(name => {
      if (name.includes('workbox') || name.includes('pages-cache') || name.includes('static-cache')) {
        caches.delete(name);
      }
    });
  });
}

// Only register SW in browser context, not in Capacitor native
const isNative = typeof (window as any).Capacitor !== 'undefined';
if (!isNative) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        updateSW(true);
      },
      onOfflineReady() {
        console.log('App ready for offline use');
      },
      onRegistered(registration) {
        if (registration) {
          setInterval(() => registration.update(), 30 * 1000);
        }
      },
    });
  }).catch(() => {});
}

const root = document.getElementById("root")!;

createRoot(root).render(<App />);
