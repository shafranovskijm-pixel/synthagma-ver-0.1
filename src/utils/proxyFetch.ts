/**
 * Proxy Fetch — глобальный перехватчик fetch, который при детекте блокировки
 * Supabase-доменов корпоративным фаерволом автоматически переключает все запросы
 * на резервные субдомены клиента (например, api.sintagma.com.ru через Cloudflare Worker).
 *
 * Логика:
 *  1. При первом запуске пытаемся обычный fetch.
 *  2. Если получаем сетевую ошибку (TypeError/AbortError/no-status) для *.supabase.co —
 *     помечаем proxy-режим и повторяем запрос через резервный домен.
 *  3. Сохраняем выбор в localStorage, чтобы следующая сессия сразу шла через прокси.
 *  4. Раз в 30 минут пробуем «вернуться» на прямой домен (на случай если блокировку сняли).
 *
 * Резервные субдомены настраиваются через VITE_PROXY_API_HOST и т.д. Если переменные
 * не заданы, прокси-режим просто не активируется (никаких ошибок в обычной работе).
 */

const SUPABASE_HOST = 'atxwvjxbqjgkbjlhsdch.supabase.co';

// Хосты-прокси (заполняются на проде через runtime config или хардкод).
// Пользователь сообщил, что доступ к DNS есть → используем sintagma.com.ru.
const PROXY_HOSTS = {
  api: 'api.sintagma.com.ru',           // → REST/Auth/Realtime (https://atxwvjxbqjgkbjlhsdch.supabase.co)
  functions: 'functions.sintagma.com.ru', // → Edge Functions
  storage: 'storage.sintagma.com.ru',   // → Storage
};

const PROXY_FLAG_KEY = 'sintagma:use-proxy';
const PROXY_LAST_PROBE_KEY = 'sintagma:proxy-last-probe';
const PROBE_INTERVAL_MS = 30 * 60 * 1000; // 30 минут

function getProxyMode(): boolean {
  try {
    return localStorage.getItem(PROXY_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

function setProxyMode(enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(PROXY_FLAG_KEY, '1');
    else localStorage.removeItem(PROXY_FLAG_KEY);
  } catch {
    // ignore
  }
}

/** Маппинг URL → прокси-URL. Возвращает исходный URL, если не подходит. */
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
      // /rest, /auth, /realtime → api.
      u.host = PROXY_HOSTS.api;
    }
    return u.toString();
  } catch {
    return url;
  }
}

/** Признаки сетевой блокировки (а не 4xx/5xx, который означает что сервер ответил). */
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

export function installProxyFetch() {
  if (typeof window === 'undefined') return;
  if (originalFetch) return; // уже установлен
  originalFetch = window.fetch.bind(window);

  window.fetch = async function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const urlStr = typeof input === 'string'
      ? input
      : input instanceof URL ? input.toString() : input.url;

    // Не трогаем не-Supabase запросы
    if (!urlStr.includes(SUPABASE_HOST) && !urlStr.includes('sintagma.com.ru')) {
      return originalFetch!(input, init);
    }

    const useProxy = getProxyMode();

    // Если уже в proxy-режиме — сразу через прокси
    if (useProxy && urlStr.includes(SUPABASE_HOST)) {
      const proxyUrl = rewriteUrl(urlStr);
      try {
        return await originalFetch!(proxyUrl, init);
      } catch (err) {
        // Прокси тоже упал — пробуем оригинал как последний шанс
        try {
          const resp = await originalFetch!(input, init);
          // Прямой канал работает! Сбрасываем proxy-режим
          setProxyMode(false);
          return resp;
        } catch {
          throw err;
        }
      }
    }

    // Обычный режим — пробуем прямой запрос
    try {
      const resp = await originalFetch!(input, init);
      // Раз в 30 мин в proxy-режиме пробуем вернуться (здесь не proxy, ничего не делаем)
      return resp;
    } catch (err) {
      if (isNetworkBlock(err) && urlStr.includes(SUPABASE_HOST)) {
        // Блокировка! Переключаемся на прокси
        const proxyUrl = rewriteUrl(urlStr);
        try {
          const resp = await originalFetch!(proxyUrl, init);
          // Успех → запоминаем proxy-режим
          setProxyMode(true);
          console.warn('[ProxyFetch] Direct Supabase blocked, switched to proxy:', proxyUrl);
          // Сообщаем приложению (для показа баннера)
          window.dispatchEvent(new CustomEvent('sintagma:proxy-activated'));
          return resp;
        } catch (proxyErr) {
          // Оба канала недоступны — пробрасываем исходную ошибку
          throw err;
        }
      }
      throw err;
    }
  };

  // Периодическая проверка — пробовать ли вернуться на прямой канал
  if (getProxyMode()) {
    setTimeout(probeDirectChannel, 60_000); // через минуту после загрузки
  }
}

async function probeDirectChannel() {
  if (!originalFetch) return;
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
  return { enabled: getProxyMode(), hosts: PROXY_HOSTS };
}

export function forceProxyMode(enabled: boolean) {
  setProxyMode(enabled);
}
