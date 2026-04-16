

# Звёзды в шапке + единый тёмный Hero со звёздами на всех страницах

## Суть
Вернуть `StarfieldCanvas` в шапку и сделать все Hero-секции на 4 страницах (Главная, О нас, Блог, Презентация) тёмными (`bg-[#0a0e1a]`) со звёздами, чтобы шапка и Hero визуально сливались в единое звёздное пространство.

## Изменения

### 1. Шапка — вернуть звёзды (`LandingHeader.tsx`)
- Добавить `StarfieldCanvas` обратно в header
- Убрать `overflow-hidden` чтобы звёзды плавно переходили

### 2. Главная — Hero со звёздами (`Hero.tsx`)
- Заменить текущий светлый фон (`bg-background` + градиенты) на `bg-[#0a0e1a]`
- Добавить `StarfieldCanvas` в Hero
- Текст сделать белым (`text-white`), бейдж и кнопки адаптировать под тёмный фон
- Убрать `FloatingParticles` и декоративные линии — их заменяют звёзды
- Убрать `star-fall` переход (больше не нужен)

### 3. О нас — уже готово (`About.tsx`)
- Hero уже имеет `bg-[#0a0e1a]` + `StarfieldCanvas` ✓
- Оставить как есть

### 4. Блог — Hero со звёздами (`Blog.tsx`)
- Заменить текущий светлый Hero (градиент `from-accent/5`) на `bg-[#0a0e1a]`
- Добавить `StarfieldCanvas`
- Текст сделать белым, декоративные линии убрать

### 5. Презентация — Hero со звёздами (`PlatformPresentation.tsx`)
- Hero уже имеет тёмный фон (картинка `heroBg`), но нет `StarfieldCanvas`
- Добавить `StarfieldCanvas` поверх фоновой картинки
- Убрать upward-stars transition (строки 148-158) — звёзды теперь из StarfieldCanvas непрерывно

## Файлы

| Файл | Действие |
|------|----------|
| `src/components/landing/LandingHeader.tsx` | Вернуть `StarfieldCanvas` |
| `src/components/landing/Hero.tsx` | Тёмный фон + StarfieldCanvas, белый текст |
| `src/pages/Blog.tsx` | Тёмный Hero + StarfieldCanvas |
| `src/pages/PlatformPresentation.tsx` | Добавить StarfieldCanvas в Hero, убрать upward-stars |

