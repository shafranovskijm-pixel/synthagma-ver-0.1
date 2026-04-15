

# Исправить «Войти как ученик» и добавить пагинацию списков

## Проблема 1: «Войти как ученик» показывает демо-данные

В `OrganizationStudentDetails.tsx` при формировании JSON используется ключ `odlUsr` вместо `userId`. Хук `useStudentDashboard` читает `data.userId`, получает `undefined`, и `targetUserId` остаётся `null` — загружаются данные текущего админа вместо выбранного ученика.

Также в `AdminUserDetails.tsx` кнопка «Войти как ученик» показывается только при `userRole === 'student'`, хотя это роль ПРОСМАТРИВАЕМОГО пользователя — условие корректно, но нужно убедиться что `orgReturn` передаётся для возврата на `/admin`.

### Исправления
- **`OrganizationStudentDetails.tsx`**: заменить `odlUsr` на `userId` в JSON
- **`AdminUserDetails.tsx`**: добавить `orgReturn: '/admin'` в JSON и убедиться что кнопка работает

## Проблема 2: Пагинация списков пользователей

Сейчас все пользователи отображаются сразу. Нужно показывать по 10, с кнопками «Показать ещё» и выбором количества (10, 25, 50, 100).

### Файлы и изменения

| Файл | Что меняется |
|---|---|
| `src/pages/OrganizationStudentDetails.tsx` | Ключ `odlUsr` → `userId` |
| `src/pages/AdminUserDetails.tsx` | Добавить `orgReturn` в JSON |
| `src/components/admin/UsersManager.tsx` | Пагинация: показывать `visibleCount` записей из `filteredUsers`, кнопки «Показать ещё 10/25/50/100» внизу таблицы |
| `src/components/admin/org-details/OrgStudentsPanel.tsx` | Та же пагинация для списка учеников организации |

### Логика пагинации
- Начальное значение `visibleCount = 10`
- Показывать `filteredUsers.slice(0, visibleCount)`
- Под таблицей: текст «Показано X из Y» и кнопки-чипы (10, 25, 50, 100) для увеличения `visibleCount`
- При поиске/фильтрации сбрасывать `visibleCount` на 10

~80 строк изменений, 4 файла.

