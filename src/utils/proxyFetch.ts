/**
 * Proxy Fetch — глобальный перехватчик fetch + WebSocket.
 *
 * Назначение: обходить блокировку *.supabase.co у российских провайдеров
 * через ваш собственный reverse proxy (Nginx на Timeweb / VPS), который
 * стоит на отдельном поддомене (api.синтагма.рф).
 *
 * Защитные механизмы:
 *  1. Если прокси или прямой канал отдают HTML/Cloudflare gateway error вместо JSON
 *     Supabase — считаем канал сломанным: сбрасываем флаг и повторяем
 *     запрос напрямую (для не-форсированных хостов).
 *  2. При загрузке сразу пробуем прямой канал: если он жив — выключаем
 *     прокси, чтобы залипший флаг не «съел» всех клиентов.
 *  3. Одноразовый сброс залипшего прокси-флага через ключ-миграцию.
 */

const SUPABASE_HOST = (() => {
  try {
    const url = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
    if (url) return new URL(url).host;
  } catch {
    // ignore
  }
  return 'atxwvjxbqjgkbjlhsdch.supabase.co';
})();

// Базовый URL прокси-сервера на отдельном VDS (NGINX, Timeweb).
// Punycode для api.синтагма.рф.
const PROXY_BASE_URL = 'https://api.xn--80aaiswd0ak.xn--p1ai';

// Префиксы — должны совпадать с Nginx-конфигом на VDS.
const SAME_ORIGIN_PREFIX = {
  api: '/sb-api',
  functions: '/sb-functions',
  storage: '/sb-storage',
  realtime: '/sb-realtime',
};

