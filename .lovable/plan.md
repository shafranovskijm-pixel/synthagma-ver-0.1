

## План: Создание подкатегорий в любом типе программ + выбор иконки

### Проблема

Сейчас все DB-категории жёстко привязаны к «Повышение квалификации». Нельзя:
- Создать подкатегорию внутри «Профессиональная переподготовка», «ОТ/ПБ» или «Рабочие профессии»
- Выбрать иконку для категории
- Создать категорию на уровне рядом с основными типами программ

### Решение

#### 1. Миграция: добавить поля `parent_type` и `icon` в `course_categories`

```sql
ALTER TABLE public.course_categories
  ADD COLUMN IF NOT EXISTS parent_type text DEFAULT 'Повышение квалификации',
  ADD COLUMN IF NOT EXISTS icon text DEFAULT NULL;
```

`parent_type` — строка, совпадающая с ключами `programTypeMetaAdmin` (или `__root__` для категорий верхнего уровня). `icon` — имя иконки из lucide (например `Factory`, `Zap`).

#### 2. Обновить `useAdminMarketplace.ts` — группировка по `parent_type`

Сейчас (строки 360-374): все `dbCategories` идут в `subGroups` у «Повышение квалификации».

Изменение: распределять `dbCategories` по `parent_type` — каждый программный тип получает только свои подкатегории. Курсы без категории остаются в «Повышение квалификации» (или первом типе).

```text
groupedCourses = [
  { category: "Повышение квалификации", subGroups: categories.filter(c => c.parent_type === "Повышение квалификации") },
  { category: "Профессиональная переподготовка", subGroups: categories.filter(c => c.parent_type === "Профессиональная переподготовка") },
  { category: "ОТ / ПБ", subGroups: categories.filter(c => c.parent_type === "ОТ / ПБ") },
  { category: "Рабочие профессии", subGroups: categories.filter(c => c.parent_type === "Рабочие профессии") },
]
```

#### 3. Обновить диалог «Создать категорию» — добавить выбор родителя и иконки

В `AdminMarketplaceManager.tsx` (строки 1243-1272):

- Добавить **Select** «Родительский тип программы» с вариантами: Повышение квалификации, Профпереподготовка, ОТ/ПБ, Рабочие профессии
- Добавить **Picker иконок** — сетка из ~12 предустановленных иконок lucide (Factory, Zap, Flame, Leaf, Droplets, HardHat, ShieldCheck, BookOpen, Award, Lightbulb, Building2, GraduationCap) — кликнул = выбрал
- Сохранять `parent_type` и `icon` в DB при создании

#### 4. Обновить отображение подкатегорий — использовать DB-иконку

В строках 834-846: вместо lookup по `subCategoryMetaAdmin[sub.category]` использовать `sub.icon` из DB. Маппинг строки иконки → компонент lucide через словарь.

#### 5. Обновить `handleCreateCategory` — сохранять в DB вместо local state

Текущий `handleCreateCategory` (строка 377-388) добавляет в `customCategories` (local state). Заменить на INSERT в `course_categories` с `parent_type`, `icon`, `color`, `order_index`.

### Файлы

| Файл | Что меняется |
|---|---|
| Миграция SQL | `parent_type` text + `icon` text в `course_categories` |
| `src/hooks/useAdminMarketplace.ts` | Группировка subGroups по parent_type; handleCreateCategory → DB insert |
| `src/components/admin/AdminMarketplaceManager.tsx` | Диалог создания категории: Select parent_type + icon picker; рендер иконок из DB |

