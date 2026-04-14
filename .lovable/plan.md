

# Декомпозиция критичных файлов проекта

Все 5 критичных рекомендаций + 2 предупреждения из DevTools Health будут исправлены.

## 1. AdminAnalytics (1435 → ~200 + 7 подкомпонентов)

**Хук `useAdminAnalytics.ts`** (~150 строк) — вся логика загрузки данных, `fetchAnalytics`, `useMemo` для `profilesMap`, `coursesMap`, фильтры по периоду.

**7 компонентов-вкладок** в `src/components/admin/analytics/`:
- `RegistrationsChart.tsx` — вкладка «Регистрации» (строки 791–850)
- `ActivityChart.tsx` — «Активность» (852–895)
- `VisitsChart.tsx` — «Посещения» (897–1097, самый большой ~200 строк)
- `CompletionsChart.tsx` — «Завершения» (1099–1139)
- `PaymentsChart.tsx` — «Оплаты» (1141–1213)
- `FeaturesChart.tsx` — «Функции» (1215–1255)
- `OverviewCards.tsx` — «Обзор» + карточки-метрики (1257–конец + 647–780)

**AdminAnalytics.tsx** остаётся оркестратором: `useAdminAnalytics()` + табы с подкомпонентами (~200 строк).

## 2. CoursesTab (1747 → ~300 + 5 подкомпонентов)

**Хук `useCoursesTab.ts`** (~200 строк) — стейты диалогов, обработчики (handleCreate, handleDuplicate, handleDelete, handleCoverUpload, handleGenerateCover, handleMoveCourse, handleBulkDelete).

**Подкомпоненты** в `src/components/organization/tabs/courses/`:
- `CoursesEmptyState.tsx` — уже есть как внутренняя функция, вынести (строки 43–143)
- `CourseListRow.tsx` — SortableCourseListRow (строки 145–240)
- `CourseGridCard.tsx` — карточка в режиме сетки (извлечь из JSX)
- `CourseDialogs.tsx` — все 4 диалога: создание, категория, перемещение, удаление (строки 1547–1743)
- `CoursesToolbar.tsx` — панель фильтров/поиска/вида

**CoursesTab.tsx** — оркестратор ~300 строк.

## 3. BlockEditorMain (1461 → ~250 + подкомпоненты)

**Подкомпоненты** в `src/components/course-builder/block-editor/blocks/`:
- `TextBlocks.tsx` — ParagraphBlock, QuoteBlock, CalloutBlock, HighlightBlock, AccordionBlock (~250 строк)
- `QuizBlock.tsx` — тест-блок (~100 строк)
- `MediaBlocks.tsx` — ImageBlock, VideoBlock, AudioBlock, DocumentBlock, DirectVideoBlock (~350 строк)
- `SliderBlock.tsx` — слайдер (~160 строк)
- `BlockContent.tsx` — диспетчер BlockContent (~60 строк)
- `AddBlockButton.tsx` — кнопка добавления + BlockCategoryGrid + AIGenerateButton (~80 строк)

**SortableBlockItem** остаётся в BlockEditorMain или выносится в отдельный файл (~280 строк).

**BlockEditorMain.tsx** — оркестратор ~250 строк.

## 4. OrganizationDetailsView (1790 → дальнейшая декомпозиция)

Уже частично оптимизирован (1969→1790). Следующий шаг:
- **Хук `useOrgDetailsView.ts`** — вся логика сохранения, загрузки, стейты
- **`OrgSettingsPanel.tsx`** — содержимое вкладки «Настройки»
- **Навигация** — вынести в `OrgDetailsNav.tsx`

Статус рекомендации: `checked` → `applied`.

## 5. Обновление devToolsData.ts

После декомпозиции — обновить все метрики:
- Критичные файлы получат статус `applied`
- «28 файлов > 800 строк» → пересчитать (станет ~20–22)
- Добавить info-записи о выполненных рефакторингах

## Файлы (создание/изменение)

| Действие | Файл |
|----------|------|
| Создать | `src/hooks/useAdminAnalytics.ts` |
| Создать | `src/components/admin/analytics/RegistrationsChart.tsx` |
| Создать | `src/components/admin/analytics/ActivityChart.tsx` |
| Создать | `src/components/admin/analytics/VisitsChart.tsx` |
| Создать | `src/components/admin/analytics/CompletionsChart.tsx` |
| Создать | `src/components/admin/analytics/PaymentsChart.tsx` |
| Создать | `src/components/admin/analytics/FeaturesChart.tsx` |
| Создать | `src/components/admin/analytics/OverviewCards.tsx` |
| Изменить | `src/components/admin/AdminAnalytics.tsx` (1435→~200) |
| Создать | `src/hooks/useCoursesTab.ts` |
| Создать | `src/components/organization/tabs/courses/CoursesEmptyState.tsx` |
| Создать | `src/components/organization/tabs/courses/CourseListRow.tsx` |
| Создать | `src/components/organization/tabs/courses/CourseDialogs.tsx` |
| Создать | `src/components/organization/tabs/courses/CoursesToolbar.tsx` |
| Изменить | `src/components/organization/tabs/CoursesTab.tsx` (1747→~300) |
| Создать | `src/components/course-builder/block-editor/blocks/TextBlocks.tsx` |
| Создать | `src/components/course-builder/block-editor/blocks/QuizBlock.tsx` |
| Создать | `src/components/course-builder/block-editor/blocks/MediaBlocks.tsx` |
| Создать | `src/components/course-builder/block-editor/blocks/SliderBlock.tsx` |
| Создать | `src/components/course-builder/block-editor/blocks/BlockContent.tsx` |
| Создать | `src/components/course-builder/block-editor/blocks/AddBlockButton.tsx` |
| Изменить | `src/components/course-builder/block-editor/BlockEditorMain.tsx` (1461→~250) |
| Создать | `src/hooks/useOrgDetailsView.ts` |
| Создать | `src/components/admin/org-details/OrgSettingsPanel.tsx` |
| Создать | `src/components/admin/org-details/OrgDetailsNav.tsx` |
| Изменить | `src/components/admin/OrganizationDetailsView.tsx` (1790→~400) |
| Изменить | `src/components/admin/devtools/devToolsData.ts` |

~27 файлов. Все существующие импорты продолжат работать через re-export shims.

