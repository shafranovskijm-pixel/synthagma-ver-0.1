// Harness-only setup, before the byte-exact stock setup. No application imports.
const deny = () => { throw new Error("UI_HARNESS_NETWORK_DISABLED"); };
Object.defineProperty(globalThis, "fetch", { value: deny, writable: true, configurable: true });
for (const key of ["XMLHttpRequest", "WebSocket", "EventSource"] as const) {
  Object.defineProperty(globalThis, key, { value: class { constructor() { deny(); } }, writable: true, configurable: true });
}
if (typeof window !== "undefined") {
  if (window !== globalThis) {
    Object.defineProperty(window, "fetch", { value: deny, writable: true, configurable: true });
    for (const key of ["XMLHttpRequest", "WebSocket", "EventSource"] as const) {
      Object.defineProperty(window, key, { value: class { constructor() { deny(); } }, writable: true, configurable: true });
    }
  }
  Object.defineProperty(window.navigator, "sendBeacon", { value: deny, configurable: true });
}
