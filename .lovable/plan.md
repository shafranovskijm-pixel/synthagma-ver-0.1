

## Перенос видео и документов из SkillSpace в хранилище организации

### Текущее поведение

Парсер сохраняет в уроках только **ссылки** на файлы SkillSpace (`data.file.url`, `data.url`). Видео и документы остаются на серверах SkillSpace — при удалении курса оттуда ссылки перестанут работать.

### Что нужно сделать

Добавить в Edge Function `parse-skillspace-course` этап скачивания медиафайлов и загрузки в бакет `course-files` с заменой URL в блоках уроков.

### Техническое решение

**Файл:** `supabase/functions/parse-skillspace-course/index.ts`

1. **Функция `downloadAndReupload(url, courseId, orgId, supabaseClient)`**
   - Скачивает файл с SkillSpace по URL (с текущими cookies для авторизации)
   - Определяет тип (video/mp4, application/pdf, image и т.д.) по Content-Type
   - Загружает в бакет `course-files` по пути `{orgId}/{courseId}/{uuid}.{ext}`
   - Возвращает публичный URL из нашего хранилища
   - При ошибке — оставляет оригинальный URL (graceful fallback)

2. **Обработка блоков после парсинга (между Step 4 и Step 5)**
   - Проход по всем `jsonBlocks` каждого урока
   - Для блоков типа `video` (поле `videoUrl`) — скачать и заменить URL
   - Для блоков типа `image` (поле `imageSrc`) — скачать и заменить URL
   - Для блоков типа `document` (поле `documentUrl`) — скачать и заменить URL
   - Для ссылок в HTML-контенте (href на skillspace.ru) — скачать и заменить

3. **Ограничения и защита**
   - Максимальный размер файла для скачивания: 500 МБ (чтобы не упасть по памяти)
   - Таймаут на скачивание одного файла: 60 секунд
   - Логирование: "Downloaded video X.mp4 (25MB) → course-files/..."
   - Счётчик: `filesTransferred` / `filesSkipped` в ответе

4. **Использование service_role** — Edge Function уже использует `SUPABASE_SERVICE_ROLE_KEY`, поэтому загрузка в storage пройдёт без RLS-ограничений

### Ожидаемый результат

- Видео, изображения и документы из SkillSpace копируются в бакет `course-files`
- URL в блоках уроков указывают на наше хранилище
- В ответе функции добавляются поля `filesTransferred` и `filesFailed`
- При недоступности файла — оригинальная ссылка сохраняется

