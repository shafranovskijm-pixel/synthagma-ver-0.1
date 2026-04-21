

## План: Полный CRM-комплекс для организаций — КП, Шаблоны писем, Договоры через документооборот

### Часть 1. Меню «Продажи» — скрыть по умолчанию

- `defaultMenuSettings` в `useDashboardSettings.ts` → добавить `showSales: false`.
- `normalizeMenuSettings` → `showSales: raw.showSales === true` (off by default).
- `OrgSidebar.tsx` → пункт «Продажи» рендерится **только** если `menuSettings.showSales === true`.
- В **«Профиль организации»** (`OrgProfileTab.tsx`) убираю переключатель «Компании» (`showCompanies`) **и не добавляю** свитч «Продажи» (по запросу — раздел спрятан и в настройках не светится; включается через админ-панель платформы или скрытый URL `?enableSales=1`, который ставит флаг в БД).
- На странице раздела «Продажи» (когда включён) — баннер «Beta. Хотите включить постоянно? Напишите в поддержку».

### Часть 2. Под-сайдбар «Продажи» в организации

Внутри `OrgSalesLayout.tsx` под-вкладки:
```
[Рассылки] [Шаблоны писем] [КП] [Договоры] [Лиды] [SMTP]
```
Все под одним layout, переключение по `?tab=sales&section=...`.

### Часть 3. Шаблоны HTML-писем (новое, для админа и организации)

**Таблица `email_templates`:**
```sql
id uuid PK
scope text CHECK ('platform','org')   -- platform = админ, org = организация
organization_id uuid                  -- NULL для platform
name text                             -- "Холодное знакомство", "После КП", "Повтор"
category text                         -- 'cold','followup','proposal','contract','custom'
subject text
html_body text                        -- HTML с переменными {{name}} {{company}} {{link}} {{proposal_url}} {{contract_url}}
variables jsonb                       -- список доступных переменных + примеры
is_default bool                       -- системные шаблоны (нельзя удалять, можно копировать)
created_by uuid, created_at, updated_at
```
RLS: scope='platform' → admin only; scope='org' → своя организация + admin.

**Системные шаблоны (seed, scope='platform', is_default=true):**
1. «Знакомство — холодное» (для рассылки по списку компаний)
2. «Отправка КП» (с переменной `{{proposal_url}}`)
3. «Напоминание после КП» (через 3 дня)
4. «Отправка договора» (с переменной `{{signing_url}}`)
5. «Договор подписан — благодарность»
6. «Реактивация спящего клиента»

Организация при создании автоматически клонирует системные шаблоны в свой scope='org' (через триггер `seed_org_email_templates` на `INSERT INTO organizations`).

**UI** `EmailTemplatesManager.tsx` (общий для admin/org):
- Список шаблонов с фильтром по category
- Редактор: название, категория, тема, **HTML-textarea с live-preview справа** (iframe), кнопка «Вставить переменную»
- Кнопка «Тестовая отправка на мой email» (через `send-campaign-email` с одним получателем)
- Привязка к кампаниям рассылок и к КП/договорам — везде, где есть отправка email, появляется выбор шаблона.

**Интеграция с уже сделанными кампаниями:**  
В `email_campaigns` добавить колонку `template_id uuid REFERENCES email_templates(id)`. Если выбран шаблон — `subject` и `html_body` копируются из него при создании, дальше живут отдельно (snapshot).

### Часть 4. КП в организации (новый раздел `OrgProposalsManager`)

**Не плодим новые таблицы.** Расширяем существующую `commercial_proposals`:
```sql
ALTER TABLE commercial_proposals 
  ADD COLUMN scope text NOT NULL DEFAULT 'platform' CHECK (scope IN ('platform','org')),
  ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

-- RLS: scope='org' → org users + admin; scope='platform' остаётся как было.
CREATE POLICY "Org access to own proposals" ON commercial_proposals
  FOR ALL TO authenticated
  USING (scope = 'org' AND organization_id = current_organization_id())
  WITH CHECK (scope = 'org' AND organization_id = current_organization_id());
```
То же для `commercial_proposal_services` (через JOIN).

**OrgProposalsManager.tsx** — клон `CommercialProposals.tsx`, но:
- Все запросы фильтруют по `scope='org' AND organization_id=current`.
- Услуги тянутся не из `sales_services` (это сервисы платформы), а из `org_services` (новая таблица — каталог услуг организации с тарифами/обучением). Минимальная: `id, organization_id, name, description, price, unit, is_active`.
- Шаблон письма для отправки КП — выбирается из `email_templates` scope='org'.
- Отправка через `send-campaign-email` (используется уже **org SMTP** из `org_smtp_settings`); подставляется ссылка `proposal_url = https://.../proposal/:id`.
- Лимиты прогрева — те же `consume_email_quota(org_id::text, 1)` (КП считается 1 письмом в дневной квоте).

