

# План: ускорение и оптимизация платформы

Цель — заметно сократить время первой отрисовки админки и кабинета организации, убрать лишние запросы и облегчить главный JS-бандл, не меняя поведение функций.

## 1. Убрать N+1 при загрузке списка организаций

**Где:** `src/hooks/useOrganizationsManager.ts` (`fetchOrganizations`).

Сейчас при открытии `/admin` для каждой организации делается отдельный RPC `get_decrypted_org_credentials` (в network видно ~18 одновременных POST). Это и нагрузка, и время до первой полезной отрисовки.

Что сделаю:
- создам **batch-RPC** `get_decrypted_org_credentials_batch(org_ids uuid[])`, возвращающую массив `{ organization_id, login_email, login_password }` за один вызов (SECURITY DEFINER, проверяет `has_role(auth.uid(), 'admin')` как и текущая функция);
- в `fetchOrganizations` заменю `Promise.all(orgIds.map(rpc(...)))` на один вызов;
- сами `users_count` и `courses_count` получу через `count: 'exact', head: true` группой (или один SQL view `org_overview_counts`), а не через выгрузку всех `profiles`/`courses`.

Эффект: было ~20 параллельных запросов → станет 2-3. Падение нагрузки на postgrest и заметное ускорение `/admin`.

## 2. Журналы оценок и тестов — тянуть только нужное

**Где:** `src/hooks/useAutoGradesJournal.ts`, `src/hooks/useAutoFinalAttestation.ts`.

Сейчас `select('*')` по `test_attempts` и `lesson_progress` **без фильтра по организации** и без диапазона дат — всё фильтруется уже на клиенте.

Что сделаю:
- ограничу выборку параметрами хука: `organization_id`, `dateRange.from/to`, и select только нужных колонок;
- буду делать join через два запроса по `lesson_id IN (lessons WHERE course_id IN org)` — без выкачки чужих строк (RLS и так не отдаст, но фильтр снизит нагрузку и сетевой трафик);
- добавлю `range(0, 999)` пагинацию и подгрузку «ещё».

## 3. Lazy-вкладки в AdminDashboard

**Где:** `src/pages/AdminDashboard.tsx`.

Сейчас 17 тяжёлых компонентов вкладок (Marketplace, Sales, Billing, Webinars, Broadcast, ReferralsManager, PlatformUpdatesManager, AdminBillingOverview, AdminFinanceOverview, BlogManager, AdminChatsManager, AISettingsManager, …) импортируются eagerly и попадают в чанк страницы.

Что сделаю:
- заменю прямые импорты на `lazyWithRetry` + локальный `<Suspense fallback={<LazyLoadFallback />}>` вокруг активной вкладки;
- оставлю eager только дефолтную вкладку «Организации» и часто открываемые «Пользователи» и «Sales».

То же самое сделаю для `OrganizationDashboard.tsx` (23 импорта вкладок) и `StudentDashboard.tsx` (31 импорт).

## 4. Вынести 300 КБ контрактных PNG из главного бандла

**Где:** `src/constants/contractAssets.ts` (≈300 КБ base64), импортируется из `contractTemplates.ts` и `invoiceTemplate.ts`.

Сейчас эти ассеты тянутся в любой чанк, который трогает шаблон договора/счёта.

Что сделаю:
- перенесу PNG-base64 в `src/assets/contracts/` как реальные файлы (`signature.png`, `stamp.png`) и буду импортировать через Vite `import sigUrl from '...png'` — Vite сам захэширует и положит как отдельный asset;
- если base64 нужен именно как строка (для PDF-генерации), сделаю **динамический** `() => import('./contractAssets')` — он попадёт в отдельный чанк и подгрузится только при генерации документа.

Эффект: −300 КБ из общего JS, заметно лучше TTI на холодном кэше.

## 5. Split тяжёлых монолитных компонентов

**Где:** `OrgProfileTab.tsx` (54 КБ), `ContractReviewBody.tsx` (47 КБ), `SignaturesJournal.tsx` (39 КБ), `RichTextEditor.tsx` (44 КБ), `BulkDocumentGenerator.tsx` (35 КБ), `frdoFileSanitizer.ts` (37 КБ).

Что сделаю точечно:
- `RichTextEditor` — обернуть `lazyWithRetry`, грузить только при открытии редактора;
- `BulkDocumentGenerator` — lazy, диалог открывается по кнопке;
- `SignaturesJournal` — lazy внутри вкладки документов;
- `frdoFileSanitizer` — оставить, но убедиться, что грузится только в `FrdoFileSanitizerDialog` (динамический импорт при открытии);
- `OrgProfileTab` — разбить на `ProfileBasicInfo`, `ProfileLegalInfo`, `ProfileBranding`, `ProfileCredentials`, чтобы рендер вкладки не тянул всё сразу.

