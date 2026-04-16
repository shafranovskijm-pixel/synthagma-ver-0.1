

# Подвал всегда тёмный

## Что будет сделано

Вернуть подвал лендинга к фиксированному тёмному режиму — заменить все тематические CSS-переменные (`bg-background`, `text-foreground` и т.д.) на хардкод-цвета тёмной палитры. Звёзды будут всегда видны, переключатель светлая/тёмная на подвал не влияет.

## Технические детали

### Файл: `src/components/landing/Footer.tsx`

Замены классов:
- `bg-background` → `bg-[#0a0e1a]`
- `text-foreground` → `text-white`
- `text-muted-foreground` → `text-white/60`
- `text-muted-foreground/60` → `text-white/40`
- `text-muted-foreground/50` → `text-white/35`
- `bg-foreground` → `bg-white`
- `text-background` → `text-[#0a0e1a]`
- `bg-foreground/10` → `bg-white/10`
- `bg-foreground/15` → `bg-white/15`
- `border-foreground/20` → `border-white/20`
- `hover:text-foreground` → `hover:text-white`
- `hover:text-muted-foreground` → `hover:text-white/60`

