

# Добавить «Документы» в выпадающее меню профиля

## Что будет сделано

### 1. Добавить пункт «Документы» в dropdown-меню
В `OrgDashboardHeader.tsx` добавить новый `DropdownMenuItem` «Документы» с иконкой `FileText` между «Настройки» и «Что нового?», который ведёт на `/organization/documents`.

### 2. Создать страницу `/organization/documents`
Новая страница `OrganizationDocuments.tsx` — аналогичная по структуре странице Настроек/Профиля (шапка с кнопкой «назад», заголовок). Содержимое — `DocumentsModuleWrapper` с `OrgDashboardProvider`, который рендерит `DocumentsTab` с горизонтальными суб-вкладками на всю ширину.

### 3. Убрать вкладку «Документы» из Настроек
Из `OrganizationSettings.tsx` удалить TabsTrigger и TabsContent для `documents`, а также `DocumentsModuleWrapper` и lazy import (они переедут в новую страницу).

### 4. Добавить маршрут
В роутере добавить `/organization/documents` → `OrganizationDocuments`.

## Файлы

| Файл | Изменение |
|---|---|
| `src/components/organization/OrgDashboardHeader.tsx` | Добавить пункт «Документы» в dropdown |
| `src/pages/OrganizationDocuments.tsx` | Новая страница с DocumentsTab |
| `src/pages/OrganizationSettings.tsx` | Убрать вкладку «Документы» |
| `src/App.tsx` (или роутер) | Добавить маршрут `/organization/documents` |

