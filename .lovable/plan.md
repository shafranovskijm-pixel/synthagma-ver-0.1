## Цель
Кабинет менеджера по продажам (`/sales`) сейчас содержит только 3 вкладки. Перевести его на тот же полнофункциональный интерфейс CRM, что уже есть в админке (`SalesManager`) и в кабинете организации (`OrgSalesManager`): Обзор, Задачи, Сделки 360°, Канбан, Компании, КП, Договоры, Подписание, Услуги, Рассылки, Контроль, Сравнение, Менеджеры — со всеми существующими функциями (создание/отправка/печать КП, договоры, шаблоны, превью, статусы, лог активности, демо-ссылки и т.д.).

## Что меняем

### 1. `src/pages/SalesDashboard.tsx` — переписать как layout-обёртку
- Шапка: логотип + «Кабинет менеджера» + кнопка «Выйти» (как сейчас).
- Слева — `SalesSidebar` / `SalesSidebarContent` из `components/admin/sales/SalesSidebar.tsx` (тот же sticky сайдбар, что в админке/орге).
- В центре — рендер раздела по `activeTab` через тот же `sectionMap`, что в `SalesManager.tsx`:
  - `overview` → `SalesOverview` (с `onJump` → переключение на `deals` с `initialSelectedInn`)
  - `tasks` → `SalesTasks` (с `onOpenDeal`)
  - `kanban` → `SalesKanban`
  - `deals` → `Deals360` (`initialSelectedInn`)
  - `companies` → `CompaniesUnified`
  - `proposals` → `CommercialProposals`
  - `contracts` → `SalesContracts`
  - `signing` → `DocumentSigning`
  - `services` → `SalesServices`
  - `broadcast` → `BroadcastManager`
  - `control` → `SalesControlPanel`
  - `comparison` → `CompetitorComparison`
  - `managers` → `SalesManagersList` (read-only — см. ниже)
- Хлебные крошки/заголовок раздела — как в `SalesManager` (используем `salesMenuGroups`).
- Удаляем старый код с табами/диалогом лида (его функционал полностью покрывают `Deals360` + `CommercialProposals`).

### 2. Ограничения для роли `sales_manager`
В отличие от админки, менеджер не должен править глобальные настройки:
- В `SalesManagersList` передать проп `readOnly` (или скрыть кнопки add/edit/delete, если они есть) — менеджер только видит коллег.
- `SalesControlPanel` и `CompetitorComparison` оставить как есть (это аналитика, RLS уже отфильтрует данные).
- RLS на `sales_leads`, `commercial_proposals`, `sales_contracts`, `sales_tasks` уже ограничивает по `manager_id` — никаких миграций не требуется.
- Если выясним при проверке, что какой-то компонент использует `is_admin`-only RPC и падает с ошибкой — обернём в `try/catch` или скроем кнопку для не-админов через `useUserRole`.

### 3. Не трогаем
- Админский `SalesManager.tsx` и оргшный `OrgSalesManager.tsx` — без изменений.
- Все компоненты разделов используются «как есть», без форков, чтобы новые фичи в КП/Сделках автоматически появлялись и в кабинете менеджера.
- Маршрут `/sales` и логика `Login.tsx` — без изменений.

## Технические детали
- Файл изменения: только `src/pages/SalesDashboard.tsx` (полная переписка ~120 строк по образцу `SalesManager.tsx`).
- Возможная мелкая правка: добавить `readOnly?: boolean` проп в `SalesManagersList` (или скрыть admin-only кнопки условием по роли через `useUserRole`).
- Состояние `activeTab` хранить в `useState`, дефолт `overview`. Поддержать `?tab=` в URL — опционально, по аналогии с админкой.

## Проверка
1. Зайти под тестовой учёткой `sales.test@sintagma.com.ru` → попасть на `/sales` → увидеть полный сайдбар.
2. Создать КП через раздел «КП» (`CommercialProposals` → `ProposalEditor`), отправить, увидеть в списке.
3. Открыть «Сделки 360°» — компания со своими КП/договорами/активностями.
4. Канбан — drag-n-drop сделок.
5. Убедиться, что RLS не отдаёт чужих лидов (логин под менеджером, у которого нет назначений → пустые списки, без ошибок).