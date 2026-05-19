# Что я помню про прокси на Timeweb

Да, всё помню. Схема такая:
- **Фронтенд** — Timeweb (deploy из GitHub), домены `sintagma.com.ru` и `синтагма.рф`.
- **Бэкенд** — Lovable Cloud (Supabase, хост `atxwvjxbqjgkbjlhsdch.supabase.co`).
- Для `синтагма.рф` Supabase у российских провайдеров заблокирован, поэтому мы подняли **отдельный VDS на Timeweb (IP `176.98.178.203`)** с **NGINX reverse-proxy** на домене `api.синтагма.рф` (punycode `api.xn--80aaiswd0ak.xn--p1ai`).
- В коде это `src/utils/proxyFetch.ts` (перехватчик fetch/WebSocket) + эталонный конфиг `src/utils/nginxProxyConfig.ts`.
- Префиксы: `/sb-api/`, `/sb-functions/`, `/sb-storage/`, `/sb-realtime`.
- Cloudflare и `sintagma.com.ru` в этой цепочке **не участвуют**.

# Диагноз ошибки «Ошибка загрузки документа / Failed to fetch»

Я проверил живой прокси `api.синтагма.рф`:

- Прокси работает (`HTTP 200`, SSL ок).
- На preflight `OPTIONS /sb-storage/object/student-documents/...` сервер отвечает `204`, **но** в `Access-Control-Allow-Headers` **нет** заголовков `x-upsert` и `cache-control`.

А клиент `@supabase/storage-js` при `.upload()` всегда шлёт `x-upsert` (и иногда `cache-control`). Браузер делает preflight, видит, что эти заголовки запрещены, и роняет запрос как «Failed to fetch». До самой Supabase / БД запрос даже не доходит.

То есть **конфиг NGINX на VDS устарел** относительно эталона в репозитории (`src/utils/nginxProxyConfig.ts`) — в эталоне `x-upsert` уже есть, а на сервере его нет.

# План правки (только на VDS Timeweb, код не трогаем)

Заходим по SSH на `176.98.178.203` под root и приводим конфиг прокси к актуальному виду.

## Вариант A — минимальная правка (быстро)

Открыть конфиг и в блоке `location /sb-storage/ { ... if ($request_method = OPTIONS) { ... } }` добавить в `Access-Control-Allow-Headers` два заголовка: `x-upsert` и `cache-control`.

```bash
sudo nano /etc/nginx/sites-available/api.sintagma-rf.conf
# найти Access-Control-Allow-Headers внутри location /sb-storage/
# дописать: , x-upsert, cache-control
sudo nginx -t && sudo systemctl reload nginx
```

## Вариант B — полностью переналить эталон (надёжнее)

Скопировать содержимое константы `NGINX_PROXY_CONFIG` из `src/utils/nginxProxyConfig.ts` целиком в `/etc/nginx/sites-available/api.sintagma-rf.conf` (заменить файл), затем:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Эталон уже содержит:
- `x-upsert`, `cache-control`, `range`, `tus-resumable`, `upload-*` в `Allow-Headers` для `/sb-storage/`,
- `client_max_body_size 200m`,
- корректный CORS для `синтагма.рф`, twc1.net, lovable.app, localhost.

## Проверка после правки

```bash
curl -I -X OPTIONS "https://api.xn--80aaiswd0ak.xn--p1ai/sb-storage/object/student-documents/test.pdf" \
  -H "Origin: https://xn--80aaiswd0ak.xn--p1ai" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,apikey,content-type,x-client-info,x-upsert,cache-control"
```

В ответе `Access-Control-Allow-Headers` должны появиться `x-upsert` и `cache-control`. После этого в кабинете Газукиной А. Н. на `синтагма.рф` загрузка паспорта/СНИЛС должна пройти без «Failed to fetch».

# Чего я НЕ трогаю в этом плане

- Код приложения (`StudentDocumentsUpload.tsx`, `proxyFetch.ts`, RLS, бакет `student-documents`) — там всё корректно, бакет существует, политики уже разрешают студенту INSERT/UPDATE/DELETE своих документов (это я добавлял в рамках задачи ПЭП).
- `sintagma.com.ru` и Cloudflare — без изменений.

# Технические детали (для меня/при отладке)

- Запрос клиента: `POST https://atxwvjxbqjgkbjlhsdch.supabase.co/storage/v1/object/student-documents/<uid>/passport_<ts>.png` с заголовками `authorization`, `apikey`, `x-client-info`, `x-upsert: false`, `content-type: multipart/form-data`.
- Перехватчик `proxyFetch` переписывает URL на `https://api.xn--80aaiswd0ak.xn--p1ai/sb-storage/object/student-documents/...`.
- Браузер шлёт preflight → NGINX отдаёт `Allow-Headers` без `x-upsert` → preflight fail → fetch ловит TypeError "Failed to fetch" → пользователь видит «Ошибка загрузки документа».

Если хочешь, после твоего апрува могу также добавить в `src/utils/nginxProxyConfig.ts` явный комментарий «при обновлении не забыть x-upsert/cache-control», чтобы в будущем не разъехалось.
