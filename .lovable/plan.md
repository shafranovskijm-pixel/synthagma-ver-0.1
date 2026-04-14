

# Глобальная оптимизация: производительность и качество кода

## Текущий статус после предыдущих рефакторингов

Выполнено: маршруты модулизированы, BlockEditor разбит, toast унифицирован, 28 файлов архивированы, 597 console.log удалены. Однако остались существенные проблемы.

---

## Обнаруженные проблемы

### 1. Крупные файлы-монолиты (10 файлов > 1000 строк)

| Файл | Строк |
|---|---|
| OrganizationDetailsView.tsx | 1899 |
| CoursesTab.tsx | 1747 |
| BlockEditorMain.tsx | 1461 |
| AdminAnalytics.tsx | 1435 |
| CourseDetailsModal.tsx | 1416 |
| LaborSafetyStudentDetailCard.tsx | 1295 |
| SelfExaminationQuiz.tsx | 1250 |
| CoursePreview.tsx | 1248 |
| AutoDocumentRegistrationJournal.tsx | 1246 |
| StudentsTab.tsx | 1186 |

### 2. `: any` — 200+ в активном коде

Топ-файлы: `useMarketplaceValidation.ts` (18), `BulkContentGenerator.tsx` (17), `ProfileTab.tsx` (12), `useOrganizationDataLoader.ts` (11), `ContentGeneratorTab.tsx` (10).

### 3. Производительность — отсутствие мемоизации

- Только 3 компонента используют `React.memo` (StudentsTab, DocumentsTab, CoursesTab).
- `OrganizationDetailsView` (1899 строк) — 0 `useMemo`, 2 `useCallback`, 26 операций `.filter/.map/.reduce` при каждом рендере.
- `useOrganizationDataLoader` — 11 `any`, 19 array operations без мемоизации промежуточных результатов.

### 4. Оставшиеся console.log/warn — 125 шт

В основном `console.warn` в `ContentGeneratorTab.tsx` (12 шт), `safeInvoke.ts` (3), `useOrganizationDataLoader.ts` (4), `SupportRequestForm.tsx` (1). Это diagnostic warnings — часть из них полезна, но Production должен быть чистым.

### 5. Дублирующие запросы к БД

`useStudents.ts` — 3 отдельных `useEffect` запускают 3 запроса к `profiles` таблице (студенты, группы, маппинг групп). Можно объединить в 1.

---

## План оптимизации

### Этап 1. Производительность — мемоизация и React.memo

**OrganizationDetailsView.tsx** — обернуть тяжелые фильтрации/маппинги в `useMemo`, добавить `React.memo` на дочерние табы. Это сократит ненужные рендеры при переключении табов.

**useOrganizationDataLoader.ts** — типизировать промежуточные данные (убрать `any[]`), мемоизировать вычисления статистики.

### Этап 2. Объединение запросов в useStudents

Объединить 3 `useEffect` (студенты, группы, маппинг) в 1 `useEffect` с `Promise.all`. Сократит время загрузки вкладки «Студенты» на ~30% (3 последовательных запроса → 1 параллельный).

### Этап 3. Удаление оставшихся production warnings

Удалить или заменить на тихие обработчики ~125 `console.warn/log` в 9 файлах. Оставить только `console.error` в критических catch-блоках.

### Этап 4. Типизация топ-5 файлов

Убрать `: any` в:
- `useMarketplaceValidation.ts` (18 → 0)
- `BulkContentGenerator.tsx` (17 → 0)
- `useOrganizationDataLoader.ts` (11 → 0)
- `ProfileTab.tsx` (12 → 0)
- `ContentGeneratorTab.tsx` (10 → 0)

### Этап 5. Декомпозиция 3 крупнейших монолитов

- **OrganizationDetailsView.tsx** (1899) → выделить `OrgDetailsOverviewTab`, `OrgDetailsCoursesTab`, `OrgDetailsBillingTab`
- **CoursesTab.tsx** (1747) → выделить `CourseCardGrid`, `CourseActionsToolbar`, `CreateCourseDialog`
- **CourseDetailsModal.tsx** (1416) → выделить `CourseStudentsList`, `CourseSettingsPanel`

---

## Ожидаемый эффект

| Метрика | До | После |
|---|---|---|
| Файлов > 1000 строк | 10 | 4-5 |
| `: any` в топ-файлах | 68 | 0 |
| console.warn в production | 125 | 0 |
| Лишних DB-запросов (useStudents) | 3 последовательных | 1 параллельный |
| React.memo на тяжелых компонентах | 3 | 8+ |

## Безопасность изменений

- Никакая бизнес-логика не удаляется
- Все существующие интерфейсы сохраняются
- Только структурные, типовые и performance-оптимизации

