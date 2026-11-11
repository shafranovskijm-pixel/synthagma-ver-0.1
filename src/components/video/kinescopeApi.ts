// The official IFrame API is loaded only when a Kinescope video is opened.
// Reference: https://docs.kinescope.com/player-docs/embedding/iframe-api/
export interface KinescopeEvent {
  data?: { currentTime?: number; duration?: number; volume?: number; muted?: boolean; playbackRate?: number; error?: unknown };
}

export interface KinescopePlayer {
  Events: Record<string, string>;
  on: (event: string, listener: (event: KinescopeEvent) => void) => void;
  off: (event: string, listener: (event: KinescopeEvent) => void) => void;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  seekTo: (time: number) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  mute: () => Promise<void>;
  unmute: () => Promise<void>;
  setPlaybackRate: (rate: number) => Promise<void>;
  getCurrentTime: () => Promise<number>;
  getDuration: () => Promise<number>;
  destroy: () => Promise<void>;
}

interface KinescopeOptions {
  url: string;
  size: { width: string; height: string };
  ui: { controls: boolean; mainPlayButton: boolean; language: 'ru' };
  behavior: { preload: 'none' | 'metadata' | 'auto'; localStorage: boolean; keyboard: boolean; playsInline: boolean; muted: boolean; playbackRate: number };
}

export interface KinescopeFactory {
  create: (id: string, options: KinescopeOptions) => Promise<KinescopePlayer>;
}

type KinescopeWindow = Window & {
  Kinescope?: { IframePlayer?: KinescopeFactory };
  onKinescopeIframeAPIReady?: (factory: KinescopeFactory) => void;
};

let pending: Promise<KinescopeFactory> | undefined;

// The iframe API rejects with the remote payload as-is, which can be a string or
// a plain object rather than a DOMException. Only recognizable activation denials
// should offer a direct tap; transport, decoder and unknown failures stay fatal.
export function isKinescopePlayGestureDenial(reason: unknown): boolean {
  const record = reason && typeof reason === 'object' ? reason : undefined;
  const name = record && 'name' in record && typeof record.name === 'string' ? record.name : undefined;
  if (name === 'NotAllowedError') return true;
  if (name && name !== 'Error') return false;
  const message = typeof reason === 'string' ? reason :
    record && 'message' in record && typeof record.message === 'string' ? record.message : '';
  return /^NotAllowedError(?::|$)/.test(message) ||
    /^The request is not allowed by the user agent or the platform in the current context(?:, possibly because the user denied permission)?\.?$/.test(message) ||
    /^The request is not triggered by a user activation\.?$/.test(message) ||
    /^play\(\) failed because the user didn't interact with the document first\.?$/.test(message);
}

export function loadKinescopeApi(): Promise<KinescopeFactory> {
  const target = window as KinescopeWindow;
  if (target.Kinescope?.IframePlayer) return Promise.resolve(target.Kinescope.IframePlayer);
  if (pending) return pending;
  pending = new Promise<KinescopeFactory>((resolve, reject) => {
    const previousReady = target.onKinescopeIframeAPIReady;
    const script = document.createElement('script');
    script.src = 'https://player.kinescope.io/latest/iframe.player.js';
    script.async = true;
    const reset = () => {
      window.clearTimeout(timeout);
      if (target.onKinescopeIframeAPIReady === ready) target.onKinescopeIframeAPIReady = previousReady;
    };
    const failed = (reason = 'Kinescope API script failed to load') => {
      reset();
      script.remove();
      pending = undefined;
      reject(new Error(reason));
    };
    const ready = (factory: KinescopeFactory) => {
      reset();
      resolve(factory);
      previousReady?.(factory);
    };
    const timeout = window.setTimeout(() => failed('Kinescope API script timed out after 15 seconds'), 15000);
    target.onKinescopeIframeAPIReady = ready;
    script.onerror = () => failed();
    document.head.appendChild(script);
  });
  return pending;
}
