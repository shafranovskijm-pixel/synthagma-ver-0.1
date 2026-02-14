

# Привязка админа + каскадное удаление + восстановление пароля

## Что будет сделано

### 1. Добавление второго админа (24@24zxc.ru)
- Добавить роль `admin` для пользователя `24@24zxc.ru` в таблице `user_roles` (текущая роль `organization` останется или будет заменена на `admin`)
- Обновить пароль на `4Everlife$` через edge-функцию с Admin API
- Текущий админ `admin@demo.sigma` останется без изменений

### 2. Каскадное удаление организаций
Обновить `handleDelete` в `OrganizationsManager.tsx` -- перед удалением организации последовательно удалять связанные записи:

```text
1. enrollments (через course_id из courses)
2. lessons (через course_id из courses)
3. courses
4. profiles
5. registration_links
6. companies
7. organization_credentials
8. org_documents
9. course_reminders
10. organizations (сама запись)
```

### 3. Восстановление пароля админа на 24@24zxc.ru
Обновить edge-функцию `send-password-reset` -- при запросе сброса пароля для админского аккаунта письмо будет отправляться на `24@24zxc.ru`. Функция уже принимает email и отправляет ссылку восстановления через SMTP.

---

## Технические детали

| Компонент | Изменения |
|---|---|
| Миграция БД | `INSERT INTO user_roles (user_id, role) VALUES ('aaaaaaaa-...', 'admin')` (или UPDATE текущей записи) |
| Edge-функция | Вызов `reset-org-password` для смены пароля на `4Everlife$` |
| `OrganizationsManager.tsx` | `handleDelete` -- каскадное удаление всех связанных таблиц перед удалением организации |
| `send-password-reset` | Убедиться, что функция корректно обрабатывает адрес `24@24zxc.ru` для админа |

