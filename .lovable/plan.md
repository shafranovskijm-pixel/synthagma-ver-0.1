
# Модуль "Продажи" -- CRM для отдела продаж

## Обзор

Полноценный CRM-модуль в админ-панели с коммерческими предложениями (КП), менеджерами по продажам, базой компаний с лицензиями из реестра Рособрнадзора и контролем исполнения.

---

## Часть 1. База данных (новые таблицы)

### 1.1 Новая роль: `sales_manager`

Добавить значение `sales_manager` в enum `app_role`. Менеджеры входят через обычный /login и перенаправляются в `/sales`.

### 1.2 Таблицы

**`sales_services`** -- каталог услуг для КП
- id, name, description, price, is_active, sort_order, created_at

**`commercial_proposals`** -- коммерческие предложения
- id, created_by (uuid), manager_id (uuid, nullable), company_name, company_inn, company_email, company_phone, contact_person, tariff_plan (text), custom_note, total_amount, status (draft/sent/negotiation/accepted/rejected), created_at, updated_at, valid_until (date)

**`commercial_proposal_services`** -- услуги в КП (many-to-many)
- id, proposal_id, service_id (nullable), custom_name, custom_description, price, quantity, sort_order

**`sales_leads`** -- база компаний для прозвона (из реестра Рособрнадзора)
- id, org_name, inn, ogrn, license_number, license_date, region, city, address, phone, email, website, status (new/in_progress/contacted/interested/not_interested/client), assigned_manager_id (uuid, nullable), notes, source (text, default 'obrnadzor'), created_at, updated_at, last_contact_at

**`sales_lead_activities`** -- история действий по лиду
- id, lead_id, manager_id, activity_type (call/email/meeting/note/status_change), description, created_at

**`sales_managers`** -- расширенный профиль менеджера
- id, user_id (uuid), full_name, phone, is_active, created_at
- Связь с user_roles для получения роли sales_manager

### 1.3 RLS-политики

- Все таблицы доступны для `admin` (полный доступ)
- Таблицы `sales_leads`, `sales_lead_activities` доступны для `sales_manager` только по записям, назначенным на них (assigned_manager_id = profiles.user_id) или не назначенным
- `commercial_proposals` -- менеджер видит свои КП (created_by или manager_id), админ -- все
- `sales_services` -- чтение для sales_manager, управление для admin

---

## Часть 2. Админ-панель -- вкладка "Продажи"

### 2.1 Навигация

Добавить в `AdminSidebar` новую вкладку "Продажи" (иконка `Briefcase`) с типом `"sales"`. Отобразить в `AdminDashboard`.

### 2.2 Компонент `SalesManager.tsx`

Основной компонент с подвкладками:

**Подвкладка "КП" (Коммерческие предложения)**
- Список КП с фильтрами по статусу
- Создание КП: выбор тарифа из SUBSCRIPTION_PLANS, автоматический расчет цены
- Персональная настройка: добавление/удаление услуг из каталога, ручное добавление произвольных позиций
- Указание данных компании (вручную или поиск по ИНН через DaData)
- Предпросмотр и смена статуса

**Подвкладка "Услуги"**
- CRUD для каталога услуг (название, описание, цена)
- Сортировка перетаскиванием

**Подвкладка "Менеджеры"**
- Список менеджеров с количеством лидов и КП
- Создание менеджера: email + пароль, автоматическое создание пользователя с ролью `sales_manager`
- Активация/деактивация менеджеров

**Подвкладка "База компаний"**
- Таблица компаний с лицензиями (из sales_leads)
- Фильтр по региону, статусу, менеджеру
- Импорт компаний: загрузка CSV/Excel файла с данными из реестра Рособрнадзора (ИНН, название, лицензия, регион)
- Назначение компаний менеджерам (массовое и по одной)
- Просмотр истории взаимодействий

**Подвкладка "Контроль"**
- Дашборд: сколько звонков сделал каждый менеджер, конверсия по статусам
- Таблица активности по дням
- Фильтр по менеджеру и периоду

---

## Часть 3. Кабинет менеджера (`/sales`)

### 3.1 Страница `SalesDashboard.tsx`

Доступна только для роли `sales_manager`. Содержит:

- **Мои КП**: список коммерческих предложений менеджера, создание новых
- **Мои компании**: список назначенных компаний для прозвона с возможностью менять статус и добавлять заметки
- **Журнал активности**: лог звонков/писем/встреч

### 3.2 Роутинг

- Добавить lazy-загрузку `SalesDashboard`
- Защитить маршрут `/sales` для роли `sales_manager`
- В `useAuth` / `ProtectedRoute` добавить поддержку новой роли и редирект

---

## Часть 4. Импорт данных Рособрнадзора

Данные реестра ФРДО доступны в формате CSV/XML. Поскольку прямой запрос к сайту невозможен (таймаут):

- Админ скачивает файл реестра с сайта obrnadzor.gov.ru вручную
- Загружает через интерфейс "Импорт базы компаний" (Excel/CSV)
- Парсинг на клиенте (xlsx library уже установлена) с маппингом колонок
- Фильтрация по региону перед сохранением
- Массовая вставка в `sales_leads`

---

## Часть 5. Edge-функция для создания менеджера

**`create-sales-manager/index.ts`**
- Принимает email, password, full_name
- Создает пользователя через admin API
- Присваивает роль `sales_manager`
- Создает запись в `sales_managers`

---

## Файлы для создания/изменения

### Новые файлы:
- `src/pages/SalesDashboard.tsx` -- кабинет менеджера
- `src/components/admin/SalesManager.tsx` -- основной компонент вкладки Продажи
- `src/components/admin/sales/CommercialProposals.tsx` -- управление КП
- `src/components/admin/sales/SalesServices.tsx` -- каталог услуг
- `src/components/admin/sales/SalesManagersList.tsx` -- управление менеджерами
- `src/components/admin/sales/LeadsManager.tsx` -- база компаний
- `src/components/admin/sales/LeadsImportDialog.tsx` -- импорт из Excel
- `src/components/admin/sales/SalesControlPanel.tsx` -- контроль исполнения
- `src/components/admin/sales/ProposalEditor.tsx` -- редактор КП
- `src/hooks/useSalesManager.ts` -- бизнес-логика
- `supabase/functions/create-sales-manager/index.ts` -- edge-функция

### Изменяемые файлы:
- `src/components/admin/AdminSidebar.tsx` -- добавить вкладку "Продажи"
- `src/pages/AdminDashboard.tsx` -- подключить SalesManager
- `src/App.tsx` -- добавить маршрут /sales
- `src/hooks/useAuth.tsx` -- поддержка роли sales_manager
- `src/components/ProtectedRoute.tsx` -- разрешить sales_manager
- SQL миграция -- enum, таблицы, RLS, edge function config
