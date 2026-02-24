
## Исправление: отслеживание времени обучения

### Проблема

Поле `time_spent` в таблице `enrollments` всегда равно `0`. Ни один компонент в системе не отслеживает и не записывает время, проведённое учеником на уроке. При завершении урока (`markLessonComplete`) обновляется только `progress`, но не `time_spent`.

### Решение

Добавить трекинг времени на уровне урока и суммирование на уровне курса.

### Технические детали

**1. `src/hooks/useCourseLearning.ts`** -- добавить трекинг времени:

- Добавить `useRef` для хранения момента открытия урока (`lessonStartTimeRef`)
- При переключении урока (изменении `currentLessonIndex`) и при `markLessonComplete` -- вычислять разницу с `lessonStartTimeRef`, сбрасывать таймер
- Записывать `time_spent` (в секундах) в `lesson_progress` при upsert через инкрементальное обновление
- После обновления `lesson_progress.time_spent` -- пересчитывать суммарное `enrollments.time_spent` как сумму `time_spent` из всех `lesson_progress` для данного `enrollment`

Конкретные изменения:
- Добавить `const lessonStartTimeRef = useRef<number>(Date.now())` 
- При изменении `currentLessonIndex` -- вызывать функцию `saveLessonTime()`, которая:
  1. Вычисляет `elapsed = Math.floor((Date.now() - lessonStartTimeRef.current) / 1000)`
  2. Обновляет `lesson_progress` инкрементом через RPC или upsert
  3. Обновляет `enrollments.time_spent` суммой из `lesson_progress`
  4. Сбрасывает `lessonStartTimeRef.current = Date.now()`
- В `markLessonComplete` -- вызвать `saveLessonTime()` перед обновлением прогресса
- Добавить `useEffect` с `beforeunload` для сохранения при закрытии вкладки

**2. Миграция базы данных** -- создать RPC-функцию для атомарного инкремента:

```sql
CREATE OR REPLACE FUNCTION increment_lesson_time(
  p_lesson_id uuid,
  p_user_id uuid,
  p_seconds int
) RETURNS void AS $$
BEGIN
  INSERT INTO lesson_progress (lesson_id, user_id, time_spent, completed)
  VALUES (p_lesson_id, p_user_id, p_seconds, false)
  ON CONFLICT (lesson_id, user_id)
  DO UPDATE SET time_spent = COALESCE(lesson_progress.time_spent, 0) + p_seconds;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

И функция для пересчёта суммарного времени в enrollment:

```sql
CREATE OR REPLACE FUNCTION recalc_enrollment_time(
  p_enrollment_id uuid
) RETURNS void AS $$
BEGIN
  UPDATE enrollments e
  SET time_spent = COALESCE((
    SELECT SUM(lp.time_spent)
    FROM lesson_progress lp
    JOIN lessons l ON l.id = lp.lesson_id
    WHERE l.course_id = e.course_id AND lp.user_id = e.user_id
  ), 0)
  WHERE e.id = p_enrollment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

Это обеспечит корректное отображение времени обучения в карточке ученика и во всех отчётах (ФРДО, классный журнал и т.д.).
