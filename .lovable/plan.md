
## Задача
1. **Фикс бага**: добавить `education_document` в CHECK-constraint таблицы `document_signatures`.
2. **Уведомления в колокольчике** при отправке/получении документа на подписание.
3. **Связь подписания с чатом** — кнопка «Обсудить документ» открывает чат с отправителем.
4. **Согласование с правками** — режим «На согласование» (вместо «На подпись»): получатель может оставить комментарии/правки прямо к документу, отправить обратно. Версионирование.
5. **Загрузка своего договора** (PDF/DOCX) клиентом → drag-n-drop → отправка в админку Синтагмы на согласование → итерации правок → финальная подпись.

## Что меняем

### Этап 1 — фикс + уведомления
**Миграция БД:**
- `ALTER TABLE document_signatures DROP CONSTRAINT … ADD CONSTRAINT … CHECK (document_type IN ('contract','consent','pep_agreement','act','order','custom_pdf','education_document','external_upload'))`.
- Добавить статус `'in_review'` и `'changes_requested'` (расширить CHECK на `status`).
- Триггер `notify_on_signature_event()`: при INSERT в `document_signatures` (status='sent' или 'in_review') → INSERT в `org_notifications` для `organization_id` отправителя + (если получатель — внутренний `recipient_user_id`) в его `notifications` / `org_notifications`.
- При UPDATE → status changes ('signed', 'rejected', 'changes_requested') — тоже уведомление.

**Frontend:**
- Использовать существующий `org_notifications` (см. memory `Order Notifications`) — колокольчик вверху уже подписан на эту таблицу. Просто новый `type='signature'` с `link='/organization?tab=documents&sub=signatures&id=…'`.

### Этап 2 — чат по документу
**Миграция:** добавить поле `chat_thread_id UUID` в `document_signatures` (необязательное).

**Frontend:**
- В `SignaturesJournal` и на странице `/sign/:token` — кнопка «Обсудить» → открывает существующий чат организации (используем уже имеющуюся систему чатов, см. `Feedback Lesson Type` — feedback уходит в org-чат). Создаём/находим thread по `signatureId` и автоматически добавляем системное сообщение «Документ: <название>» со ссылкой.

### Этап 3 — режим «На согласование» с правками
**Миграция:**
- Новая таблица `signature_revisions`:
  - `id`, `signature_id` (FK), `version` (int), `document_html`, `document_hash`, `created_by`, `created_at`, `change_summary`.
- Новая таблица `signature_comments`:
  - `id`, `signature_id`, `revision_id`, `author_user_id`, `author_name`, `quoted_text` (выделенный фрагмент), `comment_text`, `position_anchor` (xpath/offset для подсветки), `resolved`, `created_at`.
- В `document_signatures`: поле `mode` ('sign' | 'review') и `current_revision_id`.

**Frontend:**
- В `SendForSigningDialog` — toggle «Только подписать» / «На согласование (с правками)».
- На `/sign/:token` (режим review):
  - Получатель видит документ + может **выделять текст и оставлять комментарии** (как в Google Docs / Notion) — компонент `<ReviewableDocument />`.
  - Кнопки: «Запросить правки» (status → `changes_requested`) и «Согласовать и подписать».
- В `SignaturesJournal` отправитель видит вкладку «Комментарии», может ответить, загрузить новую версию (создаётся новый `signature_revision`), повторно отправить.
- Каждая версия — новая `revision`, на UI таймлайн версий с дельтой комментариев.
- Подсветка правок: сравнение версий через простой diff (`diff-match-patch`) → `<ins>`/`<del>` подсветка.

### Этап 4 — загрузка своего договора (PDF/DOCX)
**Миграция:** новый бакет `external-contracts` (private), RLS — org owner + admin Синтагмы.

**Frontend:** в `CounterpartiesSection` (вкладка «Синтагма» → «Договоры») добавить:
- Кнопка/dropzone «Загрузить свой договор и отправить на согласование» (PDF/DOCX, до 20 МБ).
- При загрузке:
  - Файл → `external-contracts/{org_id}/{uuid}.{ext}`.
  - Создаётся `document_signatures` с `document_type='external_upload'`, `mode='review'`, `recipient_type='admin_sintagma'`, `recipient_email=<admin email из настроек>`.
  - Уведомление в админку (`AdminSettings → Подписания` уже есть — добавить вкладку/фильтр «Входящие на согласование»).
- В админке (`SignaturesJournal` admin-mode) — новая кнопка «Открыть для правки» → скачать DOCX, внести правки, загрузить новую версию (`signature_revisions` v2), статус → `in_review` обратно к клиенту.
- Клиент видит уведомление, скачивает новую версию, либо принимает (подписывает ПЭП), либо снова шлёт на правки.
- Финал: обе стороны подписывают (двусторонняя подпись — расширение `document_signatures.signed_by` → массив `[{role, user_id, signed_at, ip, ua}]`, либо парная запись).

**Edge-функция:** `signature-version-upload` — приём DOCX/PDF, сохранение в Storage, регистрация revision.

## Технически
- Все изменения **аддитивные**: существующие записи и flow не ломаются (`mode` default `'sign'`, новые статусы опциональны).
- Чат — переиспользуем существующую систему org-чатов.
- Подсветка правок — клиентская через `diff-match-patch` (без серверной нагрузки).
- DOCX-просмотр — через `mammoth.js` (HTML preview) для отображения внутри `/sign/:token`.
- RLS: получатель видит свои revisions/comments по `signature_id`; админ Синтагмы — все с `recipient_type='admin_sintagma'`.
- НЕ трогаем: `useAuth`, существующие RLS других таблиц, конструкторы документов.

## Этапы релиза
1. **Этап 1** (минимальный риск): фикс constraint + уведомления + кнопка «Обсудить» с заглушкой-чатом. Проверка end-to-end.
2. **Этап 2**: режим «На согласование» + комментарии к выделенному тексту + версионирование.
3. **Этап 3**: загрузка PDF/DOCX от клиента + админский flow правок + двусторонняя подпись.

После approve — начну с **Этапа 1**.
