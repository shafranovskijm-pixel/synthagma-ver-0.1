
# Исправление оставшихся проблем тарифной системы

## Найденные проблемы

### 1. Модуль «Охрана труда» виден на всех тарифах
Сайдбар проверяет `isEnabled("labor_safety")`, но ключ `labor_safety` отсутствует в `OrgFeaturesState`. Функция `isEnabled()` возвращает `features[featureId] ?? true`, поэтому для неизвестного ключа всегда возвращается `true`. В результате «Охрана труда» отображается даже на бесплатном тарифе, хотя доступна только начиная с Профессионального.

### 2. Подсчёт учеников включает администратора организации
`useSubscriptionLimits` считает ВСЕ записи в `profiles` с `organization_id`, включая аккаунт самой организации. Пример из БД: организация имеет 60 profiles, но лишь 34 из них — ученики. На бесплатном тарифе (лимит 10) аккаунт администратора занимает 1 место, оставляя только 9 для учеников.

### 3. Realtime-обновление не обновляет счётчики использования
При смене тарифа через Realtime обновляется только `plan`, но `coursesCount` и `studentsCount` остаются устаревшими до перезагрузки страницы.

---

## Что будет исправлено

### 1. Добавить `labor_safety` в OrgFeaturesState

**Файл:** `src/hooks/useOrgFeatures.ts`

- Добавить ключ `labor_safety: boolean` в интерфейс `OrgFeaturesState`
- Добавить `labor_safety: true` в `defaultFeatures`
- Добавить `'labor_safety'` в массив `allCategories` внутри `fetchFeatures()`

После этого логика `enabledCategories` корректно отключит `labor_safety` для тарифов ниже Профессионального.

### 2. Фильтрация подсчёта учеников по роли

**Файл:** `src/hooks/useSubscriptionLimits.ts`

Заменить текущий запрос:
```typescript
supabase
  .from("profiles")
  .select("id", { count: "exact", head: true })
  .eq("organization_id", organizationId)
```

На запрос с подсчётом через `user_roles`:
```typescript
supabase
  .from("profiles")
  .select("id, user_roles!inner(role)", { count: "exact", head: true })
  .eq("organization_id", organizationId)
  .eq("user_roles.role", "student")
```

Это будет считать только пользователей с ролью `student`, исключая администратора организации.

### 3. Добавить refetch при Realtime-событии

**Файл:** `src/hooks/useSubscriptionLimits.ts`

В обработчике Realtime-события после обновления `plan` вызывать `fetchData()` заново, чтобы обновить и счётчики `coursesCount`/`studentsCount`.

---

## Технические детали

### `src/hooks/useOrgFeatures.ts`

```typescript
// В интерфейсе OrgFeaturesState добавить:
labor_safety: boolean;

// В defaultFeatures добавить:
labor_safety: true,

// В массиве allCategories (строка ~279) добавить 'labor_safety':
const allCategories = ['courses', 'students', 'companies', 'documents', 'journals', 'frdo', 'links', 'library', 'services', 'settings', 'student_cabinet', 'labor_safety'];
```

### `src/hooks/useSubscriptionLimits.ts`

```typescript
// Подсчёт только студентов (строка ~48):
supabase
  .from("profiles")
  .select("id, user_roles!inner(role)", { count: "exact", head: true })
  .eq("organization_id", organizationId)
  .eq("user_roles.role", "student")

// В Realtime-обработчике (строка ~83):
(payload) => {
  if (payload.new.subscription_plan) {
    setPlan(payload.new.subscription_plan as SubscriptionPlan);
  }
  // Обновить счётчики использования
  fetchData();
}
```

### Затронутые файлы

| Файл | Изменение |
|---|---|
| `src/hooks/useOrgFeatures.ts` | Добавить `labor_safety` в состояние и массив категорий |
| `src/hooks/useSubscriptionLimits.ts` | Фильтрация по роли `student` + refetch при Realtime |
