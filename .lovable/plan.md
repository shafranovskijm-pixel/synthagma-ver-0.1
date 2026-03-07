

# Интеграция Яндекс Телемост вместо Daily.co

## Подход

Яндекс Телемост не имеет публичного API для программного создания комнат. Но он позволяет создавать встречи через веб-интерфейс и делиться ссылками. Ссылки формата `https://telemost.yandex.ru/j/XXXXX` можно встроить через iframe.

Реализация: организация создаёт встречу в Телемосте вручную, вставляет ссылку в систему. Студенты подключаются через iframe или кнопку «Открыть».

## Изменения

### 1. Миграция БД
Добавить колонку `stream_url` для хранения ссылки Телемоста. Колонки `room_url` и `room_name` оставить (nullable, не ломаем старое).

```sql
ALTER TABLE webinars ADD COLUMN stream_url text;
ALTER TABLE webinars ADD COLUMN stream_platform text DEFAULT 'telemost';
```

### 2. Edge Function `manage-webinar` — убрать Daily.co
- Удалить всю логику Daily.co (dailyFetch, создание комнат, токены, удаление комнат)
- CREATE: просто insert в таблицу с `stream_url` и `stream_platform`
- DELETE: просто delete из таблицы (без Daily API)
- PATCH и token actions — упростить/удалить
- Оставить CRUD через Supabase client

### 3. Хук `useWebinarsManager`
- `createWebinar`: добавить `stream_url` в параметры
- Удалить `getMeetingToken` — больше не нужен
- Остальной CRUD без изменений

### 4. `WebinarsManager.tsx` (организация)
- В форму добавить поле «Ссылка на Яндекс Телемост» (обязательное)
- Placeholder: `https://telemost.yandex.ru/j/...`
- Убрать логику `meetingToken` и `activeWebinar` с iframe Daily
- Кнопка «Начать» → меняет статус на `live`
- Просмотр live → iframe с `stream_url` или кнопка «Открыть в Телемосте»
- Добавить поле для ссылки на запись при завершении

### 5. `StudentWebinars.tsx`
- Кнопка «Подключиться» → открывает iframe с Телемост-ссылкой или новую вкладку
- Убрать `meetingToken` и Daily-логику
- Для Телемоста iframe может быть заблокирован (X-Frame-Options), поэтому предусмотреть fallback — кнопка «Открыть в новой вкладке»

### 6. Тип Webinar
- Добавить `stream_url: string | null` и `stream_platform: string`

## Порядок
1. Миграция БД (2 колонки)
2. Переписать edge function (убрать Daily.co, чистый CRUD)
3. Обновить тип + хук
4. Обновить WebinarsManager (форма + просмотр)
5. Обновить StudentWebinars (embed/ссылка)

