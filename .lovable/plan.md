## Проблема

В БД лежат **451 лид** в `sales_leads` (источник — загруженный Excel), но в кабинете `/sales` карточка «Необработанные загруженные базы» и таблица «В работе» показывают `0`.

Причина — RLS на `sales_leads`:
- `admin` видит всё (ОК).
- `sales_manager` видит **только** лиды, где `assigned_manager_id` указывает на его запись в `sales_managers`.
- У всех 451 лида сейчас `assigned_manager_id IS NULL`, `organization_id IS NULL`, `status='new'` — это «общий пул», который не виден ни тестовому продажнику, ни менеджеру‑продажнику, открывшему `/sales`.

## Что сделаем

### 1. RLS: открыть «общий пул» менеджерам по продажам
Добавить SELECT‑политику на `sales_leads`:
```
sales_manager видит лид, если
  (assigned_manager_id IS NULL AND organization_id IS NULL AND status = 'new')
  ИЛИ assigned_manager_id = его sales_managers.id
```
И UPDATE‑политику, позволяющую самостоятельно «забрать» лид из пула:
```
sales_manager может UPDATE строки из пула, только проставляя
  assigned_manager_id = свой sales_managers.id, status='in_progress'
```
Админ и `organization_id`‑политики остаются как есть.

### 2. UI «Необработанные базы» → активная карточка
- Бейдж «451 новых» становится кликабельным.
- В блоке «В работе» добавляется быстрый фильтр **«Только пул (без менеджера)»** — по умолчанию включён, если у пользователя `sales_manager`.
- На строке лида/в массовом действии — кнопка **«Взять в работу»** (RPC `claim_sales_leads(lead_ids uuid[])`, security definer, ставит `assigned_manager_id` текущего менеджера и `status='in_progress'`, пишет запись в `sales_lead_activities`).
- Для админа — существующая кнопка «Назначить менеджера» остаётся без изменений.

### 3. Карточка «Необработанные загруженные базы»
- Источник остаётся `sales_leads.source` (у этих 451 — `'Загруженная база'` или то, что было при импорте). После открытия RLS она наполнится автоматически.
- Покажем мини‑строку «Импортировано: дата последнего лида в источнике».

## Что НЕ меняем
- Структуру таблиц `sales_leads` / `sales_managers`.
- Импорт Excel (`LeadsImportDialog`) — он уже пишет корректно.
- Логику админ‑политик и `organization_id`‑скоупа.

## Файлы

- Миграция: новая RLS‑политика SELECT + RPC `claim_sales_leads`.
- `src/components/admin/sales/LeadsManager.tsx` — фильтр «Только пул» + кнопка «Взять в работу» (одиночная и массовая).
- `src/hooks/useSalesManager.ts` — метод `claimLeads(ids)` через RPC.
- `src/components/admin/sales/CompaniesUnified.tsx` — клик по бакету ставит фильтр `source=…` в LeadsManager (через проп / событие).
