/**
 * Cloudflare Worker — полный прокси Sintagma:
 *  • api/functions/storage.sintagma.com.ru → Supabase (как раньше)
 *  • app.sintagma.com.ru (или sintagma.com.ru) → весь фронтенд (Lovable Pages)
 *
 * Скопируйте код в Cloudflare Workers (Save & Deploy) и привяжите Custom Domains:
 *   • api.sintagma.com.ru        → Supabase REST/Auth/Realtime
 *   • functions.sintagma.com.ru  → Edge Functions
 *   • storage.sintagma.com.ru    → Storage
 *   • app.sintagma.com.ru        → весь сайт (фронтенд)
 *
 * Если хотите, чтобы корень sintagma.com.ru сразу шёл на сайт — привяжите этот же
 * Worker к домену sintagma.com.ru (он опознается по hostname в SITE_HOSTS).
 */

export const CLOUDFLARE_WORKER_CODE = `// Cloudflare Worker — Sintagma Full Proxy (API + сайт)

const SUPABASE_HOST = 'atxwvjxbqjgkbjlhsdch.supabase.co';
const SITE_ORIGIN_HOST = 'synthagma-bloom.lovable.app'; // источник фронта

// Хосты, которые проксируют API
const API_HOST_MAP = {
  'api.sintagma.com.ru':       SUPABASE_HOST,
  'functions.sintagma.com.ru': SUPABASE_HOST,
  'storage.sintagma.com.ru':   SUPABASE_HOST,
};

// Хосты, на которых отдаётся сам сайт (фронтенд)
const SITE_HOSTS = new Set([
  'app.sintagma.com.ru',
  'sintagma.com.ru',
  'www.sintagma.com.ru',
  'xn--80aaiswd0ak.xn--p1ai',
  'www.xn--80aaiswd0ak.xn--p1ai',
]);

const ALLOWED_ORIGINS = [
  'https://sintagma.com.ru',
  'https://www.sintagma.com.ru',
  'https://app.sintagma.com.ru',
  'https://synthagma-bloom.lovable.app',
  'https://xn--80aaiswd0ak.xn--p1ai',
  'https://www.xn--80aaiswd0ak.xn--p1ai',
];

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version, accept, accept-profile, content-profile, prefer, range, x-upsert, tus-resumable, upload-length, upload-metadata, upload-offset, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Expose-Headers': 'content-range, content-length, x-total-count, tus-resumable, upload-offset, location',
    'Access-Control-Max-Age': '86400',
  };
}

// ===== Прокси API (Supabase) =====
async function proxyApi(request, url, origin) {
  const target = API_HOST_MAP[url.hostname];
  url.hostname = target;
  url.protocol = 'https:';
  url.port = '';

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.set('host', target);

  const proxied = new Request(url.toString(), {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
  });

  let resp;
  try {
    resp = await fetch(proxied);
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Proxy fetch failed', detail: String(err) }), {
      status: 502,
      headers: { ...corsHeaders(origin), 'content-type': 'application/json' },
    });
  }

  const respHeaders = new Headers(resp.headers);
  const cors = corsHeaders(origin);
  Object.entries(cors).forEach(([k, v]) => respHeaders.set(k, v));

  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers: respHeaders,
  });
}

// ===== Прокси сайта (фронт) =====
async function proxySite(request, url) {
  // Меняем хост на источник фронта
  const upstream = new URL(url.toString());
  upstream.hostname = SITE_ORIGIN_HOST;
  upstream.protocol = 'https:';
  upstream.port = '';

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.set('host', SITE_ORIGIN_HOST);
  // Чтобы апстрим не возвращал brotli, который мы не сможем переписать
  headers.set('accept-encoding', 'gzip');

  let upstreamReq = new Request(upstream.toString(), {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
  });

  let resp;
  try {
    resp = await fetch(upstreamReq);
  } catch (err) {
    return new Response('Upstream fetch failed: ' + String(err), { status: 502 });
  }

  // SPA-фоллбэк: если 404 на не-ассете — отдадим index.html
  const path = url.pathname;
  const looksLikeAsset = /\\.[a-zA-Z0-9]{1,8}$/.test(path);
  if (resp.status === 404 && !looksLikeAsset) {
    const idxUrl = new URL('https://' + SITE_ORIGIN_HOST + '/index.html');
    const idxHeaders = new Headers(headers);
    idxHeaders.set('host', SITE_ORIGIN_HOST);
    try {
      resp = await fetch(idxUrl.toString(), { headers: idxHeaders });
    } catch (_) { /* keep original */ }
  }

  const ct = (resp.headers.get('content-type') || '').toLowerCase();
  const respHeaders = new Headers(resp.headers);
  // Убираем заголовки апстрима, которые могут мешать
  respHeaders.delete('content-encoding');
  respHeaders.delete('content-length');
  respHeaders.delete('transfer-encoding');
  // Не позволяем апстриму ставить свой CSP, который может ломать прокси
  respHeaders.delete('content-security-policy');
  respHeaders.delete('content-security-policy-report-only');

  // Переписываем абсолютные ссылки на Lovable-домен в HTML/JS/CSS,
  // чтобы клиент тоже не лез напрямую на synthagma-bloom.lovable.app
  const isText = ct.includes('text/html') || ct.includes('javascript') || ct.includes('css') || ct.includes('json');
  if (isText) {
    let body = await resp.text();
    body = body
      .replaceAll('https://' + SITE_ORIGIN_HOST, 'https://' + url.hostname)
      .replaceAll('//' + SITE_ORIGIN_HOST, '//' + url.hostname);
    return new Response(body, { status: resp.status, statusText: resp.statusText, headers: respHeaders });
  }

  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers: respHeaders,
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    // Preflight для API
    if (request.method === 'OPTIONS' && API_HOST_MAP[url.hostname]) {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (API_HOST_MAP[url.hostname]) {
      return proxyApi(request, url, origin);
    }

    if (SITE_HOSTS.has(url.hostname)) {
      return proxySite(request, url);
    }

    return new Response('Not configured for host: ' + url.hostname, { status: 404 });
  },
};
`;