function getProxyHttpBase(): string {
  if (PROXY_BASE_URL) return PROXY_BASE_URL;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

function getProxyWsBase(): string {
  const http = getProxyHttpBase();
  return http.replace(/^http/, 'ws');
}

// Хосты, на которых прокси-режим включается ВСЕГДА (без ожидания ошибки).
// синтагма.рф (punycode) — фронт там, а Supabase заблокирован у российских провайдеров.
const FORCE_PROXY_HOSTS_EXACT = new Set<string>([
  'xn--80aaiswd0ak.xn--p1ai',
  'www.xn--80aaiswd0ak.xn--p1ai',
]);

// Хосты, на которых прокси-механизм РАЗРЕШЁН (lazy auto-switch + хранение флага).
// На lovable-превью, localhost и любых dev-доменах прокси полностью отключаем —
// иначе залипший флаг или 522 от Cloudflare ломает вход.
const PROXY_ALLOWED_HOSTS_EXACT = new Set<string>([
  'sintagma.com.ru',
  'www.sintagma.com.ru',
  'xn--80aaiswd0ak.xn--p1ai',
  'www.xn--80aaiswd0ak.xn--p1ai',
]);

function isForcedProxyHost(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  if (FORCE_PROXY_HOSTS_EXACT.has(h)) return true;
  return false;
}

function isProxyAllowedHost(): boolean {
  if (typeof window === 'undefined') return false;
  return PROXY_ALLOWED_HOSTS_EXACT.has(window.location.hostname);
}

const PROXY_FLAG_KEY = 'sintagma:use-proxy';
const PROXY_LAST_PROBE_KEY = 'sintagma:proxy-last-probe';
// v3: 2026-06 — массовый сброс залипшего флага, когда NGINX-прокси
// внезапно начал отдавать HTML вместо JSON Supabase и положил всех клиентов.
const PROXY_RESET_KEY = 'sintagma:proxy-reset-v3';
const PROBE_INTERVAL_MS = 30 * 60 * 1000;


// Одноразовый сброс залипшего прокси-флага (миграция).
try {
  if (typeof window !== 'undefined' && !localStorage.getItem(PROXY_RESET_KEY)) {
    localStorage.removeItem(PROXY_FLAG_KEY);
    localStorage.removeItem(PROXY_LAST_PROBE_KEY);
    localStorage.setItem(PROXY_RESET_KEY, '1');
  }
  // На любых dev/preview-хостах прокси не должен работать в принципе —
  // снимаем флаг сразу, чтобы залипший канал не блокировал вход.
  if (typeof window !== 'undefined' && !isProxyAllowedHost()) {
    localStorage.removeItem(PROXY_FLAG_KEY);
    localStorage.removeItem(PROXY_LAST_PROBE_KEY);
  }
} catch {
  // ignore
}

function getProxyMode(): boolean {
  if (isForcedProxyHost()) return true;
  if (!isProxyAllowedHost()) return false;
  try {
    return localStorage.getItem(PROXY_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

function setProxyMode(enabled: boolean) {
  if (isForcedProxyHost() && !enabled) return;
  if (!isProxyAllowedHost()) return;
  try {
    if (enabled) localStorage.setItem(PROXY_FLAG_KEY, '1');
    else localStorage.removeItem(PROXY_FLAG_KEY);
  } catch {
    // ignore
  }
}

/** Прямой Supabase-URL → URL прокси-сервера. */
function rewriteUrl(url: string): string {
  if (!url.includes(SUPABASE_HOST)) return url;
  try {
    const u = new URL(url);
    let prefix: string;
    if (u.pathname.startsWith('/functions/v1/')) {
      prefix = SAME_ORIGIN_PREFIX.functions;
      u.pathname = u.pathname.replace(/^\/functions\/v1/, '');
    } else if (u.pathname.startsWith('/storage/v1/')) {
      prefix = SAME_ORIGIN_PREFIX.storage;
      u.pathname = u.pathname.replace(/^\/storage\/v1/, '');
    } else {
      prefix = SAME_ORIGIN_PREFIX.api;
    }
    const base = getProxyHttpBase();
    const path = (prefix + u.pathname).replace(/\/{2,}/g, '/');
    return base + path + (u.search || '');
  } catch {
    return url;
  }
}

function rewriteWsUrl(url: string): string {
  if (!url.includes(SUPABASE_HOST)) return url;
  try {
    const u = new URL(url);
    return getProxyWsBase() + SAME_ORIGIN_PREFIX.realtime + (u.search || '');
  } catch {
    return url;
  }
}

function isNetworkBlock(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    err.name === 'TypeError' ||
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('load failed') ||
    msg.includes('err_blocked') ||
    msg.includes('err_connection') ||
    msg.includes('err_name_not_resolved')
  );
}

/**
 * Прокси-канал признаётся «сломанным», если NGINX вернул HTML вместо JSON
 * Supabase, либо отдал явный шлюзовой код (502/503/504/52x).
 */
const BROKEN_GATEWAY_STATUSES = new Set([502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527]);

function isBrokenProxyResponse(resp: Response): boolean {
  if (BROKEN_GATEWAY_STATUSES.has(resp.status)) return true;
  const ct = resp.headers.get('content-type') || '';
  // Supabase API/auth/functions/storage никогда не отдают HTML.
  if (ct.toLowerCase().includes('text/html')) return true;
  return false;
}

let originalFetch: typeof fetch | null = null;
let originalWebSocket: typeof WebSocket | null = null;
let originalXhrOpen: typeof XMLHttpRequest.prototype.open | null = null;
let originalSendBeacon: typeof navigator.sendBeacon | null = null;

async function fetchViaProxy(
  originalUrl: string,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const proxyUrl = rewriteUrl(originalUrl);
  if (typeof input === 'string' || input instanceof URL) {
    return originalFetch!(proxyUrl, init);
  }
  const req = input as Request;
  return originalFetch!(proxyUrl, {
    method: req.method,
    headers: req.headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.clone().blob(),
    mode: req.mode,
    credentials: req.credentials,
    cache: req.cache,
    redirect: req.redirect,
    referrer: req.referrer,
    integrity: req.integrity,
    ...init,
  });
}

export function installProxyFetch() {
  if (typeof window === 'undefined') return;

  // ============= Fetch перехватчик =============
  if (!originalFetch) {
    originalFetch = window.fetch.bind(window);

    window.fetch = async function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const urlStr = typeof input === 'string'
        ? input
        : input instanceof URL ? input.toString() : input.url;

      // Перехватываем только Supabase-домен. Остальное идёт напрямую.
      if (!urlStr.includes(SUPABASE_HOST)) {
        return originalFetch!(input, init);
      }

      const useProxy = getProxyMode();

      if (useProxy) {
        try {
          const resp = await fetchViaProxy(urlStr, input, init);
          if (isBrokenProxyResponse(resp)) {
            // NGINX отдал HTML/502 — прокси сломан.
            if (!isForcedProxyHost()) {
              // Снимаем флаг и повторяем напрямую.
              setProxyMode(false);
              try {
                const direct = await originalFetch!(input, init);
                console.warn('[ProxyFetch] Proxy returned HTML/5xx, recovered via direct channel');
                window.dispatchEvent(new CustomEvent('sintagma:proxy-restored'));
                return direct;
              } catch {
                // прямой канал тоже не дошёл — возвращаем плохой ответ как есть
                window.dispatchEvent(new CustomEvent('sintagma:proxy-broken'));
                return resp;
              }
            } else {
              // Форсированный хост — прямой канал недоступен, сообщаем UI.
              console.error('[ProxyFetch] Forced proxy is broken (HTML response)');
              window.dispatchEvent(new CustomEvent('sintagma:proxy-broken'));
              return resp;
            }
          }
          return resp;
        } catch (err) {
          // Прокси-сервер вовсе недоступен.
          if (!isForcedProxyHost() && isNetworkBlock(err)) {
            setProxyMode(false);
            try {
              const direct = await originalFetch!(input, init);
              window.dispatchEvent(new CustomEvent('sintagma:proxy-restored'));
              return direct;
            } catch {
              throw err;
            }
          }
          throw err;
        }
      }

      // Lazy-режим: прямой запрос, при сетевой ошибке ИЛИ HTML/5xx-ответе от
      // CDN (Cloudflare 522 на atxwvjxbqjgkbjlhsdch.supabase.co) — переключаемся
      // на резервный прокси, чтобы UI не получал HTML вместо JSON.
      try {
        const direct = await originalFetch!(input, init);
        if (isBrokenProxyResponse(direct)) {
          try {
            const resp = await fetchViaProxy(urlStr, input, init);
            if (isBrokenProxyResponse(resp)) {
              window.dispatchEvent(new CustomEvent('sintagma:proxy-broken'));
              return direct; // оба канала сломаны — отдаём оригинал
            }
            setProxyMode(true);
            console.warn('[ProxyFetch] Direct Supabase returned HTML/5xx, switched to proxy:', rewriteUrl(urlStr));
            window.dispatchEvent(new CustomEvent('sintagma:proxy-activated'));
            return resp;
          } catch {
            return direct;
          }
        }
        return direct;
      } catch (err) {
        if (isNetworkBlock(err)) {
          try {
            const resp = await fetchViaProxy(urlStr, input, init);
            if (isBrokenProxyResponse(resp)) {
              window.dispatchEvent(new CustomEvent('sintagma:proxy-broken'));
              throw err;
            }
            setProxyMode(true);
            console.warn('[ProxyFetch] Direct Supabase blocked, switched to same-origin proxy:', rewriteUrl(urlStr));
            window.dispatchEvent(new CustomEvent('sintagma:proxy-activated'));
            return resp;
          } catch {
            throw err;
          }
        }
        throw err;
      }
    };


    // Ранний пробник: если флаг прокси взведён, но мы не на форсированном
    // хосте — сразу проверяем прямой канал, чтобы вытащить клиентов из
    // залипшего прокси (например, после сбоя NGINX).
    if (!isForcedProxyHost() && getProxyMode()) {
      // не блокируем загрузку — fire-and-forget
      probeDirectChannel(true).catch(() => { /* noop */ });
    }
  }

  // ============= WebSocket перехватчик (Realtime) =============
  if (!originalWebSocket && typeof WebSocket !== 'undefined') {
    originalWebSocket = window.WebSocket;
    const Original = originalWebSocket;

    class PatchedWebSocket extends Original {
      constructor(url: string | URL, protocols?: string | string[]) {
        const urlStr = url instanceof URL ? url.toString() : url;
        let finalUrl = urlStr;

        if (urlStr.includes(SUPABASE_HOST) && getProxyMode()) {
          finalUrl = rewriteWsUrl(urlStr);
          if (finalUrl !== urlStr) {
            console.info('[ProxyFetch] WebSocket → proxy:', finalUrl);
          }
        }

        super(finalUrl, protocols);
      }
    }

    Object.defineProperty(PatchedWebSocket, 'CONNECTING', { value: Original.CONNECTING });
    Object.defineProperty(PatchedWebSocket, 'OPEN', { value: Original.OPEN });
    Object.defineProperty(PatchedWebSocket, 'CLOSING', { value: Original.CLOSING });
    Object.defineProperty(PatchedWebSocket, 'CLOSED', { value: Original.CLOSED });

    window.WebSocket = PatchedWebSocket as unknown as typeof WebSocket;
  }

  // ============= XMLHttpRequest перехватчик =============
  if (!originalXhrOpen && typeof XMLHttpRequest !== 'undefined') {
    originalXhrOpen = XMLHttpRequest.prototype.open;
    const orig = originalXhrOpen;
    XMLHttpRequest.prototype.open = function patchedOpen(
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      async?: boolean,
      username?: string | null,
      password?: string | null,
    ) {
      let finalUrl: string | URL = url;
      try {
        const urlStr = url instanceof URL ? url.toString() : url;
        if (typeof urlStr === 'string' && urlStr.includes(SUPABASE_HOST) && getProxyMode()) {
          finalUrl = rewriteUrl(urlStr);
        }
      } catch {
        // ignore
      }
      return orig.call(this, method, finalUrl as string, async ?? true, username ?? null, password ?? null);
    } as typeof XMLHttpRequest.prototype.open;
  }

  // ============= sendBeacon перехватчик =============
  if (!originalSendBeacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    originalSendBeacon = navigator.sendBeacon.bind(navigator);
    const orig = originalSendBeacon;
    navigator.sendBeacon = function patchedSendBeacon(url: string | URL, data?: BodyInit | null): boolean {
      let finalUrl: string | URL = url;
      try {
        const urlStr = url instanceof URL ? url.toString() : url;
        if (typeof urlStr === 'string' && urlStr.includes(SUPABASE_HOST) && getProxyMode()) {
          finalUrl = rewriteUrl(urlStr);
        }
      } catch {
        // ignore
      }
      return orig(finalUrl as string, data ?? null);
    };
  }

  if (isForcedProxyHost()) {
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('sintagma:proxy-activated'));
    }, 0);
  }
}

