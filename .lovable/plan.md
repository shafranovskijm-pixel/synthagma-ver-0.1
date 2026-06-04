
# Аудит партнёрской программы и план починки

## Что я проверил
- Ссылки `/register?ref=КОД` и `/partner?partner_ref=КОД` (генерация в `usePartnerLanding`, `PartnerDashboard`, `PartnerCabinet`)
- Захват реф-кода: `App.tsx` → `captureRefFromUrl` → `referralCookie.ts`
- Регистрация: `useRegisterOrganization.handleSubmit` → edge `register-organization` → RPC `register_referral`
- Создание партнёра: RPC `become_referral_partner(p_referred_by)`
- Начисление комиссий: edge `referral-commission`, вызывается из `useAdminBilling.handleMarkPaid` и `tbank-webhook`
- Состояние БД: **4 партнёра, 0 рефералов, 0 комиссий, 0 попыток регистрации с ref_code за всё время** — атрибуция реально не работает

## Найденные проблемы (отсортированы по критичности)

### Блокеры — почему ссылка «не работает»

**1. Реф-код пишется только при успешном автологине.** В `useRegisterOrganization.ts:183-209`: если `signInWithPassword` после регистрации вернул ошибку (включена email-confirmation, сетевой сбой, антивирус), код делает `return` ДО вызова `register_referral`. Партнёр теряется навсегда.

**2. Edge-функция `register-organization` не получает `ref_code` от клиента.** Сейчас ref_code привязывается с фронта после signin'а. Это значит: если вкладку закрыли между регистрацией и автологином — реферала нет.

**3. HashRouter (мобильное приложение Capacitor) полностью ломает захват.** `captureRefFromUrl()` читает `window.location.search`, но в HashRouter параметры стоят после `#/register?ref=...` — `location.search === ""`. В нативе реф НИКОГДА не сохраняется.

**4. После `/partner?partner_ref=КОД` + login пользователь не возвращается на `/partner`.** В `usePartnerLanding.handleBecomePartner` неавторизованного редиректит на `/login`, после логина — на дашборд организации. Кнопку «Стать партнёром» он больше не нажмёт. Кука есть — кода в БД нет.

**5. `register_referral` молча игнорирует невалидные коды.** Если партнёр `suspended` или код опечатан — `RETURN` без логирования. В админке/логах нет следов попытки. Никто не узнает, что атрибуция отвалилась.

**6. Cyrillic-домен `синтагма.рф` редиректит на `sintagma.com.ru` (см. PWA memory) — query-string `?ref=...` может теряться при редиректе.** Нужно проверить и зафиксировать сохранение query.

### Средние — корректность данных и UX

**7. Нет колонки `referred_by_partner_id` в `organizations`.** Связь только через таблицу `referral_registrations`. Если запись не создалась (см. п.1-2), привязка потеряна навсегда — нет даже резерва на ручное восстановление.

**8. На форме регистрации нет плашки «Вы пришли по приглашению КОД».** Клиент не видит, что попал по реф-ссылке, и не может пожаловаться партнёру, что атрибуция отвалилась.

**9. На лендинге `/partner?partner_ref=КОД` нет плашки «Вас пригласил партнёр КОД».** Конверсии в MLM теряются.

**10. `handleBecomePartner` не проверяет `agreedToTerms` в JS** — только disabled на кнопке. Любое нажатие через DevTools/баг — соглашение обходится.

**11. Идемпотентность `referral-commission` слабая** — 60-секундное окно по сумме. Если две оплаты ровно одной суммой прошли в одну минуту — одна потеряется; через 61 сек — дубль.

**12. `expires_at` у `referral_registrations` = `now() + 2 years`** прибит к моменту регистрации. Если клиент платит на 25-м месяце — комиссия не начисляется, нигде об этом не сообщается.

**13. Триггер комиссии вызывается ТОЛЬКО из:** `useAdminBilling.handleMarkPaid` (ручное «оплачено» админом) и `tbank-webhook`. Не вызывается из:
- успешной оплаты по СБП/счёту через банк-клиент
- автопродления подписки
- апгрейда тарифа free→paid через `useSubscriptionLimits`
- любой кастомной оплаты, которую админ отметил иначе

### Низкие — фоновые процессы и отчётность

**14. `monthly_network_revenue` нигде не сбрасывается в 0 в начале месяца.** `has_turnover_bonus` (бонус +5% при обороте >100к/мес) накапливается пожизненно — все партнёры через какое-то время станут «турновер-бонусными».

**15. `is_top_partner` обновляется только в edge `referral-monthly-stats`.** Cron на эту функцию в конфиге не зарегистрирован — лидерборд не пересчитывается.

**16. `register_referral` использует `ON CONFLICT (partner_id, organization_id) DO NOTHING`,** но нет защиты от «перевода» организации между партнёрами (first-touch attribution). Если клиент сначала пришёл от партнёра A, потом перешёл по ссылке B — атрибутируется тот, кто успел первым; конфликтная попытка тихо игнорируется.

