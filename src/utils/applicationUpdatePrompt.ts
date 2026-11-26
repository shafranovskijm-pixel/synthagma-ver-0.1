import { toast } from 'sonner';
import { Workbox } from 'workbox-window';

type WorkerIdentity = object;
type Notice = { failed: boolean; update: () => void };
type UpdateDependencies<W extends WorkerIdentity> = {
  waiting: () => W | null;
  active: () => W | null;
  skipWaiting: (worker: W) => void;
  reload: () => void;
  notice: (notice: Notice) => void;
  later: (callback: () => void, milliseconds: number) => unknown;
  cancel: (timer: unknown) => void;
};

/** A local click authorizes one exact worker, never another tab or a later worker. */
export function createApplicationUpdateCoordinator<W extends WorkerIdentity>(deps: UpdateDependencies<W>) {
  let ready = false;
  let pending = false;
  let failed = false;
  let advertised: W | null = null;
  let accepted: W | null = null;
  let timer: unknown;
  let reloaded = false;

  function clearAcceptance() {
    accepted = null;
    if (timer !== undefined) deps.cancel(timer);
    timer = undefined;
  }
  function reloadOnce() {
    if (reloaded) return;
    reloaded = true;
    clearAcceptance();
    deps.reload();
  }
  function show() {
    if (!ready || !pending || reloaded || accepted) return;
    const target = advertised;
    deps.notice({ failed, update: () => accept(target) });
  }
  function offer(worker: W | null = deps.waiting()) {
    pending = true;
    advertised = worker;
    show();
  }
  function accept(target: W | null) {
    if (reloaded || accepted) return;
    // A stale toast is not permission to activate a replacement worker.
    const waiting = deps.waiting();
    if (advertised !== target || (waiting && waiting !== target)) {
      offer(waiting);
      return;
    }
    failed = false;
    if (!target) {
      // Build/asset hints also require an explicit click; no cache purge is needed.
      reloadOnce();
      return;
    }
    if (waiting === target) {
      accepted = target;
      timer = deps.later(() => {
        clearAcceptance();
        failed = true;
        offer(deps.waiting());
      }, 20000);
      try { deps.skipWaiting(target); }
      catch {
        clearAcceptance();
        failed = true;
        offer(deps.waiting());
      }
      return;
    }
    // Another tab may already have activated precisely the advertised worker.
    if (deps.active() === target) reloadOnce();
    else offer(waiting);
  }
  return {
    markReady() { ready = true; show(); },
    available: offer,
    activated(worker: W, isUpdate = true) {
      if (accepted === worker && deps.active() === worker) { reloadOnce(); return; }
      if (accepted && accepted !== worker) clearAcceptance();
      if (isUpdate) offer(worker); // External updates never authorize a reload.
    },
    redundant(worker: W) {
      if (accepted === worker) { clearAcceptance(); failed = true; }
      if (advertised === worker || pending) offer(deps.waiting());
    },
  };
}

let registration: ServiceWorkerRegistration | undefined;
let workbox: Workbox | undefined;
let registrationFlight: Promise<void> | null = null;
const recoveryNotices = new Set<(notice: Notice) => void>();

export const applicationUpdates = createApplicationUpdateCoordinator<ServiceWorker>({
  waiting: () => registration?.waiting ?? null,
  active: () => registration?.active ?? null,
  skipWaiting(worker) {
    // Workbox's supported method reads registration.waiting synchronously.
    if (!workbox || registration?.waiting !== worker) throw new Error('UPDATE_WORKER_CHANGED');
    workbox.messageSkipWaiting();
  },
  reload: () => window.location.reload(),
  notice: notice => {
    if (recoveryNotices.size) {
      for (const presenter of recoveryNotices) presenter(notice);
      return;
    }
    const { failed, update } = notice;
    toast(failed ? 'Обновление не завершено' : 'Доступна новая версия', {
    id: 'sintagma-application-update', duration: Infinity,
    description: failed
      ? 'Автоматическая перезагрузка не выполнена. Проверьте соединение, сохраните изменения и повторите обновление.'
      : 'Сохраните изменения в открытой форме и нажмите «Обновить», когда будете готовы.',
    action: { label: 'Обновить', onClick: update },
    });
  },
  later: (callback, milliseconds) => setTimeout(callback, milliseconds),
  cancel: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
});

/** The private-policy failure boundary exists before React/Sonner can mount. */
export function presentApplicationRecoveryUpdates(presenter: (notice: Notice) => void): () => void {
  recoveryNotices.add(presenter);
  applicationUpdates.markReady();
  applicationUpdates.available();
  return () => { recoveryNotices.delete(presenter); };
}

/** Public SW detection never grants permission to import App or send private traffic. */
async function registerWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  workbox = new Workbox('/sw.js', { scope: '/', type: 'classic', updateViaCache: 'none' });
  workbox.addEventListener('waiting', event => applicationUpdates.available(event.sw));
  workbox.addEventListener('activated', event => applicationUpdates.activated(event.sw, Boolean(event.isUpdate || event.isExternal)));
  workbox.addEventListener('controlling', event => applicationUpdates.activated(event.sw, Boolean(event.isUpdate || event.isExternal)));
  workbox.addEventListener('redundant', event => applicationUpdates.redundant(event.sw));
  registration = await workbox.register({ immediate: true });
  if (registration?.waiting) applicationUpdates.available(registration.waiting);
  if (registration) setInterval(() => { void registration?.update().catch(() => {}); }, 30000);
}

/** No virtual:pwa-register listeners: both its auto and prompt branches reload external tabs. */
export function registerApplicationWorker(): Promise<void> {
  if (!registrationFlight) {
    const task = registerWorker();
    registrationFlight = task;
    // A failed public registration may be retried; it is never a policy acknowledgment.
    void task.catch(() => { if (registrationFlight === task) registrationFlight = null; });
  }
  return registrationFlight;
}
