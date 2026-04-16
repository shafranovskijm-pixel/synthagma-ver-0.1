

# Единая тёмная шапка со звёздами + подвал на всех публичных страницах

## Проблема
Сейчас каждая страница (главная, презентация, партнёры, о нас) имеет свою отдельную шапку с разным стилем. Нет единообразия. Шапка должна выглядеть как подвал — тёмная с анимацией звёзд (`StarfieldCanvas`).

## Решение

### 1. Создать общий компонент `LandingHeader`
Новый файл `src/components/landing/LandingHeader.tsx` — шапка в стиле подвала:
- Фон `bg-[#0a0e1a]` с `StarfieldCanvas` внутри (как в Footer)
- Sticky, `z-50`
- Логотип Σ СИНТАГМА, навигация (Стоимость, О нас, Блог, Презентация)
- Кнопки: RadioPlayerButton, ThemeToggle, Войти, Начать
- Все тексты `text-white/60`, кнопки `text-white`

### 2. Удалить встроенные шапки из страниц
- **`Hero.tsx`** (строки 225-268) — убрать `<nav>` целиком, оставить только hero-контент
- **`PlatformPresentation.tsx`** (строки 143-167) — убрать `<header>` 
- **`PartnerLanding.tsx`** (строки 222-239) — убрать `<header>`
- **`About.tsx`** (строки 22-34) — убрать `<header>`

### 3. Добавить `LandingHeader` + `Footer` на каждую страницу
- **Index.tsx** — добавить `<LandingHeader />` перед `<Hero />` 
- **PlatformPresentation.tsx** — добавить `<LandingHeader />` вверху (Footer уже добавлен)
- **PartnerLanding.tsx** — добавить `<LandingHeader />` вверху (Footer уже есть)
- **About.tsx** — добавить `<LandingHeader />` + `<Footer />`

### 4. Радио
Радио уже работает через SPA-навигацию — `useRadioPlayer` использует глобальный `Audio` объект. При переходе между страницами через `<Link>` радио не прерывается.

## Файлы

| Файл | Действие |
|------|----------|
| `src/components/landing/LandingHeader.tsx` | **Создать** — общая тёмная шапка со StarfieldCanvas |
| `src/components/landing/Hero.tsx` | Удалить `<nav>` (строки 225-268) |
| `src/pages/Index.tsx` | Добавить `<LandingHeader />` |
| `src/pages/PlatformPresentation.tsx` | Заменить header на `<LandingHeader />` |
| `src/pages/PartnerLanding.tsx` | Заменить header на `<LandingHeader />` |
| `src/pages/About.tsx` | Заменить header на `<LandingHeader />` + добавить `<Footer />` |

