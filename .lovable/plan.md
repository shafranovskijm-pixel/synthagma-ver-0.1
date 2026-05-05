## Проблема

Кнопка «Создать курс» в шапке дашборда (`OrgDashboardHeader.tsx`, активная вкладка `courses`) делает `navigate("/course-builder")` — переход на отдельную страницу без id, где открывается чистый конструктор. Это и есть «отдельное окно» на скриншоте.

Аналогичные «прыжки» на `/course-builder` есть в `QuickActionChips.tsx` и `QuickStartCard.tsx`.

## Что менять

Заменить переход на навигацию внутри дашборда + открытие диалога «Создать курс», который уже есть в `CoursesTab.tsx` (`showCreateCourseDialog`). После создания курс откроется встроенной вкладкой (это починили предыдущим шагом).

### 1. `src/components/organization/tabs/CoursesTab.tsx`
Добавить `useEffect`, слушающий глобальное событие `org-create-course` — при получении вызывать `handleOpenCreateCourseDialog()`.

### 2. `src/components/organization/OrgDashboardHeader.tsx`
Кнопка «Создать курс» (строка 358):
- переключает вкладку на `courses`,
- через `setTimeout(..., 0)` диспатчит `window.dispatchEvent(new CustomEvent('org-create-course'))`.

### 3. `src/components/organization/QuickActionChips.tsx`
Действие `"Создать курс"` — заменить `navigate("/course-builder")` на ту же связку (переключение вкладки + событие).

### 4. `src/components/organization/QuickStartCard.tsx`
Шаг создания курса — заменить `window.location.assign("/course-builder")` на `dashboard.tabNavigation.setActiveTab("courses")` + событие.

## Технические детали

- Событие через `window.dispatchEvent` использует тот же паттерн, что уже применяется в проекте (`org-add-company`, `org-sales-create-deal`).
- Никакой роутинг не ломаем: прямой переход по URL `/course-builder/:id` (редактирование существующего курса, кнопка «Редактировать» в строчном виде) остаётся без изменений.
- Диалог `CreateCourseDialog` уже корректно создаёт курс и (после предыдущей правки) открывает его внутри дашборда через `handleCourseClick`.
