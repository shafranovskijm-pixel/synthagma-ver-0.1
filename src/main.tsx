import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Aggressively clear all old caches on load to ensure fresh content
if ('caches' in window) {
  caches.keys().then(names => {
    names.forEach(name => caches.delete(name));
  });
}

// Only register SW in browser context, not in Capacitor native
const isNative = typeof (window as any).Capacitor !== 'undefined';
if (!isNative) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({
      immediate: true,
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
