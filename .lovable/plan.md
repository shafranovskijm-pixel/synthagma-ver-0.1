

# План: убрать «Финансы» из сайдбара, добавить «Продажи» с полным CRM, открыть доступ менеджеру по продажам

## Что я вижу сейчас

1. **Сайдбар организации** (`OrgSidebar.tsx`) показывает «Финансы» (`payments`) — её нужно убрать из основной навигации.
2. **«Продажи»** уже есть как `OrgSalesManager` (Обзор, Задачи, Канбан, Сделки 360°, Лиды, Компании, Сегменты, КП, Договоры, Услуги, Шаблоны, Рассылки, SMTP, Сравнение), но **скрыта по умолчанию** за флагом `menuSettings.showSales === true`.
3. **Меню аватара** (шапка `OrgDashboardHeader.tsx` + `OrgSecondaryNavTabs.tsx`): Профиль / Документы / Что нового / Помощь / Выйти. «Финансы» в нём нет — это правильно, его не трогаем.
4. **Права:** в матрице уже есть `sales.read`/`sales.write`. Роль организации `admin` видит «Продажи». Но **отдельной роли «Менеджер по продажам» для организации нет** — есть только в админке (`sales_manager`).
5. **`OrgProfileTab`** содержит тумблер «Продажи» (`showSales`) в группе «Бизнес», рядом с тумблером «Финансы» (alwaysOn).

---

## Что делаем

### 1. Убрать «Финансы» из бокового меню организации
- В `OrgSidebar.tsx` удалить строку `rawItems.push({ id: "payments", icon: Wallet, label: "Финансы" });`.
- Сам компонент `PaymentsTab.tsx` и роут не удаляем — он остаётся доступным изнутри (например, из «Тариф» / `subscription`), просто не торчит в сайдбаре.
- В `OrgProfileTab.tsx` убрать карточку-тумблер «Финансы» из группы «Бизнес» (она `alwaysOn` и теперь не имеет смысла).
- В `OrgDashboardHeader.tsx` оставить заголовок `case "payments": return "Финансы"` — на случай, если откроется внутренним переходом.

### 2. Добавить «Продажи» в основной сайдбар по умолчанию
- В `OrgSidebar.tsx` поменять условие: всегда добавлять `sales` (а не только при `showSales === true`). Иконка `Briefcase`, label «Продажи».
- В `OrgProfileTab.tsx` тумблер «Продажи» сделать `alwaysOn: true` (или убрать из списка переключаемых).
- Видимость в итоге будет управляться **правами сотрудника** (`canSeeOrgTab('sales')` уже завязан на `sales.read`).

### 3. Дополнительно — пункт «Продажи» в выпадающем меню аватара (по запросу пользователя)
- В `OrgSecondaryNavTabs.tsx` добавить элемент `{ icon: Briefcase, label: "Продажи", tab: "sales", path: "/organization?tab=sales" }` — между «Документы» и «Что нового».
- В `OrgDashboardHeader.tsx` (DropdownMenu аватара) добавить такой же `DropdownMenuItem`.
- Это даёт быстрый доступ к продажам из любого экрана без поиска иконки в сайдбаре.

### 4. Полный CRM-функционал в «Продажах» — что уже есть и что добавим

**Уже подключено в `OrgSalesManager`:**
- Обзор + KPI и план месяца
- Задачи менеджера
- Канбан сделок (DnD)
- Сделки 360° (тайм-лайн событий по компании)
- Лиды + импорт ИНН
- Компании
- Сегменты (горячие/опенили КП/замёрзшие)
- КП (`OrgProposalsManager`)
- Договоры (`OrgContractsManager`) с подписанием ПЭП
- Каталог услуг
- Шаблоны писем
- Рассылки (`OrgEmailCampaigns`)
- SMTP
- Сравнение с конкурентами

