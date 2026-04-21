

## План: Сервис Email-рассылок для админа и организаций (со своим SMTP, прогревом и шифрованием)

### Что вы получите

**Для администратора** (`/admin → Рассылка → Кампании`):
- Кампании с шаблонами писем (тема + HTML), массовая отправка по сегментам
- 3 источника получателей: организации, спарсенные компании из «Базы компаний», ручной импорт CSV/вставка email
- Прогрев SMTP с жёсткими лимитами (см. ниже)
- Статистика: отправлено / ошибок / открытий (через пиксель), история по каждой кампании

**Для организации** (`/organization → новая вкладка «Продажи»`):
- Раздел «Продажи» с под-разделами: «Рассылки» (на старте), задел под «Лиды», «КП», «Договоры» (пока заглушки — раздел растёт под будущее).
- Свои SMTP-настройки + кнопка «Тест соединения»
- Кампании по своим студентам, компаниям-клиентам, ручному списку email
- Те же шаблоны, прогрев, статистика

### Источники получателей
- **Организация:** студенты (`profiles`), компании-клиенты (`companies` с email), ручной импорт CSV/вставка email
- **Админ:** организации (`organizations`), компании из «Базы компаний» (`sales_companies_db.email`), ручной импорт

Везде явный чекбокс «У меня есть согласие получателей на рассылки» — без галки кнопка «Отправить» неактивна.

### SMTP-настройки

**Для организации** — новая вкладка «SMTP» внутри «Продажи → Рассылки»:
- Поля: host, port (587/465/2525), user, **password** (шифруется через `pgp_sym_encrypt`, как студенческие пароли), from_email, from_name, encryption (TLS/SSL/STARTTLS)
- Кнопка «Тест соединения» → edge `test-org-smtp` отправляет тестовое письмо самой организации
- Если SMTP не настроен — рассылки недоступны, показывается onboarding-инструкция (как получить SMTP у Timeweb/Beget/Yandex 360/Mail.ru для бизнеса)

**Для админа** — рассылка идёт через существующие глобальные SMTP-секреты (`SMTP_HOST/USER/PASS` платформы). Никаких дополнительных настроек.

### Прогрев (жёсткие авто-лимиты)

Таблица `email_warmup_state` хранит на каждую SMTP-конфигурацию (org_id или 'platform'):
- `started_at` — день первой отправки
- `sent_today`, `sent_today_date` — счётчик за сегодня (сброс на новый день в МСК)
- `total_sent` — всего за всё время

График лимитов (день с момента `started_at`):

```text
День 1:  10 писем/день
День 2:  20
День 3:  40
День 4:  70
День 5:  100
День 6:  150
День 7:  200
День 8:  300
День 9:  400
День 10: 500
День 11: 700
День 12: 1000
День 13: 1500
День 14+: 2000/день (потолок)
```

Серверная RPC `consume_email_quota(org_id, count)`:
- Проверяет лимит на текущий день
- Если `sent_today + count > daily_limit` → возвращает `false` + остаток
- Иначе атомарно увеличивает `sent_today` и возвращает `true`

