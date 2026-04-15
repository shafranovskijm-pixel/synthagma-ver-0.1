

# Свайп-переключение темы в баннере профиля ученика

## Что будет сделано

Баннер `StudentProfileBanner` станет интерактивной каруселью тем. Свайп влево/вправо (на мобильных — touch-события, на десктопе — маленькие стрелки по бокам) переключает тему. При переключении:
- Баннер плавно меняет фоновое изображение (CSS transition на opacity)
- Применяется вся тема через `storeThemeId` + dispatch `visual-theme-change` → обновляются сайдбар, карточки и т.д.
- Внизу баннера — точки-индикаторы текущей темы

## Техническая реализация

**Файл**: `src/components/student/StudentProfileBanner.tsx`

- Импортировать `ADMIN_THEMES`, `storeThemeId`
- Хранить `currentIndex` в state (инициализация из `getStoredThemeId`)
- Touch-обработчики: `onTouchStart` / `onTouchEnd` с порогом 50px для свайпа
- Кнопки `ChevronLeft` / `ChevronRight` (полупрозрачные, маленькие, по бокам баннера)
- При смене индекса: вызов `storeThemeId(theme.id)` + `dispatchEvent(new CustomEvent("visual-theme-change", { detail: theme.id }))`
- Плавная смена: два слоя фона с `transition-opacity duration-700`, один исчезает, второй появляется
- Точки внизу: `ADMIN_THEMES.length` маленьких кружков, активный — белый, остальные — полупрозрачные

## Файлы

| Файл | Действие |
|---|---|
| `src/components/student/StudentProfileBanner.tsx` | Полная переработка — свайп-карусель тем |

