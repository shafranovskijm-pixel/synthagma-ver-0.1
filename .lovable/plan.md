

# Подключение T-Bank (Тинькофф) вместо Robokassa

## Что делаем

Полностью заменяем Robokassa на T-Bank интернет-эквайринг. API T-Bank использует SHA-256 для подписи (вместо MD5 у Robokassa) и endpoint `POST https://securepay.tinkoff.ru/v2/Init`.

## Как работает T-Bank API

1. **Init** — `POST /v2/Init` с `TerminalKey`, `Amount` (в копейках!), `OrderId`, `Token` (SHA-256 подпись). Возвращает `PaymentURL` — ссылку на форму оплаты
2. **Token** — SHA-256 от конкатенации значений всех корневых параметров + Password, отсортированных по ключу
3. **Webhook** — POST на `NotificationURL`, ответ `OK` (HTTP 200). Подпись проверяется аналогично

## Изменения

### 1. БД: обновить таблицу `organization_payment_settings`
- Переименовать `merchant_login` → `terminal_key`
- Убрать `password2_encrypted` (T-Bank использует один пароль)
- Переименовать `password1_encrypted` → `password_encrypted`
- Обновить RPC `get_decrypted_payment_settings` — возвращать `terminal_key` и `password`
- Обновить триггер шифрования

### 2. Edge-функция `tbank-init` (заменяет `robokassa-init`)
- Принимает `course_id`, `user_id`, `email`
- Получает курс и настройки платежа организации
- Создаёт запись в `course_payments`
- Формирует Token (SHA-256): собирает пары key:value + Password, сортирует по ключу, конкатенирует значения, хеширует
- POST на `https://securepay.tinkoff.ru/v2/Init`
- Amount в копейках (`price * 100`)
- `NotificationURL` → URL edge-функции `tbank-webhook`
- `SuccessURL` / `FailURL` → `sintagma.com.ru/payment-success` / `payment-fail`
- Возвращает `PaymentURL` клиенту

### 3. Edge-функция `tbank-webhook` (заменяет `robokassa-result`)
- Принимает POST от T-Bank с данными платежа
- Проверяет Token (SHA-256 подпись с Password)
- При статусе `CONFIRMED` — обновляет `course_payments.status = 'paid'`
- Автоматическое зачисление (enrollment) при наличии `user_id` и `course_id`
- Ответ: HTTP 200, тело `OK`

### 4. UI: `RobokassaSettings.tsx` → `TBankSettings.tsx`
- Поле `TerminalKey` (вместо MerchantLogin)
- Одно поле `Пароль` (вместо двух)
- Переключатель тестового режима
- Обновить заголовок и описание

### 5. Удалить старые функции
- `supabase/functions/robokassa-init/`
- `supabase/functions/robokassa-result/`

### 6. Обновить `AvailablePaidCourses.tsx`
- Убрать текст «Временно онлайн-касса недоступна»
- При нажатии «Записаться» вызывать `tbank-init` и редиректить на `PaymentURL`

## Файлы

| Файл | Действие |
|---|---|
| SQL миграция | ALTER таблицы `organization_payment_settings`, обновить RPC |
| `supabase/functions/tbank-init/index.ts` | Новая функция инициализации платежа |
| `supabase/functions/tbank-webhook/index.ts` | Новая функция webhook |
| `supabase/functions/robokassa-init/` | Удалить |
| `supabase/functions/robokassa-result/` | Удалить |
| `src/components/organization/RobokassaSettings.tsx` → `TBankSettings.tsx` | Переделать UI настроек |
| `src/components/student/AvailablePaidCourses.tsx` | Подключить реальную оплату через T-Bank |
| Все импорты `RobokassaSettings` | Обновить на `TBankSettings` |

## Что потребуется от тебя

У тебя уже есть `TerminalKey` и пароль от T-Bank? Их нужно будет ввести в настройках кассы в кабинете организации.

