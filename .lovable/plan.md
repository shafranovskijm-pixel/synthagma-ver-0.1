

# Почему курсы ВЦОТ не загружаются

## Корневая причина

В логах базы данных — массовые **statement timeout** ошибки (код 57014). Причина: **отсутствуют индексы** на ключевых таблицах.

Сейчас нет индексов на:
- `courses.organization_id` — каждый запрос курсов делает seq scan по всей таблице (379 курсов)
- `enrollments.course_id` — подсчёт студентов сканирует все 477 записей
- `lessons.course_id` — подсчёт уроков (`lessons(count)`) тоже без индекса

При этом RLS-политика на `courses` вызывает `current_organization_id()` для **каждой строки**, что умножает нагрузку.

## Что нужно сделать

### 1. Добавить индексы (миграция)
```sql
CREATE INDEX idx_courses_organization_id ON public.courses (organization_id);
CREATE INDEX idx_enrollments_course_id ON public.enrollments (course_id);
CREATE INDEX idx_lessons_course_id ON public.lessons (course_id);
```
Это основное исправление — запросы перестанут таймаутиться.

### 2. Упростить запрос курсов
В `fetchCourses()` заменить `select(*, lessons(count))` на выборку только нужных столбцов:
```
select("id, title, description, is_published, created_at, updated_at, organization_id, category_id, duration, skip_video_identification, sequential_lessons, allow_video_seek, training_form, notify_on_completion, completion_notify_emails, cover_image_url, catalog_order, lessons(count)")
```
Это уменьшит объём передаваемых данных.

### 3. Убрать подсчёт студентов из начальной загрузки
Сейчас `fetchCourses` делает 3 запроса подряд (courses → enrollments → user_roles). Даже с try/catch, первый запрос enrollments с `.in("course_id", courseIds)` без индекса тоже может таймаутиться. Убрать подсчёт студентов из `fetchCourses` полностью — загружать его отдельно и лениво (или через отдельный вызов после рендера списка).

## Файлы
- Миграция: `supabase/migrations/` — новые индексы
- `src/api/courses.ts` — упрощение запроса, вынос studentsCount

## Ожидаемый результат
Курсы ВЦОТ (и всех организаций) загружаются стабильно без таймаутов.

