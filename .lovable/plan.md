
## План: LiveKit Cloud для вебинаров + AI-преподаватель + полное удаление Яндекса

### Что делаем

1. **LiveKit Cloud** (не свой VPS — у вас уже есть проект `sintagma-h5kuy8k3.livekit.cloud`, бесплатный тариф включает 1000 AI-минут/мес и до 100 одновременных участников). Используем готовое облако — никаких серверов, никакого админства.
2. **Вебинары на LiveKit** — встроенный плеер прямо в платформе.
3. **AI-преподаватель** — заглушка-карточка рядом с «3D-тренажёры» в кабинете ученика, сессии по 25 минут на LiveKit Agents.
4. **Полное удаление всего Яндекс-кода** (ID OAuth + Telemost).

---

### 1. Секреты (запрошу через add_secret)

- `LIVEKIT_API_KEY` = `APIkR7fby7jQSyS` (со скриншота)
- `LIVEKIT_API_SECRET` = откроете «Reveal secret» в кабинете LiveKit
- `LIVEKIT_WS_URL` = `wss://sintagma-h5kuy8k3.livekit.cloud`

---

### 2. База данных (миграция)

- DROP таблиц `yandex_identities`, `yandex_oauth_nonces` (CASCADE).
- В `webinars`: дефолт `source_type` → `'livekit'`. Старые записи не трогаем.
- Новая таблица `ai_tutor_sessions` (user_id, room_name, started_at, ended_at, duration_seconds, topic) — для учёта 25-минутных сессий AI-преподавателя и лимитов по тарифу.

---

### 3. Edge-функции

**Создаём:**
- `livekit-create-room` — создаёт комнату вебинара через LiveKit REST API, пишет `room_name` в `webinars.player_settings.livekit`.
- `livekit-issue-token` — по `webinar_id` или `ai_tutor_session_id` проверяет права в БД и подписывает JWT (HS256) для подключения к LiveKit.
- `livekit-ai-tutor-start` — создаёт комнату для AI-преподавателя, лимит 25 минут на сессию, проверяет месячный лимит организации.

**Удаляем (через delete_edge_functions):**
- `telemost-create-conference`
- `yandex-oauth-start`
- `yandex-oauth-callback`
- `yandex-oauth-complete-org`

---

### 4. Фронтенд

**Новое:**
- `src/pages/WebinarLive.tsx` (`/webinar/:id/live`) — комната на `@livekit/components-react`: видео, чат, демо экрана, для хоста — кнопка «Начать запись».
- `src/pages/AITutor.tsx` (`/ai-tutor`) — пока заглушка-карточка + кнопка «Начать 25-минутную сессию» (в превью-режиме показывает «Скоро доступно»).
- В дашборде ученика рядом с «3D-тренажёры» добавляю карточку «AI-преподаватель» в том же градиентном стиле.

**Правлю:**
- `CreateWebinarDialog.tsx` — источник по умолчанию `livekit` вместо `telemost`. При создании зовём `livekit-create-room`.
- `WebinarsManager.tsx` — кнопка «Начать вебинар» ведёт на `/webinar/:id/live`. Все ветки `telemost` → `livekit`.
- `StudentWebinarsList.tsx` — кнопка «Присоединиться» открывает `/webinar/:id/live` в роли viewer.
- `manage-secret/index.ts` — whitelist: убираем все `YANDEX_*`, добавляем `LIVEKIT_*`.
- `src/components/admin/ai-settings/constants.ts` — то же самое.

**Удаляем файлы:**
- `src/components/auth/YandexLoginButton.tsx`
- `src/components/profile/LinkedAccounts.tsx`
- `src/pages/YandexCallback.tsx`
- Импорты/использования из `Login.tsx`, `RegisterOrganization.tsx`, `publicRoutes.tsx`.

**Не трогаем:** Яндекс.Метрику и детект Яндекс-Браузера — это не аккаунты.

---

### 5. AI-преподаватель — что внутри

Первая версия = заглушка с правильной инфраструктурой:
- Карточка в кабинете ученика → кнопка «Начать сессию».
- Создаём LiveKit-комнату через `livekit-ai-tutor-start`, ограничение 25 мин (таймер на клиенте + проверка на сервере при выдаче токена).
- Сам AI-агент (LLM + voice) — отдельной задачей позже: подключим LiveKit Agents Worker (Python/Node, развернём в LiveKit Cloud Agents). Сейчас в UI пишем «Бета — голосовой ИИ-преподаватель скоро» и просто открываем пустую комнату для теста инфраструктуры.

---

### 6. Память

- Удалить `mem://integrations/yandex-id-oauth`.
- Создать `mem://integrations/livekit-cloud` — endpoint, формат токенов, бесплатный лимит, проект `sintagma-h5kuy8k3`.
- Создать `mem://features/ai-tutor` — лимит 25 минут/сессия, заглушка пока, путь `/ai-tutor`.

---

### 7. Открытые вопросы

