

# Анимации: логотип, typewriter, звёзды, marquee

## Изменения

### 1. Логотип — буквы слетаются медленнее
**Файл:** `src/components/landing/LandingHeader.tsx`
- Увеличить stagger задержку с `0.04s` на `0.08s` на каждую букву
- Увеличить длительность анимации с `0.4s` на `0.6s`
- Буквы стартуют из `translateX(30px)` вместо `20px` для более заметного эффекта

### 2. Typewriter на странице Презентации
**Файл:** `src/pages/PlatformPresentation.tsx`
- Импортировать `TypewriterText`
- Hero: «СИНТАГМА» — typewriter (`speed={80}`, `delay={500}`)
- Hero: «Платформа для образовательных организаций» — typewriter (`speed={40}`, `delay={1200}`)
- «Единая платформа» — typewriter
- «Проблема» — typewriter
- Остальные заголовки секций — typewriter с `useInView` (печатает при появлении на экране). Создать обёртку `InViewTypewriter` которая запускает typewriter только когда элемент виден.

### 3. Звёзды летят вверх из Hero презентации в шапку
**Файл:** `src/pages/PlatformPresentation.tsx`
- Между `<LandingHeader />` и Hero секцией добавить зону с анимированными частицами (framer-motion)
- Частицы (белые точки) анимируются снизу вверх (`y: [60, -20]`, `opacity: [0.6, 0]`) создавая эффект "звёзды улетают в шапку"
- ~10 частиц с разной скоростью и позицией

### 4. Gradient blur прилипает к шапке на главной
**Файл:** `src/components/landing/Hero.tsx`
- Градиент `from-[#0a0e1a] to-transparent` (строка 212) — увеличить высоту до `h-12` и добавить `sticky top-[64px] z-20` чтобы он "прилипал" к нижней границе шапки при скролле, создавая эффект перетекания размытости

### 5. Единая платформа — marquee карточки
**Файл:** `src/pages/PlatformPresentation.tsx` (секция «Решение», строки 200-220)
- Заменить статичную сетку `grid` на горизонтальный marquee (бесконечный скролл) как в `Features.tsx`
- Дублировать массив карточек (`[...items, ...items]`)
- Использовать `animate-marquee` + mask-gradient для fade по краям
- Карточки увеличить, добавить hover-эффект масштабирования
- Пауза при hover (`group-hover:[animation-play-state:paused]`)

## Файлы

| Файл | Действие |
|------|----------|
| `src/components/landing/LandingHeader.tsx` | Замедлить анимацию букв |
| `src/pages/PlatformPresentation.tsx` | TypewriterText на заголовках, звёзды вверх, marquee для "Единая платформа" |
| `src/components/landing/Hero.tsx` | Sticky gradient blur |
| `src/components/ui/TypewriterText.tsx` | Добавить вариант `InViewTypewriter` (запуск при видимости) |

