

## Проблема

В `UsersManager.tsx` функция `viewAsStudent` записывает в localStorage ключи **`odoo_user_id`** и **`studentName`**, а `useStudentDashboard.ts` читает **`userId`** и **`name`**. Из-за этого `targetUserId` остаётся `null`, и загружаются курсы текущего (админского) пользователя — у которого их нет.

## Решение

Исправить ключи в `UsersManager.tsx` (строки 89-93), чтобы они совпадали с форматом `OrganizationDetailsView.tsx`:

```typescript
localStorage.setItem('adminViewAsStudent', JSON.stringify({
  userId: user.user_id,        // было: odoo_user_id
  name: user.full_name || user.email || 'Ученик',  // было: studentName
  orgName: user.organization_name || '',
}));
```

### Файл для изменения

| Файл | Что |
|---|---|
| `src/components/admin/UsersManager.tsx` | Исправить ключи `odoo_user_id` → `userId`, `studentName` → `name` |

