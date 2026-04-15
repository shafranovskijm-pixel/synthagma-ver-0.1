

# Объединение Профиля, Настроек, Документов и «Что нового» в основной дашборд

## Суть
Сейчас при нажатии на «Профиль», «Настройки», «Документы», «Что нового» в dropdown-меню аватарки — происходит переход на отдельные страницы (`/organization/profile`, `/organization/settings`, и т.д.) с собственным layout и отдельным сайдбаром (`OrgSettingsSidebar`). Пользователь хочет, чтобы всё оставалось в одном окне: при нажатии на любой из этих пунктов рядом с основным сайдбаром появляется вторая менюшка (та самая `OrgSettingsSidebar`), а содержимое (профиль / настройки / документы / что нового) отображается в основной области дашборда.

## Решение

### 1. Новые вкладки в `TabType` (`OrgSidebar.tsx`)
Добавить `"settings"`, `"documents"`, `"whats-new"` в тип `TabType` (profile уже есть).

### 2. Вторичный сайдбар в основном дашборде
Когда `activeTab` — один из `["profile", "settings", "documents", "whats-new"]`, рядом с основным сайдбаром (88px) показывать вторичную панель (ту же `OrgSettingsSidebar`, но адаптированную для работы внутри дашборда). Она переключает между этими 4 вкладками через `setActiveTab`, а не через `navigate`.

Модифицировать `OrgSettingsSidebar` → принимать опциональный prop `embedded?: boolean`. Когда `embedded=true`:
- Вместо `navigate("/organization/profile")` → вызывает `setActiveTab("profile")`
- Вместо `navigate("/organization/settings")` → вызывает `setActiveTab("settings")`
- И т.д.
- Кнопка «Назад» → `setActiveTab("courses")` (возврат к основным вкладкам)

### 3. Контент в `TabContentRenderer.tsx`
Добавить рендер:
- `activeTab === "settings"` → `<SettingsContent />` (вынести из `OrganizationSettings.tsx`)
- `activeTab === "documents"` → `<DocumentsTab />` (уже есть)
- `activeTab === "whats-new"` → `<WhatsNewContent />` (вынести из `OrganizationWhatsNew.tsx`)
- `activeTab === "profile"` → уже работает

### 4. Основной layout (`OrganizationDashboard` / OrgLayout)
Когда активна одна из «вторичных» вкладок, сдвинуть контент вправо на ширину вторичного сайдбара (добавить `ml-[88px]` к основному контенту, итого `ml-[176px]` на desktop).

Вторичный сайдбар показывается анимированно (slide-in) при переключении на эти вкладки.

### 5. Обновить dropdown в хедере (`OrgDashboardHeader.tsx`)
Все пункты (Профиль, Настройки, Документы, Что нового) → `setActiveTab(...)` вместо `navigate(...)`.

### 6. Редиректы для обратной совместимости
- `OrganizationSettings.tsx` → `<Navigate to="/organization" state={{ tab: "settings" }} />`
- `OrganizationDocuments.tsx` → `<Navigate to="/organization" state={{ tab: "documents" }} />`
- `OrganizationWhatsNew.tsx` → `<Navigate to="/organization" state={{ tab: "whats-new" }} />`

## Файлы

| Файл | Действие |
|---|---|
| `src/components/organization/OrgSidebar.tsx` | Добавить `"settings"`, `"documents"`, `"whats-new"` в `TabType` |
| `src/components/organization/OrgSettingsSidebar.tsx` | Добавить `embedded` режим: переключение через `setActiveTab` |
| `src/components/organization/OrgDashboardHeader.tsx` | Dropdown → `setActiveTab` вместо `navigate` для всех пунктов |
| `src/components/organization/tabs/TabContentRenderer.tsx` | Рендер Settings, Documents, WhatsNew контента; показ вторичного сайдбара; скрытие stats/banner |
| `src/pages/OrganizationSettings.tsx` | Редирект → `/organization?tab=settings` |
| `src/pages/OrganizationDocuments.tsx` | Редирект → `/organization?tab=documents` |
| `src/pages/OrganizationWhatsNew.tsx` | Редирект → `/organization?tab=whats-new` |
| `src/hooks/useTabNavigation.ts` | Обработка query-параметра `?tab=` при навигации |

