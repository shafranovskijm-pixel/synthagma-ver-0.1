

## План: убрать «Хранилище и Kinescope» + анализ Kinescope Live для вебинаров

Запрос разделён на две части: (1) чистка кода Kinescope-хранилища из админки, (2) анализ возможности подключения **Kinescope Live API** к нашим вебинарам с учётом присланной документации.

---

### Часть A. Удаление раздела «Хранилище и Kinescope» из админки

Что удаляю/правлю:

1. **Sidebar и Dashboard:**
   - `src/components/admin/AdminSidebar.tsx` — удалить пункт `storage` (`Хранилище и Kinescope`).
   - `src/components/admin/AdminSidebar.tsx` — убрать `"storage"` из типа `AdminTabType`.
   - `src/components/admin/AdminDashboardHeader.tsx` — убрать заголовок `storage`.
   - `src/pages/AdminDashboard.tsx` — убрать импорт `AdminStorageOverview` и блок `{activeTab === "storage" && <AdminStorageOverview />}`.

2. **Удаляю файлы:**
   - `src/components/admin/AdminStorageOverview.tsx` (полностью, ~280 строк).
   - `supabase/functions/kinescope-storage-stats/` (edge-функция + deploy delete).

3. **Чистка вызовов:**
   - `src/hooks/useOrgDetailsView.ts` — убрать блок `kinescope-storage-stats` и связанные поля `kBytes/kSec/kCount/kRub` из `usage`. Если эти значения больше нигде не отображаются — удаляю и UI.
   - Поиском проверю и удалю остатки таблицы `kinescope_usage_cache`-зависимостей в edge-функции (миграцию для таблицы оставляю — это историческая БД-сущность, безопасно). Если таблица нигде не читается — миграцией дропнуть `kinescope_usage_cache`.

4. **Что НЕ трогаю:**
   - `kinescope-proxy`, `kinescope-drm-auth`, `kinescope-migrate-videos`, `KINESCOPE_API_TOKEN`, embed-плеер, поля `kinescope_video_id` в БД — это отдельная функциональность видео-уроков, она остаётся работать.

---

### Часть B. Кнопка «Вебинары» в админке (быстрый доступ)

В сайдбаре админки сейчас нет ссылки на вебинары — добавлю на место удалённого `storage` пункт **«Вебинары»** (`Radio`-icon), который ведёт на новую вкладку `webinars-admin`. Содержимое:

- Список всех вебинаров платформы (без фильтра по организации) — читается напрямую из `webinars`.
- Колонки: организация, название, дата, статус (planned / live / ended), источник (`livekit` / `external` / `kinescope`), длительность.
- Кнопки: «Открыть эфир» (для `livekit`) и «Удалить» (для админа).
- Под капотом — переиспользую `WebinarsManager` без `organization_id` фильтра + админ-режим (флаг `adminAll`), чтобы не дублировать UI.

Это закрывает запрос «дай кнопочку вебинара в админку» и сразу показывает заказчику весь движок вебинаров.

---

### Часть C. Анализ Kinescope Live API + сравнение с текущим LiveKit-решением

**Что у нас сейчас есть:**

| Компонент | Состояние |
|---|---|
| Тип `livekit` (рекомендуемый) | ✅ Полностью работает: `livekit-create-room`, `livekit-issue-token`, страница `/webinar/:id/live` с `LiveKitRoom + VideoConference`. Браузерная камера/микрофон без OBS. |
| Тип `external` | ✅ Просто iframe/ссылка на Zoom/VK/Rutube/YouTube. |
| Тип `kinescope` | ⚠️ В коде есть в `WebinarsManager` (handleStopLive, handleRefreshRecording, RTMP UI), но в `CreateWebinarDialog` опция уже **скрыта** (только `livekit` и `external`). В `kinescope-proxy` явно написано: *«Kinescope Live API недоступен через v1 REST»*. То есть это «мёртвый» путь — UI остался от прошлой попытки. |

