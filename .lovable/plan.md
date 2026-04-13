

# Индивидуальная цена и скидка для организаций

## Что делаем

1. **Добавляем два поля в таблицу `organizations`**: `custom_price` (индивидуальная цена, число) и `custom_discount` (скидка в %, число 0-100).

2. **Добавляем UI в админке** (`OrganizationDetailsView.tsx`, вкладка «Тарифы»): два поля ввода — «Индивидуальная цена (₽/мес)» и «Скидка (%)» рядом с существующими настройками. Сохраняются в `saveTariffSettings`.

3. **Обновляем генерацию счёта** (`SubscriptionTab.tsx`, функция `handleGenerateInvoice`):
   - Загружаем `custom_price` и `custom_discount` из таблицы `organizations`
   - Если задана `custom_price` — используем её как базу
   - Если задана `custom_discount` — применяем скидку
   - Итоговая сумма идёт в `amount` при создании записи в `subscription_invoices`

## Миграция
```sql
ALTER TABLE organizations 
  ADD COLUMN custom_price numeric DEFAULT NULL,
  ADD COLUMN custom_discount numeric DEFAULT NULL;
```

## Файлы
- Миграция: `custom_price`, `custom_discount` в `organizations`
- `src/components/admin/OrganizationDetailsView.tsx` — поля ввода цены и скидки
- `src/components/organization/SubscriptionTab.tsx` — учёт кастомной цены/скидки при генерации счёта

