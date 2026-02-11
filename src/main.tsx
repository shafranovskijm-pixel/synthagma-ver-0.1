import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Only register SW in browser context, not in Capacitor native
const isNative = typeof (window as any).Capacitor !== 'undefined';
if (!isNative) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true });
  }).catch(() => {});
}

const root = document.getElementById("root")!;

try {
  createRoot(root).render(<App />);
} catch (e: any) {
  root.innerHTML = `<pre style="color:red;padding:20px;">App Error: ${e?.message}\n${e?.stack}</pre>`;
}
