
# Декомпозиция и исправление всех рекомендаций Dev Tools

## Обзор

Реализация всех оставшихся рекомендаций из панели Dev Tools: декомпозиция крупных компонентов, консолидация дублирующихся хуков и типов, мемоизация списков, обновление статусов рекомендаций.

---

## 1. Декомпозиция крупных компонентов

### CourseBuilder.tsx (~2585 строк) -- самый крупный файл

Вынести в отдельные файлы:
- `src/utils/courseBuilderHelpers.ts` -- helper-функции: `getExternalStorageConfig`, `uploadToStorage`, `canEmbedInIframe`, `getVideoEmbedUrl`, `isIframeEmbed`, `parseSliderContent` (~200 строк)
- `src/components/course-builder/VideoPreviewInline.tsx` -- компонент предпросмотра видео (~60 строк)
- `src/components/course-builder/SliderLessonEditor.tsx` -- редактор слайдов (~150 строк)
- `src/components/course-builder/LessonTypeConfig.ts` -- константы `lessonIcons`, `lessonColors`, интерфейсы `TestQuestionLocal`, `Lesson`, `LessonType` (~50 строк)

Итого вынос ~460 строк, основной файл сокращается до ~2100.

### OrganizationDashboard.tsx (~686 строк)

Вынести:
- `src/hooks/useOrganizationDashboard.ts` -- объединяющий хук, который инициализирует все под-хуки и возвращает единый объект состояния (~180 строк). Это уберёт ~150 строк инициализации хуков из компонента.
- `src/components/organization/OrgDashboardHeader.tsx` -- header с кнопками действий по вкладкам (~80 строк)

Основной файл сокращается до ~450 строк.

### DevToolsPanel.tsx (~789 строк)

Вынести:
- `src/components/admin/devtools/CodeMapTab.tsx` -- вкладка "Карта кода" с анализом (~120 строк)
- `src/components/admin/devtools/HealthTab.tsx` -- вкладка "Здоровье" с рекомендациями (~130 строк)
- `src/components/admin/devtools/devToolsData.ts` -- все константы: CODE_TREE, EDGE_FUNCTIONS, CATEGORY_META, CODE_RECOMMENDATIONS, SEVERITY_CONFIG (~280 строк)

Основной файл сокращается до ~260 строк.

---

## 2. Консолидация дублирующихся хуков

### useStudentFilters + useStudentFiltersState

`useStudentFiltersState.ts` удаляется. Остаётся только `useStudentFilters.ts` -- он уже содержит расширенную логику (studentsWithoutEnrollments, filterCounts, resetFilters). Все импорты обновляются.

### useCourseActions -- локальная дублирующая типизация

В `useCourseActions.ts` определены локальные интерфейсы `Course` и `Student`, которые дублируют `src/types/shared.ts`. Заменить на импорт из `@/types/shared`.

---

## 3. Консолидация типов

Сейчас типы дублируются между `shared.ts`, `student.ts`, `course.ts`, `organization.ts`:
- `Student` есть в `shared.ts` и `student.ts` (разные версии)
- `Course` есть в `shared.ts` и `course.ts`
- `Company`, `DocumentsStats` есть в `shared.ts` и `organization.ts`

Решение: сделать `shared.ts` реэкспортом из доменных файлов, убрав дубликаты. Типы в `shared.ts` будут ссылаться на `student.ts` / `course.ts` / `organization.ts`.

---

## 4. React.memo для крупных списков

Обернуть в `React.memo`:
- `src/components/organization/tabs/StudentsTab.tsx`
- `src/components/organization/tabs/CoursesTab.tsx`
- `src/components/organization/tabs/DocumentsTab.tsx`

---

## 5. Обновление статусов рекомендаций в Dev Tools

Все реализованные рекомендации помечаются как "applied":
- `large-components` -- "Декомпозиция выполнена"
- `duplicate-hooks` -- "Хуки консолидированы"
- `types-consolidation` -- "Типы консолидированы"
- `memo-optimization` -- "React.memo добавлен"

---

## Изменения по файлам

| Файл | Действие |
|---|---|
| `src/utils/courseBuilderHelpers.ts` | Новый -- helper-функции из CourseBuilder |
| `src/components/course-builder/VideoPreviewInline.tsx` | Новый -- компонент видео-превью |
| `src/components/course-builder/SliderLessonEditor.tsx` | Новый -- уже существует как вложенная функция, выносится |
| `src/components/course-builder/LessonTypeConfig.ts` | Новый -- типы и константы уроков |
| `src/pages/CourseBuilder.tsx` | Рефакторинг -- импорт вынесенных модулей |
| `src/hooks/useOrganizationDashboard.ts` | Новый -- объединяющий хук |
| `src/components/organization/OrgDashboardHeader.tsx` | Новый -- header дашборда |
| `src/pages/OrganizationDashboard.tsx` | Рефакторинг -- использование нового хука и header |
| `src/components/admin/devtools/devToolsData.ts` | Новый -- константы |
| `src/components/admin/devtools/CodeMapTab.tsx` | Новый -- вкладка кода |
| `src/components/admin/devtools/HealthTab.tsx` | Новый -- вкладка здоровья |
| `src/components/admin/DevToolsPanel.tsx` | Рефакторинг -- импорт подкомпонентов |
| `src/hooks/useCourseActions.ts` | Рефакторинг -- импорт типов из shared |
| `src/types/shared.ts` | Рефакторинг -- реэкспорт без дублирования |
| `src/hooks/useStudentFiltersState.ts` | Удаляется (если используется -- заменяется на useStudentFilters) |
| `src/components/organization/tabs/StudentsTab.tsx` | React.memo обёртка |
| `src/components/organization/tabs/CoursesTab.tsx` | React.memo обёртка |
| `src/components/organization/tabs/DocumentsTab.tsx` | React.memo обёртка |
