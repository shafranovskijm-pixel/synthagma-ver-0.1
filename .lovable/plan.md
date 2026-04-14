

# Редизайн AdminSettings — левое меню + правая панель

## Что делаем

Заменяем текущий вертикальный список `<details>` секций на двухколоночный layout:
- **Левая колонка** (~220px): вертикальное меню с иконками и названиями секций, с активной подсветкой (как в OrgSettingsSidebar / StudentProfile)
- **Правая колонка**: содержимое выбранной секции

## Секции меню (10 пунктов)

| Иконка | Название | Компонент |
|---|---|---|
| Palette | Тема оформления | ThemePersonalization |
| Database | Статистика БД | inline (grid stats) |
| RefreshCw | Сброс кеша | inline |
| Globe | SEO | SEOSettingsManager |
| Shield | Системные | inline (toggles) |
| Tag | Промоакции | PromoCodesManager |
| Bell | Уведомления | placeholder |
| BarChart3 | Аналитика | AdminAnalytics |
| FileText | Контент | BlogManager |
| Bot | ИИ-провайдеры | AISettingsManager |
| Terminal | Developer Tools | DevToolsPanel |

## Реализация

### `AdminSettings.tsx` — полная переработка

- Добавить `useState` для `activeSection` (по умолчанию `"theme"`)
- Layout: `flex` с двумя колонками
- Левая колонка: список кнопок с иконками, `bg-primary/10` для активной, `hover:bg-primary/5` для остальных, cyan-подсветка в стиле платформы
- Правая колонка: рендер содержимого по `activeSection` (switch/case или map)
- На мобильных: левое меню горизонтальный скролл сверху или скрыто с бургером

### Один файл

| Действие | Файл |
|---|---|
| Переписать | `src/components/admin/AdminSettings.tsx` |

