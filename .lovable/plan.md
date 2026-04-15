

# Применить баннер из темы на всех страницах организации

## Проблема

Баннер из визуальной темы (Офис с зеленью, Природа и т.д.) применяется только на главной странице дашборда (`OrgDashboardHeader`), но не на подстраницах — Профиль, Курс, Настройки и др. Эти подстраницы используют `OrgPageLayout`, в котором отсутствует логика чтения активной темы.

## Решение

Добавить в `OrgPageLayout.tsx` ту же логику отслеживания темы, что уже есть в `OrgDashboardHeader`:

1. `useState` для `themeBannerUrl` и `themeBannerPosition`, инициализированные из `getStoredThemeId()`
2. `useEffect` с подпиской на `window "visual-theme-change"` event
3. `displayCover` = `themeBannerUrl || coverUrl || defaultCoverImg`
4. `objectPosition` учитывает `themeBannerPosition` (приоритет над `coverPosition`)
5. Скрыть "Онлайн-обучение" когда есть тема-баннер (как в `OrgDashboardHeader`)

## Файлы

| Файл | Действие |
|---|---|
| `src/components/organization/OrgPageLayout.tsx` | Добавить theme banner state + listener, обновить `displayCover` и `objectPosition` в hero banner |

Изменения ~15 строк — только в одном файле. Вся остальная часть компонента остаётся без изменений.

