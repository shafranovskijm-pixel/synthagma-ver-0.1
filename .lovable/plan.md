

# Уведомление админу при формировании счёта организацией

## Что будет сделано

Когда организация формирует счёт на оплату (в `SubscriptionTab` или `DocumentsTab`), автоматически создаётся запись в `admin_notifications` с информацией о счёте. Админ видит уведомление в колокольчике, кликает — переходит в карточку организации на вкладку биллинга, где может отметить счёт как оплаченный и продлить тариф.

## Изменения

### 1. Отправка уведомления при создании счёта организацией

**Файл**: `src/components/organization/SubscriptionTab.tsx`
После успешного `insert` в `subscription_invoices` (строка ~231) — добавить вставку в `admin_notifications`:
- `type`: `"invoice"`
- `title`: `"Новый счёт: {invoiceNum}"`
- `message`: `"Организация «{orgName}» сформировала счёт на {amount} ₽ (план: {plan})"`
- `related_entity_id`: ID организации (для навигации)
- `metadata`: `{ invoice_id, organization_id, amount, plan }`

**Файл**: `src/components/organization/tabs/DocumentsTab.tsx`
Аналогично — после `handleSavePendingInvoice` (строка ~453) добавить ту же вставку в `admin_notifications`.

Для получения имени организации — использовать уже загруженные данные или сделать дополнительный запрос.

### 2. Кликабельные уведомления в админ-панели

**Файл**: `src/components/admin/AdminDashboardHeader.tsx`
Сейчас уведомления — просто текст без действий. Добавить:
- При клике на уведомление типа `invoice` — вызвать `onClick(n)` callback
- Передать callback из `AdminDashboard.tsx`, который переключает на вкладку «Организации», открывает карточку организации по `related_entity_id` на вкладке биллинга

**Файл**: `src/pages/AdminDashboard.tsx`
- Добавить обработчик клика по уведомлению: `handleNotificationClick(n)` — определяет тип, переключает на нужную вкладку/организацию
- Для `type === "invoice"`: переход в `OrganizationDetailsView` → вкладка «Биллинг»

## Файлы

| Файл | Действие |
|---|---|
| `src/components/organization/SubscriptionTab.tsx` | Добавить insert в `admin_notifications` после создания счёта |
| `src/components/organization/tabs/DocumentsTab.tsx` | Аналогично — уведомление после создания счёта |
| `src/components/admin/AdminDashboardHeader.tsx` | Сделать уведомления кликабельными с callback |
| `src/pages/AdminDashboard.tsx` | Добавить обработчик клика → навигация к организации |

