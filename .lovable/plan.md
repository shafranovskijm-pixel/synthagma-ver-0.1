

## Добавить кнопку "Переместить" в список курсов (list view)

### Проблема
Кнопка перемещения курса в другую категорию (`FolderInput`) есть только в режиме карточек (grid view). В табличном режиме (list view) — который вы используете — этой кнопки нет.

### Решение
Добавить кнопку `FolderInput` ("Переместить в категорию") в обе функции рендеринга строк таблицы: `renderCourseRow` и `renderVariantRow`.

### Файл: `src/components/admin/AdminMarketplaceManager.tsx`

**В `renderCourseRow` (строки 150-165)** — добавить кнопку перемещения между кнопками Eye и FolderOpen:
```tsx
<Button variant="ghost" size="icon" className="h-8 w-8" title="Переместить в категорию"
  onClick={() => { h.setMovingCourse(item); h.setTargetCategory(h.extractCategory(item.course?.title)); h.setShowMoveCategoryDialog(true); }}>
  <FolderInput className="w-3.5 h-3.5" />
</Button>
```

**В `renderVariantRow` (строки 194-208)** — аналогичная кнопка.

Также расширить ширину колонки действий с `w-[130px]` до `w-[160px]` для размещения 5 кнопок.

