
# Триггер автообновления статуса training_plans

## Что делаем

Создаём триггерную функцию на таблице `enrollments`, которая при изменении статуса зачисления автоматически обновляет соответствующий план обучения в `training_plans`:

- При **зачислении** (INSERT в enrollments) -- статус плана меняется на `enrolled`
- При **завершении курса** (UPDATE status -> 'completed') -- статус плана меняется на `completed`

## SQL-миграция

Одна миграция с функцией и триггером:

```sql
CREATE OR REPLACE FUNCTION public.sync_training_plan_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- На INSERT: помечаем план как "enrolled"
  IF TG_OP = 'INSERT' THEN
    UPDATE training_plans
    SET status = 'enrolled'
    WHERE user_id = NEW.user_id
      AND course_id = NEW.course_id
      AND status = 'planned';
    RETURN NEW;
  END IF;

  -- На UPDATE: если курс завершён, помечаем план как "completed"
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
      UPDATE training_plans
      SET status = 'completed'
      WHERE user_id = NEW.user_id
        AND course_id = NEW.course_id
        AND status IN ('planned', 'enrolled');
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_training_plan_on_enroll
AFTER INSERT ON public.enrollments
FOR EACH ROW
EXECUTE FUNCTION public.sync_training_plan_status();

CREATE TRIGGER sync_training_plan_on_complete
AFTER UPDATE OF status ON public.enrollments
FOR EACH ROW
EXECUTE FUNCTION public.sync_training_plan_status();
```

## Логика

- Сопоставление по `user_id` + `course_id` -- триггер находит план для того же сотрудника и того же курса
- Обновляются только планы со статусом `planned` (при зачислении) или `planned`/`enrolled` (при завершении)
- Если плана нет -- ничего не происходит, триггер работает безопасно
- Используется `SECURITY DEFINER` для обхода RLS при обновлении

## Затронутые файлы

| Файл | Действие |
|---|---|
| Новая SQL-миграция | Функция `sync_training_plan_status` + 2 триггера на `enrollments` |

Никаких изменений в коде фронтенда не требуется -- статусы обновляются на уровне БД.
