
# Кнопка «Оплачено» на счетах — продление тарифа

## Что будет сделано

На каждом счёте со статусом «Ожидает» (pending) появится кнопка «Оплачено» (иконка CheckCircle). При клике:

1. Статус счёта в `subscription_invoices` меняется на `paid`
2. Поле `paid_until` в таблице `organizations` продлевается: если текущий `paid_until` ещё не истёк — к нему добавляется `period_months` месяцев; если уже истёк или null — от текущей даты + `period_months` месяцев
3. Данные обновляются на экране

## Технические детали

### Файл: `src/components/admin/AdminBillingOverview.tsx`

**Новая функция `handleMarkPaid(invoice)`:**
- `UPDATE subscription_invoices SET status = 'paid' WHERE id = inv.id`
- Запрос текущего `paid_until` из `organizations` по `inv.organization_id`
- Если `paid_until` > now() → новый `paid_until` = `paid_until` + `period_months` месяцев
- Иначе → `paid_until` = now() + `period_months` месяцев
- `UPDATE organizations SET paid_until = ... WHERE id = inv.organization_id`
- Вызов `loadData()` для обновления списка
- Toast «Оплата подтверждена, тариф продлён»

**Изменения в компонентах `OrgInvoicesList` и `AllBillingContent` (таб «Счета»):**
- Передать `onMarkPaid` callback
- Для счетов со `status === "pending"` — добавить кнопку с иконкой CheckCircle2 рядом с бейджем

### Миграция: не требуется
Поле `paid_until` уже существует в таблице `organizations`.

## Файлы

| Файл | Действие |
|---|---|
| `src/components/admin/AdminBillingOverview.tsx` | Добавить `handleMarkPaid`, кнопку «Оплачено» в оба списка счетов |
