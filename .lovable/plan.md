

# Единый тёмный стиль шапки + подвал на всех страницах

## Что будет сделано

1. **Шапка главной страницы** (`Hero.tsx`, строка 225) — сделать всегда тёмной как подвал:
   - `bg-card/80 backdrop-blur-md` → `bg-[#0a0e1a]/95 backdrop-blur-lg`
   - `border-border/30` → `border-white/10`
   - `bg-foreground` (логотип) → `bg-white`
   - `text-background` → `text-[#0a0e1a]`
   - Текст навигации и название: `text-muted-foreground` → `text-white/60`, `hover:text-foreground` → `hover:text-white`
   - Кнопки «Войти»/«Начать»: белый текст

2. **Шапка страницы Презентации** (`PlatformPresentation.tsx`, строка 143) — уже тёмная, без изменений.

3. **Подвал страницы Презентации** (`PlatformPresentation.tsx`) — добавить `<Footer />` после последней секции (перед закрывающим `</div>`). Сейчас подвала нет.

4. **Шапка страницы Партнёров** (`PartnerLanding.tsx`, строка 222) — сделать тёмной:
   - `bg-background/95 backdrop-blur-sm border-border` → `bg-[#0a0e1a]/95 backdrop-blur-lg border-white/10`
   - Логотип и кнопки — белый текст

5. **Подвал страницы Партнёров** — уже использует `<Footer />`, без изменений.

## Файлы

| Файл | Изменения |
|------|-----------|
| `src/components/landing/Hero.tsx` | Тёмная шапка (навигация, строки 225-268) |
| `src/pages/PlatformPresentation.tsx` | Добавить `<Footer />` в конец |
| `src/pages/PartnerLanding.tsx` | Тёмная шапка (строки 222-239) |

