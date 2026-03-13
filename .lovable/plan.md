

## План: Создать 6 категорий в БД и обновить админ-панель маркетплейса

### 1. Миграция БД

- Добавить колонку `order_index` (integer, default 0) в `course_categories` для сортировки/перемещения
- Вставить 6 категорий для организации `4ac2c05a-d8b5-4e72-ba31-f2c743091d95`:

| # | Название | Цвет | order_index |
|---|----------|------|-------------|
| 1 | Промышленная безопасность | #ef4444 | 0 |
| 2 | Электробезопасность | #3b82f6 | 1 |
| 3 | Энергетика | #f59e0b | 2 |
| 4 | Экологическая безопасность | #10b981 | 3 |
| 5 | Гидротехнические сооружения | #6366f1 | 4 |
| 6 | Строительный контроль | #8b5cf6 | 5 |

### 2. `useAdminMarketplace.ts`

- Исправить `fetchDbCategories` — использовать `MARKETPLACE_ORG_ID` вместо `00000000-...`
- Сортировать категории по `order_index`
- Добавить функции для перемещения категорий (drag-and-drop через `order_index`): `handleReorderCategory(categoryId, newIndex)`
- Добавить функции для перемещения курса в категорию через `category_id` в `courses` (вместо переименования title)

### 3. `AdminMarketplaceManager.tsx`

- В каталоге: группировать курсы по `category_id` → `dbCategories` (вместо парсинга заголовков)
- Добавить drag-and-drop для категорий через `@dnd-kit/sortable` (уже установлен)
- На каждой категории показать кнопку перетаскивания (GripVertical)
- В диалоге «Переместить в категорию» — использовать DB-категории через Select

### Файлы

| Файл | Изменение |
|---|---|
| `supabase/migrations/...` | ALTER TABLE + INSERT 6 categories |
| `src/hooks/useAdminMarketplace.ts` | Fetch с правильным org_id, reorder logic, category-based grouping |
| `src/components/admin/AdminMarketplaceManager.tsx` | DnD-сортировка категорий, обновлённый рендер каталога |

