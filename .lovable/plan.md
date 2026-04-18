
## Задача
Видео-блок, добавляемый через «+» внутри текстового урока (а также через «Слайд» и т.п.), сейчас использует упрощённый UI (`VideoBlock` в `MediaBlocks.tsx`): просто поле ссылки + «Выбрать из загруженных» + «Загрузить видео». Нужно заменить его на тот же расширенный UI, что используется в полноценном видеоуроке (`LessonEditor.tsx` / `SortableLessonItem.tsx`):

- Табы **«Видеосервис+ (рекомендуется)»** / **«На сервер (до 2 ГБ)»**
- Загрузка через Kinescope (внутреннее API), но в UI — название **«Видеосервис+»**
- Прогресс загрузки с метриками (UploadProgressBlock), отмена загрузки
- Заглушка `Lock` для тарифов **Бесплатный / Старт / Стандарт** с кнопкой «Перейти к тарифам →»
- Доступно только на **Профессиональный / Максимальный** (флаг `limits.kinescopeEnabled` — уже есть)
- Поле ссылки/iframe + предпросмотр (как сейчас)
- Кнопка «Из загруженных» (MediaLibraryDialog с фильтром по организации — уже исправлено)

## Что меняем

### 1. `src/components/course-builder/block-editor/blocks/MediaBlocks.tsx`
Полностью переписать `VideoBlock`:
- Принять опциональный пропс `organizationId` (для проверки тарифа).
- Подключить `useLessonMedia` (с генерируемым lessonId, как в `LessonEditor`) и `useSubscriptionLimits`.
- Состояние `videoUploadTab` (`"kinescope" | "server"`), по умолчанию kinescope если доступен, иначе server.
- Скопировать структуру табов и блоков прогресса/загрузки из `LessonEditor.tsx` (строки 108–214), адаптировав:
  - `e.setVideoUrl(url)` → `onUpdate({ videoUrl: url })`
  - `e.videoUrl` → `block.videoUrl`
- В UI лейблы/тексты заменить **«Kinescope»** → **«Видеосервис+»** (только видимые надписи; внутреннее API/код Kinescope не трогаем).
- Сохранить существующий блок предпросмотра (с поддержкой `kinescope:`, прямых mp4, iframe и т.д.) — там уже корректная логика, оставляем.
- Сохранить кнопку «Из загруженных» (MediaLibraryDialog с `filter="video"` и `organizationId`).

### 2. Прокинуть `organizationId` до `VideoBlock`
- `BlockEditor` / `BlockRenderer` уже получает контекст уроков. Добавить опциональный пропс `organizationId` в `BlockEditorProps` (`types.ts`) и пробросить его через `BlockRenderer` в `VideoBlock`.
- В `LessonEditor.tsx` (полный редактор урока) — передать `organizationId` в `<BlockEditor ... organizationId={organizationId} />` для текстовых уроков.
- В `SortableLessonItem.tsx` (inline-редактор урока в курс-билдере) — также пробросить `organizationId`.

### 3. Без изменений
- `useLessonMedia.ts`, `useSubscriptionLimits.ts`, `MediaLibraryDialog.tsx`, БД — не трогаем.
- Логика «доступно с Профессионального» уже работает через `limits.kinescopeEnabled` (флаг `false` для free/start/standard, `true` для professional/maximum).

## Технические детали
- Файл блока (`ContentBlock`) хранит `videoUrl` — структура не меняется. Видео, загруженные через Kinescope, сохраняются как `kinescope:<id>` (так делает `useLessonMedia`).
- Никаких миграций и edge-функций.
- Название «Kinescope» во **внутренних идентификаторах** (значение таба, ключ хранения, имена методов) оставляем, чтобы не ломать существующую логику. Меняем только видимые пользователю надписи на «Видеосервис+».
