/**
 * Proxy Fetch — глобальный перехватчик fetch + WebSocket, который переключает
 * все Supabase-запросы на резервные субдомены через Cloudflare Worker.
 *
 * Логика:
 *  1. На основном домене (sintagma.com.ru / www.sintagma.com.ru) — прокси-режим
 *     включён ВСЕГДА, без ожидания первой ошибки. Это устраняет 30-сек таймаут
 *     при попытке достучаться до заблокированного провайдером Supabase.
 *  2. На остальных доменах (lovable.app, localhost) — старая логика:
 *     пробуем прямой запрос, при сетевой ошибке переключаемся на прокси.
 *  3. Перехватываем также WebSocket — Realtime использует wss://, не fetch.
 *  4. На основном домене проба возврата на прямой канал отключена
 *     (провайдеры РФ не разблокируются).
 */

const SUPABASE_HOST = 'atxwvjxbqjgkbjlhsdch.supabase.co';

const PROXY_HOSTS = {
  api: 'api.sintagma.com.ru',           // → REST/Auth/Realtime
  functions: 'functions.sintagma.com.ru', // → Edge Functions
  storage: 'storage.sintagma.com.ru',   // → Storage
};

// Хосты, на которых прокси-режим включается принудительно с самого старта.
const FORCE_PROXY_HOSTS = new Set([
  'sintagma.com.ru',
  'www.sintagma.com.ru',
]);

const PROXY_FLAG_KEY = 'sintagma:use-proxy';
const PROXY_LAST_PROBE_KEY = 'sintagma:proxy-last-probe';
const PROBE_INTERVAL_MS = 30 * 60 * 1000;

function isForcedProxyHost(): boolean {
  if (typeof window === 'undefined') return false;
  return FORCE_PROXY_HOSTS.has(window.location.hostname);
}

function getProxyMode(): boolean {
  // На основном домене прокси всегда активен — не ждём таймаута.
  if (isForcedProxyHost()) return true;
  try {
    return localStorage.getItem(PROXY_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

function setProxyMode(enabled: boolean) {
  // Не позволяем выключить прокси на основном домене.
  if (isForcedProxyHost() && !enabled) return;
  try {
    if (enabled) localStorage.setItem(PROXY_FLAG_KEY, '1');
    else localStorage.removeItem(PROXY_FLAG_KEY);
  } catch {
    // ignore
  }
}

/** http(s):// URL → прокси-URL. */
function rewriteUrl(url: string): string {
  if (!url.includes(SUPABASE_HOST)) return url;
  try {
    const u = new URL(url);
    const path = u.pathname;
    if (path.startsWith('/functions/')) {
      u.host = PROXY_HOSTS.functions;
    } else if (path.startsWith('/storage/')) {
      u.host = PROXY_HOSTS.storage;
    } else {
      u.host = PROXY_HOSTS.api;
    }
    return u.toString();
  } catch {
    return url;
  }
}

/** ws(s):// URL → прокси-URL (для Realtime). */
function rewriteWsUrl(url: string): string {
  if (!url.includes(SUPABASE_HOST)) return url;
  try {
    const u = new URL(url);
    // Realtime всегда идёт через api.* (тот же хост, что REST/Auth)
    u.host = PROXY_HOSTS.api;
    return u.toString();
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

let originalFetch: typeof fetch | null = null;
let originalWebSocket: typeof WebSocket | null = null;

export function installProxyFetch() {
  if (typeof window === 'undefined') return;

  // ============= Fetch перехватчик =============
  if (!originalFetch) {
    originalFetch = window.fetch.bind(window);

    window.fetch = async function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const urlStr = typeof input === 'string'
        ? input
        : input instanceof URL ? input.toString() : input.url;

      if (!urlStr.includes(SUPABASE_HOST) && !urlStr.includes('sintagma.com.ru')) {
        return originalFetch!(input, init);
      }

      const useProxy = getProxyMode();

      // Принудительный прокси на основном домене — никаких попыток прямого запроса.
      if (useProxy && urlStr.includes(SUPABASE_HOST)) {
        const proxyUrl = rewriteUrl(urlStr);
        // Если запрос был с Request-объектом, его нельзя просто передать с другим URL —
        // нужно либо строку, либо новый Request. Используем строку + init.
        if (typeof input === 'string' || input instanceof URL) {
          return originalFetch!(proxyUrl, init);
        }
        // Для Request копируем поля.
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

      // Обычный режим (lovable.app, localhost) — прямой запрос с фолбэком.
      try {
        return await originalFetch!(input, init);
      } catch (err) {
        if (isNetworkBlock(err) && urlStr.includes(SUPABASE_HOST)) {
          const proxyUrl = rewriteUrl(urlStr);
          try {
            const resp = await originalFetch!(proxyUrl, init);
            setProxyMode(true);
            console.warn('[ProxyFetch] Direct Supabase blocked, switched to proxy:', proxyUrl);
            window.dispatchEvent(new CustomEvent('sintagma:proxy-activated'));
            return resp;
          } catch {
            throw err;
          }
        }
        throw err;
      }
    };

    // Проба возврата только на не-основном домене.
    if (!isForcedProxyHost() && getProxyMode()) {
      setTimeout(probeDirectChannel, 60_000);
    }
  }

  // ============= WebSocket перехватчик (для Realtime) =============
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

    // Копируем статические свойства (CONNECTING/OPEN/CLOSING/CLOSED).
    Object.defineProperty(PatchedWebSocket, 'CONNECTING', { value: Original.CONNECTING });
    Object.defineProperty(PatchedWebSocket, 'OPEN', { value: Original.OPEN });
    Object.defineProperty(PatchedWebSocket, 'CLOSING', { value: Original.CLOSING });
    Object.defineProperty(PatchedWebSocket, 'CLOSED', { value: Original.CLOSED });

    window.WebSocket = PatchedWebSocket as unknown as typeof WebSocket;
  }

  // На основном домене сразу диспатчим событие — баннер/индикатор покажет статус.
  if (isForcedProxyHost()) {
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('sintagma:proxy-activated'));
    }, 0);
  }
}

async function probeDirectChannel() {
  if (!originalFetch) return;
  if (isForcedProxyHost()) return; // на основном домене не пробуем
  try {
    const last = Number(localStorage.getItem(PROXY_LAST_PROBE_KEY) || 0);
    if (Date.now() - last < PROBE_INTERVAL_MS) return;
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
    }
  } catch {
    // всё ещё заблокировано
  }
}

export function getProxyStatus() {
  return { enabled: getProxyMode(), hosts: PROXY_HOSTS, forced: isForcedProxyHost() };
}

export function forceProxyMode(enabled: boolean) {
  setProxyMode(enabled);
}
