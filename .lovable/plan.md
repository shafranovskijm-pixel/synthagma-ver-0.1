

# Сохранение тестовых данных терминала T-Bank

## Что делаем

Записываем тестовые реквизиты терминала T-Bank в таблицу `app_settings`, чтобы edge-функция `tbank-init-subscription` их подхватывала автоматически.

## Изменения

### 1. Миграция — upsert в `app_settings`

Три записи:
- `tbank_terminal_key` → `1776260219596DEMO`
- `tbank_password` → `8N0cF8$5$irHLtrE`
- `tbank_test_mode` → `true`

Используем `INSERT ... ON CONFLICT DO UPDATE` чтобы не дублировать, если записи уже есть.

### 2. Обновить `AdminPaymentTester.tsx`

При загрузке компонента — подтягивать существующие значения из `app_settings` и отображать статус «Подключено» сразу, без повторного ввода.

