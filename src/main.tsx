import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Only register SW in browser context, not in Capacitor native
const isNative = typeof (window as any).Capacitor !== 'undefined';
if (!isNative) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({
      immediate: true,
    });
    // Listen for SW updates and auto-reload
    navigator.serviceWorker?.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  }).catch(() => {});
}

const root = document.getElementById("root")!;

createRoot(root).render(<App />);
