

# Рефакторинг — Продолжение: Декомпозиция крупных файлов + типизация

## Текущий статус

Выполнено ранее:
- BlockEditor разбит на 6 файлов
- console.log удалены (597 → 0)
- Toast унифицирован на Sonner
- 28 мёртвых файлов архивированы
- Маршруты модулизированы

## Что осталось

| Проблема | Масштаб |
|---|---|
| Крупные файлы (800+ строк) | 28 файлов |
| Использования `: any` | 365 шт в 132 файлах |
| Топ-6 файлов-монолитов | 2233, 1899, 1747, 1461, 1435, 1416 строк |

---

## План работ

### Этап 1. Декомпозиция AdminMarketplaceManager (2233 строк)

Вынести из монолита:
- `MarketplaceCourseRow.tsx` — рендер строки курса в таблице (функции `CourseRow`, `GroupedCourseRow`, `CoursesTable`)
- `MarketplaceBulkActions.tsx` — функции `handleBulkValidate`, `handleAutoFix`, `handleBulkGenerate` (~500 строк)
- `MarketplaceCourseForm.tsx` — диалог создания/редактирования курса

### Этап 2. Декомпозиция OrganizationDetailsView (1899 строк)

Разбить по табам:
- `OrgDetailsOverviewTab.tsx` — общая информация и настройки
- `OrgDetailsCoursesTab.tsx` — курсы организации
- `OrgDetailsStudentsTab.tsx` — студенты организации
- `OrgDetailsBillingTab.tsx` — биллинг и подписки

### Этап 3. Декомпозиция CoursesTab (1747 строк)

Вынести:
- `CourseCardItem.tsx` — карточка курса
- `CourseListFilters.tsx` — фильтры и поиск
- `CourseActionButtons.tsx` — кнопки действий

### Этап 4. Типизация — убрать `: any` в ключевых файлах

Приоритетные файлы (наибольшее кол-во `any`):
- `AdminMarketplaceManager.tsx` — ~30 any → типизировать через DB-типы
- `ContentGeneratorTab.tsx` — ~12 any → lesson/block типы
- `api/students.ts` — ~6 any → enrollment/profile типы
- `api/courses.ts` — ~3 any → course типы
- `AdminBillingOverview.tsx` — ~5 any → invoice/contract типы

Не трогаем `error: any` в catch-блоках — это допустимый паттерн.

### Этап 5. Документ-генераторы — общий базовый паттерн

`ActGenerator`, `InvoiceGenerator`, `ConsentGenerator` — 3 файла × ~830 строк с идентичной структурой (загрузка данных орг., preview, export).
Вынести общую логику загрузки данных организации в хук `useOrganizationDetails.ts`.

---

## Порядок выполнения

Последовательно, этап за этапом. Каждый этап — обратносовместимый через реэкспорты. Начинаю с Этапа 1 (AdminMarketplaceManager) как самого крупного файла.

## Ожидаемый эффект

| Метрика | До | После |
|---|---|---|
| Макс. размер файла | 2233 строк | ~600 строк |
| `: any` | 365 | ~100 (только catch + DB callbacks) |
| Файлов > 1000 строк | 15 | 6-7 |

