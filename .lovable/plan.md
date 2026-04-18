
## Проблема

Договор отправлен админу Синтагмы, но:
1. В админ-панели в колоколе уведомлений — пусто
2. В разделе «Биллинг → Договоры» — 0 договоров
3. У отправителя (организации) уведомление появилось, у получателя (админа) — нет

## Анализ

**Где сейчас создаются уведомления:** триггер `notify_on_signature_event` пишет в `org_notifications`. Это таблица **уведомлений организации**, а не админа платформы. В колоколе админа отображается `admin_notifications` (видно в `AdminDashboard.tsx`: `from("admin_notifications")`).

То есть когда `recipient_type = 'admin_sintagma'` — никакое уведомление в `admin_notifications` не создаётся вообще. Поэтому в колоколе админа пусто.

**Почему нет в «Биллинг → Договоры»:** надо посмотреть, как `AdminBillingOverview` грузит договоры. Скорее всего, он смотрит таблицу `sales_contracts` или `org_billing_documents`, а не `document_signatures`. Внешние договоры от организаций сейчас попадают в `document_signatures` — в админский биллинг они просто не подключены.

## Что нужно проверить (read-only этап)

1. `src/components/admin/AdminBillingOverview.tsx` — откуда таблица «Договоры» берёт данные.
2. `supabase--read_query`: посмотреть последнюю запись в `document_signatures` (она должна быть создана) — проверить что RPC реально отработал.
3. Триггер `notify_on_signature_event` — убедиться, что он не пишет ничего для `recipient_type='admin_sintagma'`.

## Решение

### A. Уведомления админу Синтагмы при получении договора
Расширить триггер `notify_on_signature_event`: когда `recipient_type = 'admin_sintagma'` — ДОПОЛНИТЕЛЬНО создавать запись в `admin_notifications`:
- `type = 'signature'` (или `'contract'`)
- `title = 'Новый договор на согласование'`
- `message = recipient_name + " от " + sender_name + " — " + document_title`
- `related_entity_id = signature_id`
- `related_entity_type = 'document_signature'`

И при смене статуса (`signed`, `rejected`, `changes_requested`) — тоже писать в `admin_notifications`, чтобы админ видел отклик.

### B. Раздел «Договоры» в админ-биллинге
Добавить в `AdminBillingOverview` (вкладка «Договоры») источник `document_signatures` с фильтром `recipient_type = 'admin_sintagma'`. Показывать:
- организация-отправитель, название документа, дата, статус, действие «Открыть» → `/sign/{token}` (в режиме админа — открывается review-интерфейс).

Альтернатива: создать отдельную вкладку «На согласование» — но проще вписать в существующие «Договоры», потому что внешние загрузки концептуально это договоры.

### C. Клик по уведомлению в колоколе админа
В `AdminDashboard.tsx` `handleNotificationClick`: добавить ветку для `n.type = 'signature'` → переход на вкладку `billing` + открытие соответствующего договора.

## Файлы

- Миграция:
  - `CREATE OR REPLACE FUNCTION notify_on_signature_event` — добавить ветку для `admin_sintagma` с записью в `admin_notifications`.
- `src/components/admin/AdminBillingOverview.tsx` — добавить источник `document_signatures` (recipient_type='admin_sintagma') в список договоров.
- `src/pages/AdminDashboard.tsx` — обработка `n.type='signature'` в `handleNotificationClick`.

## Этапы

1. **Диагностика** (read-only): прочитать `AdminBillingOverview.tsx` + проверить через `read_query` что запись в `document_signatures` создалась.
2. **Миграция триггера**: писать `admin_notifications` для `recipient_type='admin_sintagma'`.
3. **UI админ-биллинга**: подключить `document_signatures` к вкладке «Договоры».
4. **Клик по колоколу**: routing на договор.
5. **End-to-end проверка**: повторно отправить договор → должен появиться в колоколе и в «Договоры».
