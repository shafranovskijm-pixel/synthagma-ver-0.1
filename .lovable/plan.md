

## Проблема: Кнопка «Из выпускников» не находит студентов

### Диагностика

Функция «Из выпускников» в журнале дипломов/удостоверений/свидетельств ищет записи в таблице `enrollments` с условиями:
- `status = 'completed'`
- `completed_at IS NOT NULL`

**Результат проверки базы данных:**
- Все 465 записей в `enrollments` имеют `status = 'active'`
- Ни одна запись не имеет `completed_at`
- При этом есть студенты с `progress >= 100` (некоторые даже 233%)

**Причина:** В системе отсутствует механизм автоматического завершения курса. Нигде — ни в клиентском коде, ни в триггерах базы данных, ни в edge-функциях — нет логики, которая обновляла бы `status` на `completed` и выставляла бы `completed_at`, когда студент достигает 100% прогресса.

Существующие триггеры (достижения, напоминания, трудовая безопасность) срабатывают *после* изменения статуса на `completed`, но ничего не инициирует это изменение.

### План исправления

**1. Создать триггер в БД для автоматического завершения курса**

SQL-миграция: при обновлении `progress` в таблице `enrollments`, если `progress >= 100` и текущий `status != 'completed'`, автоматически выставить:
- `status = 'completed'`
- `completed_at = now()`

```sql
CREATE OR REPLACE FUNCTION public.auto_complete_enrollment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.progress >= 100 AND NEW.status != 'completed' THEN
    NEW.status := 'completed';
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_complete_enrollment
  BEFORE UPDATE ON public.enrollments
  FOR EACH ROW
  WHEN (NEW.progress >= 100 AND NEW.status != 'completed')
  EXECUTE FUNCTION public.auto_complete_enrollment();
```

**2. Исправить текущие данные — привести существующие записи в порядок**

Одноразовый UPDATE для всех записей, у которых `progress >= 100`:

```sql
UPDATE public.enrollments
SET status = 'completed', completed_at = now()
WHERE progress >= 100 AND status != 'completed';
```

**3. Добавить кнопку ручного завершения курса менеджером**

В карточке студента (вкладка «Курсы», файл `src/components/organization/student-detail/CoursesTab.tsx`) добавить кнопку «Завершить курс» для активных зачислений, чтобы менеджер мог вручную отметить завершение.

### Результат

- Студенты с прогрессом ≥100% автоматически получат статус `completed`
- Кнопка «Из выпускников» в журналах дипломов/удостоверений/свидетельств начнёт находить выпускников
- Все связанные триггеры (достижения, напоминания о переподготовке, обновление планов обучения) начнут корректно срабатывать

