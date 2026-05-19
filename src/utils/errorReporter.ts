/**
 * errorReporter — глобальный сборщик сетевых ошибок клиента.
 *
 * Патчит window.fetch один раз. При любой fetch-ошибке (network, CORS, timeout)
 * или non-2xx-ответе формирует событие и батчем шлёт в edge function
 * log-client-error. Из батча исключаются сами вызовы лог-функции и
 * аналитика/реклама, чтобы не получить рекурсию.
 *
 * Никаких PII не отправляется:
 *  - query string обрезается;
 *  - request body не сохраняется;
 *  - response — только первые ~2 КБ как сниппет (текстовые ответы).
 */

const FN_NAME = "log-client-error";
const PROJECT_ID =
  (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID ||
  "atxwvjxbqjgkbjlhsdch";
const FN_ENDPOINT = `https://${PROJECT_ID}.supabase.co/functions/v1/${FN_NAME}`;
const ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY || "";

const FLUSH_INTERVAL_MS = 5000;
const MAX_BATCH = 10;
const MAX_BUFFER = 50;
const DEDUP_WINDOW_MS = 10_000;
const STORAGE_KEY = "sintagma:err-buffer";

type ErrorKind =
  | "http_4xx"
  | "http_5xx"
  | "network_error"
  | "cors_error"
  | "timeout"
  | "aborted"
  | "unknown";

interface ErrorEvent {
  occurred_at: string;
  method: string;
  url_host: string;
  url_path: string;
  status: number | null;
  error_kind: ErrorKind;
  error_message: string | null;
  response_snippet: string | null;
  response_content_type: string | null;
  duration_ms: number;
  page_url: string;
  page_route: string;
  user_agent: string;
  proxy_used: boolean;
  app_version: string;
  occurrence_count: number;
}

let buffer: ErrorEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let installed = false;

function loadPersistedBuffer() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      buffer.push(...arr.slice(0, MAX_BUFFER));
    }
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function persistBuffer() {
  try {
    if (buffer.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buffer.slice(-MAX_BUFFER)));
  } catch {
    // ignore (quota)
  }
}

function dedupKey(ev: ErrorEvent): string {
  return `${ev.method}|${ev.url_host}|${ev.url_path}|${ev.status}|${ev.error_kind}`;
}

function enqueue(ev: ErrorEvent) {
  // Дедуп: одинаковая ошибка в окне 10с → увеличиваем счётчик
  const now = Date.now();
  for (let i = buffer.length - 1; i >= 0; i--) {
    const existing = buffer[i];
    const age = now - new Date(existing.occurred_at).getTime();
    if (age > DEDUP_WINDOW_MS) break;
    if (dedupKey(existing) === dedupKey(ev)) {
      existing.occurrence_count += 1;
      return;
    }
  }

  if (buffer.length >= MAX_BUFFER) {
    buffer.shift();
  }
  buffer.push(ev);

  if (buffer.length >= MAX_BATCH) {
    void flush();
  } else if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush();
    }, FLUSH_INTERVAL_MS);
  }
}

let originalFetch: typeof fetch | null = null;

async function flush(useBeacon = false): Promise<void> {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, MAX_BATCH);
  const payload = JSON.stringify({ events: batch });

  // Найдём JWT из supabase-сессии в localStorage (если есть)
  let authHeader: string | undefined;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const token = parsed?.access_token || parsed?.currentSession?.access_token;
      if (token) {
        authHeader = `Bearer ${token}`;
        break;
      }
    }
  } catch {
    // ignore
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: ANON_KEY,
  };
  if (authHeader) headers.Authorization = authHeader;

  if (useBeacon && typeof navigator.sendBeacon === "function") {
    // sendBeacon не принимает кастомные заголовки — отправляем как Blob,
    // токен в этом случае не передаётся (анонимная запись)
    try {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon(FN_ENDPOINT, blob);
      return;
    } catch {
      // fallback
    }
  }

  try {
    const fn = originalFetch || window.fetch.bind(window);
    await fn(FN_ENDPOINT, {
      method: "POST",
      headers,
      body: payload,
      keepalive: true,
    });
  } catch {
    // Не зацикливаемся: если лог не доставился — кладём обратно в localStorage
    buffer.unshift(...batch);
    persistBuffer();
  }
}

function getHostAndPath(url: string): { host: string; path: string } {
  try {
    const u = new URL(url, window.location.origin);
    return { host: u.host, path: u.pathname };
  } catch {
    return { host: "", path: String(url).split("?")[0].slice(0, 1024) };
  }
}

function isOurOwnLogEndpoint(url: string): boolean {
  return url.includes(FN_NAME);
}

function isIgnorable(url: string): boolean {
  // Не логируем аналитику, метрики, рекламу — они шумят и не критичны
  return (
    isOurOwnLogEndpoint(url) ||
    url.includes("mc.yandex") ||
    url.includes("googletagmanager") ||
    url.includes("google-analytics") ||
    url.includes("googleadservices") ||
    url.includes("doubleclick") ||
    url.includes("/rest/v1/client_error_logs")
  );
}