**Чего не хватает по сравнению с админкой — добавим:**
- **Демо-доступы** — портируем `DemoLinksManager` из админки в `OrgSalesManager` как раздел «Демо-доступы». На уровне БД таблица `sales_demo_links` сейчас admin-only — добавим миграцию: колонка `organization_id`, RLS-политики «менеджер организации видит только свои демо-ссылки» на основе `has_org_staff_permission(organization_id, 'sales')`.
- **Аналитика рассылок** — расширим `OrgEmailCampaigns`: воронка «отправлено → доставлено → открыто → клики → ответы → отписки». Используем существующие колонки `email_campaign_recipients` (открытия/клики уже трекаются), добавим вкладку «Аналитика» внутрь компонента.

### 5. Доступ менеджеру по продажам — да, мы можем его дать

Сейчас у организации есть роли: `owner / admin / school_editor / course_editor / teacher`.  
**Добавляем 6-ю роль: `sales_manager`** (менеджер по продажам).

- В `rolePermissions.ts`:
  ```text
  ORG_SALES_MANAGER = [
    'sales.read', 'sales.write',
    'companies.read', 'companies.write',
    'services.read',
    'documents.read',          // видеть готовые КП/договоры
    'chats.read', 'chats.write',
    'students.read',           // нужен для контекста сделок
  ]
  ```
  То есть менеджер видит **только** «Продажи» + «Компании» + «Чаты» в сайдбаре, без курсов, ФРДО, охраны труда, биллинга, настроек.
- **Серверная часть (миграция):**
  - Расширить enum `org_staff_role` значением `'sales_manager'`.
  - Обновить SQL-функцию `public.has_org_staff_permission` и `public.org_role_default_permissions`, добавив строки для `sales_manager` (зеркало фронт-матрицы).
- **UI выбора роли** — в `StaffManager` (вкладка «Сотрудники» организации) в селекте ролей добавить пункт «Менеджер по продажам». Описание: «Доступ только к разделу Продажи: воронка, лиды, КП, договоры, рассылки».

Владелец организации сам приглашает сотрудника на email с этой ролью через уже существующий `staff_invitations` flow.

### 6. Где деть «Финансы» (чтобы пользователь её всё-таки находил)

- Ссылка «Финансы / Платежи» переезжает внутрь раздела **«Тариф»** (`SubscriptionTab`): добавим там кнопку/ссылку «Открыть финансовые операции» → переключает `activeTab` на `payments`.
- Это логично: подписка и платежи теперь рядом, а основное меню разгружено.

---

## Файлы

**Frontend (правки):**
- `src/components/organization/OrgSidebar.tsx` — убрать «Финансы», всегда показывать «Продажи»
- `src/components/organization/OrgSecondaryNavTabs.tsx` — добавить «Продажи»
- `src/components/organization/OrgDashboardHeader.tsx` — добавить «Продажи» в DropdownMenu аватара
- `src/components/organization/tabs/OrgProfileTab.tsx` — убрать тумблер «Финансы», «Продажи» сделать всегда-on
- `src/components/organization/tabs/SubscriptionTab.tsx` — кнопка перехода в «Финансы»
- `src/constants/rolePermissions.ts` — новая роль `sales_manager` + её матрица
- `src/components/organization/staff/StaffManager.tsx` (или где селект ролей) — добавить опцию «Менеджер по продажам»
- `src/components/organization/sales/OrgSalesManager.tsx` — добавить раздел «Демо-доступы»
- `src/components/organization/sales/OrgEmailCampaigns.tsx` (или `CampaignsManager`) — вкладка «Аналитика»
- Новый файл: `src/components/organization/sales/OrgDemoLinksManager.tsx` — обёртка над демо-ссылками для организации

**Backend (миграция):**
- Расширить enum `org_staff_role` → `sales_manager`
- Обновить функции `has_org_staff_permission` и `org_role_default_permissions`
- Добавить `organization_id` в `sales_demo_links` + RLS-политики

---

## Память, которую обновлю после реализации
- Обновить `mem://features/staff/permissions-foundation` — добавить роль `sales_manager` для организации
- Создать `mem://features/sales/org-cabinet-full-suite` — что входит в кабинет «Продажи» организации (полный список разделов + новая роль)

