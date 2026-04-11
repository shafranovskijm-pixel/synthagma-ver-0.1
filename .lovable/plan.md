

## Иконка «глаз» не появляется — RLS блокирует `test_attempts` для администратора

### Причина

Та же проблема, что была с `lesson_progress`: RLS-политика на таблице `test_attempts` использует `current_organization_id()`, которая возвращает `NULL` для admin-пользователя без профиля. Результат — запрос к `test_attempts` возвращает пустой массив, `test_attempt_id` остаётся `null`, иконка глаза не отображается, а столбцы показывают «Не сдан» / «Ожидается».

В БД данные есть: у Палухина попытка 7/8 (87.5%) по финальному тесту — но RLS их скрывает.

### Исправление

**SQL-миграция**: добавить admin-bypass в SELECT-политику `test_attempts`:

```sql
DROP POLICY IF EXISTS "Org users can view attempts for their courses" ON public.test_attempts;
CREATE POLICY "Org users can view attempts for their courses" 
  ON public.test_attempts FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM lessons l 
      JOIN courses c ON c.id = l.course_id 
      WHERE l.id = test_attempts.lesson_id 
      AND c.organization_id = current_organization_id()
    )
    OR has_role('admin'::app_role, auth.uid())
  );
```

Одна SQL-миграция, без изменений в коде. После этого данные тестов станут видны администратору — иконка глаза появится, баллы и статус отобразятся корректно.

