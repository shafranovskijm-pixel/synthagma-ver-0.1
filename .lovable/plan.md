

## План: Замена парсера list-org на интеграцию с Checko API + автообновление 100/день

### Что получится

В админке **«Продажи → База компаний»** вместо парсера list-org появится модуль обогащения по Checko API:

1. **Кнопка «Загрузить ИНН списком»** — вставка/загрузка CSV с ИНН (до 100 за раз). Каждый ИНН → 1 запрос к `/v2/company` → полная карточка компании сохраняется.
2. **Кнопка «Обновить устаревшие»** — берёт компании из БД, отсортированные по `parsed_at ASC`, и обогащает столько, сколько осталось из дневной квоты (100 − уже использовано).
3. **Переключатель «Автообновление раз в сутки»** (toggle на уровне платформы) — при включении ежедневно в 03:00 МСК запускает фоновое обновление до 100 самых старых записей.
4. **Индикатор квоты** в шапке: «Использовано сегодня: 12 / 100. Сброс в 00:00 МСК». Берётся из `meta.today_request_count` (Checko возвращает в каждом ответе) + локального счётчика.

Кнопка «Спарсить страницу list-org» удаляется. Edge-функция `parse-list-org` остаётся в кодовой базе, но больше не вызывается из UI (можно удалить позже).

### Источник API ключа

Ключ Checko (`gSxUDYBlrLQp1c3O`) сохраняю как **runtime-секрет** `CHECKO_API_KEY` через `add_secret`. Используется только из edge-функций — в UI не светится. Если понадобится сменить — пользователь меняет в Lovable Cloud.

### Что сохраняем из ответа Checko (поля endpoint `/v2/company`)

В существующую таблицу `sales_companies_db` (новые колонки добавлю миграцией):

| Поле БД | Источник Checko |
|---|---|
| `inn`, `ogrn`, `name` (НаимПолн), `short_name` (НаимСокр), `full_name` | как было |
| `kpp` *(новая)* | `КПП` |
| `okpo` *(новая)* | `ОКПО` |
| `registration_date` *(новая, date)* | `ДатаРег` |
| `address`, `city`, `region` | `ЮрАдрес.АдресРФ` / `ЮрАдрес.НасПункт` / `Регион.Наим` |
| `phone` | `Контакты.Тел[0]` |
| `phones` *(новая, text[])* | `Контакты.Тел` (полный массив) |
| `email` | `Контакты.Емэйл[0]` |
| `emails` *(новая, text[])* | `Контакты.Емэйл` |
| `website` | `Контакты.ВебСайт` |
| `social_links` *(новая, jsonb)* | `{vk, max, telegram}` |
| `director` | `Руковод[0].ФИО` |
| `director_inn` *(новая)* | `Руковод[0].ИНН` |
| `director_position` | `Руковод[0].НаимДолжн` |
| `okved_main` | `ОКВЭД.Код + " " + ОКВЭД.Наим` |
| `okved_list` | `ОКВЭДДоп[]` (массив кодов с наименованиями) |
| `licenses` *(новая, jsonb[])* | весь массив `Лиценз[]` (Номер, Дата, ДатаНач, ДатаОконч, ЛицОрг, ВидДеят[]) |
| `license_number`, `license_issue_date`, `license_authority`, `license_activities`, `license_valid_to` | первая образовательная лицензия (если найдена по ВидДеят содержит «образоват») — иначе первая лицензия |
| `has_education_license` | true если в `Лиценз[*].ВидДеят` встречается «образоват» |
| `status` | `Статус.Наим` |
| `employee_count` | `СЧР` (среднеспис. численность работников) |
| `charter_capital` *(новая, numeric)* | `УстКап.Сумма` |
| `unfair_supplier` *(новая, bool)* | `НедобПост` |
| `mass_director` *(новая, bool)* | `МассРуковод` |
| `mass_address` *(новая, bool)* | `ЮрАдрес.МассАдрес.length > 0` |
| `sanctions` *(новая, bool)* | `Санкции` |
| `successors` *(новая, jsonb)* | `Правопреем[]` |
| `predecessors` *(новая, jsonb)* | `Правопредш[]` |
| `branches_count` *(новая, int)* | `Подразд.Филиал.length` |
| `last_data_date` *(новая, date)* | `ДатаВып` (дата выгрузки данных Checko) |
| `raw_data` | весь `data` объект (jsonb, для audit и будущего) |
| `source_url` | `https://checko.ru/company/ul/{ОГРН}` (стандартный URL карточки) |
| `data_source` *(новая)* | `'checko'` |
| `parsed_at` | `now()` при каждом обновлении |

Уникальный ключ — `inn`. При повторной загрузке — `INSERT ... ON CONFLICT (inn) DO UPDATE`.

### Учёт квоты 100/день

Новая таблица `checko_api_usage`:
```
id uuid PK,
date date UNIQUE,
requests_count int default 0,
last_balance numeric,        -- из meta.balance
last_used_at timestamptz
```

