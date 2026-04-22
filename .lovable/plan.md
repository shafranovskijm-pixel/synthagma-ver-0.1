

# Аудит «Продажи»: что ещё надо починить

После прошлого спринта (4 итерации) я перепроверил код. Хорошая новость: основа теперь твёрдая — RLS по организациям подтверждена в БД, фильтрация прокинута, лимиты добавлены. Но я нашёл **новую партию узких мест**, которые точно «вылезут» у пользователя.

## Состояние RLS в БД (проверил из postgres)

✅ Все ключевые таблицы изолированы:
- `sales_leads`, `sales_lead_activities`, `sales_companies_db`, `sales_contracts`, `sales_blacklist`, `sales_tasks` — политики `Org members manage own ...` с `organization_id = current_organization_id()` действуют.
- `commercial_proposals`, `document_signatures` — политики org-area тоже на месте.

⚠️ Но `sales_managers` — только админ + сам менеджер. У `org_manager` доступа нет → леaderboard и фильтр менеджера в орг-кабинете всегда пустые (это уже учтено в `SalesOverview`, но в `LeadsManager.managers` массив **пустой**, а интерфейс показывает фильтр и бейдж «Менеджер» с прочерком).

## Новые узкие места и баги

### 1. Утечка через `useSalesManager` (КРИТ)
- `LeadsManager` вызывает `fetchLeads()` без `organizationId`, фильтрует уже **на клиенте** (`l.organization_id === organizationId`). Для организаций с **>1000 лидов** Supabase вернёт максимум 1000 (default limit), и после клиентской фильтрации может получиться пусто или непредсказуемо обрезано. Нужно фильтровать на сервере.
- Тот же `useSalesManager` используется в `NewTaskForm` (`SalesTasks`) — `fetchLeads` без org-фильтра загружает чужие лиды для админа (норм) и пустоту для орг (RLS отрежет, ок), но с лимитом 1000 для крупных аккаунтов.
- `fetchActivities`, `fetchProposals` — нигде не фильтруются по `organization_id` явно (полагаемся только на RLS). На больших объёмах админ получит «всё подряд» и фриз.

### 2. `DealCommunication` — SQL-инъекция через `.or()` (КРИТ безопасность)
- Строки `or('inn.eq.${inn},org_name.ilike.${companyName.slice(0,30)}%')` и `or('company_inn.eq.${inn},company_name.ilike.${companyName.slice(0,30)}%')` подставляют `companyName` без экранирования.
- Если в названии компании есть `,` или `)`, запрос **сломается** или вернёт неожиданное.
- Названия типа `ООО «Рога, и копыта»` гарантированно ломают URL-параметры PostgREST.

### 3. `sales_companies_db` insert RLS — `INSERT` политика без проверки `WITH CHECK` для admin (нашёл дыру)
- Политика `Admins can insert sales companies db` имеет `qual = NULL` для INSERT (это нормально для INSERT) но `with_check` требует `organization_id IS NOT NULL OR admin`. Это значит, что **админ при импорте через Чеко** может вставить строку **без `organization_id`** → она будет видна всем org как «осиротевшая»? Нет, RLS SELECT для org требует `organization_id = current_organization_id()`. Проверю: SELECT-политики org игнорируют NULL → ок.
- Но `sales_companies_db_db` массовый импорт через `checko-enrich-batch` сохраняет данные **без** `organization_id` (это глобальная база, общее для всех админов). Для **орг.менеджера** Чёрная база будет пустой всегда → опция «обогатить из ИНН-базы» бесполезна. Нужно решить продуктово: либо **общая глобальная база** видна всем, либо орг ведёт свою.

### 4. `OrgSalesManager` — пустые данные и потерянный сценарий
- Раздел `companies` грузит `LeadsManager` + `CompaniesDatabase` (Чеко-база). Поскольку Чеко-база **глобальная** (без `organization_id`), орг-менеджер видит пустоту → кнопка «Импорт из Excel» и «Добавить ИНН» ведёт на админский функционал, который для орг тоже не работает (RLS на `organization_id IS NOT NULL OR admin` для INSERT, но сам Edge `checko-enrich-batch` от service-role и не проставляет `organization_id`).
- Решение: либо скрыть «Холодную базу» в орг-кабинете, либо хранить per-org копию (предпочтительно — скрыть и показывать сообщение «Холодная база ИНН доступна только администраторам платформы»).

### 5. `Deals360.signatures` — старый O(N×M) substring match никуда не делся
- В `Deals360.tsx:171-178` всё ещё есть код `Array.from(map.values()).find(x => x.name.toLowerCase().includes(s.recipient_name.slice(0,15)))`. Я починил это в `SalesKanban`, но `Deals360` — нет.
- При 500 КП × 500 подписей = 250k операций сравнения строк = ~200ms заметного фриза.
- Решение: построить `byNameLower: Map` и `byInn: Map` один раз, искать через `.get()`.

### 6. `Deals360.invoices` — массив всегда пустой
- В `loadDeals()` есть `billingRes` (запрос `subscription_invoices`), но **результаты нигде не пишутся в `c.invoices`** — массив создаётся пустым в `ensure()`, и счётчик «Счета: 0» всегда.
- В правой панели «Воронка этапов» иконка «Счета» всегда тёмная.

### 7. `SalesTasks` создание — `managers` массив всегда `[]` для орг
- `useSalesManager().fetchManagers()` вызывает `select('*').from('sales_managers')` без `organization_id`. RLS не пускает org_manager → массив пустой.
- В `NewTaskForm` `Select` с менеджерами **пуст**. Пользователь думает «нет менеджеров — нельзя создать задачу». Нужно показать info-сообщение «В вашей организации нет менеджеров продаж — задача будет без привязки».

