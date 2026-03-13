

## План: Аккордеоны с категориями в магазине курсов

### Проблема
Сейчас в магазине курсов (для организаций и студентов) все категории развёрнуты и отображаются плоским списком карточек. Нужно:
1. Обернуть всё в аккордеон «Курсы Ростехнадзора» (свёрнут по умолчанию)
2. Внутри — подкатегории-аккордеоны (тоже свёрнуты)
3. Показывать все 6 категорий даже если в них 0 курсов (с иконками)
4. То же самое в конвейере (BulkPipelineWidget) — пустые категории видны

### Изменения

**1. `src/components/organization/CourseStoreManager.tsx`**
- Обернуть весь список в `Collapsible` «Курсы Ростехнадзора» (closed by default)
- Каждую подкатегорию обернуть в `Collapsible` (closed by default)
- Добавить пустые категории из `categoryMetaOrg` в список, если нет курсов — показывать «0 курсов»

**2. `src/components/student/StudentCourseStore.tsx`**
- Аналогично: аккордеон «Курсы Ростехнадзора» → подкатегории-аккордеоны
- Показывать пустые категории с иконками

**3. `src/hooks/useCourseStoreManager.ts`**
- В `groupedCatalog` добавлять пустые группы для всех 6 категорий из `categoryMeta`, если в них нет курсов

**4. `src/components/admin/BulkPipelineWidget.tsx`**
- В список курсов добавить группировку по категориям (из `course_categories` маркетплейса)
- Показывать пустые категории с бейджем «0 курсов»

### Файлы

| Файл | Что |
|---|---|
| `src/hooks/useCourseStoreManager.ts` | Включать пустые категории в groupedCatalog |
| `src/components/organization/CourseStoreManager.tsx` | Collapsible аккордеоны, closed by default |
| `src/components/student/StudentCourseStore.tsx` | Collapsible аккордеоны + пустые категории |
| `src/components/admin/BulkPipelineWidget.tsx` | Группировка по категориям с пустыми |

