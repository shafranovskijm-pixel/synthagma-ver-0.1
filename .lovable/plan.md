

# Привязка балансов к реальным кассам T-Bank

## Что сейчас
- `balance_transactions` заполняется вручную через `topUpBalance`/`deductBalance` в `useOrgBalance.ts`
- Админ может пополнять баланс через `OrgBalanceManager.tsx`
- Организация видит баланс и транзакции в `PaymentsTab.tsx`
- `CourseStoreManager` принимает `deductBalance`/`topUpBalance` для покупок из магазина
- `tbank-webhook` НЕ создаёт записей в `balance_transactions`

## Что нужно сделать

### 1. Обнулить данные (миграция)
- `DELETE FROM balance_transactions;`
- `UPDATE organizations SET balance = 0;`

### 2. Привязать tbank-webhook к balance_transactions
В `supabase/functions/tbank-webhook/index.ts`:
- При статусе `CONFIRMED` для оплаты курса — вставлять запись в `balance_transactions` с типом `payment` и `related_order_id`
- При статусе `CONFIRMED` для подписки — вставлять запись с типом `subscription`
- Обновлять `organizations.balance` (суммировать из подтверждённых платежей)

### 3. Убрать ручное пополнение
**`useOrgBalance.ts`:**
- Удалить функцию `topUpBalance` (ручное пополнение)
- Удалить функцию `deductBalance` (ручное списание)
- Оставить только `fetchBalance`, `fetchTransactions`, `refresh`

**`OrgBalanceManager.tsx`:**
- Убрать кнопку «Пополнить» и диалог пополнения
- Оставить только отображение баланса и историю операций (read-only)

**`CourseStoreManager.tsx`:**
- Убрать пропсы `deductBalance`, `topUpBalance`, `refreshBalance`, `orgBalance`
- Покупки в магазине должны идти через T-Bank (оплата онлайн), а не через вычитание из баланса

**`TabContentRenderer.tsx`:**
- Убрать передачу `orgBalance`, `deductBalance`, `topUpBalance`, `refreshBalance` в `CourseStoreManager`

**`useOrganizationDashboard.ts`:**
- Упростить `orgBalance` — убрать `topUpBalance`/`deductBalance` из возвращаемого объекта

### 4. Обновить AdminFinanceOverview
- Вкладка «Транзакции баланса» теперь показывает только реальные платежи от кассы
- Убрать возможность ручного пополнения из admin-интерфейса

### 5. Обновить PaymentsTab (организация)
- Вкладка «Транзакции баланса» — read-only, данные приходят только из webhook
- Баланс считается автоматически из `organizations.balance`, который обновляет webhook

## Файлы

| Действие | Файл |
|----------|------|
| Миграция | DELETE balance_transactions + UPDATE organizations SET balance=0 |
| Изменить | `supabase/functions/tbank-webhook/index.ts` — добавить запись в balance_transactions |
| Изменить | `src/hooks/useOrgBalance.ts` — убрать topUp/deduct |
| Изменить | `src/components/admin/OrgBalanceManager.tsx` — убрать кнопку пополнения |
| Изменить | `src/components/organization/CourseStoreManager.tsx` — убрать balance пропсы |
| Изменить | `src/hooks/useCourseStoreManager.ts` — убрать balance интерфейс |
| Изменить | `src/components/organization/tabs/TabContentRenderer.tsx` — убрать balance пропсы |
| Изменить | `src/hooks/useOrganizationDashboard.ts` — упростить orgBalance |

