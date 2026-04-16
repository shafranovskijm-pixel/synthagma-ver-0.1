

# Замена тестовых данных + кнопки быстрой оплаты T-Bank

## Что делаем

1. **Миграция** — обновляем `app_settings`: заменяем тестовые `TerminalKey` и `Password` на боевые, и ставим `tbank_test_mode = false`
2. **Кнопки быстрой оплаты** — встраиваем T-Bank `integration.js` виджет (СБП, T-Pay, SberPay, Mir Pay) на страницу покупки тарифа
3. **Фикс runtime error** — «Component is not a function» (скорее всего сторонний компонент — проверим при реализации)

## Изменения

### 1. Миграция — обновить `app_settings`

```sql
UPDATE app_settings SET setting_value = '1776260219616' WHERE setting_key = 'tbank_terminal_key';
UPDATE app_settings SET setting_value = '52HR7tiTdG1TlbLT' WHERE setting_key = 'tbank_password';
UPDATE app_settings SET setting_value = 'false' WHERE setting_key = 'tbank_test_mode';
```

### 2. Кнопки быстрой оплаты — Integration.js

**`index.html`** — добавить скрипт T-Bank перед `</body>`:
```html
<script src="https://integrationjs.t-static.ru/integration.js" async></script>
```

**Новый компонент `TBankSpeedPay.tsx`**:
- Принимает `terminalKey`, `onPaymentUrl` callback
- При монтировании инициализирует `PaymentIntegration.init({ terminalKey, product: 'eacq', features: { payment: {} } })`
- Создаёт интеграцию, монтирует в контейнер div
- Устанавливает `setPaymentStartCallback` — при клике вызывает `tbank-init-subscription` edge-функцию и возвращает `PaymentURL`
- Передаёт `DATA.connection_type = "Widget"` в edge-функцию для корректной работы виджета

**`tbank-init-subscription/index.ts`** — добавить `connection_type` в `DATA`:
```ts
requestBody.DATA = { connection_type: "Widget" };
```

**`AdminPaymentTester.tsx`** — в секцию «Покупка тарифа» добавить контейнер для виджета кнопок быстрой оплаты рядом с текущей кнопкой «Оплатить подписку».

### 3. Фикс runtime error
Проверить и исправить «Component is not a function» — вероятно, проблема с lazy-импортом или неправильным экспортом.

## Технические детали

- `integration.js` загружается с `https://integrationjs.t-static.ru/integration.js` асинхронно
- Виджет поддерживает: `sbp`, `tpay`, `sberpay`, `mirpay`
- `paymentStartCallback` должен возвращать `PaymentURL` из ответа `Init`
- CSP: нужны домены `*.tinkoff.ru`, `*.tcsbank.ru`, `*.tbank.ru`, `*.nspk.ru`, `*.t-static.ru`

