

## Журнал посещаемости не работает — отсутствует RLS-доступ для администраторов

### Проблема

Журнал посещаемости показывает «0 записей» потому что:

1. Текущий пользователь (`24@24zxc.ru`) — **администратор** через таблицу `user_roles`, но **не имеет записи в `profiles`**
2. Функция `current_organization_id()` возвращает `NULL` (она ищет в `profiles`)
3. RLS-политика на `lesson_progress` **не содержит fallback для админов** (`has_role('admin', ...)`)
4. Запрос возвращает пустой массив — все 4790 записей скрыты

Другие журналы (документооборот) работают, потому что их RLS-политики **содержат** `OR has_role('admin', auth.uid())`.

### Что нужно сделать

**1. SQL-миграция: добавить admin-доступ в RLS `lesson_progress`**

Обновить политику `"Org users can view progress for their courses"` — добавить `OR has_role('admin', auth.uid())`:

```sql
DROP POLICY IF EXISTS "Org users can view progress for their courses" ON public.lesson_progress;
CREATE POLICY "Org users can view progress for their courses" 
  ON public.lesson_progress FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.lessons l 
      JOIN public.courses c ON c.id = l.course_id 
      WHERE l.id = lesson_id 
      AND c.organization_id = current_organization_id()
    )
    OR has_role('admin', auth.uid())
  );
```

**2. Также проверить и исправить RLS на связанных таблицах**, если у них тоже нет admin-fallback:
- `enrollments` — проверить SELECT-политику
- `profiles` — проверить SELECT-политику (нужна для получения имён студентов)

**3. Создать профиль для admin-пользователя** (опционально, но рекомендуется) — чтобы `current_organization_id()` работало корректно и для остальных RLS-политик.

### Результат

После миграции администратор сможет видеть все записи о посещаемости во всех организациях, и журнал начнёт отображать данные.

