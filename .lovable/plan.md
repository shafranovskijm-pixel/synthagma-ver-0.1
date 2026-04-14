

# Глубокий рефакторинг кодовой базы

## Обзор

Кодовая база — ~147K строк. Основные проблемы:
- **BlockEditor.tsx** — 3043 строки, 20+ компонентов в одном файле
- **AdminMarketplaceManager.tsx** — 2283 строки
- 75+ использований `: any` в хуках
- console.log в production-коде (useAuth, useVideoProgress и др.)
- App.tsx — 280 строк маршрутов без группировки
- Повторяющиеся паттерны в organization-компонентах (журналы, генераторы документов)

## Стратегия

Разбиваем на **5 этапов**, каждый — самостоятельный и не ломает предыдущий. Выполняем последовательно.

---

### Этап 1. Декомпозиция BlockEditor (3043 → ~8 файлов)

Создать `src/components/course-builder/block-editor/` с подмодулями:

| Новый файл | Что переносим |
|---|---|
| `types.ts` | `BlockType`, `ContentBlock`, `QuizOption`, `SliderSlide`, `StylePreset` + утилиты `createBlock`, `blockTypeConfig`, `blockCategories`, `calloutItems` |
| `utils.ts` | `linkifyHtml`, `sanitizeHtml`, `renderHtml`, `summarizeExistingContent`, `loadPresets`, `savePresets`, `extractStyle`, `describeStyle` |
| `parsers.ts` | `blocksToJson`, `jsonToBlocks`, `markdownToBlocks`, `htmlToBlocks`, `normalizeLines` |
| `BlockRenderer.tsx` | `BlockRenderer`, `RenderBlock` + все read-only рендереры |
| `blocks/MediaBlocks.tsx` | `ImageBlock`, `VideoBlock`, `AudioBlock`, `DocumentBlock`, `SliderBlock`, `DirectVideoBlock` |
| `blocks/TextBlocks.tsx` | `ParagraphBlock`, `QuoteBlock`, `CalloutBlock`, `HighlightBlock`, `AccordionBlock`, `QuizBlock` |
| `SortableBlockItem.tsx` | `SortableBlockItem`, `BlockContent`, `AddBlockButton`, `BlockCategoryGrid`, `AIGenerateButton` |
| `index.ts` | Реэкспорт всех публичных API (чтобы существующие импорты `from "@/components/course-builder/BlockEditor"` **продолжали работать**) |

**Переходный `BlockEditor.tsx`** — остаётся как реэкспорт из `block-editor/index.ts` для обратной совместимости.

---

### Этап 2. Типизация хуков — убрать `any`

Файлы с наибольшим количеством `any`:

| Файл | Проблема | Решение |
|---|---|---|
| `useBulkPipeline.ts` | 12× `any` — `error: any`, `data: any`, `q: any`, `l: any` | Типизировать через существующие типы из `types/` |
| `useCourseBuilder.ts` | `l: any`, `error: any` | Использовать `Lesson`, `Error` |
| `useCompaniesManager.ts` | `updateData: any` | Определить `CompanyUpdatePayload` |
| `useCompanyStudentsManager.ts` | `e: any`, `p: any` | Типизировать через DB-типы |
| `useAdminMarketplace.ts` | `error: any` | `Error` |

Также удалить `console.log` из:
- `useAuth.tsx` (8 шт)
- `useVideoProgress.ts` (6 шт)
- `AdminMarketplaceManager.tsx` (7 шт)

---

### Этап 3. Рефакторинг маршрутизации App.tsx

Текущая структура — плоский список 60+ маршрутов. Разбить на модули:

```text
src/routes/
  publicRoutes.tsx      — /, /login, /features, /blog, /about, /privacy...
  studentRoutes.tsx     — /student/*, /course/*/learn
  organizationRoutes.tsx — /organization/*, /course-builder, /course-*/edit
  adminRoutes.tsx       — /admin, /sales
  partnerRoutes.tsx     — /partner/*
  companyRoutes.tsx     — /company
```

`App.tsx` станет ~50 строк: провайдеры + `<Routes>{...allRoutes}</Routes>`.

Также вынести обёртку `ProtectedRoute` в хелпер:
```tsx
const protectedRoute = (el: JSX.Element, role?: string) => (
  <ProtectedRoute requiredRole={role}>{el}</ProtectedRoute>
);
```

---

### Этап 4. Декомпозиция крупных компонентов

**AdminMarketplaceManager.tsx (2283 строк)**:
- Вынести таб-контент в отдельные компоненты (часть уже вынесена — `BulkCourseImporter`, `ContentGeneratorTab` и т.д.)
- Выделить `MarketplaceCourseEditor.tsx` — форма создания/редактирования курса
- Выделить `MarketplaceOrdersList.tsx` — таблица заказов
- Выделить `MarketplaceCategoryManager.tsx` — управление категориями

**OrganizationDetailsView.tsx (1900 строк)**:
- Разбить на табы: `OrgDetailsOverview`, `OrgDetailsSubscription`, `OrgDetailsCourses`

**CoursesTab.tsx (1747 строк)**:
- Выделить `CourseCard.tsx`, `CourseFilters.tsx`, `CourseActions.tsx`

---

### Этап 5. Оптимизация ре-рендеров и общие паттерны

1. **Мемоизация тяжёлых компонентов**: обернуть в `React.memo` компоненты-списки (`CourseCard`, `StudentRow`, `BlockItem`)
2. **Вынести общий паттерн журналов**: `AutoDocumentRegistrationJournal`, `AutoFinalAttestationJournal`, `CopiesDuplicatesJournal` — похожая структура. Создать `BaseJournal` компонент с конфигурацией колонок
3. **Вынести общий паттерн генераторов документов**: `ActGenerator`, `ConsentGenerator`, `InvoiceGenerator` — обобщить шаблон с preview + export

---

## Гарантии безопасности

- Каждый этап — отдельный коммит
- Все существующие импорты сохраняются через реэкспорты
- Никакой бизнес-логики не удаляется и не меняется
- Только структурные изменения: перемещение кода, добавление типов, удаление `console.log`

## Порядок выполнения

Начинаем с **Этапа 1** (BlockEditor) — наибольший эффект при минимальном риске, так как все импорты проходят через один файл.

