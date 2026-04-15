

# Система визуальных тем для всех кабинетов (Админ, Организация, Слушатель)

## Что будет сделано

Добавление системы из 6 визуальных тем (Свежесть, Офис, Нью-Йорк, Закат, Минимализм, Бирюза) с анимациями, атмосферными эффектами и выбором баннера — во все три кабинета: админа, организации и слушателя.

## Новые файлы

### 1. `src/constants/admin-themes.ts` (~120 строк)
Определения 6 тем: id, label, emoji, bannerUrl, bgClass, headerClass, cardClass, sidebarClass, accent HSL, animation type, atmosphereBlur/Opacity/Sharp настройки.

### 2. `src/components/ui/ThemeAnimations.tsx` (~250 строк)
7 типов анимаций на framer-motion:
- `leaves` — 12 падающих 🍃
- `fade` — пульсирующий градиент
- `lights` — 20 мерцающих точек
- `gradient` — плавающий орб
- `glow` — пульсирующие фиолетовые сферы
- `particles` — 45 слоёных блёсток
- `sand` — 30 дрейфующих песчинок

### 3. `src/components/ui/AtmosphericBleed.tsx` (~80 строк)
Атмосферные фрагменты баннера в углах страницы через CSS mask-image с blur/saturate.

### 4. `src/components/ui/ThemeSelector.tsx` (~150 строк)
Универсальный компонент выбора темы: сетка карточек с превью баннеров, загрузка кастомного баннера, выбор режима отображения (cover/contain/tile/stretch). Сохранение в localStorage.

## Изменяемые файлы

### 5. `src/components/ui/ThemePersonalization.tsx`
Добавить секцию «Визуальная тема» с ThemeSelector. Существующие настройки (акцент, плотность, радиус) остаются.

### 6. `src/pages/StudentProfile.tsx`
Заменить простой light/dark/system переключатель на полный ThemeSelector + существующие режимы.

### 7. `src/pages/AdminDashboard.tsx`
Применить activeTheme на корневой div: переопределение `--primary`, bgClass, анимации, атмосферные фрагменты.

### 8. `src/pages/OrganizationProfile.tsx`
Тема уже есть через ThemePersonalization — новый ThemeSelector автоматически появится.

### 9. `src/App.tsx` / `useThemePersonalization`
Добавить восстановление визуальной темы из localStorage при загрузке.

## Технические детали

- Темы сохраняются в `localStorage('visual-theme')` — работают для каждого пользователя индивидуально на его устройстве
- Активная тема переопределяет `--primary` и `--primary-foreground` CSS-переменные через inline style
- Все shadcn/ui кнопки автоматически перекрашиваются через `bg-primary`
- Баннерные изображения — статические URL (можно использовать Unsplash или загрузить в public/)
- framer-motion уже установлен в проекте

## Объём
~10 файлов, ~700 строк нового кода.

