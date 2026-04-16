

# Тестирование покупки тарифа в админке

## Суть

Переделываем вкладку «Тест платежей» — вместо выбора организации и курса делаем интерфейс покупки тарифного плана. Администратор выбирает организацию, тариф и оплачивает через `tbank-init-subscription` — точно как клиент.

## Изменения

### 1. Переписать `AdminPaymentTester.tsx`

**Шаг 1 — Настройка платформенной кассы:**
- Вместо «выбери организацию и настрой ей кассу» — настройка **платформенного** терминала через `app_settings` (ключи `tbank_terminal_key`, `tbank_password`, `tbank_test_mode`)
- Edge-функция `tbank-init-subscription` уже использует `app_settings` как fallback — достаточно заполнить эти записи
- Поля: TerminalKey, Пароль, тестовый режим
- Статус: подключено / не подключено

**Шаг 2 — Покупка тарифа:**
- Выбор организации (для которой покупаем тариф)
- Карточки тарифов (Старт / Стандарт / Профессиональный / Максимальный) с ценами из `PLAN_PRICES` в edge-функции (3490 / 6990 / 16990 / 24990 ₽)
- Выбор периода: 1 мес / 12 мес (со скидкой 15%)
- Поле email для чека
- Кнопка «Оплатить» → вызов `tbank-init-subscription`
- Ссылка на оплату + открытие в новом окне

**Шаг 3 — Результат:**
- Polling статуса из `subscription_invoices` по `invoice_id` (каждые 5 сек)
- Статусы: pending → paid / failed
- Проверка что webhook обновил `organizations.subscription_plan` и `paid_until`
- Тестовые данные карты (как сейчас)

### 2. Без миграций
- `app_settings` уже существует
- `subscription_invoices` уже существует
- Edge-функции `tbank-init-subscription` и `tbank-webhook` уже обрабатывают весь флоу

## Технические детали
- upsert в `app_settings` для ключей `tbank_terminal_key`, `tbank_password`, `tbank_test_mode`
- Вызов `supabase.functions.invoke("tbank-init-subscription", { body: { organization_id, plan, period_months, email } })`
- Polling: `supabase.from("subscription_invoices").select("status, paid_at").eq("id", invoiceId)`
- После успешной оплаты — проверка `organizations.subscription_plan` для подтверждения