### Часть 5. Договоры через документооборот (главное)

**Решение:** НЕ создаём отдельную таблицу контрактов в org. Используем уже существующий **полноценный документооборот** платформы:
- `document_signatures` — кто кому, статус, токен подписи, expires_at
- `signature_revisions` — версионирование с change_summary
- `signature_comments` — правки/возражения с резолюцией
- RPC `add_signature_revision`, `set_signature_comment_resolution`, `org_finalize_signature_review`
- Edge `send-signing-email`, `finalize-signature` (всё уже работает у админа в «Договорах с организациями»)

**Что добавляем:**
1. **`OrgContractsManager.tsx`** — раздел в «Продажи → Договоры»:
   - Таб «Шаблоны договоров» — таблица `org_contract_templates(id, organization_id, name, body_html, variables jsonb, created_at)`. UI редактор: HTML + переменные `{{client_name}}, {{client_inn}}, {{amount}}, {{date}}, {{director}}, ...`.
   - Таб «На подписание» — список `document_signatures` где `organization_id = current` И `document_type = 'sales_contract'` (новый тип). Колонки: контрагент, статус (`draft → sent → in_review → signed/changes_requested`), последняя версия, кнопки «Открыть переписку», «Скачать подписанный PDF».
   - Кнопка **«Создать договор»** → диалог:
     - Выбор шаблона из `org_contract_templates` (или свой HTML)
     - Выбор контрагента: из «Базы компаний» (`sales_companies_db`), из своих `companies`, или ручной ввод (ИНН → DaData автозаполнение через уже существующий `dadata-company`)
     - Заполнение переменных шаблона
     - Preview HTML
     - Кнопка «Отправить на подписание» → создаёт запись в `document_signatures` через `create_external_contract_signature` (RPC уже есть!) → автоматически создаёт первую `signature_revisions` → Edge `send-signing-email` шлёт письмо с токеном.
   - Получатель открывает `/sign/:token` (страница уже работает на платформе) → подписывает или присылает правки → организация видит в «Документообороте» и в «Продажи → Договоры → На подписание» (одна и та же запись, два входа).

2. **Шаблон письма для договора** берётся из `email_templates` (категория `contract`) и переопределяет дефолтный текст в `send-signing-email`. Функцию правлю: если в payload `template_id` — рендерит HTML из шаблона с подстановкой `{{signing_url}}`, `{{document_title}}`, `{{recipient_name}}`, `{{sender_name}}`.

3. **Связь КП → Договор:** в открытом КП кнопка «Создать договор на основе КП» — подставляет компанию, услуги, сумму, открывает диалог создания договора. В `commercial_proposals` добавить `linked_signature_id uuid` для трекинга.

### Часть 6. Узкие места и что закрываю заранее

| Проблема | Решение |
|---|---|
| **Лимиты прогрева** при массовой отправке КП/договоров через org SMTP | КП и договор — **транзакционные**, не подпадают под прогрев. RPC `consume_email_quota` принимает доп. параметр `p_skip_warmup boolean default false`. Для КП/договоров вызываем с `true` — расходуем общий счётчик `total_sent`, но не блокируем. |
| **org SMTP не настроен**, а пользователь отправляет КП | Перед отправкой проверка: если `org_smtp_settings` нет или `is_verified=false` → диалог «Настройте SMTP» с кнопкой → редирект на «Продажи → SMTP». КП сохраняется как `draft`. |
| **Шаблон ссылается на несуществующую переменную** | Серверный валидатор в `send-campaign-email`: парсит `{{var}}`, если переменной нет в payload — заменяет на пустую строку, пишет warning в `email_send_log`. |
| **Договор с правками — клиент не понимает статус** | UI «На подписание» отображает таймлайн: `Отправлен → Получены правки (3 шт.) → Принято: 2, Отклонено: 1, Отправлена v2 → Подписан`. Берётся из `signature_revisions` + `signature_comments`. |
| **Двойная отправка одного и того же КП** | На `commercial_proposals` уникальное поле `last_sent_at`; кнопка «Отправить» в течение 60 сек после клика заменяется на «Отправлено ✓», retry разрешён только через 5 мин. |
| **Шаблоны писем — пользователь сломает HTML** | Live-preview через `<iframe srcdoc>` (изоляция). Перед сохранением sanitize через DOMPurify в браузере. |
| **Org SMTP rate-limit от провайдера** (Yandex 360 = 500/сутки) | В `org_smtp_settings` поле `provider_daily_limit int` (юзер сам выставляет). `consume_email_quota` дополнительно сверяется с этим лимитом (берётся `MIN(warmup_limit, provider_daily_limit)`). |
| **Бесконечная рассылка в БД** при лагах кампании | В `run-email-campaign` лимит «не больше 5000 писем за 1 запуск», иначе кампания паузится. |
| **Договор подписан, но KP остался в статусе sent** | Триггер `on document_signatures UPDATE WHEN status='signed'` → если `linked_proposal_id` не NULL → ставит `commercial_proposals.status='accepted'`. |
| **Контрагент не получил письмо** (попало в спам) | В `email_campaign_recipients` уже есть трек открытий. Для договоров — добавить в `document_signatures` колонку `email_opened_at` (заполняется через тот же `track-email-open` с типом `?type=signing&id=...`). UI показывает «📩 Открыто» на карточке договора. |
| **Производительность списка кампаний** при 10к получателей | Не грузим всех получателей в `CampaignsManager`, только агрегаты из `email_campaigns` (sent_count, failed_count, open_count). Детали — пагинация в `CampaignReport`. |
| **Удаление шаблона, который используется в 30 отправленных КП** | Soft delete: `email_templates.deleted_at`. Использованные снапшоты в `email_campaigns.html_body` живут отдельно. |
| **Доступ другого админа org к чужим SMTP-паролям** | RPC `get_decrypted_org_smtp` отдаёт пароль только для своей `current_organization_id()` — это уже сделано в прошлой миграции. |
| **CORS / трекинг открытия** для писем подписания | `track-email-open` уже без JWT, расширяем — принимает `purpose=signing`/`campaign` и пишет в нужную таблицу. |

