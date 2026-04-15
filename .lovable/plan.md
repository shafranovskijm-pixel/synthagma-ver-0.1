

# Применить визуальную тему на всех страницах организации

## Проблема

Главная страница дашборда (`OrganizationDashboard.tsx`) применяет полную визуальную тему:
- `activeTheme.bgClass` — градиентный фон
- `ThemeAnimations` — анимированные частицы/листья
- `AtmosphericBleed` — размытый фоновый эффект

Подстраницы (Профиль, Курс, Настройки, Документы) используют `OrgPageLayout`, который применяет только баннер-картинку темы, но **не применяет фон, анимации и атмосферу**. Поэтому при переходе на подстраницу фон становится белым/стандартным.

## Решение

Добавить в `OrgPageLayout.tsx` те же визуальные эффекты темы, что есть на главной:

1. Загрузить полный объект `activeTheme` (не только `bannerUrl`)
2. Применить `activeTheme.bgClass` на корневой `<div>`
3. Добавить `<ThemeAnimations>` и `<AtmosphericBleed>` компоненты
4. Обработать специальный кейс для темы `turquoise` (inline gradient)

## Файлы

| Файл | Действие |
|---|---|
| `src/components/organization/OrgPageLayout.tsx` | Заменить раздельные `themeBannerUrl`/`themeBannerPosition` на полный `activeTheme` объект. Добавить `ThemeAnimations`, `AtmosphericBleed`, `bgClass` на корневой div |

## Детали изменений

В `OrgPageLayout.tsx`:
- Заменить два `useState` (`themeBannerUrl`, `themeBannerPosition`) на один `useState<AdminTheme | null>` для `activeTheme`
- Вычислять `themeBannerUrl` и `themeBannerPosition` из `activeTheme`
- На корневой `<div>` добавить `activeTheme?.bgClass` и inline style для turquoise
- Перед `<main>` вставить `<ThemeAnimations>` и `<AtmosphericBleed>` (условно, если activeTheme)
- Импортировать `ThemeAnimations`, `getStoredAnimationLevel`, `AtmosphericBleed`

Изменения ~20 строк в одном файле.