async function probeDirectChannel(force = false) {
  if (!originalFetch) return;
  if (isForcedProxyHost()) return;
  try {
    if (!force) {
      const last = Number(localStorage.getItem(PROXY_LAST_PROBE_KEY) || 0);
      if (Date.now() - last < PROBE_INTERVAL_MS) return;
    }
    localStorage.setItem(PROXY_LAST_PROBE_KEY, String(Date.now()));

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const resp = await originalFetch(`https://${SUPABASE_HOST}/auth/v1/health`, {
      signal: ctrl.signal,
      cache: 'no-store',
    });
    clearTimeout(t);
    if (resp.ok || resp.status === 401) {
      setProxyMode(false);
      console.info('[ProxyFetch] Direct channel restored, proxy disabled');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sintagma:proxy-restored'));
      }
    }
  } catch {
    // всё ещё заблокировано — оставляем флаг как есть
  }
}

export function getProxyStatus() {
  return {
    enabled: getProxyMode(),
    forced: isForcedProxyHost(),
    sameOriginPrefix: SAME_ORIGIN_PREFIX,
    supabaseHost: SUPABASE_HOST,
  };
}

export function forceProxyMode(enabled: boolean) {
  setProxyMode(enabled);
}

/** Принудительно сбросить прокси-флаг и пробник; нужно для кнопки «починить канал». */
export function resetProxyChannel() {
  try {
    localStorage.removeItem(PROXY_FLAG_KEY);
    localStorage.removeItem(PROXY_LAST_PROBE_KEY);
  } catch {
    // ignore
  }
}

export function proxiedAssetUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (!url.includes(SUPABASE_HOST)) return url;
  if (!getProxyMode()) return url;
  return rewriteUrl(url);
}
