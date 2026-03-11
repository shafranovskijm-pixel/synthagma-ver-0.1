

## Две проблемы

### 1. Хранилище показывает 0

**Причина:** В `OrganizationDetailsView.tsx` (строки 322–358) метод `fetchUsage` работает так:
- Сначала ищет запись в таблице `organization_usage` за текущий месяц
- Если запись **есть** (даже с `storage_bytes = 0`) — берёт значение оттуда и **не считает реально**
- Если записи **нет** — пытается посчитать из бакетов, но:
  - Не включает **внешнее хранилище** (`course-videos` на внешнем Supabase)
  - Использует `supabase.storage.from(bucket).list(organization.id)` — это **не рекурсивный** обход, считает только файлы в корне папки организации
  - Не сканирует файлы по `courseId` (в отличие от `StorageManager`, который правильно сканирует `course-files/{courseId}`)

**Решение:** Переписать `fetchUsage`, взяв логику из `StorageManager`:
- Получить все `courseId` организации
- Сканировать `course-files`, `presentations` по каждому курсу
- Сканировать `org-documents`, `company-documents`, `org-branding`, `library-files`, `student-documents` по `organizationId`
- Добавить внешнее хранилище (`course-videos`) через `get-external-storage-config`
- Рекурсивно обходить папки (как `scanPath` в StorageManager)

### 2. Логин и пароль организации не отображаются в карточке

**Причина:** `OrganizationDetailsView.tsx` **не содержит** никакого отображения учётных данных (`credentials`, `login_email`, `login_password`). Эти данные видны только в списке организаций (`OrganizationsManager.tsx`), но при открытии детальной карточки — теряются.

**Решение:** Добавить секцию «Учётные данные» в шапку/обзор `OrganizationDetailsView`:
- Вызвать RPC `get_decrypted_org_credentials` для текущей организации
- Показать логин и пароль с кнопками «Показать/Скрыть» (Eye) и «Копировать»

### Файлы для изменения

- **`src/components/admin/OrganizationDetailsView.tsx`**:
  - Переписать `fetchUsage` — добавить рекурсивный обход бакетов + внешнее хранилище
  - Добавить состояние `credentials` и запрос `get_decrypted_org_credentials`
  - Добавить UI-блок с логином/паролем в шапке (рядом со статистикой или в отдельной секции)

