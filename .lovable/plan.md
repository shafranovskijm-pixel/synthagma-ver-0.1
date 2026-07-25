## Что делаем (без дублирования — используем уже существующие компоненты)

### 1. Админ-сайдбар (`src/components/admin/AdminSidebar.tsx`)
- Убираем пункты **«База компаний»** (`companies`) и **«Документы»** (`documents`) — они переезжают в Sales.
- Возвращаем пункт **«Статистика»** (`analytics`, иконка `Activity` из lucide) — открывает уже существующий `AdminAnalytics`. В нём готовые вкладки: «Активность», «Посещения» (лог посещений — кто/из какой организации/роль/что открывал/когда последний раз через `visitLog` + `topUsers`), «Регистрации», «Завершения», «Оплаты». Ничего нового рендерить не нужно.
- Пункт **«Вебинары»** (`webinars-admin`) остаётся в коде, но по умолчанию **скрыт** через новый механизм видимости (см. п.3).
- Добавляем фильтр по `localStorage['admin-sidebar-hidden']` (JSON-массив id вкладок) + слушатель `window` события `admin-sidebar-visibility-change`, чтобы менюшка обновлялась без перезагрузки.

Итоговый порядок иконок в сайдбаре:
```text
Статистика · Организации · Пользователи · Маркетплейс · Продажи · Чаты
```

### 2. Раздел «Продажи» — принимаем перенесённые пункты
- `src/components/admin/SalesManager.tsx` — в `topNav` дописываем 2 кнопки:
  - `companies` → уже есть в `TABS: <CompaniesUnified />` (реально это `AdminCompaniesTab` из `useSalesCompaniesDb`).
  - `admin-documents` → новый ключ в `TABS`, который рендерит **уже существующий** `AdminDocumentsManager` (админ-генератор договоров/протоколов). Ничего не дублируем.
- `src/components/admin/sales/SalesAdminView.tsx` — те же 2 пункта в шорткатах верхней панели: клик выставляет `localStorage['sales_initial_tab']` и переходит на `/sales`, где `SalesManager` подхватывает нужный таб (механизм уже работает для `broadcast`, `leads` и т.д.).

### 3. Управление видимостью иконок из «Темы оформления»
- В `src/components/ui/ThemePersonalization.tsx` добавляем новый блок **«Иконки боковой панели»** (виден только когда компонент открыт в контексте админа — новый опциональный prop `showAdminSidebar`).
- Блок = чек-лист с полным списком вкладок админ-сайдбара; галочки сохраняются в `localStorage['admin-sidebar-hidden']` (JSON-массив id) и триггерят событие `admin-sidebar-visibility-change`.
- В `src/components/admin/AdminSettings.tsx` передаём `showAdminSidebar` в компонент.
- Дефолт при первом заходе: `['webinars-admin']` (по запросу «значок вебинары скрой»).

### 4. Совместимость роутинга
- `src/pages/AdminDashboard.tsx` — оставляем рендер `activeTab === 'companies'` / `activeTab === 'documents'` как есть. Иконки из сайдбара пропали, но если пользователь ранее сохранил такой `activeTab` в URL/localStorage — экран не сломается.

## Что НЕ делаем (антидубликаты)
- Не создаём новый экран статистики/активности — используем текущий `AdminAnalytics`.
- Не создаём новый компонент «база компаний» — используем `AdminCompaniesTab` (`CompaniesUnified` в Sales).
- Не создаём новый экран документов — используем `AdminDocumentsManager`.
- Не трогаем БД (`audit_logs`, `enrollment_history`, `student_login_history` и т.д.) — они уже питают существующие графики.

## Список правок (файлы)
- `src/components/admin/AdminSidebar.tsx` — удалить 2 пункта, добавить «Статистика», добавить фильтр по `admin-sidebar-hidden`.
- `src/components/admin/SalesManager.tsx` — расширить `topNav` и `TABS` (ключ `admin-documents`).
- `src/components/admin/sales/SalesAdminView.tsx` — добавить 2 шортката в `topNav`.
- `src/components/ui/ThemePersonalization.tsx` — новый блок «Иконки боковой панели» под prop.
- `src/components/admin/AdminSettings.tsx` — прокинуть prop `showAdminSidebar`.

## Проверка после реализации
1. `/admin` → в сайдбаре видно: Статистика, Организации, Пользователи, Маркетплейс, Продажи, Чаты. Вебинары скрыты.
2. Клик по «Статистика» открывает существующий `AdminAnalytics`, вкладка «Посещения» показывает лог заходов по всем организациям (кто, роль, что открывал, когда).
3. `/admin` → Продажи → в topNav есть «База компаний» и «Документы»; клики открывают `/sales` с нужным табом.
4. `/admin` → Настройки → Внешний вид → «Иконки боковой панели»: чек-лист позволяет скрывать/показывать любые иконки, изменения применяются мгновенно.
