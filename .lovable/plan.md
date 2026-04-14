

# Перенос «Сотрудники» внутрь «Настройки»

## Что делаем

Убираем «Сотрудники» как отдельный пункт из выпадающего меню в хедере админа и добавляем его как секцию внутри AdminSettings (между «Настройки» → левое меню, рядом с «Тема оформления», «Статистика БД» и т.д.).

## Изменения

### 1. `src/components/admin/AdminSettings.tsx`
- Добавить `"staff"` в `SectionKey`
- Добавить в массив `SECTIONS` пункт `{ key: "staff", label: "Сотрудники", icon: Users, color: "text-cyan-500" }` — сразу после «Тема оформления»
- В `renderContent()` добавить `case "staff": return <AdminStaffTab />;`
- Импортировать `Users` и `AdminStaffTab`

### 2. `src/components/admin/AdminDashboardHeader.tsx`
- Убрать пункт «Сотрудники» из выпадающего меню (DropdownMenuItem с `setActiveTab("staff")`)

### 3. `src/pages/AdminDashboard.tsx`
- Убрать отдельный рендер `{activeTab === "staff" && <AdminStaffTab />}` — теперь он внутри AdminSettings

### 4. `src/components/admin/AdminSidebar.tsx`
- Убрать `"staff"` из типа `AdminTabType` (опционально, можно оставить для обратной совместимости)

