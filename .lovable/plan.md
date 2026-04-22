

# Аудит «Продажи»: что готово, что хрупко, что починить

## Состояние по разделам

### Админка (/admin → Продажи) — работает, но с подводными камнями
- **Обзор, Задачи, Сделки 360°, Канбан, Компании (с Чёрным списком), КП, Договоры, Подписание, Услуги, Менеджеры, Контроль, Сравнение, Рассылки** — всё на месте.
- **«Наши реквизиты»** вынесены в кнопку в шапке (модалка) — корректно.

### Организация (/organization → Продажи, если включён `showSales`)
- Новый `OrgSalesManager` подключён, использует те же компоненты `SalesOverview`, `SalesTasks`, `Deals360`, `CompaniesUnified` из админки.
- Проблема: эти компоненты **не передают `organizationId`** и **не фильтруют данные по организации** на клиенте. RLS отдаст организации только её данные → внутри будет «пусто», а админ увидит вообще всё (вперемешку с другими орг.).

## Узкие места и риски (что точно «уплывёт» у пользователя)

### A. Утечка данных и пустые экраны (критично)
1. **`Deals360` / `SalesKanban` / `SalesOverview` / `CompaniesUnified` дёргают глобальные таблицы без `organization_id`-фильтра**. Для организации:
   - `commercial_proposals` — RLS политика «Org members manage own proposals» требует `scope='org' AND organization_id=...`. Если в таблице платформенные КП (`scope='platform'`), орг. их **не увидит и это правильно**, но если КП орг. сохранены без `organization_id` — будут невидимы. Нужно проверять при создании КП в `OrgProposalsManager`, что `organization_id` проставляется.
   - `sales_contracts`, `sales_companies_db`, `sales_leads`, `sales_managers`, `sales_lead_activities` — RLS только для `admin` и `sales_manager`. **Менеджер организации (роль `org_manager`) не получит ни одной строки** → во вкладках будет вечная «Загрузка…» / пустота.
2. **`subscription_invoices`** в Сделках 360° для орг. показывает только её счета (RLS), но в админке — все счета платформы. Скорее всего это нормально, но в орг. контексте `Wallet` всегда будет 0.

### B. Перфоманс и тайм-ауты
3. **`Deals360.loadDeals()`** грузит **все** `commercial_proposals` + **все** `sales_contracts` без `limit` и без range. На 5000+ КП — фриз и таймаут.
4. **`SalesOverview`** делает 6 параллельных `select *` без лимитов. У больших аккаунтов уйдёт в out-of-memory браузера.
5. **`SalesKanban`** жёстко использует `Array.from(map.values()).find(...)` для привязки подписей по `recipient_name` (substring 15 символов) — **O(N×M)** + ложные привязки (две компании с похожими названиями склеятся в одну).

### C. UX-баги, которые точно вылезут
6. **«Канбан» в Сделках 360°** — переключение `view='kanban'`, но шапка с тогглом отрисована **снаружи** канбана. Когда в канбане кликают карточку, переключение возвращает в `list` — а скроллинг страницы остаётся на канбане → пользователь «теряет» выбор.
7. **`DealQuickActions`** — все 6 кнопок (Создать КП, Создать договор, Счёт, Звонок, Заметка, Задача) **без `onClick` обработчиков** в `Deals360`. Нажимаются, но ничего не происходит → ощущение «сломано».
8. **`DealCommunication`** показывает «историю» — из какого источника? Если из `sales_lead_activities`, то для записи без `lead_id` (в орг. контексте) будет пусто всегда.
9. **`SalesTasks → NewTaskForm → managerId`** — обязательное поле. У орг. менеджера в `sales_managers` записей **нет** → создать задачу невозможно (кнопка disabled).
10. **`overview` → `onJump('leads')` / `onJump('signing')`** — этих секций больше нет в `OrgSalesManager` (есть только `companies`, нет `leads`/`signing`/`comparison`/`control`/`managers`). Клик по уведомлению — ничего не происходит.
11. **Шапка/сайдбар орг. Продаж**: ширина `w-56` + контент `flex-1`, но **внутри** контент `Deals360` рисует свой `grid lg:grid-cols-[300px_minmax(0,1fr)_320px]`. На вьюпорте 1280-1366 правая панель «Контакты + быстрые действия» **уплывёт под основной блок** (gap=4×16 + 300+320=684px съедает половину). Нужен `xl:` брейкпоинт.
12. **Чёрный список**: `useSalesBlacklist.list` грузит **всё подряд** без фильтра по `organization_id`. У админа покажет ИНН разных организаций вперемешку, у орг. менеджера — RLS-зависимо (если RLS требует `organization_id`, увидит только свои).
13. **«Архив» в `CompaniesUnified`** — заглушка-плейсхолдер, никакого функционала.

