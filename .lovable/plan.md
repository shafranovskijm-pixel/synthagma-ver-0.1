

## Лимит обученных в месяц (maxTrainedPerMonth)

### Суть
Значение `maxTrainedPerMonth` задано в каждом тарифе, но нигде не проверяется. Нужно:
1. Считать количество завершений курсов за текущий месяц для организации
2. Блокировать завершение курса при превышении лимита
3. Показывать использование в интерфейсе

### Где происходит завершение курса
Единственная точка — `src/hooks/useCourseLearning.ts`, функция `handleCourseCompletion` (строка 487). Там делается `enrollments.update({ status: 'completed' })`.

### План изменений

**1. Создать RPC-функцию `count_org_completions_this_month`**
SQL-миграция: функция считает `enrollments` со `status = 'completed'` и `completed_at` в текущем месяце для курсов данной организации.

```sql
CREATE OR REPLACE FUNCTION count_org_completions_this_month(org_id uuid)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COUNT(*)
  FROM enrollments e
  JOIN courses c ON c.id = e.course_id
  WHERE c.organization_id = org_id
    AND e.status = 'completed'
    AND e.completed_at >= date_trunc('month', now())
    AND e.completed_at < date_trunc('month', now()) + interval '1 month';
$$;
```

**2. Расширить `useSubscriptionLimits`**
- Добавить `trainedThisMonth` в state
- Добавить запрос `count_org_completions_this_month` в `fetchData`
- Добавить `canCompleteCourse` (computed)
- Расширить `checkLimit` для типа `'trained'`
- Добавить `trainedThisMonth` в `usage`

**3. Проверка перед завершением в `useCourseLearning.ts`**
В `handleCourseCompletion` — перед `enrollments.update` вызвать RPC `count_org_completions_this_month`, сравнить с лимитом плана организации. Если превышен — показать toast с ошибкой и не завершать курс.

**4. Отображение в UI (`SubscriptionTab.tsx`)**
Добавить строку использования «Обучено в этом месяце: X / Y» рядом с существующими показателями курсов и учеников (аналогично тому, как уже отображаются `coursesCount` и `studentsCount`).

### Файлы для изменения
- **Миграция**: новая RPC-функция `count_org_completions_this_month`
- `src/hooks/useSubscriptionLimits.ts` — добавить подсчёт и проверку
- `src/hooks/useCourseLearning.ts` — проверка лимита перед завершением
- `src/components/organization/tabs/SubscriptionTab.tsx` — отображение использования

