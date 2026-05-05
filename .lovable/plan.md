
# План: синтагма.рф без VPN, без sintagma.com.ru и без Cloudflare

## Текущая картина (как сейчас работает)

```text
Браузер (РФ, без VPN)
   │
   ▼
синтагма.рф  ──► Timeweb App (деплой с GitHub, фронтенд)
   │
   │  фронт делает запросы к VITE_SUPABASE_URL
   ▼
api.sintagma.com.ru  ──► Cloudflare DNS ──► (раньше) Worker / NGINX 176.98.178.203
   │
   ▼
atxwvjxbqjgkbjlhsdch.supabase.co  (Supabase, заблокирован в РФ напрямую)
```

Проблемы:
1. `VITE_SUPABASE_URL` указывает на `api.sintagma.com.ru` — это привязывает .рф к домену .com.ru.
2. DNS этого поддомена живёт в Cloudflare. Любая правка там ломает .рф.
3. Когда вы удалили запись/Worker в Cloudflare — .рф упал, хотя сам сайт деплоится отдельно.

## Цель

```text
Браузер (РФ, без VPN)
   │
   ▼
синтагма.рф  ──► Timeweb App (фронтенд, GitHub deploy)
   │
   │  все запросы к API
   ▼
api.синтагма.рф  ──► A-запись прямо на 176.98.178.203 (Timeweb VDS, NGINX)
   │
   ▼
atxwvjxbqjgkbjlhsdch.supabase.co
```

Никакого `sintagma.com.ru` и никакого Cloudflare в цепочке .рф.

## Что нужно сделать

### 1. DNS поддомена `api.синтагма.рф` (у регистратора .рф)

Там, где у вас сейчас управляется домен `синтагма.рф` (не Cloudflare — судя по тому, что .рф работает через Timeweb App, NS у Timeweb или у регистратора), добавить **одну A-запись**:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `api` | `176.98.178.203` | Auto |

Без проксирования, прямой A-record. Имя получится `api.синтагма.рф` (в punycode `api.xn--80aaiswd0ak.xn--p1ai`) — оба варианта валидны и резолвятся одинаково.

### 2. NGINX на VDS 176.98.178.203

Я возьму существующий конфиг `src/utils/nginxProxyConfig.ts` и сделаю отдельный server-block для `api.xn--80aaiswd0ak.xn--p1ai` (NGINX обязан слушать имя в punycode). Он будет:
- проксировать `/sb-api/`, `/sb-functions/`, `/sb-storage/`, `/sb-realtime` на Supabase;
- разрешать CORS для `https://синтагма.рф` (`xn--80aaiswd0ak.xn--p1ai`) и оставит совместимость для preview-доменов Lovable/Timeweb;
- получит SSL через `certbot --nginx -d api.xn--80aaiswd0ak.xn--p1ai`.

Старый блок для `api.sintagma.com.ru` можно либо удалить, либо оставить — на работу .рф он уже не влияет.

### 3. Переменные окружения проекта

В `.env` поменять:
```
VITE_SUPABASE_URL="https://api.xn--80aaiswd0ak.xn--p1ai"
```
(или человекочитаемый `https://api.синтагма.рф` — браузер сам приведёт к punycode; для .env лучше punycode, чтобы не было проблем с кодировкой).

`VITE_SUPABASE_PROJECT_ID` и `VITE_SUPABASE_PUBLISHABLE_KEY` остаются как есть.

### 4. Код фронтенда

В `src/utils/proxyFetch.ts` уже есть нужная логика — он подменяет `*.supabase.co` на same-origin `/sb-*` или на `PROXY_BASE_URL`. Чтобы он гарантированно использовал `api.синтагма.рф` и не зависел от текущего origin, я:
- задам `PROXY_BASE_URL = 'https://api.xn--80aaiswd0ak.xn--p1ai'`;
- включу `FORCE_PROXY_HOSTS_EXACT` для `xn--80aaiswd0ak.xn--p1ai` и `www.xn--80aaiswd0ak.xn--p1ai` — чтобы прокси-режим включался сразу, без ожидания ошибки.

Это значит: на синтагма.рф фронт всегда ходит через `api.синтагма.рф`, на остальных доменах (sintagma.com.ru, lovable.app) — напрямую в Supabase, как сейчас.

### 5. Cloudflare — что трогать

Ничего не трогаем в Cloudflare для зоны `sintagma.com.ru`. Поддомен `api.sintagma.com.ru` после миграции больше нигде в коде не используется — можно просто оставить запись пустой/удалить позже.

## Что вы делаете руками, а что я

| Шаг | Кто |
|---|---|
| Добавить A-запись `api → 176.98.178.203` у регистратора .рф | Вы |
| Положить новый NGINX-конфиг на VDS, выпустить SSL через certbot | Вы (по моей инструкции из обновлённого `nginxProxyConfig.ts`) |
| Обновить `.env` (`VITE_SUPABASE_URL`) | Я |
| Поправить `proxyFetch.ts` (PROXY_BASE_URL + FORCE_PROXY_HOSTS) | Я |
| Обновить `nginxProxyConfig.ts` под новый домен | Я |
| Обновить памятку в `mem://` про firewall-bypass-proxy | Я |

## Проверка после деплоя

1. Без VPN открыть `https://api.xn--80aaiswd0ak.xn--p1ai/` → должен вернуться `sintagma proxy ok`.
2. Открыть `https://синтагма.рф`, в DevTools → Network убедиться, что запросы идут на `api.xn--80aaiswd0ak.xn--p1ai`, а не на `*.supabase.co` и не на `*.sintagma.com.ru`.
3. Логин/регистрация работают без VPN.

## Один вопрос перед стартом

Поддомен лучше делать **на .рф напрямую** (`api.синтагма.рф`), как описано выше — это ваше требование. Подтвердите только: DNS домена `синтагма.рф` управляется у регистратора (например, RU-CENTER / reg.ru / Timeweb), а не в Cloudflare? Если в Cloudflare — нужно будет туда же добавить A-запись, других вариантов нет, но по вашему запросу — хочется полностью без Cloudflare, поэтому идеально перенести NS .рф к регистратору/Timeweb, если ещё не перенесено.

Если ответ «DNS не в Cloudflare» — план готов, можно приступать.
