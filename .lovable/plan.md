

# Интеграция Kinescope: загрузка и воспроизведение видео

## Что даёт интеграция

- Загрузка видео любого размера (без лимита 2 ГБ) через Kinescope
- Профессиональный плеер с DRM-защитой и адаптивным стримингом
- Видео хранится и раздаётся с CDN Kinescope, не нагружая наше хранилище

## Что будет сделано

### 1. Сохранить API-токен Kinescope
Добавить секрет `KINESCOPE_API_TOKEN` со значением `eac50162-73a8-4b21-917a-9566b0331c6c`.

### 2. Создать Edge-функцию `kinescope-proxy`
Файл: `supabase/functions/kinescope-proxy/index.ts`

Единая серверная функция для работы с Kinescope API (`api.kinescope.io/v1`):
- **`upload_init`** — инициализирует загрузку через TUS, возвращает `upload_url` для прямой загрузки с клиента
- **`list_projects`** — получить список проектов Kinescope (для выбора папки)
- **`get_video`** — получить данные видео (embed-ссылку, статус обработки)
- **`list_videos`** — список видео в проекте (для медиатеки)

API-токен берётся из серверного секрета — клиент его не видит.

### 3. Добавить загрузку через Kinescope в конструкторе курса
Файл: `src/hooks/useLessonMedia.ts`

Новый метод `handleKinescopeUpload(file)`:
1. Вызывает `kinescope-proxy` → `upload_init` — получает TUS upload URL
2. Загружает файл напрямую в Kinescope через TUS с клиента (прогресс-бар работает как обычно)
3. После завершения сохраняет в `lesson.content` JSON: `{ "type": "kinescope", "videoId": "...", "embedUrl": "..." }`

### 4. Обновить UI видео-урока — выбор способа загрузки
Файл: `src/components/course-builder/SortableLessonItem.tsx`

В секции видео добавить два варианта:
- **Kinescope** (рекомендуется) — без ограничений по размеру, профессиональный плеер
- **На сервер** — текущая загрузка до 2 ГБ (остаётся как запасной вариант)

Выбор через простые табы или кнопки.

### 5. Поддержка Kinescope-плеера при воспроизведении
Файлы:
- `src/utils/courseBuilderHelpers.ts` — добавить распознавание Kinescope URL/embed в `getVideoEmbedUrl`
- `src/components/course-builder/VideoPreviewInline.tsx` — рендерить Kinescope iframe для превью
- `src/components/course-learning/VideoPlayerInline.tsx` — рендерить Kinescope iframe в обучении
- `src/pages/CoursePreview.tsx` — аналогичная поддержка

Kinescope embed: `https://kinescope.io/embed/{videoId}` — стандартный iframe.

### 6. Добавить Kinescope в медиатеку
При открытии MediaLibraryDialog добавить вкладку «Kinescope» — список ранее загруженных видео через `kinescope-proxy` → `list_videos`.

## Технические детали

- Загрузка идёт напрямую с браузера пользователя на `uploader.kinescope.io` через TUS — Edge-функция только инициирует сессию
- Kinescope видео сохраняется как `kinescope:{videoId}` в поле `content` урока
- Все существующие видео (загруженные на сервер или по ссылке) продолжают работать без изменений
- Формат хранения обратно совместим — старые уроки не затрагиваются

## Файлы

- Секрет: `KINESCOPE_API_TOKEN`
- Новый: `supabase/functions/kinescope-proxy/index.ts`
- Редактировать: `src/hooks/useLessonMedia.ts`
- Редактировать: `src/components/course-builder/SortableLessonItem.tsx`
- Редактировать: `src/utils/courseBuilderHelpers.ts`
- Редактировать: `src/components/course-builder/VideoPreviewInline.tsx`
- Редактировать: `src/components/course-learning/VideoPlayerInline.tsx`
- Редактировать: `src/pages/CoursePreview.tsx`

Без миграций БД.