Frontend перед запуском кампании показывает: «Сегодня доступно: X из Y. Это N-й день прогрева». Если запросили больше — кнопка блокируется с подсказкой «разделите на N дней» (NB: ученик #3 в опросе — Жёсткие лимиты).

Также техническая пауза 1.5 сек между письмами в одной кампании (защита от ban'а SMTP-сервера).

### Архитектура БД (одна миграция)

```sql
-- 1) SMTP организаций (пароль шифруется триггером)
CREATE TABLE org_smtp_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  host text NOT NULL,
  port int NOT NULL DEFAULT 587,
  username text NOT NULL,
  password_encrypted text NOT NULL,  -- pgp_sym_encrypt
  from_email text NOT NULL,
  from_name text,
  encryption text NOT NULL DEFAULT 'tls',  -- tls|ssl|starttls
  is_verified boolean DEFAULT false,
  last_test_at timestamptz,
  last_test_error text,
  created_at, updated_at
);
-- триггер trigger_encrypt_smtp_password (по образцу trigger_encrypt_org_cred_password)
-- RPC get_decrypted_org_smtp(org_id) — только админ или своя организация

-- 2) Кампании
CREATE TABLE email_campaigns (
  id uuid PK,
  scope text NOT NULL CHECK (scope IN ('platform','org')),  -- админ или организация
  organization_id uuid,  -- NULL для platform
  name text NOT NULL,
  subject text NOT NULL,
  html_body text NOT NULL,
  from_name text,
  reply_to text,
  recipient_source text NOT NULL,  -- 'students'|'companies'|'organizations'|'companies_db'|'manual'
  recipient_filter jsonb,           -- {city, hasLicense, ids[]}
  manual_emails text[],             -- для source='manual'
  status text NOT NULL DEFAULT 'draft',  -- draft|sending|completed|failed|paused
  scheduled_at timestamptz,
  started_at, completed_at,
  total_recipients int DEFAULT 0,
  sent_count int DEFAULT 0,
  failed_count int DEFAULT 0,
  open_count int DEFAULT 0,
  created_by uuid, created_at, updated_at
);

-- 3) Получатели/события (по одной строке на email)
CREATE TABLE email_campaign_recipients (
  id uuid PK,
  campaign_id uuid REFERENCES email_campaigns(id) ON DELETE CASCADE,
  email text NOT NULL,
  recipient_name text,
  status text NOT NULL DEFAULT 'pending',  -- pending|sent|failed|bounced|opened
  error text,
  sent_at, opened_at,
  open_token uuid DEFAULT gen_random_uuid()  -- для трекинг-пикселя
);
CREATE INDEX ON email_campaign_recipients(campaign_id, status);

-- 4) Прогрев
CREATE TABLE email_warmup_state (
  scope_key text PRIMARY KEY,  -- 'platform' или org_id::text
  started_at date NOT NULL DEFAULT CURRENT_DATE,
  sent_today int NOT NULL DEFAULT 0,
  sent_today_date date NOT NULL DEFAULT CURRENT_DATE,
  total_sent int NOT NULL DEFAULT 0,
  updated_at timestamptz
);

-- RPC consume_email_quota(scope_key text, count int) RETURNS jsonb
-- RPC get_warmup_status(scope_key text) RETURNS jsonb { day, daily_limit, sent_today, remaining }
```

**RLS:** 
- `org_smtp_settings`: SELECT/UPDATE только своя организация + admin (через `has_role` и `current_organization_id`)
- `email_campaigns`/`email_campaign_recipients`: scope='platform' → admin only; scope='org' → своя организация + admin
- `email_warmup_state`: SELECT/UPDATE через SECURITY DEFINER RPC, прямого доступа нет

### Edge Functions

1. **`send-campaign-email`** (новая) — универсальный отправитель:
   - Принимает `{ campaignId, recipientId }`
   - Загружает кампанию + получателя + SMTP-настройки (org_smtp при scope='org', иначе ENV `SMTP_*`)
   - Расшифровывает пароль через `decrypt_password`
   - Подставляет в HTML трекинг-пиксель `<img src=".../track-open?t={open_token}" width="1" height="1">`
   - Шлёт через тот же deno-TLS-сокет, что в `send-email/index.ts` (UTF-8 base64 для темы/тела, encodeFromHeader)
   - Обновляет статус получателя в `email_campaign_recipients`

2. **`run-email-campaign`** (новая) — воркер кампании:
   - `{ campaignId }` → проверяет квоту через `consume_email_quota`, ставит status='sending'
   - Цикл по получателям (pending), 1.5 сек между письмами, инвокает `send-campaign-email`
   - Если квота кончилась → status='paused', записывает «продолжить завтра»
   - По завершении → status='completed', обновляет агрегаты
   - Хранит ID в `running_campaigns` (in-memory) для retry

3. **`test-org-smtp`** (новая) — `{ organizationId }` шлёт тестовое письмо самой организации через её SMTP, обновляет `is_verified` + `last_test_error`.

4. **`track-email-open`** (новая, без JWT) — `GET /track-email-open?t={token}` → ставит `opened_at`, увеличивает `open_count`, отдаёт 1×1 GIF.

### Frontend

**Новые файлы:**
- `src/components/admin/broadcast/CampaignsManager.tsx` — список кампаний + создание (для админа)
- `src/components/admin/broadcast/CampaignEditor.tsx` — редактор: название, тема, HTML (textarea + preview), выбор источника, фильтры
- `src/components/admin/broadcast/RecipientPicker.tsx` — переиспользуется в org/admin: выбор source + manual import (CSV/textarea)
- `src/components/admin/broadcast/WarmupBadge.tsx` — карточка с днём прогрева, лимитом, остатком на сегодня
- `src/components/admin/broadcast/CampaignReport.tsx` — таблица получателей со статусами + графики
- `src/components/organization/sales/OrgSalesLayout.tsx` — каркас раздела «Продажи» (под-сайдбар: Рассылки | Лиды (soon) | КП (soon))
- `src/components/organization/sales/OrgEmailCampaigns.tsx` — кампании организации (использует те же ниже-уровневые компоненты)
- `src/components/organization/sales/OrgSmtpSettings.tsx` — форма SMTP + кнопка «Тест»
- `src/hooks/useEmailCampaigns.ts`, `useEmailWarmup.ts`, `useOrgSmtp.ts`

**Изменения:**
- `src/components/admin/BroadcastManager.tsx` → добавить вкладки внутри: «Уведомления» (как сейчас), **новое** «Email-кампании» (`<CampaignsManager />`)
- `src/components/organization/OrgSidebar.tsx` → новый пункт `sales` (иконка `Briefcase`), TabType += `"sales"`
- `src/components/organization/tabs/TabContentRenderer.tsx` → case `"sales"` → `<OrgSalesLayout />`
- `src/lib/appVersion.ts` → `1.0.53`
- запись в `platform_updates`

### Меню «Продажи» в организации (под-сайдбар)
```text
[Рассылки]   ← v1, реализуется сейчас
 Лиды        ← soon (заглушка)
 КП          ← soon
 Договоры    ← soon
 SMTP        ← внутри «Рассылки» как саб-вкладка
```
URL: `/organization?tab=sales&section=campaigns|smtp`.

### End-to-end проверка перед сдачей

1. Миграция применена: `org_smtp_settings`, `email_campaigns`, `email_campaign_recipients`, `email_warmup_state`, RPC `consume_email_quota`, `get_warmup_status`, `get_decrypted_org_smtp`, триггер шифрования. `supabase--linter` без ошибок.
2. RLS-проверка через `supabase--read_query`: SELECT из всех 4 таблиц не падает с recursion, политики применены (по 4 на таблицу, без дубликатов).
3. `supabase--curl_edge_functions` → `test-org-smtp` для тестовой организации (если есть тестовые SMTP) → 200 + `is_verified=true` или понятная ошибка.
4. `consume_email_quota('platform', 5)` → возвращает `{allowed:true, remaining: 5}` на день 1.
5. Создание кампании из UI админа → 1 получатель (мой email) → письмо приходит, статус в `email_campaign_recipients` = `sent`, открытие пикселем фиксируется как `opened`.
6. Для организации: попытка отправить без SMTP → блокируется с подсказкой; после ввода SMTP + теста → отправка работает.
7. Превышение лимита: попытка отправить 11 писем в день 1 → блокировка с сообщением «Доступно 10, разделите на 2 дня».
8. В чате отчитываюсь: «работает: миграция OK, RLS OK, SMTP-тест OK, отправка OK, прогрев OK, открытия трекаются» — с конкретными цифрами.

### Что НЕ делаю в v1

- Без визуального drag-and-drop редактора писем — только HTML textarea + live preview (можно усилить позже).
- Без отложенного запуска по cron (только «Запустить сейчас»; продолжение «завтра» при исчерпании квоты — да, через ручной клик).
- Без сегментации по поведению (последний логин, открыл ли прошлое письмо) — только базовые фильтры.
- Без bounce-обработки через webhook (это требует поддержки от SMTP-провайдера; добавим, когда придёт явный запрос).

### Файлы

**Создать:** 1 миграция, 4 edge-функции, 9 frontend-файлов (см. выше).
**Править:** `BroadcastManager.tsx`, `OrgSidebar.tsx`, `TabContentRenderer.tsx`, `appVersion.ts`, запись в `platform_updates`.