### 8. `process-paused-campaigns` cron — может убить рассылку
- Cron каждые 5 минут вызывает `run-email-campaign` для всех `paused`. Если пользователь сам поставил кампанию на паузу (вручную) — **cron её снова запустит**.
- Сейчас в БД статус `paused` означает «зависла, надо продолжить». Но если в UI кнопка «Пауза» делает то же самое — конфликт.
- Решение: добавить колонку `email_campaigns.paused_by_user boolean` и не ресюмить такие, ИЛИ заменить `paused` на `interrupted` для зависших.

### 9. `commercial_proposals` SELECT для anon (`Public can view sent proposals`)
- Политика разрешает **анонимам** читать любые КП со статусом `sent`. Это **публичная утечка данных всех клиентов всех организаций** — ИНН, суммы, контактные данные.
- Назначение, видимо: клиент по `proposal_token` видит своё КП. Но политика не ограничивает по токену!
- **КРИТИЧНО**: переписать политику на `(status = 'sent' AND public_token IS NOT NULL)` и в коде на стороне клиента всегда читать через токен, либо вообще убрать публичный доступ и читать через edge-функцию.

### 10. Мелочи UX
- `Deals360` колонка «Подписи» считает только подписи, привязанные через имя (см. п. 5) — реальное число всегда занижено.
- `SalesKanban` 5 колонок на 1366px (sm:3, lg:5) — последние 2 колонки горизонтально скроллятся, контент обрезается. Нужен `2xl:grid-cols-5`, на меньших — `lg:grid-cols-3 xl:grid-cols-5`.
- Архив в `CompaniesUnified` группирует только `not_interested` лиды и `rejected` КП — а отклонённые договоры (status `cancelled`/`expired`) не попадают.

## План: 3 итерации

### Итерация 1 — Безопасность (сделать срочно)
1. Закрыть SQL-инъекцию в `DealCommunication`: использовать `.eq('inn', inn)` отдельным запросом и `.ilike('company_name', escapedName)` через `replace(',', '\\,')` либо переключиться на 2 отдельных запроса с `OR` через `.or()` корректно.
2. Сузить политику `Public can view sent proposals` на `commercial_proposals` — добавить ограничение по `public_token IS NOT NULL` ИЛИ убрать политику и читать через edge-функцию `get-public-proposal`.
3. Добавить флаг `email_campaigns.user_paused boolean` и в cron `process-paused-campaigns` пропускать `WHERE user_paused = false`.

### Итерация 2 — Производительность и корректность данных
4. `useSalesManager.fetchLeads/fetchProposals/fetchActivities` — принимают `organizationId`, добавляют `.eq('organization_id', orgId)` + `.limit(2000)`.
5. `Deals360.tsx`: индекс `byInn` и `byNameLower`, замена substring-поиска подписей.
6. `Deals360.tsx`: `billingRes` действительно пушим в `c.invoices` (привязка по `organization_id` для платформенных счетов или по `company_inn` если будет такое поле).
7. `SalesKanban` сетка: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5`.

### Итерация 3 — UX и продуктовые улучшения
8. `OrgSalesManager` → раздел «companies»: скрыть вкладку «Холодная база» (Чеко) для орг, показать карточку «Доступно администраторам платформы». Либо — отдельная per-org Чеко-база (большая работа, отложить).
9. `SalesTasks NewTaskForm` для орг: если `managers.length === 0`, скрыть селект менеджера и показать подсказку «Задача будет создана без привязки к менеджеру».
10. `LeadsManager` для орг: фильтр «Менеджер» скрыть, если `managers` пуст. Показать счётчик «Всего: N» вместо `(orgFilteredLeads.length)` после server-side фильтрации.
11. `Архив` в `CompaniesUnified`: добавить договоры со статусом `cancelled`/`expired`.

## Что НЕ делаю
- Не переделываю `commercial_proposals` на токен-based чтение (это отдельная задача — нужна edge-функция и редизайн страницы публичного просмотра КП).
- Не делаю drag-n-drop в Канбане.
- Не трогаю `useSalesManager` структурно (старый код с useState вместо react-query) — только добавляю org-фильтр.

## Технические детали

**Файлы для итерации 1:**
- `src/components/admin/sales/DealCommunication.tsx` — переписать `.or()` запросы.
- Миграция: `ALTER POLICY "Public can view sent proposals" ON commercial_proposals USING (status='sent' AND public_token IS NOT NULL)` (сначала проверю наличие `public_token` колонки).
- Миграция: `ALTER TABLE email_campaigns ADD COLUMN user_paused boolean DEFAULT false`. Edge `process-paused-campaigns`: `WHERE status='paused' AND user_paused=false`.

**Файлы для итерации 2:**
- `src/hooks/useSalesManager.ts` — параметризация org-фильтра.
- `src/components/admin/sales/Deals360.tsx` — рефакторинг `loadDeals`.
- `src/components/admin/sales/SalesKanban.tsx` — сетка.

**Файлы для итерации 3:**
- `src/components/organization/sales/OrgSalesManager.tsx` — заглушка для холодной базы.
- `src/components/admin/sales/SalesTasks.tsx`, `LeadsManager.tsx`, `CompaniesUnified.tsx` — UX.

## Решение от вас

Какой объём делаем?

1. **Все 3 итерации** (рекомендую — закрывает безопасность + UX-косяки) — 1 крупный заход.
2. **Только Итерация 1 (безопасность)** — обязательный минимум, особенно п.9 (утечка КП).
3. **Итерации 1 + 2** (без UX-полировки).
4. **Свой набор** — скажите номера пунктов.

