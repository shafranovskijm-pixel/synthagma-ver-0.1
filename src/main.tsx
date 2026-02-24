import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Only register SW in browser context, not in Capacitor native
const isNative = typeof (window as any).Capacitor !== 'undefined';
if (!isNative) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({
      immediate: true,
      onNeedRefresh() {
        caches.keys().then(names => {
          Promise.all(names.map(name => caches.delete(name)))
            .then(() => window.location.reload());
        });
      },
      onOfflineReady() {
        console.log('App ready for offline use');
      },
      onRegistered(registration) {
        if (registration) {
          setInterval(() => {
            registration.update();
          }, 60 * 1000);
        }
      },
    });
  }).catch(() => {});
}

const root = document.getElementById("root")!;

createRoot(root).render(<App />);
