

# Сделать вебинары LiveKit реально пригодными для проведения «здесь и сейчас»

## Что есть сейчас (после изучения кода)

- **«Начать сейчас»** в `WebinarsManager.tsx` уже создаёт LiveKit-комнату через `livekit-create-room`, вставляет запись в `webinars` со статусом `live` и редиректит вас на `/webinar/:id/live` (страница `WebinarLive.tsx`) — **камера/микрофон работают, это проверено**.
- Страница `/webinar/:id/live` тянет токен через edge `livekit-issue-token`, открывает `LiveKitRoom` + `VideoConference` (полный UI LiveKit: сетка, чат, демонстрация экрана).
- Кнопка «копировать ссылку» в карточке (иконка Link) копирует только `embed_url || external_url` — **для LiveKit-вебинаров там пусто**, поэтому ничего не происходит, и непонятно, что вообще отправлять.
- Чтобы кто-то смог войти, его сейчас нужно: 1) зарегистрировать в системе, 2) открыть «Уч-ки» → «Добавить» и выбрать его руками, либо 3) привязать вебинар к курсу с активным зачислением. **Гостевого входа по ссылке нет вообще.**
- На карточке нет визуального признака «вот это live-вебинар, он идёт прямо сейчас, вот ссылка для участников».

То есть когда вы жмёте «вебинар» — открывается комната, но **отправить кому-то ссылку, чтобы он зашёл, нельзя**: либо он не в системе, либо edge-функция его отвергнет с 403.

## Что сделаю — 3 фазы

### Фаза 1. Гостевой вход по публичной ссылке (главное)

**База данных** (миграция):
- Добавить в `webinars`: `public_token TEXT UNIQUE` (генерируется при создании, 32-символьный nanoid), `allow_guests BOOLEAN DEFAULT true`, `guest_password TEXT NULL` (опционально).
- Триггер `BEFORE INSERT`: если `public_token IS NULL` — генерируем `encode(gen_random_bytes(16), 'hex')`.
- Бэкфилл существующих вебинаров.
- RLS: новая публичная политика `SELECT` для анонов на `webinars` **только** при условии `public_token = current_setting('request.jwt.claims', true)::json->>'webinar_token'` — но проще не открывать таблицу, а сделать одну read-only edge-функцию `webinar-public-info` (см. ниже). Так безопаснее.

**Edge-функции**:
- **Новая `webinar-public-info`** (`verify_jwt = false`): принимает `public_token` → возвращает `{ id, title, description, scheduled_at, status, source_type, allow_guests, requires_password }`. Без чувствительных полей (никаких `roomName`, `wsUrl`, `created_by`).
- **Доработать `livekit-issue-token`**: добавить ветку `if (body.publicToken)`. Если токен валиден и `allow_guests=true` (и пароль совпал, если задан) — выдаём JWT с **`canPublish:false, canSubscribe:true, canPublishData:true`** (гость только смотрит и пишет в чат). Identity = `guest_<random>`, name = `body.guestName || "Гость"`.
- Снять `verify_jwt` с `livekit-issue-token` — иначе анонимный гость не сможет дойти до функции. JWT-проверку оставить **только в коде**: если есть `publicToken` — пропускаем `getUser()`, иначе требуем авторизации как раньше.

**Фронтенд**:
- **Новая публичная страница** `/w/:token` (`src/pages/WebinarPublic.tsx`):
  - Не требует авторизации (добавляю в `publicRoutes`, не в `studentRoutes`).
  - Рисует обложку, название, описание вебинара (через `webinar-public-info`).
  - Если `status === 'live'` → форма «Ваше имя» (+ пароль, если задан) → кнопка **«Войти в эфир»** → монтирует тот же `LiveKitRoom`, что и `WebinarLive.tsx`, но с `video={false}, audio={false}` (только слушать).
  - Если `status === 'planned'` — отсчёт до начала, кнопка «Добавить в календарь» (.ics).
  - Если `status === 'ended'` — «Эфир завершён», ссылка на запись если есть.
- В `WebinarLive.tsx` (для хоста) добавить наверху мини-панель **«Поделиться эфиром»** с публичной ссылкой `https://<host>/w/<public_token>`, кнопкой «Скопировать», QR-кодом (через `qrcode.react`, уже в зависимостях, проверю).

### Фаза 2. Удобство хоста — карточка «В эфире прямо сейчас»

