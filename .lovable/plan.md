

# Курс как вкладка в основном дашборде

## Суть
Сейчас при клике на курс происходит `navigate("/organization/course/:id")` — отдельная страница. Нужно, чтобы курс открывался прямо в основном окне дашборда как ещё одна вкладка (аналогично профилю/настройкам).

## Решение

### 1. Добавить `"course-details"` в `TabType` (`OrgSidebar.tsx`)
Новый тип вкладки для отображения деталей курса.

### 2. Состояние выбранного курса в контексте
В `useOrganizationDashboard` (или `useTabNavigation`) добавить `selectedCourseId: string | null` и `setSelectedCourseId`. При выборе курса — устанавливать ID и переключать `activeTab` на `"course-details"`.

### 3. Изменить навигацию в `TabContentRenderer.tsx`
- Вместо `navigate("/organization/course/${course.id}")` → `setSelectedCourseId(course.id)` + `setActiveTab("course-details")`
- Добавить рендер `CourseDetailsContent` при `activeTab === "course-details"` (с загрузкой данных курса по `selectedCourseId`)

### 4. Создать обёртку `CourseDetailsTab.tsx`
Новый компонент, который берёт `selectedCourseId` из контекста, загружает данные курса (логика из `OrganizationCourseDetails.tsx`) и рендерит `CourseDetailsContent`. Кнопка «Назад» → `setActiveTab("courses")`.

### 5. Обратная совместимость
`OrganizationCourseDetails.tsx` → `<Navigate to="/organization?tab=course-details&courseId=..." />` или оставить как fallback для прямых ссылок.

### 6. Скрыть stats cards и banner для `course-details`
Добавить в `shouldShowStatsCards` исключение.

## Файлы

| Файл | Действие |
|---|---|
| `src/components/organization/OrgSidebar.tsx` | Добавить `"course-details"` в `TabType` |
| `src/components/organization/tabs/CourseDetailsTab.tsx` | Новый — обёртка с загрузкой курса |
| `src/components/organization/tabs/TabContentRenderer.tsx` | Рендер `CourseDetailsTab`, изменить навигацию курса |
| `src/hooks/useTabNavigation.ts` | Добавить `selectedCourseId` / `setSelectedCourseId` |
| `src/pages/OrganizationCourseDetails.tsx` | Редирект в дашборд |
| `src/pages/OrganizationDashboard.tsx` | Обработка `?courseId=` query param |

