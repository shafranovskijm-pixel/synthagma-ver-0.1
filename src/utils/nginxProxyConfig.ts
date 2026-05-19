/**
 * Готовый Nginx-конфиг для reverse proxy на отдельном VDS Timeweb (176.98.178.203).
 *
 * Назначение: обход блокировки *.supabase.co в РФ без VPN для домена синтагма.рф.
 * Полностью независим от sintagma.com.ru и Cloudflare.
 *
 * Домен: api.синтагма.рф  (punycode: api.xn--80aaiswd0ak.xn--p1ai)
 * DNS: одна A-запись `api → 176.98.178.203` у регистратора .рф (Timeweb/reg.ru/...).
 *
 * Префиксы должны точно совпадать с SAME_ORIGIN_PREFIX в src/utils/proxyFetch.ts:
 *   /sb-api/        → https://<supabase>/                (auth/rest HTTP)
 *   /sb-functions/  → https://<supabase>/functions/v1/
 *   /sb-storage/    → https://<supabase>/storage/v1/
 *   /sb-realtime    → wss://<supabase>/realtime/v1/websocket
 *
 * Установка SSL:
 *   sudo certbot --nginx -d api.xn--80aaiswd0ak.xn--p1ai
 *   (домен передавать ИМЕННО в punycode — Let's Encrypt IDN не понимает)
 *
 * ВАЖНО при обновлении конфига на VDS:
 *   В location /sb-storage/ в Access-Control-Allow-Headers ОБЯЗАТЕЛЬНО должны
 *   присутствовать `x-upsert` и `cache-control` — иначе supabase-js .upload()
 *   падает с "Failed to fetch" на preflight (браузер не пропускает запрос).
 *   Также нужны `range`, `tus-resumable`, `upload-length`, `upload-metadata`,
 *   `upload-offset` для TUS-аплоадов больших файлов.
 */

export const NGINX_PROXY_CONFIG = `# === Sintagma reverse proxy для синтагма.рф ===
# /etc/nginx/sites-available/api.sintagma-rf.conf
# ln -s /etc/nginx/sites-available/api.sintagma-rf.conf /etc/nginx/sites-enabled/
# certbot --nginx -d api.xn--80aaiswd0ak.xn--p1ai

map $http_origin $cors_origin {
    default "";
    # синтагма.рф (punycode) — основной домен
    "~^https?://(www\\.)?xn--80aaiswd0ak\\.xn--p1ai$"     $http_origin;
    # preview / staging
    "~^https?://[a-z0-9-]+\\.twc1\\.net$"                  $http_origin;
    "~^https?://[a-z0-9-]+\\.lovable\\.app$"               $http_origin;
    "~^https?://[a-z0-9-]+\\.lovableproject\\.com$"        $http_origin;
    "~^http://localhost(:[0-9]+)?$"                       $http_origin;
}

server {
    listen 80;
    listen [::]:80;
    # ВАЖНО: nginx понимает только punycode
    server_name api.xn--80aaiswd0ak.xn--p1ai;

    # Backend — Supabase
    set $sb_host "atxwvjxbqjgkbjlhsdch.supabase.co";

    resolver 1.1.1.1 8.8.8.8 ipv6=off valid=300s;
    resolver_timeout 5s;

    client_max_body_size 200m;
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_http_version 1.1;
    proxy_set_header Host $sb_host;
    proxy_ssl_server_name on;
    proxy_ssl_name $sb_host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;

    # Скрываем CORS-заголовки от Supabase, чтобы не было дублей
    proxy_hide_header Access-Control-Allow-Origin;
    proxy_hide_header Access-Control-Allow-Credentials;
    proxy_hide_header Access-Control-Allow-Methods;
    proxy_hide_header Access-Control-Allow-Headers;
    proxy_hide_header Access-Control-Allow-Expose-Headers;
    proxy_hide_header Access-Control-Expose-Headers;
    proxy_hide_header Access-Control-Max-Age;

    # 1) REST / Auth — /sb-api/ → /
    location /sb-api/ {
        if ($request_method = OPTIONS) {
            add_header Access-Control-Allow-Origin  $cors_origin always;
            add_header Access-Control-Allow-Credentials "true" always;
            add_header Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS" always;
            add_header Access-Control-Allow-Headers "authorization, apikey, content-type, x-client-info, x-supabase-api-version, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, prefer, accept-profile, content-profile, range, if-match, if-none-match, x-upsert" always;
            add_header Access-Control-Max-Age 3600 always;
            add_header Content-Length 0;
            add_header Content-Type text/plain;
            return 204;
        }
        add_header Access-Control-Allow-Origin  $cors_origin always;
        add_header Access-Control-Allow-Credentials "true" always;
        add_header Access-Control-Expose-Headers "content-range, content-length, x-supabase-api-version" always;
        proxy_pass https://$sb_host/;
    }

    # 2) Edge Functions — /sb-functions/ → /functions/v1/
    location /sb-functions/ {
        if ($request_method = OPTIONS) {
            add_header Access-Control-Allow-Origin  $cors_origin always;
            add_header Access-Control-Allow-Credentials "true" always;
            add_header Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS" always;
            add_header Access-Control-Allow-Headers "authorization, apikey, content-type, x-client-info, x-supabase-api-version, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version" always;
            add_header Access-Control-Max-Age 3600 always;
            return 204;
        }
        add_header Access-Control-Allow-Origin  $cors_origin always;
        add_header Access-Control-Allow-Credentials "true" always;
        proxy_pass https://$sb_host/functions/v1/;
    }

    # 3) Storage — /sb-storage/ → /storage/v1/
    location /sb-storage/ {
        if ($request_method = OPTIONS) {
            add_header Access-Control-Allow-Origin  $cors_origin always;
            add_header Access-Control-Allow-Credentials "true" always;
            add_header Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS" always;
            add_header Access-Control-Allow-Headers "authorization, apikey, content-type, x-client-info, x-upsert, cache-control, range, tus-resumable, upload-length, upload-metadata, upload-offset" always;
            add_header Access-Control-Max-Age 3600 always;
            return 204;
        }
        add_header Access-Control-Allow-Origin  $cors_origin always;
        add_header Access-Control-Allow-Credentials "true" always;
        add_header Access-Control-Expose-Headers "content-range, content-length, etag, tus-resumable, upload-offset, upload-length" always;
        proxy_pass https://$sb_host/storage/v1/;
    }

    # 4) Realtime WebSocket — /sb-realtime → /realtime/v1/websocket
    location = /sb-realtime {
        proxy_pass https://$sb_host/realtime/v1/websocket;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $sb_host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # health
    location = / {
        return 200 "sintagma proxy ok\\n";
        add_header Content-Type text/plain;
    }
}
`;
