# Партнёрская программа — что есть и что доделать

## Что уже работает

- **Страницы и маршруты:** `/partner` (лендинг), `/partner/dashboard`, `/partner/offer` — подключены в `src/routes/partnerRoutes.tsx`, есть ссылка в футере организации.
- **Реф-ссылки:** при заходе на `/?ref=CODE` или `/register?ref=CODE` код сохраняется в cookie (`captureRefFromUrl` в `App.tsx`).
- **Регистрация организации:** `useRegisterOrganization` подхватывает cookie и зовёт RPC `register_referral`, создавая запись в `referral_registrations` (срок 12 мес).
- **«Стать партнёром»:** кнопка на `/partner` вызывает RPC `become_referral_partner`, в БД уже 3 активных партнёра.
- **MLM-структура:** 3 уровня, бонусы за оборот/лидерство, таблицы и edge-функция `referral-commission` готовы.
- **Кабинет партнёра:** `PartnerDashboard` и `PartnerCabinet` показывают баланс, комиссии, рефералов.
- **NGINX-прокси:** не мешает. Партнёрские страницы — обычный SPA-роут, а вызовы к Supabase из них автоматически идут через `api.синтагма.рф` на доменах с принудительным прокси. Никакой особой настройки на NGINX не нужно.

## Где разрыв (главное)

В `referral_registrations` сейчас **0 записей**, а в `referral_commissions` комиссии **никогда не начисляются**. Причина: edge-функция `referral-commission` не вызывается ни из одного платёжного потока:

- `supabase/functions/tbank-webhook/index.ts` — при `status = CONFIRMED` помечает счёт оплаченным, но `referral-commission` не дёргает.
- `src/hooks/useAdminBilling.ts` (строка 327) — админ вручную ставит `status: 'paid'` и продлевает `paid_until`, тоже без вызова комиссии.

То есть партнёры могут регистрироваться и раздавать ссылки, но даже при успешной оплате клиента — ничего им не капает.

## План правок

### 1. Начисление комиссии при автоматической оплате (T-Bank)
В `supabase/functions/tbank-webhook/index.ts` после успешного `UPDATE subscription_invoices … status='paid'` (и продления `paid_until`) добавить вызов:

```ts
await supabase.functions.invoke('referral-commission', {
  body: {
    organization_id: invoice.organization_id,
    amount: invoice.amount,
    payment_source: 'subscription',
  },
});
```

Вызов не должен ломать вебхук при ошибке — обернуть в try/catch с логом.

### 2. Начисление комиссии при ручном подтверждении админом
В `src/hooks/useAdminBilling.ts` в функции подтверждения оплаты (строка ~327) после успешного `update paid_until` добавить такой же `supabase.functions.invoke('referral-commission', …)` с `payment_source: 'manual'`.

### 3. Защита от двойного начисления
В `supabase/functions/referral-commission/index.ts` добавить проверку: если для пары `(organization_id, payment_source, amount, created_at в пределах суток)` уже есть запись — выходить без вставки. Либо передавать `invoice_id` и хранить его в `referral_commissions` (требует миграции, опционально).

Для MVP достаточно простой проверки по сумме и organization_id за последние 60 секунд.

### 4. Ручная QA-проверка после правок
- Открыть `/partner` под обычным пользователем → «Стать партнёром» → получить код.
- Перейти `/register?ref=CODE` инкогнито → зарегистрировать организацию → убедиться, что в `referral_registrations` появилась строка.
- Отметить тестовый счёт оплаченным в админке → проверить, что в `referral_commissions` появилась запись и баланс партнёра вырос.
- Проверить на домене `синтагма.рф`, что страница `/partner` открывается через NGINX-прокси (только supabase-запросы).

## Что НЕ меняем

- Структуру таблиц `referral_*` (она уже корректна).
- UI кабинета партнёра и лендинга.
- Логику NGINX/прокси — она к партнёрке отношения не имеет, маршруты SPA отдаются с того же origin.
- Cookie-механику `ref_code` / `partner_ref` — работает корректно.

## Технические детали

- Edge `referral-commission` принимает `{ organization_id, amount, payment_source }`, ищет активную запись в `referral_registrations`, строит цепочку до 3 уровней через `referred_by_partner_id`, считает % + бонусы (оборот +5%, лидер +3%) и пишет в `referral_commissions` + обновляет `balance/total_earned` у партнёров.
- Поле `expires_at` у `referral_registrations` = 12 месяцев с момента регистрации — комиссии после этого не начисляются (фильтр `gte expires_at, now()`).
