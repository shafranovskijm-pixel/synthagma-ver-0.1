import type { KinescopeFactory, KinescopePlayer } from './kinescopeApi';

type Options = Parameters<KinescopeFactory['create']>[1];
type AutoPlayer = KinescopePlayer & {
  getTargetContainer: () => HTMLIFrameElement;
  setOptions: (options: unknown) => Promise<void>;
};
type Created = { data: AutoPlayer };
type AutoFactory = KinescopeFactory & {
  version: string;
  Events: { Created: string };
  on: (type: string, listener: (event: Created) => void) => void;
  off: (type: string, listener: (event: Created) => void) => void;
  monitor: () => () => void;
};
const monitors = new WeakMap<AutoFactory, { users: number; stop?: () => void }>();

export function isKinescopeHandshakeTimeout(reason: unknown): boolean {
  if (!reason || typeof reason !== 'object') return false;
  const error = reason as { code?: unknown; status?: unknown; cause?: { message?: unknown } };
  return error.code === 'HTTP_STATUS' && error.status === 200 &&
    typeof error.cause?.message === 'string' &&
    /^Timeout of \d+ms exceeded\. Unable to connect to iframe\.$/.test(error.cause.message);
}

// This recovery uses the provider's documented existing-iframe connection.
// It is restricted to the SDK version whose instance/container contract was
// verified. Unknown versions keep the normal create() failure behavior.
export function recoverKinescopeConnection(factory: KinescopeFactory, oldFrame: HTMLIFrameElement,
  frameId: string, options: Options): { frame: HTMLIFrameElement; ready: Promise<KinescopePlayer>; cancel: () => void } | undefined {
  const api = factory as Partial<AutoFactory>;
  if (api.version !== '2.200.3' || !api.Events?.Created || typeof api.on !== 'function' ||
    typeof api.off !== 'function' || typeof api.monitor !== 'function') return;
  const auto = api as AutoFactory;
  const url = new URL(options.url);
  url.searchParams.delete('_'); url.searchParams.delete('v');
  for (const [key, value] of Object.entries({ enableIframeApi: '', controls: '0', keyboard: '0',
    autoplay: '0', background: '0', playsinline: '1', preload: '1', t: '0' })) url.searchParams.set(key, value);
  const frame = oldFrame.cloneNode(false) as HTMLIFrameElement;
  frame.id = frameId;
  // Set src before insertion; monitor() attaches without navigating again.
  frame.src = url.toString();
  oldFrame.replaceWith(frame);
  let cancel = () => {};
  const ready = new Promise<KinescopePlayer>((resolve, reject) => {
    let settled = false, detached = false;
    let candidate: AutoPlayer | undefined;
    let release: (() => void) | undefined;
    const detach = () => {
      if (detached) return;
      detached = true;
      try { auto.off(auto.Events.Created, created); } catch { /* best-effort cleanup */ }
      release?.();
    };
    const finish = (ok: boolean, error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); detach();
      if (!ok) { void candidate?.destroy().catch(() => {}); reject(error ?? new Error('Kinescope recovery failed')); }
      else resolve(candidate!);
    };
    const created = ({ data: player }: Created) => {
      if (settled || candidate || !frame.isConnected || typeof player?.getTargetContainer !== 'function' ||
        player.getTargetContainer() !== frame) return;
      candidate = player;
      detach();
      void (async () => {
        if (typeof player.setOptions !== 'function') throw new Error('Kinescope recovery settings unavailable');
        await player.setOptions({ ui: options.ui, behavior: { ...options.behavior, autoPlay: false,
          localStorage: false, keyboard: false, preload: 'metadata' } });
        if (settled) return;
        // Do not inherit the provider's cached position. The component restores
        // the authorized savedPosition only after this connection is returned.
        await player.seekTo(0);
        finish(true);
      })().catch(error => finish(false, error));
    };
    const timer = setTimeout(() => finish(false, new Error('Kinescope existing-frame connection timed out')), 15000);
    cancel = () => finish(false, new DOMException('Video connection cancelled', 'AbortError'));
    try {
      auto.on(auto.Events.Created, created);
      let state = monitors.get(auto);
      if (!state) { state = { users: 0 }; monitors.set(auto, state); }
      state.users++;
      const shared = state;
      release = () => { if (--shared.users === 0) { shared.stop?.(); shared.stop = undefined; } };
      // A rescan includes a newly inserted iframe. Already connected players
      // use their own MessagePorts and do not depend on this initial monitor.
      shared.stop?.(); shared.stop = undefined;
      const stop = auto.monitor();
      if (shared.users === 0) stop(); else shared.stop = stop;
    } catch (error) { finish(false, error); }
  });
  return { frame, ready, cancel: () => cancel() };
}
