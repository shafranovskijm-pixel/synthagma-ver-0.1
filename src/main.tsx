import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Only register SW in browser context, not in Capacitor native
const isNative = typeof (window as any).Capacitor !== 'undefined';
if (!isNative) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        const key = '__sw_reload_count';
        const count = parseInt(sessionStorage.getItem(key) || '0', 10);
        if (count < 2) {
          sessionStorage.setItem(key, String(count + 1));
          updateSW(true);
        }
      },
      onOfflineReady() {
        console.log('App ready for offline use');
      },
      onRegistered(registration) {
        if (registration) {
          setInterval(() => registration.update(), 60 * 1000);
        }
      },
    });
  }).catch(() => {});
}

const root = document.getElementById("root")!;

createRoot(root).render(<App />);
