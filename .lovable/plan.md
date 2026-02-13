

# Исправление реактивности тарифов при смене плана

## Найденные проблемы

### 1. Тариф не обновляется без перезагрузки страницы
`useSubscriptionLimits` и `useOrgFeatures` загружают данные один раз при монтировании. Когда администратор меняет тариф организации — интерфейс организации продолжает работать по старому тарифу до полной перезагрузки страницы.

### 2. Некорректный текст ошибки для настроек курсов
Сообщение «Настройки курсов доступны начиная с тарифа Стандарт» неверно — `courseSettings: true` начинается с тарифа **Старт** (3 490 руб.), а не Стандарт.

### 3. Подсчёт учеников через enrollments считает дубли
Один ученик, записанный на 2 курса, считается как 2 ученика. Это приводит к преждевременному срабатыванию лимита.

## Что будет исправлено

### 1. Подписка на изменения тарифа в реальном времени

**Файл:** `src/hooks/useSubscriptionLimits.ts`

- Добавить Realtime-подписку на таблицу `organizations` с фильтром по `id = organizationId`
- При получении события `UPDATE` — автоматически обновлять `plan` из `subscription_plan`
- Отписываться при размонтировании компонента

### 2. Подписка на изменения в useOrgFeatures

**Файл:** `src/hooks/useOrgFeatures.ts`

- Аналогично добавить Realtime-подписку на `organizations` для автоматического `refetch` при смене плана

### 3. Исправление текста ошибки

**Файл:** `src/components/organization/tabs/CoursesTab.tsx`

- Изменить текст с «Стандарт» на «Старт»

### 4. Подсчёт уникальных учеников

**Файл:** `src/hooks/useSubscriptionLimits.ts`

- Заменить подсчёт enrollments на подсчёт уникальных `user_id` через `profiles` с фильтром `organization_id`, что даст точное число учеников в организации

## Технические детали

### `src/hooks/useSubscriptionLimits.ts`

```typescript
// Добавить Realtime-подписку
useEffect(() => {
  if (!organizationId) return;

  const channel = supabase
    .channel(`org-plan-${organizationId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'organizations',
        filter: `id=eq.${organizationId}`,
      },
      (payload) => {
        if (payload.new.subscription_plan) {
          setPlan(payload.new.subscription_plan as SubscriptionPlan);
        }
      }
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, [organizationId]);

// Заменить подсчёт учеников:
// Вместо enrollments считать уникальные profiles
supabase
  .from("profiles")
  .select("user_id", { count: "exact", head: true })
  .eq("organization_id", organizationId)
  .eq("role", "student")  // если есть роль
```

### `src/hooks/useOrgFeatures.ts`

```typescript
// Добавить Realtime-подписку
useEffect(() => {
  if (!organizationId) return;

  const channel = supabase
    .channel(`org-features-${organizationId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'organizations',
        filter: `id=eq.${organizationId}`,
      },
      () => { fetchFeatures(); }
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, [organizationId, fetchFeatures]);
```

### `src/components/organization/tabs/CoursesTab.tsx`

```typescript
// Строка 282: изменить текст
toast.error('Настройки курсов доступны начиная с тарифа «Старт». Перейдите на следующий тариф.');
```

### Включение Realtime для таблицы organizations

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.organizations;
```

### Затронутые файлы

| Файл | Изменение |
|---|---|
| `src/hooks/useSubscriptionLimits.ts` | Realtime-подписка + исправление подсчёта учеников |
| `src/hooks/useOrgFeatures.ts` | Realtime-подписка при смене плана |
| `src/components/organization/tabs/CoursesTab.tsx` | Исправление текста ошибки |
| SQL-миграция | Включение Realtime для `organizations` |

