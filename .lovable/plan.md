

# Реализация раздела «Вебинары»

## Что делаем

Заменяем заглушку на полноценный раздел вебинаров с двумя режимами:
1. **Kinescope Live** — создание трансляции через Kinescope API (получаем RTMP-ключ, embed-ссылку, после завершения запись сохраняется автоматически)
2. **Внешние трансляции** — вставка ссылки на Zoom, VK Video, Rutube, YouTube Live и др.

Ученики видят список вебинаров, могут смотреть трансляцию или запись прямо на платформе.

## Структура данных

### Новая таблица `webinars`

| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | |
| organization_id | uuid FK | Организация |
| title | text | Название |
| description | text | Описание |
| scheduled_at | timestamptz | Дата/время начала |
| duration_minutes | int | Длительность |
| status | text | `planned` / `live` / `ended` |
| source_type | text | `kinescope` / `external` |
| kinescope_live_id | text | ID трансляции Kinescope |
| kinescope_video_id | text | ID записи (после завершения) |
| external_url | text | Ссылка на Zoom/VK/Rutube |
| embed_url | text | Ссылка для embed |
| rtmp_url | text | RTMP endpoint (Kinescope) |
| rtmp_key | text | Stream key (Kinescope) |
| cover_url | text | Обложка |
| created_by | uuid | Кто создал |
| created_at | timestamptz | |

### Новая таблица `webinar_participants`

| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | |
| webinar_id | uuid FK | |
| user_id | uuid | Ученик |
| enrolled_at | timestamptz | |

RLS: организация видит свои вебинары; ученики видят вебинары, на которые назначены.

## Kinescope Live API

Добавляем в `kinescope-proxy` новые actions:
- `create_live` — `POST /v1/live/streams` (создаёт трансляцию, возвращает RTMP URL/key + embed URL)
- `stop_live` — `POST /v1/live/streams/{id}/stop`
- `get_live` — `GET /v1/live/streams/{id}` (статус, запись)
- `list_live` — `GET /v1/live/streams`

## Компоненты UI

### Организация (CoursesTab → вкладка «Вебинары»)
- **Список вебинаров** — карточки с названием, датой, статусом (запланирован / в эфире / завершён)
- **Кнопка «Создать вебинар»** — диалог с полями:
  - Название, описание, дата/время
  - Источник: Kinescope (создаём трансляцию автоматически) или Внешний (вставить ссылку Zoom/VK/Rutube)
- **Управление**: старт/стоп трансляции, копирование RTMP-ключа, назначение учеников
- **Запись**: после завершения Kinescope-трансляции — автоматически подтягивается запись (`kinescope_video_id`)

### Ученик (StudentDashboard → вкладка «Вебинары»)
- Список назначенных вебинаров с датами
- Кнопка «Смотреть» — открывает embed (Kinescope) или переход по внешней ссылке
- Если есть запись — можно посмотреть позже

## Файлы

### Новые файлы:
- `src/components/organization/WebinarsManager.tsx` — основной компонент управления вебинарами
- `src/components/organization/CreateWebinarDialog.tsx` — диалог создания
- `src/components/organization/WebinarParticipantsDialog.tsx` — назначение учеников

### Изменяемые файлы:
- `supabase/functions/kinescope-proxy/index.ts` — добавить actions для Live API
- `src/components/organization/tabs/CoursesTab.tsx` — заменить заглушку на `<WebinarsManager />`
- `src/pages/StudentDashboard.tsx` — заменить заглушку на список вебинаров ученика

### Миграция:
- Создание таблиц `webinars` и `webinar_participants` с RLS-политиками

