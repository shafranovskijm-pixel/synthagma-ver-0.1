

# Перенос настроек в Профиль и удаление шестерёнки из сайдбара

## Проблема
1. На вкладке «Настройки» в Профиле — «Организация не найдена» (organizationId не загружается)
2. Настройки (Сотрудники, Документооборот, Журналы, ФИС ФРДО) дублируются — есть и в сайдбаре (шестерёнка), и должны быть в профиле

## Решение

### 1. Починить загрузку organizationId в OrganizationProfile
Сейчас `loadOrgIcon` делает отдельный запрос к `profiles` с `.single()` — если профиль не найден, organizationId остаётся null. Нужно использовать уже загруженный `organizationId` из первого useEffect, а не загружать повторно.

### 2. Добавить навигацию к разделам в Settings-вкладку профиля
Перенести содержимое `SettingsTab.tsx` (аккордеоны: Сотрудники, Документооборот, Журналы, ФИС ФРДО) в `OrgProfileSettings.tsx` или напрямую во вкладку «Настройки» в `OrganizationProfile.tsx`. Кнопки будут вести обратно на `/organization` с нужной вкладкой через `navigate("/organization", { state: { tab: "staff" } })`.

### 3. Убрать шестерёнку из сайдбара
В `OrgSidebar.tsx` удалить строку `navItems.push({ id: "settings", ... })`. Убрать `SettingsTab` из `TabContentRenderer.tsx`.

## Файлы
- `src/pages/OrganizationProfile.tsx` — починить organizationId, добавить навигационные карточки
- `src/components/organization/OrgProfileSettings.tsx` — добавить секции навигации (Сотрудники, Документооборот, Журналы, ФРДО)
- `src/components/organization/OrgSidebar.tsx` — убрать "settings" из navItems
- `src/components/organization/tabs/TabContentRenderer.tsx` — убрать рендер SettingsTab

