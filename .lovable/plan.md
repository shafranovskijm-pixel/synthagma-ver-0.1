
# Исправление: файлы не сохраняются и не отображаются в уроках

## Проблема

При сохранении прикрепленных файлов возвращается ошибка **403** — политика безопасности (RLS) таблицы `lesson_attachments` не пропускает запросы от администраторов.

Причина: RLS-политики для `lesson_attachments` проверяют только `current_organization_id()`, но у администратора `organization_id` в профиле равен `NULL`. В таблице `lessons` эта проблема решена добавлением `has_role('admin', auth.uid())` — в `lesson_attachments` этот fallback отсутствует.

## Решение

### 1. Обновить RLS-политики таблицы `lesson_attachments` (SQL-миграция)

Удалить 3 текущие политики (INSERT, UPDATE, DELETE) и пересоздать их с добавлением проверки `has_role('admin')`:

```text
INSERT: has_role('admin') OR (lesson -> course -> org = current_organization_id())
UPDATE: has_role('admin') OR (lesson -> course -> org = current_organization_id())
DELETE: has_role('admin') OR (lesson -> course -> org = current_organization_id())
```

Это полностью повторяет паттерн из таблицы `lessons`.

### 2. Проверить отображение для студентов

Политика SELECT уже позволяет всем аутентифицированным пользователям читать attachments (`USING (true)`), поэтому студенты увидят файлы после исправления записи. Код в `useCourseLearning.ts` и `CourseLearning.tsx` уже корректно загружает и отображает вложения.

## Затрагиваемые файлы

- **SQL-миграция** — обновление RLS-политик для `lesson_attachments` (3 политики: INSERT, UPDATE, DELETE)
- Код фронтенда менять **не нужно** — проблема только в базе данных