В `WebinarsManager.tsx`:
- Если есть live-вебинар — **наверху списка** показываю выделенную карточку «🔴 Сейчас в эфире: <название>» с тремя крупными кнопками:
  1. **«Войти как ведущий»** → `/webinar/:id/live`
  2. **«Скопировать публичную ссылку»** → `https://.../w/<token>` + toast
  3. **«Завершить эфир»** → `status='ended'`
- Кнопка иконкой Link на каждой LiveKit-карточке теперь копирует **публичную ссылку** (`/w/<token>`), а не пустой `embed_url`.
- Новый `ShareWebinarDialog` (открывается по той же иконке Link или новой кнопке «Поделиться»):
  - Публичная ссылка + кнопка копирования.
  - QR-код 200×200 для сканирования с телефона.
  - Toggle «Разрешить гостей без аккаунта» (`allow_guests`).
  - Поле «Пароль для входа (опционально)» (`guest_password`).
  - Подсказка: «Отправьте эту ссылку участникам в Telegram/WhatsApp/Email — они зайдут в один клик».

### Фаза 3. Мелкие фиксы UX

- В `CreateWebinarDialog` для `source_type='livekit'` после сохранения сразу показывать `ShareWebinarDialog` («Готово! Вот ссылка для участников»).
- В `EmbeddedWebinarPlayer` (LiveKit) для гостей не запрашивать камеру (`video={false}, audio={false}`).
- Кнопка «Войти в эфир» на карточке — `target="_blank"` для хоста (чтобы список вебинаров остался открыт).
- В `WebinarLive.tsx` индикатор **количества участников** (через `useParticipants()` из `@livekit/components-react`).

## Технические детали

| Файл | Изменение |
|---|---|
| миграция | `ALTER TABLE webinars ADD COLUMN public_token, allow_guests, guest_password` + trigger + backfill |
| `supabase/functions/webinar-public-info/index.ts` | **Новый** (verify_jwt=false), читает 1 запись по токену |
| `supabase/functions/livekit-issue-token/index.ts` | Ветка для `publicToken` без auth, проверка пароля, гостевой identity, ограниченные claims |
| `supabase/config.toml` | `[functions.webinar-public-info] verify_jwt=false`, `[functions.livekit-issue-token] verify_jwt=false` |
| `src/pages/WebinarPublic.tsx` | **Новая** публичная страница `/w/:token` |
| `src/routes/publicRoutes.tsx` | Регистрация `/w/:token` |
| `src/components/organization/ShareWebinarDialog.tsx` | **Новый** компонент с QR + ссылка + настройки |
| `src/components/organization/WebinarsManager.tsx` | Live-карточка наверху, обновление кнопки «копировать ссылку», подключение `ShareWebinarDialog` |
| `src/pages/WebinarLive.tsx` | Панель «Поделиться» вверху + счётчик участников |
| `src/components/webinars/EmbeddedWebinarPlayer.tsx` | Поддержка гостевого режима (без камеры/мика) |

## Безопасность

- Гостевой токен **не даёт права публиковать** (`canPublish:false`) — гость не сможет включить камеру/микрофон, только смотреть и писать в чат.
- Опциональный пароль защищает от утечки ссылки.
- `webinar-public-info` отдаёт только публичные поля (никаких `created_by`, `player_settings.roomName`, `organization_id`).
- Хост может в любой момент выключить `allow_guests` → старые ссылки перестают работать.
- Rate limiting на `livekit-issue-token` для гостевой ветки (10/мин с одного IP).

## Что вы получите сразу после деплоя

1. Жмёте **«Начать сейчас»** → попадаете в комнату как ведущий, наверху видна **публичная ссылка** `sintagma.com.ru/w/abc123…` и QR-код.
2. Копируете ссылку, отправляете в WhatsApp/Telegram любому человеку (даже не зарегистрированному).
3. Он открывает ссылку → видит обложку и название → вводит имя → попадает в эфир как зритель.
4. В чате LiveKit можно общаться, поднимать руку (если включить в будущем). Хост видит счётчик «В эфире: 12».
5. Нажимаете **«Завершить эфир»** → все отключаются.

## Чего НЕ делаю в этом плане

- Не делаю запись эфира на стороне LiveKit (это отдельный egress-pipeline, обсудим потом).
- Не делаю «поднять руку» / выдачу слова гостям — гости только смотрят (можно добавить позже отдельной кнопкой хоста «дать микрофон»).
- Не трогаю Kinescope-вебинары — они работают по своей схеме через RTMP.