### D. Рассылки
14. **Cron `process-paused-campaigns`** добавлен, но в `CampaignsManager` бейдж «Продолжается автоматически» показан только для `paused`. Если пользователь создал кампанию в `draft` и она «зависла» на `sending` (Edge упал, статус не обновился) — бейджа нет, кнопки «Принудительно продолжить» нет. Менеджер думает «всё сломано».
15. **Trial / SMTP не настроен** в орг.: `OrgEmailCampaigns` пытается запустить → `run-email-campaign` вернёт ошибку, но в `OrgSalesManager` нет видимого предупреждения «настройте SMTP сначала». Раздел `smtp` есть, но пользователь о нём не догадывается.

### E. Рискованные предположения в коде
16. `STAGE_ICON`, `STATUS_COLORS` имеют ключи только под некоторые статусы. Новый статус (например, `archived`) → пустой стиль, бейдж без цвета.
17. `differenceInDays` в `SalesOverview` падает, если `last_sent_at`/`sent_at` `null` (фильтр `.filter(p.last_sent_at)` есть, но для signatures проверка только `s.sent_at || s.created_at` — `created_at` всегда есть, ОК). Для `coldLeads` `last_contact_at || created_at` — ОК.
18. `NewTaskForm` сохраняет `due_date` через `new Date(dueDate).toISOString()` — берёт локальный TZ браузера. На сервере хранится UTC. Отчёт «сегодня» в другой timezone покажет «вчера» — лёгкая путаница на стыке полуночи.

## Что предлагаю сделать (по приоритету)

### Итерация 1 — Изоляция организаций и пустые экраны (БЛОКЕР)
- Прокинуть проп `organizationId?: string` в `SalesOverview`, `SalesTasks`, `Deals360`, `SalesKanban`, `CompaniesUnified` (и далее в `LeadsManager`, `CompaniesDatabase`). Когда `organizationId` задан — фильтровать запросы `.eq('organization_id', organizationId)`.
- Добавить RLS политики для `org_manager` на `sales_leads`, `sales_lead_activities`, `sales_companies_db`, `sales_managers` (видеть только свою орг.). Без этого даже с фильтром будут пустые экраны.
- В `OrgSalesManager` убрать из меню/обзора пункты, которые не реализованы для орг (`leads`, `signing`, `managers`, `control`), либо показывать их как «soon». `onJump` маппить только в существующие секции.

### Итерация 2 — Производительность
- В `Deals360.loadDeals()` добавить `.limit(500)` + сортировку по `created_at desc`, отдельную пагинацию «Показать ещё». Для орг. — `.eq('organization_id', orgId)`.
- В `SalesOverview` запросы `.select(...)` сузить полями, добавить `.gte('created_at', ...)` (последние 90 дней + текущий месяц).
- В `SalesKanban` заменить «привязку подписей по substring имени» на индекс по `inn` (если в `document_signatures` нет `inn` — добавить колонку в миграции и заполнить триггером при создании подписи).

