

## Проблема

Когда организация создаётся, функция `apply_free_plan_features` записывает в таблицу `organization_feature_categories` строки с `is_enabled = false` для категорий, недоступных на бесплатном тарифе (компании, документы, журналы, ФРДО, ссылки, библиотека, сервисы).

При повышении тарифа (например, на "Максимальный") обновляется только поле `subscription_plan` в таблице `organizations`. Старые записи с `is_enabled = false` остаются в `organization_feature_categories` и продолжают блокировать вкладки, потому что код в `useOrgFeatures` применяет их как переопределения.

## Решение

Два изменения: одно в коде, одно в базе данных.

### 1. Исправить логику в `useOrgFeatures.ts`

Изменить порядок приоритетов: подписочный план должен **принудительно включать** категории, доступные на тарифе, а не только отключать недоступные. Если категория входит в `enabledCategories` плана, она должна быть включена, даже если в `organization_feature_categories` стоит `false` (эти записи — артефакт бесплатного плана).

Логика будет такой:
- Начинаем с дефолтов (все включено)
- Применяем глобальные настройки системы
- Применяем org-специфичные настройки
- **Финально**: для каждой категории из `enabledCategories` текущего плана -- принудительно включаем; для категорий НЕ в плане -- принудительно отключаем

### 2. Создать триггерную функцию в БД

Создать функцию `apply_plan_features`, которая автоматически обновляет `organization_feature_categories` при смене `subscription_plan`. Это гарантирует, что записи в БД всегда соответствуют тарифу.

### 3. Удалить старые некорректные записи

Одноразовый SQL для исправления существующих организаций: обновить `organization_feature_categories` для всех организаций в соответствии с их текущим тарифом.

## Технические детали

### Файл: `src/hooks/useOrgFeatures.ts`

В блоке после строки 276, изменить логику на строках 278-292:

```typescript
// Subscription plan is the FINAL authority on categories
const subscriptionPlan = (orgPlanResult.data?.subscription_plan || 'free') as SubscriptionPlan;
const planInfo = getPlanInfo(subscriptionPlan);
const allCategories = ['courses', 'students', 'companies', 'documents', 'journals', 'frdo', 'links', 'library', 'services', 'settings', 'student_cabinet', 'labor_safety'];

for (const cat of allCategories) {
  if (planInfo.enabledCategories.includes(cat)) {
    // Plan grants this category -- force enable
    (newFeatures as any)[cat] = true;
  } else {
    // Plan doesn't include this category -- force disable
    (newFeatures as any)[cat] = false;
  }
}
```

### Миграция SQL

1. Триггер при смене `subscription_plan`:

```sql
CREATE OR REPLACE FUNCTION public.apply_plan_features_on_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
DECLARE
  plan_categories TEXT[];
  all_categories TEXT[] := ARRAY['courses','students','companies','documents',
    'journals','frdo','links','library','services','settings','student_cabinet','labor_safety'];
  cat TEXT;
BEGIN
  IF NEW.subscription_plan IS NOT DISTINCT FROM OLD.subscription_plan THEN
    RETURN NEW;
  END IF;

  -- Map plan to enabled categories
  plan_categories := CASE NEW.subscription_plan
    WHEN 'free' THEN ARRAY['courses','students','services','settings','student_cabinet']
    WHEN 'start' THEN ARRAY['courses','students','companies','links','services','settings','student_cabinet']
    WHEN 'standard' THEN ARRAY['courses','students','companies','links','services','settings','student_cabinet']
    WHEN 'professional' THEN ARRAY['courses','students','companies','documents','journals','links','library','services','settings','student_cabinet','labor_safety']
    WHEN 'maximum' THEN ARRAY['courses','students','companies','documents','journals','frdo','links','library','services','settings','student_cabinet','labor_safety']
    ELSE ARRAY['courses','students','settings','student_cabinet']
  END;

  FOREACH cat IN ARRAY all_categories LOOP
    INSERT INTO organization_feature_categories (organization_id, category_id, is_enabled)
    VALUES (NEW.id, cat, cat = ANY(plan_categories))
    ON CONFLICT (organization_id, category_id)
    DO UPDATE SET is_enabled = (cat = ANY(plan_categories));
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apply_plan_features
  AFTER UPDATE OF subscription_plan ON organizations
  FOR EACH ROW EXECUTE FUNCTION apply_plan_features_on_change();
```

2. Одноразовое исправление существующих организаций -- обновить все записи в `organization_feature_categories` в соответствии с текущим планом каждой организации.

## Затрагиваемые файлы

- `src/hooks/useOrgFeatures.ts` -- исправить приоритет плана над org-записями
- Новая миграция SQL -- триггер + исправление существующих данных

## Результат

- Вкладки всегда соответствуют тарифу организации
- При смене тарифа записи в БД автоматически обновляются
- Существующие организации починены
