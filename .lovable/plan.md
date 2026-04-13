

# Два отдельных «мира» навигации: основной дашборд и страницы настроек

## Суть проблемы
Сейчас кнопки «Профиль», «Настройки», «Документы» добавлены внизу основного сайдбара — получился один мир. Нужно разделить на два:

1. **Основной дашборд** (`/organization`) — сайдбар с курсами, учениками, статистикой и т.д. Без утилитарных кнопок внизу.
2. **Страницы настроек** (`/organization/profile`, `/organization/settings`, `/organization/documents`, `/organization/whats-new`, `/organization/help`) — свой отдельный сайдбар с этими 5 пунктами по центру (как студенческий сайдбар). Кнопка «Назад» в шапке ведёт обратно в основной дашборд.

## Что будет сделано

### 1. Убрать утилитарные кнопки из `OrgSidebar.tsx`
Удалить блок `utilityItems` и весь раздел «Utility navigation» внизу сайдбара (строки 158–296). Сайдбар основного дашборда остаётся только с основными пунктами навигации.

### 2. Создать `OrgSettingsSidebar.tsx` — отдельный сайдбар для «мира настроек»
Новый компонент с 5 пунктами навигации по центру (в таком же pill-контейнере как основной):
- Профиль (`/organization/profile`, иконка User)
- Настройки (`/organization/settings`, иконка Settings)
- Документы (`/organization/documents`, иконка FileText)
- Что нового (`/organization/whats-new`, иконка Sparkles)
- Помощь (`/organization/help`, иконка HelpCircle)

Активный пункт подсвечивается по `location.pathname`. Логотип сверху, кнопка выхода снизу — как в основном сайдбаре.

### 3. Обновить `OrgPageLayout.tsx`
Заменить `<OrgSidebar />` на `<OrgSettingsSidebar />`. Кнопка «Назад» в шапке ведёт на `/organization` (не `navigate(-1)`).

## Файлы

| Файл | Изменение |
|---|---|
| `src/components/organization/OrgSidebar.tsx` | Удалить utilityItems и блок «Utility navigation» |
| `src/components/organization/OrgSettingsSidebar.tsx` | **Новый** — сайдбар для страниц настроек |
| `src/components/organization/OrgPageLayout.tsx` | Использовать `OrgSettingsSidebar` вместо `OrgSidebar`, кнопка назад → `/organization` |

