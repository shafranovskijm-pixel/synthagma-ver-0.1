

## Проблема

Авто-фикс при нахождении дублей (уроков с одинаковыми названиями) **переименовывает** их, добавляя суффикс `(2)`, `(3)`. Но на самом деле это полные копии одного и того же урока — их нужно **удалять**, а не переименовывать. Переименование только маскирует проблему и оставляет мусорный контент.

## Исправление

**Файл: `src/components/admin/AdminMarketplaceManager.tsx`**

Заменить логику «Fix duplicate titles» (строки 730-739):

**Было:** переименовать дубли → `title (2)`, `title (3)`

**Станет:** оставить первый урок из группы, **удалить остальные** (вместе с их вопросами, если это тесты):

```typescript
// 5. Remove duplicate lessons (keep first, delete rest)
if (duplicateGroups.length > 0) {
  completed++;
  toast.loading(`Удаляю дубликаты (${completed}/${totalTasks})`, { id: toastId });
  const idsToDelete: string[] = [];
  for (const group of duplicateGroups) {
    // Keep the first, delete the rest
    for (let i = 1; i < group.length; i++) {
      idsToDelete.push(group[i].id);
    }
  }
  if (idsToDelete.length > 0) {
    await supabase.from("test_questions").delete().in("lesson_id", idsToDelete);
    await supabase.from("lesson_progress").delete().in("lesson_id", idsToDelete);
    await supabase.from("lessons").delete().in("id", idsToDelete);
  }
}
```

Также обновить текст ошибки в валидации — вместо «дубли заголовков» написать «дубли уроков (будут удалены)».

| Файл | Действие |
|---|---|
| `src/components/admin/AdminMarketplaceManager.tsx` | Удалять дубли вместо переименования |

