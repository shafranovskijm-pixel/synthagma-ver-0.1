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
        // New SW available — activate it immediately
        window.location.reload();
      },
      onOfflineReady() {
        console.log('App ready for offline use');
      },
    });
  }).catch(() => {});
}

const root = document.getElementById("root")!;

createRoot(root).render(<App />);