**Что говорит документация Kinescope (v1 + v2 на postman-доке):**

Я открыл документ. Доступные endpoint'ы:
- `v1/projects`, `v1/videos` (CRUD видео);
- `v2/init` (TUS-инициализация загрузки файла);
- Документация **не содержит** публичного **Live Streams API** (`POST /v1/lives`, `POST /v1/lives/{id}/start|stop`). Раздел Live в дашборде Kinescope управляется внутренним API, не вынесенным в публичный Postman.

**Технически создать Live можно только так:**
1. Менеджер заходит в **личный кабинет Kinescope**, создаёт Live-стрим вручную.
2. Получает `RTMP URL` + `Stream Key` + `embed_id`.
3. Эти 3 значения вставляет в нашу карточку вебинара (готовое поле уже есть в БД: `rtmp_url`, `rtmp_key`, `kinescope_live_id`).
4. Ведёт трансляцию через **OBS / vMix / любой RTMP-клиент** — никакой web-камеры из браузера, как мы и обсуждали ранее.

**Вывод по Kinescope Live:**
- Полностью автоматизировать создание Live-стрима через API **невозможно** (на момент актуальной публичной документации) — придётся вручную дёргать дашборд Kinescope.
- OBS остаётся обязательным для ведущего — Kinescope не отдаёт WebRTC-вход для веб-камеры.
- Зато Kinescope даёт DRM, аналитику просмотров, авто-запись и оплачиваемое CDN.

**Рекомендация для заказчика — гибридная модель:**
- Оставить **LiveKit** как основной режим (камера прямо в браузере, без OBS, работает «из коробки»).
- Вернуть тип **`kinescope` с ручным вводом RTMP** как «продвинутый» режим — для тех организаций, кому нужны OBS-стримы, DRM и запись в Kinescope. Чтобы это включить, нужно:
  1. Вернуть в `CreateWebinarDialog` опцию `kinescope` с тремя полями: RTMP URL, Stream Key, Embed ID + инструкция «создайте Live в дашборде Kinescope».
  2. Оставить в `WebinarsManager` уже написанные кнопки «В эфир» / «Стоп» / «Обновить запись», но **убрать вызовы** `kinescope-proxy.stop_live / get_live` (их нет в API) — заменить на ручное переключение статуса + ручной ввод `kinescope_video_id` записи.
  3. Если позже Kinescope выпустит публичный Live API — допишем.

В этой итерации **по умолчанию ничего не возвращаю** — жду решения пользователя в Q1 ниже.

---

### Часть D. Версия

`APP_VERSION` → `1.0.47`, `BUILD_DATE_SHORT` → `21.04`. Запись в `/whats-new`: «Убрали раздел Хранилище и Kinescope, добавили вкладку Вебинары в админку».

---

### Файлы, которые трону

- удалить: `src/components/admin/AdminStorageOverview.tsx`, `supabase/functions/kinescope-storage-stats/`
- править: `AdminSidebar.tsx`, `AdminDashboardHeader.tsx`, `AdminDashboard.tsx`, `useOrgDetailsView.ts`
- создать: `src/components/admin/AdminWebinarsOverview.tsx` (тонкая обёртка над списком всех вебинаров)
- править: `src/lib/appVersion.ts`, миграция-сидер `platform_updates`
- (опц., по решению Q1): `CreateWebinarDialog.tsx`, `WebinarsManager.tsx`, `kinescope-proxy/index.ts`

---

### Вопросы для решения

1. По **Kinescope Live для вебинаров**: возвращать ручной режим (RTMP + OBS + Embed ID), или пока оставить только LiveKit + внешние ссылки (Zoom/VK/Rutube/YouTube)?
2. По **админ-вкладке «Вебинары»**: показать как просмотровый ридонли-журнал (только список и удаление), или дать админу полный набор действий (старт/стоп/редактирование чужих вебинаров)?
3. Удалить ли из БД таблицу `kinescope_usage_cache` миграцией (если её нигде не читают), или оставить «на всякий случай»?