Edge-функция перед каждым запросом проверяет `requests_count < 100` для текущей даты (МСК). После запроса берёт `meta.today_request_count` из ответа — это **наиболее точное значение от самого Checko**, синхронизируем с ним. Если Checko вернул `today_request_count >= 100` или статус "error" с лимитом — функция останавливает batch и возвращает фронту «остановлено: квота исчерпана, обработано N из M».

UI показывает:
- «Сегодня использовано: **N / 100**» (тянется из `checko_api_usage.requests_count` для текущей даты).
- Прогресс-бар.
- Если 100 — кнопка обогащения дизаблится с подсказкой «Сброс квоты в 00:00 МСК. Включите автообновление, чтобы каждое утро забирать новые 100».

### Автообновление раз в сутки

Таблица `checko_settings` (1 строка, id=1):
```
auto_enrich_enabled bool default false,
last_auto_run_at timestamptz,
last_auto_processed int,
last_auto_error text
```

Cron-job (через `pg_cron` + `pg_net`, расширения уже включены):
```sql
select cron.schedule(
  'checko-daily-enrich',
  '0 0 * * *',  -- 00:00 UTC = 03:00 МСК
  $$
  select net.http_post(
    url := 'https://atxwvjxbqjgkbjlhsdch.supabase.co/functions/v1/checko-daily-enrich',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer ANON_KEY"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 600000
  );
  $$
);
```

Edge `checko-daily-enrich`:
1. Читает `checko_settings.auto_enrich_enabled` — если false, выходит.
2. Берёт 100 самых старых записей из `sales_companies_db` (ORDER BY parsed_at ASC).
3. Если их меньше 100 — добивает новыми ИНН из «очереди» (см. ниже).
4. Делает запросы пачкой по 5 параллельно с `await Promise.all`, между пачками `sleep(500ms)` (чтобы не перегружать Checko).
5. После завершения пишет `last_auto_run_at`, `last_auto_processed`, `last_auto_error`.
6. Лог последнего запуска показывается в UI («Последнее автообновление: 21.04.2026 03:00, обновлено 100 компаний»).

**Очередь новых ИНН** (`checko_pending_inns`):
```
inn text PK,
added_at timestamptz default now(),
note text
```
Если пользователь добавил 500 ИНН одной кнопкой, первые ~ (100 − использовано) обрабатываются сразу, остальные кладутся в очередь и подхватываются ежесуточно.

### Edge-функции (новые)

| Функция | Назначение |
|---|---|
| `checko-enrich-batch` | Принимает `{ inns: string[], mode: 'add'|'refresh' }`. Делает запросы с учётом квоты, возвращает `{ processed, skipped_quota, errors[], remaining_quota, queued_inns[] }`. |
| `checko-daily-enrich` | Cron-обёртка — без авторизации (verify_jwt=false), запускается из pg_cron. Использует service role внутри. |
| `checko-stats` | GET → `{ today_used, today_remaining, balance, last_auto_run, queue_size, total_companies }` для UI. |

Edge `parse-list-org` остаётся в кодовой базе как deprecated (на случай rollback), но из UI убирается.

### Frontend — изменения

**`src/components/admin/sales/CompaniesDatabase.tsx`** — переписываю верхнюю карточку:
- Убираю input URL и Pages.
- Добавляю две кнопки: **«Добавить ИНН»** (открывает диалог с textarea для вставки списка ИНН + загрузкой CSV) и **«Обновить устаревшие (N)»**.
- Добавляю индикатор квоты + переключатель «Автообновление ежедневно».
- Таблица результатов остаётся, но добавляются новые колонки: КПП, Числ. сотр., Лицензий (count), Метки риска (Санкции / РНП / Масс. адрес — если true).

**Новые компоненты:**
- `AddInnsDialog.tsx` — textarea (по 1 ИНН в строке) + загрузка CSV (xlsx/csv parser уже есть). Парсит, валидирует контрольное число ИНН, показывает предпросмотр.
- `ChekoQuotaBar.tsx` — прогресс-бар + переключатель автообновления + кнопка «Запустить вручную».

**Новый хук** `useCheckoApi.ts`:
- `stats` (useQuery, refetchInterval 30s)
- `enrichBatch` (useMutation)
- `setAutoEnrich` (useMutation)
- `runManualNow` (useMutation)

### Миграция (схема + cron + начальная строка settings)

