

# Полноценная карточка пользователя в админке (как у организации)

## Что делаем

При клике на пользователя в таблице UsersManager — вместо текущего маленького Dialog открывается полноэкранная страница `/admin/user/:userId` с таким же детальным интерфейсом, как `/organization/student/:studentId`: вертикальное меню разделов (Личное дело, Идентификация, Курсы, Документы, Активность, Чат), кнопка «Назад» возвращает на вкладку «Пользователи».

## Изменения

### 1. Новая страница `src/pages/AdminUserDetails.tsx`
- Полноэкранная страница с тем же набором табов, что и OrganizationStudentDetails
- Переиспользует существующие компоненты: `ProfileTab`, `IdentificationTab`, `CoursesTab`, `DocumentsTab`, `ActivityTab`, `ChatTab` из `src/components/organization/student-detail/`
- Использует `useStudentDetailCardLogic` для загрузки данных
- Хедер с аватаром, именем, онлайн-статусом, кнопкой «Назад в пользователи»
- Для админа — `organizationId` берётся из профиля ученика (а не из контекста организации)
- Дополнительно показывает: роль, организацию, учётные данные (логин/пароль), User ID

### 2. `src/routes/adminRoutes.tsx`
- Добавить роут `<Route path="/admin/user/:userId" element={protectedRoute(<AdminUserDetails />, "admin")} />`

### 3. `src/components/admin/UsersManager.tsx`
- Клик по строке таблицы → `navigate(\`/admin/user/\${user.user_id}\`)` вместо `fetchUserDetail(user)`
- Удалить Dialog с детальной информацией (строки 559-757), состояния `selectedUser`, `userDetail`, `credEdit`, `credPasswordVisible` и функции `fetchUserDetail`, `handleSaveCredentials`

Итого: 1 новый файл, 2 файла правок.

