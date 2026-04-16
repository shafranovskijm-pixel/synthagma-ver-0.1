

# Массовое улучшение кода — 5 этапов до полной оптимизации

## Текущий прогресс

Уже оптимизировано в этой сессии:
- SelfExaminationQuiz: 1244 → 131 строк ✅
- AutoDocumentRegistrationJournal: 1226 → 217 ✅
- StudentsTab: 1196 → 248 ✅
- CoursesTab: 1379 → 554 ✅

Данные в devToolsData.ts **устарели** — не отражают выполненный рефакторинг.

## Этап 1: Оставшиеся файлы > 1000 строк (3 файла)

| Файл | Строк | Действие |
|------|-------|----------|
| CoursePreview.tsx (pages) | 1248 | Хук useCoursePreview + секции Hero/Content/Sidebar/Modules |
| OrganizationsManager.tsx | 1178 | Подключить useOrganizationsManager + OrgFormDialog + OrgStatsCards (уже созданы) |
| AdminBillingOverview.tsx | 1076 | Подключить useAdminBilling + BillingTable + BillingFilters |

**Обновить devToolsData.ts:** пометить SelfExamination, AutoDoc, StudentsTab как "applied", обновить line counts.

## Этап 2: Файлы 900–1075 строк (3 файла)

| Файл | Строк | Действие |
|------|-------|----------|
| OrgDocumentsManager.tsx | 1075 | Хук + подкомпоненты по типам документов |
| CompanyDetailDialog.tsx | 975 | Разбить на табы-компоненты |
| ContentGeneratorTab.tsx | 975 | Вынести форму генерации и результат |

**Обновить devToolsData.ts:** пометить этап 1 как "applied".

## Этап 3: Файлы 827–874 строк (5 файлов)

| Файл | Строк | Действие |
|------|-------|----------|
| AISettingsManager.tsx | 874 | Секции настроек в подкомпоненты |
| BulkContentGenerator.tsx | 867 | UI разбить (логика уже в хуке) |
| InvoiceGenerator.tsx | 846 | Preview + форма в подкомпоненты |
| JournalsManager.tsx | 841 | Декомпозиция по типам журналов |
| ConsentGenerator.tsx | 834 | Шаблоны + preview |

**Обновить devToolsData.ts:** пометить этап 2 как "applied".

## Этап 4: Файлы 791–827 строк (4 файла)

| Файл | Строк | Действие |
|------|-------|----------|
| CourseDetailsContent.tsx | 827 | Разбить на секции |
| ActGenerator.tsx | 827 | Preview + форма |
| CopiesDuplicatesJournal.tsx | 805 | Логика в хук |
| AutoFinalAttestationJournal.tsx | 791 | Логика в хук |

**Обновить devToolsData.ts:** пометить этап 3 как "applied".

## Этап 5: Финальное обновление + страницы > 700 строк

| Файл | Строк | Действие |
|------|-------|----------|
| LessonEditor.tsx | 726 | Секции редактора |
| StorageManager.tsx | 724 | Подкомпоненты хранилища |
| CourseGroupsTab.tsx | 666 | Подкомпоненты |
| CourseRemindersTab.tsx | 660 | Подкомпоненты |

**Финальное обновление devToolsData.ts:**
- Все метрики (файлы, строки, процент)
- Все recommendations → "applied"
- QUALITY_METRICS: крупнейший файл < 600, файлов > 800 = 0
- Context coverage пересчитать

## Стратегия для каждого файла

1. Хук `use{Name}.ts` — стейт, запросы, handlers
2. Подкомпоненты — таблицы, формы, диалоги
3. Главный файл — только layout (~100–200 строк)

## Создаваемые файлы

| Этап | Новых хуков | Новых компонентов | Рефакторинг |
|------|-------------|-------------------|-------------|
| 1 | 1 (useCoursePreview) | ~6 | 3 + devToolsData |
| 2 | 3 | ~9 | 3 + devToolsData |
| 3 | 2 | ~10 | 5 + devToolsData |
| 4 | 2 | ~8 | 4 + devToolsData |
| 5 | 0 | ~8 | 4 + devToolsData |

После каждого этапа — проверка TypeScript build и автоматический переход к следующему этапу без ожидания подтверждения.