### Итерация 3 — UX-баги и плавающие плашки
- Подключить `onCreate*` хендлеры в `DealQuickActions` (открывать существующие диалоги создания КП/договора, либо переключать секцию + предзаполнять).
- Сетка `Deals360` на ≤1280px: переключить с `lg:grid-cols-[...3-col]` на `xl:grid-cols-[...3-col]` и `lg:grid-cols-[280px_1fr]` (правую панель — под основной блок).
- В `SalesTasks` для орг. менеджера автоподставлять «Менеджер = текущий пользователь» (если в `sales_managers` есть запись с `user_id = auth.uid()`), либо разрешать `manager_id = null` при создании.
- В `Deals360`: после клика на карточку канбана **сначала** переключать на `list`, **потом** ставить `selectedInn` в `setTimeout(0)` — чтобы grid отрисовался и скроллбар появился до выбора.
- В `CampaignsManager`: добавить «Принудительно продолжить» для статуса `sending`, если `started_at` старше 10 минут (зависшая кампания).
- В `OrgSalesManager → Рассылки`: проверять `useOrgSmtp().configured` и показывать `Card`-предупреждение «Настройте SMTP» с кнопкой перехода в раздел `smtp`.

### Итерация 4 — Контент-заглушки
- Реализовать вкладку «Архив» в `CompaniesUnified`: показывать `sales_leads` со статусом `not_interested` / `archived` + `commercial_proposals.status='rejected'`.
- В `useSalesBlacklist` добавить фильтр `organizationId` (если задан) для админа — оставить «всё», для орг. — только свои (RLS уже работает, но добавить явный `.eq()` для скорости и чтобы query-key был корректный).

## Что НЕ делаю
- Не переписываю CRM с нуля (структура хорошая).
- Не интегрирую телефонию/CRM-почту (отложено).
- Не делаю drag-n-drop для канбана (отдельная большая задача).
- Не правлю TZ-логику globally (только напомню на UI «Сегодня в вашем часовом поясе»).

## Технические детали (для разработчика)

**Файлы под правки в Итерации 1:**
- `src/components/admin/sales/SalesOverview.tsx` — пропс `organizationId?: string`, добавить `.eq()` ко всем 6 запросам.
- `src/components/admin/sales/Deals360.tsx`, `SalesKanban.tsx`, `CompaniesUnified.tsx`, `SalesTasks.tsx`, `LeadsManager.tsx`, `CompaniesDatabase.tsx` — то же.
- `src/components/organization/sales/OrgSalesManager.tsx` — `<SalesOverview organizationId={organizationId} />` и т.д.
- Миграция: RLS политики `org_manager` на `sales_leads`, `sales_lead_activities`, `sales_companies_db` (`USING (organization_id = current_organization_id())`).

**Итерация 2 — индексы и лимиты:**
- Индексы: `sales_leads(organization_id, created_at desc)`, `commercial_proposals(organization_id, created_at desc)`, `sales_contracts(organization_id, created_at desc)`.
- В query-key хука прокинуть `organizationId` чтобы кэш не «склеивался» между организациями.

**Итерация 3 — UX:**
- `DealQuickActions` принимает `onCreateProposal/Contract/Invoice` колбэки и `OrgSalesManager`/`SalesManager` пробрасывает их (открывают модалку или переключают секцию + state).
- Брейкпоинт сетки: `grid-cols-1 lg:grid-cols-[280px_1fr] xl:grid-cols-[300px_minmax(0,1fr)_320px]`.

**Итерация 4 — `CampaignsManager`:**
- Зависшие кампании детектить так: `status='sending' AND now()-started_at > '10 min'`. Кнопка «Принудительно продолжить» вызывает `run-email-campaign` повторно (он уже идемпотентен).

## Решение от вас

1. **Все 4 итерации сразу** (рекомендую — это закрывает блокеры и UX-косяки) — 1 крупный заход.
2. **Только Итерация 1** (изоляция организаций и пустые экраны) — обязательный минимум, ~1 заход.
3. **Итерации 1 + 3** (изоляция + UX без производительности и архива).
4. **Свой набор** — скажите номера пунктов.

