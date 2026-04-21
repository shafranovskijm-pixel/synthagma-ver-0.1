

## План: «База компаний» в карточке Продажи + парсер list-org.com

### Что вы получите

В админке `/admin → Продажи` появится новый раздел в сайдбаре **«База компаний»**. Внутри:

1. Поле «URL поиска list-org.com» (по умолчанию подставлен ваш URL с фильтром по ОКВЭД 85.3 / 85.41.9 / 85.42.9 + телефон + email).
2. Кнопка **«Спарсить страницу»** + поле «Сколько страниц подряд» (1–20).
3. Таблица с компаниями: Название, ИНН, ОГРН, Город, Телефон, Email, **Лицензия (№ + дата + орган)**, ОКВЭД, Директор, Сайт, Дата добавления.
4. Фильтры: по наличию лицензии, по городу, по наличию email/телефона.
5. Экспорт в Excel/CSV.
6. Кнопка «Создать лид» рядом с компанией → добавляет её в существующий раздел `LeadsManager` одним кликом.

### Как обходим антибот list-org.com

list-org.com защищён Cloudflare + JS-челленджем + rate-limit по IP. Простой `fetch` из edge-функции получит 403/503. Решение — комбинированный подход:

**Основной путь — Firecrawl** (уже есть в списке коннекторов Lovable, проходит Cloudflare штатно):
- `POST https://api.firecrawl.dev/v2/scrape` с `formats: ['html', 'markdown']`, `waitFor: 3000`, `onlyMainContent: false`.
- Firecrawl сам рендерит JS, держит пул IP, ротирует UA → защита проходится без капчи в 95% случаев.

**Резервный путь — DaData** (уже подключён, секрет `DADATA_API_KEY` есть, есть edge-функция `dadata-company`):
- Из list-org вытаскиваем только список ИНН + название.
- По каждому ИНН вызываем существующий `dadata-company` → получаем **лицензии (включая образовательные Л035), учредителей, директора, адрес, статус** — это точнее, чем то, что отдаёт сам list-org.
- Email/телефон берём с list-org (DaData их не даёт), всё остальное — с DaData.

Так получаем полные данные с лицензиями, обходя капчу за счёт того, что тяжёлую работу (поиск + ИНН) делает Firecrawl, а обогащение — официальный API DaData.

### Архитектура

**Новая таблица `sales_companies_db`** (отдельно от `companies`, чтобы не смешивать клиентов с лидогенерационной базой):

```
id uuid pk
inn text unique
ogrn text
name text
short_name text
address text
city text
phone text
email text
website text
director text
director_position text
okved_main text
okved_list text[]
license_number text
license_issue_date date
license_authority text
license_activities text[]
license_valid_to date
status text                  -- ACTIVE / LIQUIDATING / LIQUIDATED
employee_count int
source_url text              -- ссылка на list-org карточку
raw_data jsonb               -- полный ответ DaData для будущих полей
parsed_at timestamptz default now()
converted_to_lead_id uuid references leads(id)
created_at, updated_at
```

RLS: только `admin` (по `has_role(auth.uid(), 'admin')`) — это внутренний инструмент продаж. 4 политики (SELECT/INSERT/UPDATE/DELETE), без рекурсии.

**Две edge-функции:**

1. `parse-list-org` (новая):
   - Принимает `{ searchUrl, pages }`.
   - Для каждой страницы (`&p=1..N`) дёргает Firecrawl `/v2/scrape` с `formats: ['html']`.
   - Парсит HTML регуляркой/DOMParser (deno-dom): из `.org` блоков достаёт `name`, ссылку на карточку, ИНН, ОГРН, город, телефон, email.
   - По каждой найденной карточке (если ИНН есть) вызывает `dadata-company` через `supabase.functions.invoke()` → дополняет лицензиями, директором, ОКВЭД.
   - Делает `upsert` в `sales_companies_db` по `inn` (если ИНН пустой — skip с пометкой в response).
   - Возвращает `{ found, inserted, updated, skipped, errors[] }`.
   - Пауза 1–2 сек между страницами + 0.3 сек между DaData-вызовами (rate-limit DaData = 30 req/min).

2. `convert-company-to-lead` (новая, мини):
   - `{ companyDbId }` → `INSERT` в `leads` с `company_name`, `inn`, `phone`, `email`, `notes` (с лицензией) → `UPDATE sales_companies_db.converted_to_lead_id`.

**Frontend компонент `src/components/admin/sales/CompaniesDatabase.tsx`:**
- React Query для списка + парсинга.
- Прогресс-бар при многостраничном парсинге (стрим через realtime-канал по `parser_jobs` — опционально, в v1 — просто toast «Готово: спарсено X компаний»).
- Таблица на shadcn `Table` + фильтры shadcn `Select`/`Input`.
- Экспорт через `xlsx` (уже в проекте, используется во ФРДО).

### Подключение в UI

Добавляю пункт в `SalesSidebar` → `companies-db` («База компаний», иконка `Database`). В `SalesManager.TABS` маппинг `'companies-db': <CompaniesDatabase />`.

### Файлы

**Создать:**
- миграция `sales_companies_db` + RLS + 4 политики
- `supabase/functions/parse-list-org/index.ts`
- `supabase/functions/convert-company-to-lead/index.ts`
- `src/components/admin/sales/CompaniesDatabase.tsx`
- `src/hooks/useSalesCompaniesDb.ts`

**Править:**
- `src/components/admin/sales/SalesSidebar.tsx` — добавить пункт меню
- `src/components/admin/SalesManager.tsx` — добавить `'companies-db'` в TABS
- `src/lib/appVersion.ts` → `1.0.52`
- запись в `platform_updates`

### Что нужно от вас (один шаг)

Подключить **Firecrawl** через коннектор Lovable (одна кнопка, без копирования ключей в код). DaData у вас уже работает.

Если Firecrawl подключать не хотите — есть план Б: использовать только DaData с поиском по ОКВЭД через `/suggest/party` (`{ query: "85.41.9", count: 300, type: "LEGAL", status: ["ACTIVE"] }`). Минус — без email/телефона, без фильтрации по «есть сайт» и максимум 300 за запрос. С list-org получится богаче.

### Критерии готовности

1. В `/admin → Продажи → База компаний` нажимаю «Спарсить страницу» (1 страница) → за 30–60 сек таблица заполняется ≥10 компаниями с вашей ссылки.
2. Минимум у 30% спарсенных компаний есть лицензия (это образовательные ОКВЭД, у них почти у всех Л035).
3. У всех есть ИНН, ОГРН, директор, ОКВЭД (из DaData).
4. Кнопка «Создать лид» создаёт запись в `LeadsManager` за 1 клик.
5. Экспорт в Excel скачивается, открывается в Excel/Numbers без поломанных кириллических символов.

### Что НЕ делаю

- Не пишу свой обход капчи — это хрупко и нарушает ToS list-org. Использую Firecrawl, который это делает легально через прокси.
- Не парсю баланс/выручку (на list-org их часто нет, на DaData нужен платный тариф).
- Не делаю автоматическую регулярную сверку — только ручной запуск кнопкой (cron можно добавить позже).

