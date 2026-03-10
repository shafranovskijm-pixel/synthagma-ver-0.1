

## Кнопка «Перейти на тариф» в toast при превышении лимитов

### Суть
Во всех местах, где показывается toast об ограничении тарифа, заменить простой текст на toast с кнопкой действия, которая переключает на вкладку «Тариф» (subscription).

### Точки изменения

**6 мест показывают toast при превышении лимитов:**

1. **`src/components/organization/tabs/CoursesTab.tsx`** — 2 места: `checkLimit('course')` → `toast.error(result.message)` (строки ~251, ~263)
2. **`src/components/organization/OrgDashboardHeader.tsx`** — `checkLimit('student')` → `toast.error(result.message)` (строка ~19)
3. **`src/hooks/useCourseLearning.ts`** — `toast.error(...)` при превышении maxTrainedPerMonth (строка ~502)
4. **`src/components/ImportStudentsForm.tsx`** — `toast({ variant: "destructive" })` при импорте (строка ~136)
5. **`src/components/company/EmployeeImportDialog.tsx`** — `toast({ variant: "destructive" })` при импорте сотрудников (строка ~83)
6. **`src/components/organization/tabs/CoursesTab.tsx`** — `toast.error` для `hasCourseSettings` (строка ~386)

### Подход

Использовать `toast()` из `sonner` с параметром `action`, который содержит кнопку. Sonner поддерживает:
```ts
toast.error("Сообщение", {
  action: {
    label: "Перейти на тариф",
    onClick: () => { /* навигация */ }
  }
});
```

**Навигация к вкладке подписки:**
- В компонентах внутри OrgDashboard — вызвать `d.tabNavigation.setActiveTab('subscription')` (через контекст)
- В `useCourseLearning.ts` — использовать `window.location` или передать callback. Проще всего: передать в toast `action` с `onClick`, который сделает программную навигацию через `window.dispatchEvent` или вернуть результат из хука

Наиболее чистый подход для `useCourseLearning.ts`: вместо показа toast изнутри хука — выбросить ошибку или вернуть объект `{ blocked: true }`, и обработать toast в вызывающем компоненте. Но это потребует рефакторинга. Проще — использовать `window.location.hash` или глобальный event.

**Решение**: создать утилиту `showLimitToast(message)` в отдельном файле, которая показывает toast с кнопкой. Кнопка будет диспатчить кастомный event `navigate-to-subscription`, а в OrgDashboard слушать его и переключать вкладку.

### Файлы

- **Новый**: `src/utils/limitToast.ts` — утилита `showLimitToast(message: string)`
- **Изменить**: `src/components/organization/tabs/CoursesTab.tsx` — заменить `toast.error(result.message)` на `showLimitToast(result.message)`
- **Изменить**: `src/components/organization/OrgDashboardHeader.tsx` — аналогично
- **Изменить**: `src/hooks/useCourseLearning.ts` — аналогично
- **Изменить**: `src/components/ImportStudentsForm.tsx` — аналогично
- **Изменить**: `src/components/company/EmployeeImportDialog.tsx` — аналогично
- **Изменить**: `src/components/organization/OrgDashboardLayout.tsx` или основной компонент дашборда — добавить listener на event `navigate-to-subscription` → `setActiveTab('subscription')`

