import type { KinescopeFactory, KinescopePlayer } from './kinescopeApi';

type Options = Parameters<KinescopeFactory['create']>[1];

export function isKinescopeHandshakeTimeout(reason: unknown): boolean {
  if (!reason || typeof reason !== 'object') return false;
  const error = reason as { code?: unknown; status?: unknown; cause?: { message?: unknown } };
  return error.code === 'HTTP_STATUS' && error.status === 200 &&
    typeof error.cause?.message === 'string' &&
    /^Timeout of \d+ms exceeded\. Unable to connect to iframe\.$/.test(error.cause.message);
}

// One retry on a fresh DOM node and SDK id. Reusing the failed iframe can keep
// the timed-out document/channel; letting the SDK navigate a clean node is
// equivalent to the normal Retry action, without resetting the React state.
// Its rejection is returned to the caller, never recursively retried here.
export function recoverKinescopeConnection(factory: KinescopeFactory, oldFrame: HTMLIFrameElement,
  frameId: string, options: Options): { frame: HTMLIFrameElement; ready: Promise<KinescopePlayer>; cancel: () => void } {
  const frame = oldFrame.cloneNode(false) as HTMLIFrameElement;
  frame.removeAttribute('src');
  frame.id = frameId;
  oldFrame.replaceWith(frame);
  let cancelled = false, resolved = false;
  let rejectReady: (reason: unknown) => void;
  const aborted = () => new DOMException('Video connection cancelled', 'AbortError');
  const ready = new Promise<KinescopePlayer>((resolve, reject) => {
    rejectReady = reject;
    void Promise.resolve().then(() => {
      if (cancelled) throw aborted();
      return factory.create(frameId, options);
    }).then(player => {
      if (cancelled) { void player.destroy().catch(() => {}); return; }
      resolved = true;
      resolve(player);
    }, error => { if (!cancelled) reject(error); });
  });
  return { frame, ready, cancel: () => {
    if (cancelled || resolved) return;
    cancelled = true; rejectReady(aborted());
  } };
}
