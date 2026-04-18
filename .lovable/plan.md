
## Задача
1. Изменить дефолтный email админа Синтагмы: `admin@sintagma.com.ru` → `support@syntagma.com.ru` (это рабочий SMTP-email отправки).
2. Сделать поле «Email администратора Синтагмы» в настройках **необязательным** — по умолчанию пустое.
3. Исправить ошибку `new row violates row-level security policy` при загрузке внешнего договора (на скриншоте).

## Что меняем

### 1. Дефолтный email
- Миграция: `UPDATE app_settings SET setting_value = 'support@syntagma.com.ru' WHERE setting_key = 'admin_signature_email'` — но только если значение всё ещё дефолтное `admin@sintagma.com.ru`. Иначе не трогаем (вдруг уже поменяли вручную).
- Альтернатива (выбираю): оставляем строку в БД пустой, а fallback-значение `support@syntagma.com.ru` хранится в коде на случай, если поле не заполнено.

### 2. Поле необязательное
- В админке (где редактируется `admin_signature_email`) — убрать `required`, placeholder сделать `support@syntagma.com.ru`, подпись «Если оставить пустым, будет использоваться support@syntagma.com.ru».
- Найду компонент, где это поле рендерится (вероятно `AdminSettings` → SMTP/General).

### 3. Фикс RLS на загрузке внешнего договора
**Источник ошибки:** `ExternalContractUploader.tsx` загружает файл в bucket `external-contracts` через `supabase.storage.from('external-contracts').upload(path, file)`. RLS на `storage.objects` для этого бакета, скорее всего, не разрешает INSERT текущему пользователю-организации (или path не подпадает под политику).

**План фикса:**
- Проверю текущие политики бакета `external-contracts` через `supabase--read_query`.
- Посмотрю, какой путь формирует `ExternalContractUploader` (по структуре политики path должен начинаться с `{org_id}/...`).
- Скорректирую миграцию: добавить INSERT-политику вида:
  ```sql
  CREATE POLICY "Org users upload external contracts" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'external-contracts'
    AND (storage.foldername(name))[1] = current_organization_id()::text
  );
  ```
  Аналогично SELECT — для скачивания владельцем-орг и админом.
- Если в `ExternalContractUploader` путь сейчас не `{orgId}/...` — поправлю на корректный.

### 4. Frontend fallback
В `CounterpartiesSection.tsx`, где читается `admin_signature_email` из `app_settings`:
```ts
const adminEmail = settingValue?.trim() || 'support@syntagma.com.ru';
```

## Технически
- Изменения аддитивные, никаких ломающих API.
- Миграция: одна — для UPDATE дефолта (если ещё не меняли) + DROP/CREATE storage policies для `external-contracts`.
- Файлы: `CounterpartiesSection.tsx`, `ExternalContractUploader.tsx` (проверка пути), компонент админ-настроек (placeholder + не-required).

## Этапы
1. Проверка текущих RLS-политик бакета и пути загрузки в коде.
2. Миграция: storage policies + обновление дефолтного email.
3. Frontend: fallback + UX поля (placeholder, не-required).
4. End-to-end проверка: загрузить внешний договор от лица организации.