### Часть 7. Архитектура БД (одна миграция)

```sql
-- 1. Шаблоны писем
CREATE TABLE email_templates (
  id uuid PK,
  scope text CHECK ('platform','org'),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'custom',
  subject text NOT NULL,
  html_body text NOT NULL,
  variables jsonb DEFAULT '[]',
  is_default boolean DEFAULT false,
  deleted_at timestamptz,
  created_by uuid, created_at, updated_at
);
CREATE INDEX ON email_templates(scope, organization_id, category);

-- 2. Услуги организации (для КП)
CREATE TABLE org_services (
  id uuid PK,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  name, description, price numeric, unit text DEFAULT 'шт',
  is_active boolean DEFAULT true,
  created_at, updated_at
);

-- 3. Шаблоны договоров организации
CREATE TABLE org_contract_templates (
  id uuid PK,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  body_html text NOT NULL,
  variables jsonb DEFAULT '[]',
  is_default boolean DEFAULT false,
  created_at, updated_at
);

-- 4. Расширяем КП на org
ALTER TABLE commercial_proposals
  ADD COLUMN scope text NOT NULL DEFAULT 'platform' CHECK (scope IN ('platform','org')),
  ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN linked_signature_id uuid REFERENCES document_signatures(id) ON DELETE SET NULL,
  ADD COLUMN last_sent_at timestamptz;

-- 5. Расширяем кампании
ALTER TABLE email_campaigns ADD COLUMN template_id uuid REFERENCES email_templates(id);

-- 6. Org SMTP лимит провайдера
ALTER TABLE org_smtp_settings ADD COLUMN provider_daily_limit int DEFAULT 500;

-- 7. Трекинг открытия для договоров
ALTER TABLE document_signatures
  ADD COLUMN email_opened_at timestamptz,
  ADD COLUMN email_open_token uuid DEFAULT gen_random_uuid(),
  ADD COLUMN linked_proposal_id uuid REFERENCES commercial_proposals(id) ON DELETE SET NULL;

-- 8. Прогрев — параметр пропуска
DROP FUNCTION consume_email_quota(text, int);
CREATE FUNCTION consume_email_quota(
  p_scope_key text, p_count int, p_skip_warmup boolean DEFAULT false
) RETURNS jsonb ...;

-- 9. Триггер автоклонирования системных шаблонов в org
CREATE TRIGGER seed_org_email_templates
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION clone_default_email_templates();

-- 10. Триггер: договор подписан → КП accepted
CREATE TRIGGER on_signature_signed_update_proposal
  AFTER UPDATE ON document_signatures
  FOR EACH ROW WHEN (NEW.status = 'signed' AND OLD.status <> 'signed')
  EXECUTE FUNCTION mark_proposal_accepted_on_signing();

-- 11. RLS на все новые таблицы по образцу email_campaigns:
-- admin = всё; org users — только свои.
```

### Часть 8. Edge Functions (новые/правки)