**17. Нет first-touch vs last-touch политики** — кука перезаписывается каждый раз. Стандарт MLM — first-touch с защитой 90 дней; сейчас де-факто last-touch без объявленной политики.

**18. Cookie без явного `domain=`** — при переходе между `sintagma.com.ru`, `синтагма.рф`, поддоменами реф теряется.

## План починки (по приоритетам)

### Этап 1 — починить ссылку end-to-end (критично)
1. **Перенести `register_referral` на сервер.** Передавать `ref_code` в edge `register-organization`; вызывать `register_referral(orgId, refCode)` сразу после `INSERT organizations` (до любого signin'а).
2. **Добавить `organizations.referred_by_partner_id uuid` колонку** + заполнять её в той же edge-функции. Таблица `referral_registrations` остаётся для дат/expiry, но primary source — поле в organizations.
3. **Логировать неудачную атрибуцию.** Если код не найден или партнёр неактивен — писать строку в `audit_logs` или новую таблицу `referral_attribution_log` (попытка, причина отказа).
4. **Починить захват в HashRouter:** в `captureRefFromUrl` парсить и `location.search`, и `location.hash` (substring после `?`).
5. **Сохранять реф-код также в `localStorage`** (не только cookie) — выживает между origin'ами PWA и cyrillic-редиректами.
6. **Проверить редирект `синтагма.рф → sintagma.com.ru`:** убедиться, что query-string сохраняется (если нет — починить).

### Этап 2 — UX-сигналы и MLM-конверсия
7. **Плашка на `/register`:** «Вы пришли по приглашению партнёра XXX. Регистрация засчитается ему.» Подсвечивать жёлтым при невалидном коде.
8. **Плашка на `/partner?partner_ref=КОД`:** «Вас пригласил партнёр XXX. После регистрации вы автоматически попадёте в его сеть второго уровня.»
9. **Авто-возврат на `/partner`:** в `handleBecomePartner` для гостя — сохранять `intent=become_partner` в sessionStorage, redirect на `/login?next=/partner`; после логина авто-вызывать become_referral_partner.
10. **Серверный check `agreedToTerms`** — добавить параметр `p_accepted_terms boolean` в `become_referral_partner` и проверять, что true.

### Этап 3 — корректность комиссий
11. **Единая точка начисления комиссии:** триггер на `subscription_invoices` после `status='paid'`, вызывающий edge `referral-commission`. Уберёт зависимость от того, кто/как пометил оплату.
12. **Идемпотентность по `invoice_id`:** добавить `referral_commissions.invoice_id uuid UNIQUE` (nullable, partial unique index) — гарантирует ровно одну выплату на счёт.
13. **Cron для `referral-monthly-stats`:** регистрация в `supabase/config.toml`, расписание `0 2 1 * *` (1-го числа в 02:00 UTC).
14. **Cron на сброс `monthly_network_revenue`** в 0 каждый 1-й день месяца (часть той же функции).
15. **First-touch attribution:** в `register-organization` если `referred_by_partner_id` уже выставлен — не перезаписывать; в куке не перезаписывать ref_code, если он уже стоит и младше 90 дней.

### Этап 4 — наблюдаемость
16. **Админская страница «Партнёрка → Диагностика»:** последние 50 попыток attribution с причиной отказа.
17. **E2E-тест:** скрипт, который проходит весь цикл (создать партнёра → перейти по `/register?ref=` → зарегистрировать организацию → пометить счёт оплаченным → проверить, что комиссия начислилась). Запускать вручную из админки кнопкой.

## Что вам нужно решить до реализации

Прежде чем кодить, подтвердите:
- **First-touch или last-touch attribution?** (Я предлагаю first-touch на 90 дней — стандарт.)
- **Включать ли проверку accepted_terms на сервере** (это сломает текущих 4 партнёров — у них флага нет; либо делаем backfill `accepted_at = created_at`).
- **Куда заводим cron** для monthly stats — Supabase pg_cron или Lovable Cloud scheduled function (у вас уже есть `process-invoice-payment-reminders-daily` — по тому же шаблону).
- **Этап 3 (триггер на subscription_invoices)** трогает биллинг — делать сейчас или отдельной задачей после стабилизации Этапа 1?

После вашего ответа на эти 4 вопроса перехожу в build mode и делаю по этапам с проверкой каждого шага в браузере и БД.

## Технические детали

- Миграции: ALTER `organizations` (+ `referred_by_partner_id`), ALTER `referral_commissions` (+ `invoice_id` unique), новая таблица `referral_attribution_log`, обновление функций `register_referral` и `become_referral_partner`, новый триггер на `subscription_invoices`.
- Edge: правка `register-organization` (приём ref_code, вызов RPC), правка `referral-commission` (идемпотентность по invoice_id), новый cron `referral-monthly-rollup` (1 числа).
- Frontend: правки `referralCookie.ts` (hash + localStorage), `usePartnerLanding.ts` (auto-redirect, terms check), компонент `ReferralBanner` на `/register` и `/partner`.
- Тесты: `referralCookie.test.ts` уже есть — расширить кейсами hash и localStorage; добавить интеграционный тест для edge `register-organization`.