function classifyHttp(status: number): ErrorKind {
  if (status >= 500) return "http_5xx";
  if (status >= 400) return "http_4xx";
  return "unknown";
}

function classifyError(err: unknown, url: string): ErrorKind {
  if (!err) return "unknown";
  const msg = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "";

  if (name === "AbortError") return "aborted";
  if (/timeout/i.test(msg)) return "timeout";
  if (/cors/i.test(msg)) return "cors_error";
  // Cross-origin без CORS-заголовков → TypeError 'Failed to fetch'
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg)) {
    // Если запрос не same-origin и без CORS → вероятнее cors_error
    try {
      const u = new URL(url, window.location.origin);
      if (u.origin !== window.location.origin) return "cors_error";
    } catch {
      // ignore
    }
    return "network_error";
  }
  return "network_error";
}

async function snippetFromResponse(resp: Response): Promise<{ snippet: string | null; ct: string | null }> {
  const ct = resp.headers.get("content-type");
  if (!ct) return { snippet: null, ct: null };
  // Только текстовые/json — бинарь не читаем
  if (!/text|json|xml|html/i.test(ct)) return { snippet: null, ct };
  try {
    const cloned = resp.clone();
    const txt = await cloned.text();
    return { snippet: txt.slice(0, 2048), ct };
  } catch {
    return { snippet: null, ct };
  }
}

function buildEvent(params: {
  url: string;
  method: string;
  status: number | null;
  errorKind: ErrorKind;
  errorMessage: string | null;
  responseSnippet: string | null;
  responseCT: string | null;
  durationMs: number;
}): ErrorEvent {
  const { host, path } = getHostAndPath(params.url);
  const proxyUsed =
    path.startsWith("/sb-api") ||
    path.startsWith("/sb-functions") ||
    path.startsWith("/sb-storage") ||
    host.startsWith("api.xn--80aaiswd0ak");
  return {
    occurred_at: new Date().toISOString(),
    method: params.method.toUpperCase().slice(0, 16),
    url_host: host,
    url_path: path,
    status: params.status,
    error_kind: params.errorKind,
    error_message: params.errorMessage ? params.errorMessage.slice(0, 2048) : null,
    response_snippet: params.responseSnippet,
    response_content_type: params.responseCT,
    duration_ms: Math.max(0, Math.round(params.durationMs)),
    page_url: window.location.href.slice(0, 1024),
    page_route: window.location.pathname.slice(0, 256),
    user_agent: navigator.userAgent.slice(0, 512),
    proxy_used: proxyUsed,
    app_version: String((window as any).__BUILD_VERSION__ || "unknown").slice(0, 64),
    occurrence_count: 1,
  };
}

export function installErrorReporter() {
  if (installed) return;
  installed = true;

  loadPersistedBuffer();
  if (buffer.length > 0) {
    // Отправим хвост предыдущей сессии
    setTimeout(() => void flush(), 2000);
  }

  originalFetch = window.fetch.bind(window);
  const orig = originalFetch;

  window.fetch = async function patchedFetchForLogging(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;
    const method = (init?.method || (input instanceof Request ? input.method : "GET")) ?? "GET";

    if (isIgnorable(url)) {
      return orig(input as RequestInfo, init);
    }

    const startedAt = performance.now();
    try {
      const resp = await orig(input as RequestInfo, init);
      if (!resp.ok && resp.status >= 400) {
        const { snippet, ct } = await snippetFromResponse(resp);
        enqueue(
          buildEvent({
            url,
            method,
            status: resp.status,
            errorKind: classifyHttp(resp.status),
            errorMessage: resp.statusText || null,
            responseSnippet: snippet,
            responseCT: ct,
            durationMs: performance.now() - startedAt,
          })
        );
      }
      return resp;
    } catch (err) {
      const errorKind = classifyError(err, url);
      // AbortError не логируем — это нормальный поток (React Query cancel)
      if (errorKind !== "aborted") {
        enqueue(
          buildEvent({
            url,
            method,
            status: null,
            errorKind,
            errorMessage: err instanceof Error ? err.message : String(err),
            responseSnippet: null,
            responseCT: null,
            durationMs: performance.now() - startedAt,
          })
        );
      }
      throw err;
    }
  };

  // Сохраняем буфер при уходе со страницы / уходе во фон
  const flushOnHide = () => {
    if (buffer.length > 0) {
      void flush(true);
      persistBuffer();
    }
  };
  window.addEventListener("pagehide", flushOnHide);
  window.addEventListener("beforeunload", flushOnHide);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushOnHide();
  });

  // При возврате онлайн — попытка флаша
  window.addEventListener("online", () => {
    if (buffer.length > 0) void flush();
  });
}
