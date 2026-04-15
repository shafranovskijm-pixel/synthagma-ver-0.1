

# Карточка ученика внутри дашборда + пагинация + «Войти как ученик»

## 3 задачи

### 1. Карточка ученика — вкладка в дашборде (как курс)
Сейчас `onViewStudent` → `navigate("/organization/student/:id")` — отдельная страница с собственным хедером/сайдбаром. Нужно открывать как вкладку `"student-details"` внутри основного дашборда, аналогично `"course-details"`.

**Изменения:**
- `OrgSidebar.tsx` — добавить `"student-details"` в `TabType`
- `useTabNavigation.ts` — добавить `selectedStudentId` / `setSelectedStudentId`
- `useStudentDetailCard.ts` — вместо `navigate(...)` → вызывать `setSelectedStudentId` + `setActiveTab("student-details")`
- Новый `StudentDetailsTab.tsx` — обёртка, берёт `selectedStudentId` из контекста, рендерит содержимое карточки (логика из `OrganizationStudentDetails.tsx`): вертикальное меню + контент (Личное дело, Идентификация, Курсы, Документы, Активность, Чат). Кнопка «Назад» → `setActiveTab("students")`
- `TabContentRenderer.tsx` — рендер `StudentDetailsTab` при `activeTab === "student-details"`, добавить в `shouldShowStatsCards` исключение
- `OrganizationStudentDetails.tsx` — редирект → `/organization?tab=student-details&studentId=...`
- `OrganizationDashboard.tsx` — обработка `?studentId=` query param

### 2. «Войти как ученик» в хедере карточки
Кнопка уже есть в `OrganizationStudentDetails.tsx`. Перенести её в `StudentDetailsTab.tsx` — показывать вверху рядом с кнопкой «Назад». Использует тот же `adminViewAsStudent` localStorage механизм с `orgReturn: '/organization'`.

### 3. Пагинация списка учеников (10 по умолчанию)
В `StudentsTab.tsx` сейчас все ученики показываются сразу. Добавить:
- Состояние `pageSize` (по умолчанию 10) с выбором 10 / 25 / 50 / 100
- Состояние `currentPage`
- Применять `slice()` к отфильтрованному списку
- UI: внизу таблицы — навигация по страницам + выбор количества на странице

## Файлы

| Файл | Действие |
|---|---|
| `src/components/organization/OrgSidebar.tsx` | Добавить `"student-details"` в `TabType` |
| `src/hooks/useTabNavigation.ts` | Добавить `selectedStudentId` / `setSelectedStudentId` |
| `src/hooks/useStudentDetailCard.ts` | Переключать на вкладку вместо навигации |
| `src/components/organization/tabs/StudentDetailsTab.tsx` | Новый — обёртка карточки ученика |
| `src/components/organization/tabs/TabContentRenderer.tsx` | Рендер `StudentDetailsTab` |
| `src/components/organization/tabs/StudentsTab.tsx` | Пагинация (10/25/50/100) |
| `src/pages/OrganizationStudentDetails.tsx` | Редирект в дашборд |
| `src/pages/OrganizationDashboard.tsx` | Обработка `?studentId=` |

