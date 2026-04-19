

## План: Заменить Kinescope Live на Яндекс Телемост в вебинарах

### Что я выяснил из документации
- **Telemost API** живёт по адресу `https://cloud-api.yandex.net/v1/telemost-api/conferences` и принимает обычный OAuth-токен Яндекса в заголовке `Authorization: OAuth <token>`.
- На создании конференции возвращаются:
  - `id`, `join_url` (ссылка для участников),
  - `live_stream.watch_url` — публичная страница просмотра трансляции (если включён `live_stream`),
  - SIP-параметры.
- Важное ограничение Яндекса: **API доступно только пользователям Яндекс 360 для бизнеса** (домен организации), а live-stream требует подходящего тарифа Яндекс 360.
- Нужный scope для нас: `telemost-api:conferences.create` (и при необходимости `.read`/`.update`).

Это значит: пользователю надо один раз получить личный OAuth-токен Яндекс 360 и вставить его в настройки — мы в edge-функции проксируем создание конференций по этому токену. Никакого собственного OAuth-callback не нужно: для серверных интеграций Яндекс рекомендует именно «токен в Authorization».

### Что меняется в продукте
1. В диалоге создания вебинара вместо `Kinescope Live (RTMP)` ставим:
   - `Яндекс Телемост` (по умолчанию) — мы сами создаём конференцию через API,
   - `Внешняя ссылка` (как было).
2. При создании «Телемост»-вебинара:
   - вызываем новую edge-функцию `telemost-create-conference`,
   - сохраняем в `webinars`:
     - `source_type = 'telemost'`,
     - `external_url = join_url`,
     - `embed_url = live_stream.watch_url` (если включён live_stream) или `join_url`,
     - метаданные конференции в `player_settings.telemost = { id, watch_url, join_url, sip_id }`.
3. У организации в кабинете появляется поле «OAuth-токен Яндекс 360» (хранится как секрет на бэкенде, не в `webinars`). Самый чистый вариант — **общий секрет проекта** `YANDEX_TELEMOST_OAUTH_TOKEN` в Lovable Cloud, который использует edge-функция. Это покрывает один аккаунт-владелец на школу. Если понадобится мультитенант — можно будет позже завести таблицу `organization_telemost_credentials`, но это уже сверх текущего запроса.
4. У студента и в просмотре уже есть универсальный рендер `embed_url` через iframe, поэтому `watch_url` Телемоста заработает без отдельной правки плеера.
5. Старые Kinescope-вебинары не ломаются — `source_type = 'kinescope_live'` оставляем как есть, просто его больше нельзя выбрать при создании.

### Технически
- **БД**: расширить CHECK на `source_type` для `webinars`, добавив `'telemost'`. Никаких новых таблиц не создаём.
- **Секреты**: один новый runtime-секрет `YANDEX_TELEMOST_OAUTH_TOKEN`. Запрошу его через `add_secret` после подтверждения.
- **Edge-функция `telemost-create-conference`**:
  - принимает `{ title, description, withLiveStream }`,
  - валидирует JWT (как остальные функции организации),
  - дергает `POST https://cloud-api.yandex.net/v1/telemost-api/conferences` с телом
    `{ access_level: "PUBLIC", live_stream: { access_level: "PUBLIC", title, description } }`,
  - возвращает `{ id, join_url, watch_url }`.
  - CORS как везде.
- **Фронт**:
  - `CreateWebinarDialog.tsx`: добавить вариант `telemost`, заменить ветку Kinescope при `sourceType === 'telemost'` — звать `telemost-create-conference`, заполнять `external_url`/`embed_url`/`player_settings`.
  - `WebinarsManager.tsx` и `StudentWebinarsList.tsx`: для `source_type === 'telemost'` показывать кнопки «Войти в Телемост» (`join_url`) и «Смотреть трансляцию» (`watch_url`, если есть).
  - Иконку оставляем камеру (как уже сделали).

### Проверка перед сдачей
1. Создаю Телемост-вебинар → в БД появляется запись с `external_url` и `embed_url`.
2. У организации есть кнопки «Войти» и «Смотреть».
3. У студента вебинар появляется в списке и открывается через iframe `watch_url` (или внешней ссылкой, если только `join_url`).
4. Старые Kinescope-вебинары продолжают работать без регрессий.
5. Если `YANDEX_TELEMOST_OAUTH_TOKEN` не задан или Яндекс ответит 402/403 — показываем понятную ошибку в toast.

### Что нужно от вас
Один раз получить персональный OAuth-токен Яндекс 360 для бизнеса по ссылке из доки:
`https://oauth.yandex.ru/authorize?response_type=token&client_id=65e062c9a30c4b8f86651dd464c17572`
(это DEBUG-клиент Телемоста из их же спецификации; для прод-режима потом можно завести своё OAuth-приложение).
После одобрения плана я попрошу вставить этот токен в защищённый секрет — он будет лежать на бэкенде и наружу не светиться.

### Файлы, которые буду менять/создавать
- `supabase/functions/telemost-create-conference/index.ts` (новая)
- миграция: расширить CHECK на `webinars.source_type`
- `src/components/organization/CreateWebinarDialog.tsx`
- `src/components/organization/WebinarsManager.tsx`
- `src/components/student/StudentWebinarsList.tsx`

