import { cleanPrivateRuntimeCaches } from '@/lib/pwa/privateCachePolicy';

export type PrivatePolicyFailure = 'ACK_TIMEOUT' | 'POLICY_MISMATCH' | 'CLEANUP_FAILED' | 'WORKER_UNAVAILABLE' | 'POLICY_UPDATE_FAILED' | 'CONTROLLER_UNSTABLE';
export class PrivateRuntimePolicyError extends Error {
  constructor(readonly code: PrivatePolicyFailure) { super(code); this.name = 'PrivateRuntimePolicyError'; }
}
const ACK_TIMEOUT_MS = 6000;
const STARTUP_TIMEOUT_MS = 20000;
let confirmedController: ServiceWorker | null | undefined;
let policyFlight: Promise<void> | null = null;
let browserCleanupFlight: Promise<void> | null = null;

type Ack = 'confirmed' | 'changed' | 'timeout' | 'mismatch' | 'cleanup_failed' | 'unavailable';
/** A reply from a former controller is never authority for the current page. */
async function acknowledgePrivatePolicy(workers: ServiceWorkerContainer, controller: ServiceWorker, timeoutMs: number): Promise<Ack> {
  if (typeof MessageChannel === 'undefined') return 'unavailable';
  return new Promise(resolve => {
    const channel = new MessageChannel(); let finished = false;
    const finish = (result: Ack) => {
      if (finished) return; finished = true; clearTimeout(timer);
      workers.removeEventListener('controllerchange', changed);
      channel.port1.onmessage = null; channel.port1.onmessageerror = null;
      channel.port1.close(); channel.port2.close(); resolve(result);
    };
    const changed = () => { if (workers.controller !== controller) finish('changed'); };
    const timer = setTimeout(() => finish(workers.controller !== controller ? 'changed' : 'timeout'), timeoutMs);
    workers.addEventListener('controllerchange', changed);
    channel.port1.onmessage = event => {
      if (workers.controller !== controller) return finish('changed');
      if (event.data?.policyVersion !== 2) return finish('mismatch');
      if (event.data?.ok === true) return finish('confirmed');
      finish(event.data?.error === 'CLEANUP_FAILED' ? 'cleanup_failed' : 'mismatch');
    };
    channel.port1.onmessageerror = () => finish('unavailable');
    try {
      if (workers.controller !== controller) return finish('changed');
      controller.postMessage({ type: 'SINTAGMA_CLEAN_PRIVATE_RUNTIME_CACHES' }, [channel.port2]);
    } catch { finish('unavailable'); }
  });
}
function cleanBrowserCaches(): Promise<void> {
  if (!browserCleanupFlight) {
    const task = (async () => { if (typeof caches !== 'undefined') await cleanPrivateRuntimeCaches(caches, window.location.origin); })();
    browserCleanupFlight = task;
    void task.then(() => { if (browserCleanupFlight === task) browserCleanupFlight = null; }, () => { if (browserCleanupFlight === task) browserCleanupFlight = null; });
  }
  return browserCleanupFlight;
}
async function bounded<T>(task: Promise<T>, milliseconds: number, code: PrivatePolicyFailure): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([task, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new PrivateRuntimePolicyError(code)), Math.max(1, milliseconds)); })]); }
  finally { if (timer) clearTimeout(timer); }
}
async function waitForControllerOrDelay(workers: ServiceWorkerContainer, controller: ServiceWorker, milliseconds: number): Promise<void> {
  await new Promise<void>(resolve => {
    const finish = () => { clearTimeout(timer); workers.removeEventListener('controllerchange', changed); resolve(); };
    const changed = () => { if (workers.controller !== controller) finish(); };
    const timer = setTimeout(finish, Math.max(1, milliseconds));
    workers.addEventListener('controllerchange', changed); changed();
  });
}
async function confirmCurrentPolicy(): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  const workers = navigator.serviceWorker;
  let updateRequested = false, updateFailed = false, attempts = 0;
  let previous: ServiceWorker | null | undefined;
  let lastFailure: PrivatePolicyFailure = 'ACK_TIMEOUT';
  while (Date.now() < deadline) {
    const controller = workers?.controller ?? null;
    if (controller !== previous) { previous = controller; attempts = 0; }
    if (!controller) {
      // There is no controlling worker to read an old runtime cache. Still finish
      // the targeted local cleanup before the private application is imported.
      try { await bounded(cleanBrowserCaches(), deadline - Date.now(), 'CLEANUP_FAILED'); }
      catch { throw new PrivateRuntimePolicyError('CLEANUP_FAILED'); }
      if ((workers?.controller ?? null) !== null) continue;
      confirmedController = null; return;
    }
    const result = await acknowledgePrivatePolicy(workers, controller, Math.min(ACK_TIMEOUT_MS, deadline - Date.now()));
    if (result === 'changed') continue;
    if (result === 'confirmed') {
      if (workers.controller !== controller) continue;
      confirmedController = controller; return;
    }
    if (result === 'cleanup_failed') throw new PrivateRuntimePolicyError('CLEANUP_FAILED');
    lastFailure = result === 'mismatch' ? 'POLICY_MISMATCH' : result === 'unavailable' ? 'WORKER_UNAVAILABLE' : 'ACK_TIMEOUT';
    attempts += 1;
    if (!updateRequested) {
      updateRequested = true;
      try { void workers.register('/sw.js', { updateViaCache: 'none' }).catch(() => { updateFailed = true; }); }
      catch { updateFailed = true; }
      // Registration may continue in the browser; it is not a security proof.
      // Keep listening/retrying the current controller within the startup bound.
    }
    if (result !== 'timeout') {
      await waitForControllerOrDelay(workers, controller, Math.min(ACK_TIMEOUT_MS, deadline - Date.now()));
    }
    if (attempts >= 3) throw new PrivateRuntimePolicyError(updateFailed ? 'POLICY_UPDATE_FAILED' : lastFailure);
  }
  throw new PrivateRuntimePolicyError(updateFailed ? 'POLICY_UPDATE_FAILED' : 'CONTROLLER_UNSTABLE');
}
/** Old controllers must acknowledge the reviewed policy AND completed cleanup before App/Auth. */
export async function ensurePrivateRuntimePolicy(): Promise<void> {
  while (confirmedController !== (navigator.serviceWorker?.controller ?? null)) {
    if (!policyFlight) {
      const task = confirmCurrentPolicy(); policyFlight = task;
      void task.then(() => { if (policyFlight === task) policyFlight = null; }, () => { if (policyFlight === task) policyFlight = null; });
    }
    await policyFlight;
  }
}
const FETCH_FENCE_KEY = Symbol.for('sintagma.private-runtime-fetch-fence.v2');
function aborted(signal: AbortSignal): unknown {
  return signal.reason === undefined ? new DOMException('The operation was aborted.', 'AbortError') : signal.reason;
}
async function waitForPolicy(signal: AbortSignal | null | undefined): Promise<void> {
  if (signal?.aborted) throw aborted(signal);
  if (!signal) return ensurePrivateRuntimePolicy();
  // Abort only this request's wait, never claim to cancel a shared worker scan.
  await new Promise<void>((resolve, reject) => {
    const stop = () => { signal.removeEventListener('abort', onAbort); };
    const onAbort = () => { stop(); reject(aborted(signal)); };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) { onAbort(); return; }
    void ensurePrivateRuntimePolicy().then(() => { stop(); resolve(); }, error => { stop(); reject(error); });
  });
}
/** Install before proxy/error wrappers capture their transport, including retries. */
export function installPrivateRuntimeFetchFence(): void {
  if (Reflect.get(window, FETCH_FENCE_KEY)) return;
  const transport = window.fetch;
  if (typeof transport !== 'function') return;
  window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const [input, init] = args;
    const inputIsRequest = typeof input === 'object' && input !== null
      && (input instanceof Request || Object.prototype.toString.call(input) === '[object Request]');
    const signal = init?.signal !== undefined ? init.signal : inputIsRequest ? (input as Request).signal : null;
    do { await waitForPolicy(signal); }
    while (confirmedController !== (navigator.serviceWorker?.controller ?? null));
    if (signal?.aborted) throw aborted(signal);
    // No await between checking identity and native transport dispatch. Preserve
    // Request/body/headers/arguments exactly; do not clone or consume streams.
    return Reflect.apply(transport, window, args);
  };
  Reflect.set(window, FETCH_FENCE_KEY, true);
}
/** Recheck after chunk loading: a controller can change while imports are in flight. */
export async function startAfterPrivateRuntimePolicy<T>(prepare: () => Promise<T>, start: (ready: T) => void): Promise<void> {
  await ensurePrivateRuntimePolicy();
  const ready = await prepare();
  await ensurePrivateRuntimePolicy();
  start(ready);
}
/** Targeted and idempotent; leaves IDB records and anonymous lesson assets intact. */
export async function clearPrivateRuntimeCaches(): Promise<boolean> {
  confirmedController = undefined;
  try { await ensurePrivateRuntimePolicy(); return true; } catch { return false; }
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
