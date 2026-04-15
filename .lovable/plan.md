

# Убрать «Профиль» из основного сайдбара

## Суть
Профиль не должен быть кнопкой в основном навигационном меню (сайдбаре). Он открывается через аватарку в хедере (dropdown → «Профиль»), которая уже работает и вызывает `setActiveTab("profile")`. Контент профиля отображается в том же основном окне — без перехода на другую страницу. Просто убираем лишнюю иконку из сайдбара.

## Изменения

### `src/components/organization/OrgSidebar.tsx`
- Удалить строку 176: `navItems.push({ id: "profile", icon: User, label: "Профиль" });`
- Убрать импорт `User` если больше не используется

Всё остальное уже работает:
- Dropdown в хедере (`OrgDashboardHeader.tsx`, строка 182) → `setActiveTab("profile")` ✓
- `TabContentRenderer.tsx` рендерит `ProfileTab` при `activeTab === "profile"` ✓
- `ProfileTab.tsx` показывает sub-tabs (Мой профиль, Брендирование, Уведомления, Партнёрская) ✓

## Файлы

| Файл | Действие |
|---|---|
| `src/components/organization/OrgSidebar.tsx` | Удалить `profile` из navItems (строка 176) |