```sql
-- 1. Расширяем sales_companies_db
ALTER TABLE sales_companies_db
  ADD COLUMN IF NOT EXISTS kpp text,
  ADD COLUMN IF NOT EXISTS okpo text,
  ADD COLUMN IF NOT EXISTS registration_date date,
  ADD COLUMN IF NOT EXISTS phones text[],
  ADD COLUMN IF NOT EXISTS emails text[],
  ADD COLUMN IF NOT EXISTS social_links jsonb,
  ADD COLUMN IF NOT EXISTS director_inn text,
  ADD COLUMN IF NOT EXISTS licenses jsonb,
  ADD COLUMN IF NOT EXISTS charter_capital numeric,
  ADD COLUMN IF NOT EXISTS unfair_supplier boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mass_director boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mass_address boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sanctions boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS successors jsonb,
  ADD COLUMN IF NOT EXISTS predecessors jsonb,
  ADD COLUMN IF NOT EXISTS branches_count int,
  ADD COLUMN IF NOT EXISTS last_data_date date,
  ADD COLUMN IF NOT EXISTS data_source text DEFAULT 'list-org';

CREATE UNIQUE INDEX IF NOT EXISTS sales_companies_db_inn_key ON sales_companies_db (inn);

-- 2. Учёт квоты
CREATE TABLE checko_api_usage (
  date date PRIMARY KEY,
  requests_count int NOT NULL DEFAULT 0,
  last_balance numeric,
  last_used_at timestamptz
);
ALTER TABLE checko_api_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read checko usage" ON checko_api_usage FOR SELECT TO authenticated USING (has_role('admin', auth.uid()));

-- 3. Настройки
CREATE TABLE checko_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  auto_enrich_enabled boolean DEFAULT false,
  last_auto_run_at timestamptz,
  last_auto_processed int,
  last_auto_error text,
  updated_at timestamptz DEFAULT now()
);
INSERT INTO checko_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE checko_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage checko settings" ON checko_settings FOR ALL TO authenticated USING (has_role('admin', auth.uid())) WITH CHECK (has_role('admin', auth.uid()));

-- 4. Очередь
CREATE TABLE checko_pending_inns (
  inn text PRIMARY KEY,
  added_at timestamptz DEFAULT now(),
  note text
);
ALTER TABLE checko_pending_inns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage checko queue" ON checko_pending_inns FOR ALL TO authenticated USING (has_role('admin', auth.uid())) WITH CHECK (has_role('admin', auth.uid()));
```

Cron создаётся **отдельным insert-вызовом** (как требует инструкция — содержит anon key):
```sql
SELECT cron.schedule('checko-daily-enrich', '0 0 * * *', $$
  SELECT net.http_post(
    url := 'https://atxwvjxbqjgkbjlhsdch.supabase.co/functions/v1/checko-daily-enrich',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 600000
  );
$$);
```

### End-to-end проверка перед сдачей

1. Миграция применена, RLS на 3 новых таблицах, индекс на `inn` создан.
2. Секрет `CHECKO_API_KEY` создан и доступен в edge-функциях.
3. Cron-job `checko-daily-enrich` создан (`SELECT * FROM cron.job WHERE jobname='checko-daily-enrich'`).
4. UI: В админке «Продажи → База компаний» вижу новый интерфейс, кнопка list-org удалена.
5. **Тестовый запуск:** добавляю 3 ИНН (Сбербанк `7707083893`, Яндекс `7736207543`, наша Синтагма) → нажимаю «Обогатить» → получаю 3 заполненные карточки с лицензиями, контактами, директором. Квота `3/100`. Каждое поле в БД заполнено корректно.
6. **Очередь:** добавляю 200 ИНН — первые ~97 обрабатываются, остальные 103 уходят в `checko_pending_inns` со статусом «в очереди».
7. **Лимит:** искусственно ставлю `requests_count=99`, нажимаю «Обновить устаревшие» — обрабатывается 1 запись, кнопка дизаблится, текст «Квота исчерпана».
8. **Автообновление:** включаю переключатель → проверяю в `checko_settings.auto_enrich_enabled=true`. Вручную дёргаю edge `checko-daily-enrich` через `curl_edge_functions` → процессит до 100 записей из очереди и старых, `last_auto_run_at` обновляется.
9. **Конвертация в лид:** из новой карточки нажимаю «В лиды» — лид создаётся с полным набором полей (телефон, email, директор), статус карточки `converted_to_lead_id` обновляется.
10. **Экспорт XLSX:** кнопка работает, выгружает все новые поля.
11. Отчёт в чат: ✅ миграция, ✅ секрет, ✅ cron, ✅ UI, ✅ обогащение 3 компаний с реальными данными, ✅ очередь, ✅ лимит, ✅ автообновление — с конкретными числами и ID.

### Что НЕ делаю в v1

- Не использую `/v2/search` Checko (на бесплатном тарифе недоступен — endpoint требует платного плана).
- Не подключаю `/v2/finances` и `/v2/proceedings` — пока только базовая карточка (можно добавить позже отдельной кнопкой «Обогатить финансами», но это лишний запрос на компанию).
- Не удаляю физически edge `parse-list-org` (deprecated, оставляю на случай rollback на 1 релиз).
- Не делаю автоматический парсинг по ОКВЭД (нет search) — пользователь сам приносит список ИНН.

### Файлы

**Создать:** 1 миграция, 1 cron-insert (отдельно), 3 edge-функции, 4 frontend-файла.  
**Править:** `CompaniesDatabase.tsx`, `useSalesCompaniesDb.ts` (дополню типом), `appVersion.ts → 1.0.57`, запись в `platform_updates`.

