## Что у нас по факту

- **Фронт:** Timeweb App Platform (Caddy, не Nginx) — `shafranovskijm-pixel-synthagma-bloom-e52ceedb-4ffa.twc1.net`. Кастомный домен — `синтагма.рф` (`xn--80aaiswd0ak.xn--p1ai`).
- **VDS:** Timeweb VDS, Ubuntu 24.04, IP `176.98.178.203` — пустой, чистый.
- **Цель:** Обойти блокировку `*.supabase.co` у пользователей в РФ.

## Развилка — какая схема

На App Platform нельзя править веб-сервер (Caddy управляется Timeweb), значит same-origin прокси на самом фронт-домене мы сделать не можем. Поэтому VDS — отдельный домен только для прокси.

```text
Браузер пользователя
  │
  │ 1. сам сайт ──────► xn--80aaiswd0ak.xn--p1ai  (Timeweb App)
  │ 2. supabase API ───► api.sintagma.com.ru     (наш VDS, Nginx)
  ▼                          │
                             ▼
                   atxwvjxbqjgkbjlhsdch.supabase.co
```

Это значит: код фронта в `proxyFetch.ts` нужно немного дополнить — сейчас он пишет запросы на `window.location.origin` (same-origin), а нам надо чтобы с фронт-домена он ходил на **другой** домен `https://api.sintagma.com.ru`.

## Шаги

### Шаг 1. DNS

В регистраторе `sintagma.com.ru` добавить:

```
api    A    176.98.178.203    TTL 300
```

Если запись `api` уже была от прежней Cloudflare-схемы — заменить значение.

### Шаг 2. Подключиться к VDS по SSH

```
ssh root@176.98.178.203
```

Пароль — из панели Timeweb. На первом входе сменить.

### Шаг 3. Базовая настройка Ubuntu (один блок команд)

- `apt update && apt upgrade -y`
- Установить Nginx, certbot, ufw, fail2ban
- ufw открыть только 22 / 80 / 443
- Включить fail2ban для SSH

### Шаг 4. Положить Nginx-конфиг

Создать `/etc/nginx/sites-available/api.sintagma.com.ru.conf` с:

- `server_name api.sintagma.com.ru;`
- `listen 80;` (потом certbot сам добавит 443)
- внутри — содержимое из `src/utils/nginxProxyConfig.ts` (4 location: `/sb-api/`, `/sb-functions/`, `/sb-storage/`, `/sb-realtime`)
- **CORS-заголовки** на каждый location: `Access-Control-Allow-Origin: https://xn--80aaiswd0ak.xn--p1ai` (и `https://sintagma.com.ru`, и preview-домен `*.twc1.net`) + обработка preflight `OPTIONS`. Это критично — иначе браузер не разрешит cross-origin запросы с фронта на api.

Активировать: symlink в `sites-enabled`, `nginx -t`, `systemctl reload nginx`.

### Шаг 5. Получить SSL

```
certbot --nginx -d api.sintagma.com.ru
```

### Шаг 6. Доработать `src/utils/proxyFetch.ts` (правка кода)

Сейчас перехватчик переписывает URL на `window.location.origin + /sb-api/...`. Надо добавить переменную `PROXY_BASE_URL`:

```text
PROXY_BASE_URL = 'https://api.sintagma.com.ru'
rewriteUrl: → PROXY_BASE_URL + '/sb-api/' + path
rewriteWsUrl: → 'wss://api.sintagma.com.ru/sb-realtime' + ...
```

И включить FORCE_PROXY на всех фронт-доменах (там уже есть `xn--80aaiswd0ak.xn--p1ai`, `*.twc1.net`).

### Шаг 7. Проверка

1. `curl https://api.sintagma.com.ru/sb-api/auth/v1/health` — должен вернуть JSON GoTrue.
2. Открыть `синтагма.рф` без VPN из РФ-сети — логин, курсы, видео, чат должны работать.
3. На странице `/admin/proxy-setup` индикатор должен показывать «АКТИВЕН».
4. В DevTools → Network: запросы к Supabase идут на `api.sintagma.com.ru`, а не `atxwvjxbqjgkbjlhsdch.supabase.co`.

### Шаг 8. (потом) Безопасность сервера

После того как всё заработает:

- SSH по ключу, отключить вход по паролю
- Автообновления безопасности (`unattended-upgrades`)
- Мониторинг — простой скрипт `health.sh` через cron + Telegram-уведомление при падении

## Технические детали

- **Nginx + SNI**: `proxy_ssl_server_name on; proxy_ssl_name atxwvjxbqjgkbjlhsdch.supabase.co;` — обязательно, иначе Supabase отдаст 526.
- **WebSocket**: `proxy_http_version 1.1; Upgrade/Connection: upgrade; proxy_read_timeout 3600s` для realtime.
- **CORS preflight**: на каждый location нужен `if ($request_method = 'OPTIONS') { ... return 204; }` с заголовками `Access-Control-Allow-Origin/Methods/Headers/Credentials`.
- **`Allow-Origin`**: динамически из whitelist (3 домена) — нельзя `*` потому что используем `Authorization` + credentials.
- **`Access-Control-Allow-Headers`**: `authorization, apikey, content-type, x-client-info, x-supabase-*` — всё что шлёт Supabase JS SDK.
- **`client_max_body_size 200m`** — для загрузок файлов в Storage и видео.
- **resolver 1.1.1.1 8.8.8.8** — чтобы Nginx разрешал имя Supabase.
- **Логи Nginx** — `/var/log/nginx/access.log` и `error.log`. Полезно следить первые сутки.

## План на сегодня

1. Я подготовлю **финальный Nginx-конфиг** с CORS под наши 3 фронт-домена + правку `proxyFetch.ts` (добавлю `PROXY_BASE_URL` и опубликую). Это — режим build (после утверждения этого плана).
2. Параллельно пришлю вам **готовый набор SSH-команд** одним блоком — копируете, вставляете в терминал, всё ставится.
3. Когда сервер заработает — проверим вместе по чек-листу из шага 7.

Если согласны со схемой `api.sintagma.com.ru` (один домен под все 4 префикса, CORS с фронта) — апрувите план, и я перехожу к выполнению.

Если хотите 3 отдельных поддомена `api.` / `functions.` / `storage.` (как было в Cloudflare-варианте) — скажите, переделаю под этот вариант. Но это лишняя сложность без пользы — рекомендую один.