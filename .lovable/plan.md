

# Исправление пустой вкладки «Настройки» в профиле организации

## Проблема

На странице `/organization/profile` вкладка «Настройки» пуста. Компонент `OrgProfileSettings` рендерится только при условии `organizationId && user?.id`, но `organizationId` загружается асинхронно внутри функции `loadOrgIcon` и может быть `null`, если запрос не вернул `organization_id`.

## Решение

### 1. Вынести загрузку `organizationId` в отдельный надёжный запрос
В `OrganizationProfile.tsx` — загружать `organizationId` сразу при монтировании, не привязывая к `loadOrgIcon`. Добавить отдельную функцию `loadOrganizationId`, которая сначала проверяет `profiles.organization_id`, а если пусто — ищет по таблице `organizations` через `owner_id`.

### 2. Добавить состояние загрузки для вкладки «Настройки»
Показывать индикатор загрузки (`Loader2`) пока `organizationId` ещё не определён, вместо пустого контента.

### 3. Fallback через хук `useOrgDashboard`
Как резервный вариант — использовать данные из контекста `OrgDashboardContext`, если профиль не содержит `organization_id` напрямую.

## Файлы
| Действие | Файл |
|----------|------|
| Изменить | `src/pages/OrganizationProfile.tsx` — вынести и исправить загрузку `organizationId` |

