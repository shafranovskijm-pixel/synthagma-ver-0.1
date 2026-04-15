

# Расчётное время загрузки + Сравнение скорости с конкурентами

## Задача 1: ETA при загрузке видео

Сейчас при загрузке видео отображается только процент. Нужно добавить расчётное время до завершения (ETA), скорость загрузки и итоговое время после завершения.

### Подход

Трекать `uploadStartTime` и текущий `offset` — из этого вычислять:
- Скорость: `bytesUploaded / elapsedSeconds` → форматировать как МБ/с
- ETA: `(fileSize - bytesUploaded) / speed` → форматировать как «~2 мин 15 сек»

### Изменения

**`src/hooks/useLessonMedia.ts`**:
- Добавить состояния: `uploadStartTime`, `uploadFileSize`, `uploadedBytes` (для обоих: server и Kinescope)
- При старте загрузки (`setKinescopeUploadProgress(0)` / `setVideoUploadProgress(0)`) записывать `Date.now()` и `file.size`
- При каждом обновлении прогресса обновлять `uploadedBytes`
- При завершении сохранять финальное время (для показа «Загружено за X мин»)
- Экспортировать `uploadStartTime`, `uploadFileSize`, `uploadedBytes`

**`src/components/course-builder/SortableLessonItem.tsx`**:
- Вычислять ETA и скорость из `media.uploadStartTime`, `media.uploadedBytes`, `media.uploadFileSize`
- Показывать под прогресс-баром: `12 МБ/с · ~1 мин 30 сек`
- Работает одинаково для Kinescope и серверной загрузки

## Задача 2: Скорость загрузки в таблице сравнения

**`src/components/admin/sales/CompetitorComparison.tsx`**:
- Добавить строку в категорию «LMS»: `{ category: 'LMS', feature: 'Скорость загрузки видео', sintagma: 'До 100 МБ/с (CDN)', getcourse: 'Медленная', ispring: 'Средняя', moodle: 'Зависит от сервера' }`

## Файлы

| Файл | Действие |
|---|---|
| `src/hooks/useLessonMedia.ts` | Добавить трекинг времени и байтов загрузки |
| `src/components/course-builder/SortableLessonItem.tsx` | Отобразить ETA, скорость, итоговое время |
| `src/components/admin/sales/CompetitorComparison.tsx` | Добавить строку сравнения скорости загрузки |

