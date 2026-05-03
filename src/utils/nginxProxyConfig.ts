/**
 * Готовый Nginx-конфиг для reverse proxy на Timeweb / VPS.
 * Размещается на том же домене, что и фронтенд (same-origin).
 *
 * Префиксы должны точно совпадать с SAME_ORIGIN_PREFIX в src/utils/proxyFetch.ts:
 *   /sb-api/        → https://<supabase>/                (auth/rest/realtime HTTP)
 *   /sb-functions/  → https://<supabase>/functions/v1/
 *   /sb-storage/    → https://<supabase>/storage/v1/
 *   /sb-realtime    → wss://<supabase>/realtime/v1/websocket  (WebSocket)
 *
 * Замените SUPABASE_HOST на ваш реальный backend-хост, если он отличается.
 */

export const NGINX_PROXY_CONFIG = `# === Sintagma reverse proxy (Timeweb/VPS) ===
# Положите этот блок ВНУТРЬ существующего server { ... } фронтенда,
# который уже отдаёт сам сайт (React-сборку).
#
# Backend Supabase host:
set $sb_host "atxwvjxbqjgkbjlhsdch.supabase.co";

# Резолвер нужен для проксирования на внешний хост по имени
resolver 1.1.1.1 8.8.8.8 ipv6=off valid=300s;
resolver_timeout 5s;

# Большие заголовки/тела (загрузки файлов, JWT)
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

# 1) REST / Auth / Realtime HTTP — /sb-api/ → /
location /sb-api/ {
    proxy_pass https://$sb_host/;
}

# 2) Edge Functions — /sb-functions/ → /functions/v1/
location /sb-functions/ {
    proxy_pass https://$sb_host/functions/v1/;
}

# 3) Storage — /sb-storage/ → /storage/v1/
location /sb-storage/ {
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
`;