## 6. Поллинг → realtime + visibility-aware

**Где:** `useCheckoApi.ts` (`refetchInterval: 30s`), `OnlineUsersWidget.tsx` (30s), `GenerationHistoryTab.tsx`, `useOrgNewIndicators.ts` (90s).

Что сделаю:
- глобально оборачиваю интервалы условием `document.visibilityState === 'visible'`, чтобы не дёргать сервер с фоновых вкладок;
- `checko-stats` дополнительно держу `refetchInterval` только когда раздел «Холодная база» открыт (через `enabled: tab === 'cold-base'`);
- `OnlineUsersWidget` — увеличу до 60с и поставлю visibility guard.

## 7. Глобальная конфигурация React Query

**Где:** `src/App.tsx`.

Сейчас `staleTime: 30s` для всех запросов — нормальный дефолт, но точечно для справочников он маленький.

Что сделаю:
- в хуках, где данные меняются редко (категории, регионы, типы лицензий, тарифы, `radio_stations`, `admin_branding`), укажу `staleTime: 5 * 60 * 1000` и `gcTime: 30 * 60 * 1000`;
- добавлю `placeholderData: keepPreviousData` для пагинированных таблиц (companies, journals), чтобы UI не «прыгал» при смене страницы.

## 8. Точечные индексы в БД

Создам/проверю индексы там, где идут частые фильтры:
- `lesson_progress (user_id, completed, completed_at desc)`,
- `test_attempts (user_id, completed_at desc)`,
- `enrollments (organization_id, status, started_at desc)`,
- `sales_companies_db (inn)`, `(region)`, `(updated_at desc)` — для холодной базы и фильтров поиска,
- `checko_pending_inns (created_at)` — для очереди.

Перед созданием прогоню `EXPLAIN` через managed DB tools, добавлю только реально нужные.

## 9. Мелкие правки

- В `useOrganizationsManager` уже после успешного `create/edit/delete` вызывается полный `fetchOrganizations()` — заменю на оптимистичное обновление состояния, чтобы не передёргивать всю таблицу.
- Убрать в админке двойную подписку Yandex.Metrika (видно 2 счётчика в network) — оставить один, второй грузится зря.

## Файлы

| Файл | Изменение |
|---|---|
| `src/hooks/useOrganizationsManager.ts` | один batch-RPC для credentials, count через head:true |
| миграция | RPC `get_decrypted_org_credentials_batch`, нужные индексы |
| `src/hooks/useAutoGradesJournal.ts`, `useAutoFinalAttestation.ts` | фильтры по org/датам, нужные колонки, пагинация |
| `src/pages/AdminDashboard.tsx` | lazyWithRetry для редких вкладок + Suspense |
| `src/pages/OrganizationDashboard.tsx`, `StudentDashboard.tsx` | то же |
| `src/constants/contractAssets.ts` + `contractTemplates.ts`, `invoiceTemplate.ts` | вынести PNG в assets/динамический импорт |
| `src/components/course-builder/RichTextEditor.tsx` (использования) | lazy-обёртка в местах открытия редактора |
| `src/components/organization/BulkDocumentGenerator.tsx` (использования) | lazy при открытии диалога |
| `src/components/admin/SignaturesJournal.tsx` (использования) | lazy внутри вкладки документов |
| `src/components/organization/tabs/OrgProfileTab.tsx` | разбиение на 4 файла |
| `src/hooks/useCheckoApi.ts`, `OnlineUsersWidget.tsx`, `useOrgNewIndicators.ts` | visibility-aware polling |
| `src/hooks/use*` (справочники) | staleTime 5мин, keepPreviousData |
| `index.html` | оставить один счётчик Метрики |

## Что НЕ трогаю

- Логику бизнес-функций (CRM, ФРДО, маркетплейс, обучение) — только обвязка.
- `src/integrations/supabase/types.ts` — авто-генерируемый.
- Дизайн и внешний вид кабинетов.
- Порядок работы Lovable Cloud / SMTP / Kinescope / GigaChat.

## Ожидаемый эффект

- Главный JS-бандл − ориентировочно 350-500 КБ (за счёт lazy-вкладок и выноса PNG).
- Загрузка `/admin`: 20+ параллельных запросов → 2-3.
- Журналы оценок: вместо «select * по всей таблице» — выборка только за нужный месяц и нужную организацию.
- Меньше фоновой нагрузки на postgrest и edge-функции из-за visibility-aware поллинга.

