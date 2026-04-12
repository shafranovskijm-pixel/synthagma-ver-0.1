

# Повторный импорт курсов + миграция видео в Kinescope

## Что делаем

1. **Повторный парсинг 6 неудавшихся курсов** — сбросить статус jobs с `error` на `pending`, увеличить таймаут fetch до 120с в `batch-skillspace-import`, перезапустить обработку.

2. **Массовая миграция видео в Kinescope** — все видео с `selcdn.ru` и из Supabase Storage переносятся в Kinescope через API "import by URL". Видео с `ktalk.ru` и `vkvideo.ru` **остаются как есть**.

3. **Кнопка в UI** — "Перенести все видео в Kinescope" на уровне организации в `CoursesTab.tsx`.

## Изменения по файлам

### `supabase/functions/batch-skillspace-import/index.ts`
- Добавить `signal: AbortSignal.timeout(120000)` к fetch-вызову `parse-skillspace-course`

### `supabase/functions/kinescope-migrate-videos/index.ts`
- Обновить `isExternalVideoUrl`: добавить Supabase Storage URLs (`supabase.co/storage`)
- Явно исключить `ktalk.ru` и `vkvideo.ru` из миграции

### `src/components/organization/tabs/CoursesTab.tsx`
- Добавить кнопку "Перенести все видео в Kinescope" (вызов с `organization_id` без `course_id`)

### SQL (миграция)
- Сбросить 6 failed jobs: `UPDATE skillspace_import_jobs SET status = 'pending', error_message = NULL WHERE batch_id = '...' AND status = 'error'`