| Функция | Действие |
|---|---|
| `send-campaign-email` | + поддержка `template_id` (рендер из БД), + параметр `purpose: 'campaign'\|'proposal'\|'contract'`, + skip_warmup для proposal/contract |
| `send-signing-email` | + опциональный `template_id` для рендера письма из шаблона организации, + трекинг-пиксель `track-email-open?purpose=signing&id=...` |
| `track-email-open` | + ветка `purpose=signing` → пишет `document_signatures.email_opened_at` |
| `send-test-email` (новая) | Принимает `{ template_id, to_email }` → рендерит шаблон с тестовыми переменными → шлёт через org SMTP или platform SMTP |
| `org-create-contract-signature` (новая) | Обёртка над `create_external_contract_signature` + `add_signature_revision` + `send-signing-email` в одной транзакции, чтобы UI не делал 3 запроса |

### Часть 9. Frontend — новые/изменённые файлы

**Создать:**
- `src/components/shared/sales/EmailTemplatesManager.tsx` (общий для admin/org)
- `src/components/shared/sales/EmailTemplateEditor.tsx` (HTML editor + iframe preview + переменные)
- `src/components/organization/sales/OrgProposalsManager.tsx`
- `src/components/organization/sales/OrgContractsManager.tsx`
- `src/components/organization/sales/OrgServicesManager.tsx`
- `src/components/organization/sales/OrgContractTemplateEditor.tsx`
- `src/components/organization/sales/CreateContractDialog.tsx` (выбор контрагента + шаблона + переменных + preview + send)
- `src/hooks/useEmailTemplates.ts`
- `src/hooks/useOrgProposals.ts`
- `src/hooks/useOrgContracts.ts`
- `src/hooks/useOrgServices.ts`

**Править:**
- `src/hooks/useDashboardSettings.ts` — `showSales: false` по умолчанию
- `src/components/organization/OrgSidebar.tsx` — фильтр по `showSales`
- `src/components/organization/tabs/OrgProfileTab.tsx` — убрать «Компании»-свитч (showCompanies)
- `src/components/organization/sales/OrgSalesLayout.tsx` — добавить новые секции
- `src/components/admin/BroadcastManager.tsx` — добавить таб «Шаблоны писем»
- `src/components/admin/sales/CommercialProposals.tsx` — выбор шаблона при отправке
- `src/components/signing/SendForSigningDialog.tsx` — выбор шаблона письма (опционально)
- `src/lib/appVersion.ts` → `1.0.54`
- запись в `platform_updates`

### Часть 10. End-to-end проверка перед сдачей

1. Миграция применена, `supabase--linter` чистый. RLS на всех 6 новых/изменённых таблицах.
2. Системные шаблоны seedнуты (6 штук, scope='platform').
3. При создании новой организации триггер `seed_org_email_templates` склонировал шаблоны → проверяю SELECT.
4. **Меню скрыто:** новый orgowner не видит «Продажи». Через `?enableSales=1` или ручной UPDATE — видит.
5. **Шаблоны писем (org):** создал шаблон «Тест» → отправил тестовое письмо себе → пришло, переменные подставлены, открытие зафиксировано в `email_send_log`.
6. **КП (org):** создал КП → отправил клиенту через org SMTP с шаблоном «Отправка КП» → клиент открыл ссылку `/proposal/:id` → статус сменился на `viewed` → счётчик `consume_email_quota` увеличился на 1, прогрев НЕ блокировал (skip_warmup=true).
7. **Договор (org):** создал шаблон договора → создал договор по КП → отправил → клиент открыл `/sign/:token` → прислал правки → организация увидела в «Документообороте» И в «Продажи → Договоры» → ответила «принять/отклонить» → отправила v2 → клиент подписал → `document_signatures.status='signed'` → триггер сработал → `commercial_proposals.status='accepted'` автоматом.
8. **Прогрев:** запустил рассылку из 11 писем в день 1 → блок с сообщением «доступно 10».
9. **SMTP не настроен:** попытка отправить КП → диалог редиректа в SMTP-настройки.
10. **Удалён шаблон, использованный в КП:** соft delete, отправленные КП в истории не сломались.
11. Отчёт в чат: ✅ миграция, ✅ RLS, ✅ seed, ✅ меню, ✅ шаблоны, ✅ КП e2e, ✅ договор e2e с правками, ✅ прогрев, ✅ SMTP-валидация — c конкретными ID и цифрами.

### Что НЕ делаю в v1

- Без визуального drag-n-drop редактора писем (HTML + preview достаточно).
- Без планировщика отправки по расписанию (cron) — только «отправить сейчас».
- Без многоязычных шаблонов — пока только русский.
- Без bounce-webhook от SMTP-провайдеров — статусы `sent/failed/opened` достаточно.
- Без редактора **визуального** конструктора договоров (как у DocuSign) — только HTML с переменными.

