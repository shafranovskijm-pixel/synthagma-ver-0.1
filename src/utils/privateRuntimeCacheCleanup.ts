import { cleanPrivateRuntimeCaches } from '@/lib/pwa/privateCachePolicy';

async function acknowledgePrivatePolicy(controller: ServiceWorker | null, timeoutMs = 1200): Promise<boolean> {
  if (!controller || typeof MessageChannel === 'undefined') return false;
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const finish = (ok: boolean) => { clearTimeout(timer); channel.port1.close(); channel.port2.close(); resolve(ok); };
    const timer = setTimeout(() => finish(false), timeoutMs);
    channel.port1.onmessage = event => finish(event.data?.ok === true && event.data?.policyVersion === 2);
    try { controller.postMessage({ type: 'SINTAGMA_CLEAN_PRIVATE_RUNTIME_CACHES' }, [channel.port2]); }
    catch { finish(false); }
  });
}

/** Old controllers must activate the reviewed policy before App/Auth/API requests begin. */
export async function ensurePrivateRuntimePolicy(): Promise<void> {
  const workers = navigator.serviceWorker;
  if (!workers?.controller) return; // Uncontrolled requests cannot read an old worker's runtime cache.
  if (await acknowledgePrivatePolicy(workers.controller)) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onChange: (() => void) | undefined;
  try {
    await Promise.race([
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('private_policy_reconnect_required')), 5000); }),
      (async () => {
        const changed = new Promise<void>(resolve => { onChange = resolve; workers.addEventListener('controllerchange', onChange); });
        await workers.register('/sw.js', { updateViaCache: 'none' });
        if (await acknowledgePrivatePolicy(workers.controller)) return;
        await changed;
        if (!await acknowledgePrivatePolicy(workers.controller)) throw new Error('private_policy_reconnect_required');
      })(),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (onChange) workers.removeEventListener('controllerchange', onChange);
  }
}

/** Targeted and idempotent; leaves offline IDB records and anonymous lesson assets intact. */
export async function clearPrivateRuntimeCaches(): Promise<boolean> {
  try {
    if (typeof caches !== 'undefined') await cleanPrivateRuntimeCaches(caches, window.location.origin);
    if (navigator.serviceWorker?.controller) return await acknowledgePrivatePolicy(navigator.serviceWorker.controller);
    return true;
  } catch { return false; }
}

/** Recover stale application chunks without destroying downloaded public lesson assets. */
export async function refreshApplicationCaches(): Promise<void> {
  try {
    if (typeof caches !== 'undefined') await cleanPrivateRuntimeCaches(caches, window.location.origin, undefined, true);
  } catch { /* Best effort: never substitute a global erase. */ }
  try {
    for (const registration of await navigator.serviceWorker?.getRegistrations?.() || []) {
      if (registration.active && new URL(registration.active.scriptURL).pathname === '/sw.js') await registration.unregister();
    }
  } catch { /* Offline: retain the current shell and explicit lesson assets. */ }
}
