/**
 * Cloudflare Worker для прокси Supabase через собственный домен.
 * Скопируйте весь этот код в Cloudflare Workers и привяжите к 3 субдоменам.
 *
 * Скопировать как text/plain в буфер можно прямо из этого файла,
 * содержимое также показывается на странице /admin → "Прокси-настройка".
 */

export const CLOUDFLARE_WORKER_CODE = `// Cloudflare Worker — Sintagma Supabase Proxy
// Деплой: создайте Worker в Cloudflare → вставьте этот код → Save & Deploy
// Затем привяжите 3 кастомных домена (Triggers → Custom Domains):
//   • api.sintagma.com.ru
//   • functions.sintagma.com.ru
//   • storage.sintagma.com.ru

const SUPABASE_HOST = 'atxwvjxbqjgkbjlhsdch.supabase.co';

const HOST_MAP = {
  'api.sintagma.com.ru':       SUPABASE_HOST,
  'functions.sintagma.com.ru': SUPABASE_HOST,
  'storage.sintagma.com.ru':   SUPABASE_HOST,
};

const ALLOWED_ORIGINS = [
  'https://sintagma.com.ru',
  'https://www.sintagma.com.ru',
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

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const target = HOST_MAP[url.hostname];
    if (!target) {
      return new Response('Not configured', { status: 404 });
    }

    // Подменяем хост, путь/query сохраняем
    url.hostname = target;
    url.protocol = 'https:';
    url.port = '';

    // Копируем заголовки, выкидываем Host
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

    // Возвращаем ответ с CORS-заголовками
    const respHeaders = new Headers(resp.headers);
    const cors = corsHeaders(origin);
    Object.entries(cors).forEach(([k, v]) => respHeaders.set(k, v));

    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: respHeaders,
    });
  },
};
`;
