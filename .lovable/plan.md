

# План: кнопка «Отправить тестовый документ себе» для проверки цикла

## Зачем

Чтобы менеджер организации одним кликом мог проверить весь цикл inbox'а: создаётся реальная запись в `document_signatures` на его собственный `user_id`, прилетает realtime-уведомление, документ виден в личном кабинете в разделе «Документы → Требуют действия», подписывается стандартным флоу.

## Где появится кнопка

Раздел **«Документы»** в кабинете организации (`/organization/documents` → таб «Документы»), правый верхний угол шапки — рядом с уже существующими действиями. Маленькая `outline`-кнопка **«🧪 Тест inbox»** (только для роли с правом `documents.manage`), не загромождает интерфейс.

## Что делает кнопка

1. Открывает компактный диалог `TestInboxDialog`:
   - Поле «Название документа» (по умолчанию: `Тестовый документ — {дата}`).
   - Селект шаблона из `org_contract_templates` (опционально, иначе используется заглушка-HTML «Это тестовый документ для проверки inbox»).
   - Информационная плашка: *«Документ будет отправлен на ваш собственный аккаунт ({email}) и появится в разделе «Документы» вашего личного кабинета. Письмо тоже придёт.»*
2. По «Отправить»:
   - Вставка в `document_signatures`:
     - `recipient_user_id` = текущий `auth.uid()`,
     - `recipient_email` = email текущего юзера,
     - `recipient_name` = имя из profile,
     - `recipient_type = 'student'`,
     - `sender_user_id` = тот же текущий юзер,
     - `status = 'sent'`,
     - `document_type = 'test'`,
     - `document_html` = выбранный шаблон или дефолтный,
     - `expires_at` = +14 дней,
     - `organization_id` = активная организация.
   - Создание `signature_revisions` v1.
   - Toast: *«Тестовый документ отправлен. Проверьте кабинет ученика — должен прилететь realtime.»*
3. Кнопка в toast: **«Открыть мой кабинет»** → `/student?tab=documents`.

## Что НЕ делаем

- Не отправляем реальное письмо (чтобы не тратить SMTP-квоту на тесты) — поле `sent_at` ставим, но edge `org-create-contract-signature` не вызываем. Это inbox-only тест.
- Не создаём отдельную таблицу `test_documents` — пишем в общий `document_signatures` с `document_type='test'`, чтобы тестовые записи можно было фильтровать/чистить.
- Не добавляем кнопку «удалить тестовые» — оставляем менеджеру возможность подписать/отклонить как обычный документ (или удалить вручную через UI документов, если есть).

## Технические детали

| Файл | Изменение |
|---|---|
| `src/components/organization/documents/TestInboxButton.tsx` | новый: кнопка + диалог + insert логика (вставка в `document_signatures` через supabase client, без edge-функции) |
| `src/components/organization/tabs/DocumentsTab.tsx` | добавить `<TestInboxButton organizationId={...} />` в шапку рядом с другими действиями |

## Риски

- RLS на `document_signatures` должен разрешать `INSERT` менеджеру организации, где он состоит. Если политики такой нет — миграция: `CREATE POLICY "Managers can insert signatures" ON document_signatures FOR INSERT TO authenticated WITH CHECK (sender_user_id = auth.uid() AND has_org_staff_permission(auth.uid(), organization_id, 'documents.manage'))`. Перед миграцией проверю существующие политики через `supabase--read_query`.

