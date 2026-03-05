

## План: Проверка лимита курсов при заказе из магазина

### Проблема

Функция `handleOrder` в `useCourseStoreManager.ts` **не проверяет лимит курсов по тарифу**. Организация на бесплатном плане (максимум 3 курса) может добавлять неограниченное количество курсов из маркетплейса.

### Решение

1. **Передать `checkLimit` в хук** — добавить проп `checkLimit` в интерфейс `UseCourseStoreManagerProps`, принимая функцию из `useSubscriptionLimits`.

2. **Проверка в `handleOrder`** — перед созданием заказа вызывать `checkLimit('course')`. Если `allowed === false`, показать `toast.error` с сообщением и прервать заказ.

3. **Передача из компонента** — в `CourseStoreManager.tsx` добавить новый проп `checkCourseLimit` и передать его в хук. В `OrganizationDashboard` (или где рендерится `CourseStoreManager`) прокинуть `checkLimit` из `useSubscriptionLimits`.

### Альтернативный вариант (проще)

Вызвать `useSubscriptionLimits` прямо внутри `useCourseStoreManager`, передав `organizationId` (который уже есть). Это избавит от необходимости прокидывать пропы через компоненты.

**Реализация:**
- В `useCourseStoreManager.ts`:
  - Импортировать `useSubscriptionLimits`
  - Вызвать `const { checkLimit } = useSubscriptionLimits(organizationId);`
  - В начале `handleOrder` добавить:
    ```typescript
    const limitResult = checkLimit('course');
    if (!limitResult.allowed) {
      toast.error(limitResult.message);
      setIsOrdering(false);
      return;
    }
    ```
  - После успешного клонирования вызвать `refetch()` для обновления счётчика

### Файлы
- `src/hooks/useCourseStoreManager.ts` — добавить проверку лимита в `handleOrder`

