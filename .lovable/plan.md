

# Интеграция профиля в основной дашборд организации

## Проблема
Сейчас «Профиль» — отдельная страница `/organization/profile` с собственным `OrgPageLayout`. Это ощущается как «два разных мира». Пользователь хочет, чтобы профиль (мой профиль, брендирование, уведомления, партнёрская программа) был просто ещё одной вкладкой в основном сайдбаре, с плавным переключением как у остальных разделов.

## Решение

### 1. Добавить вкладку «Профиль» в сайдбар (`OrgSidebar.tsx`)
- Добавить `"profile"` в тип `TabType`
- Добавить иконку `User` в навигацию сайдбара — в нижнюю часть, перед кнопкой «Выйти» (отделяя от основных рабочих вкладок)

### 2. Вынести содержимое профиля в компонент-вкладку (`ProfileTab.tsx`)
- Извлечь `ProfileContent` из `OrganizationProfile.tsx` в новый компонент `src/components/organization/tabs/ProfileTab.tsx`
- Компонент принимает `organizationId` и рендерит те же sub-tabs: Мой профиль, Брендирование, Бренд. страницы входа, Уведомления, Партнёрская программа

### 3. Подключить в `TabContentRenderer.tsx`
- Добавить рендер `ProfileTab` при `activeTab === "profile"`

### 4. Обновить навигацию в хедере (`OrgDashboardHeader.tsx`)
- Вместо `navigate("/organization/profile")` → `setActiveTab("profile")`
- Вместо `navigate("/organization/profile?tab=partner")` → `setActiveTab("profile")` + передать начальный sub-tab

### 5. Упростить `OrganizationProfile.tsx`
- Оставить как редирект `<Navigate to="/organization?tab=profile" />` для обратной совместимости

## Файлы

| Файл | Действие |
|---|---|
| `src/components/organization/tabs/ProfileTab.tsx` | Новый — содержимое профиля из `OrganizationProfile.tsx` |
| `src/components/organization/OrgSidebar.tsx` | Добавить `"profile"` в `TabType` и кнопку `User` перед Logout |
| `src/components/organization/tabs/TabContentRenderer.tsx` | Добавить рендер `ProfileTab` |
| `src/components/organization/OrgDashboardHeader.tsx` | Заменить `navigate` на `setActiveTab("profile")` |
| `src/pages/OrganizationProfile.tsx` | Заменить на `<Navigate to="/organization?tab=profile" />` |

