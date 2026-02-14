

# Улучшение тулбара и новые настройки текста

## 1. Увеличение кнопок тулбара

Текущие кнопки `h-6 w-6` с иконками `w-3 h-3` слишком мелкие. Увеличим до `h-8 w-8` с иконками `w-4 h-4`, добавим скруглённый фон с hover-эффектом и тёмную подложку (как на скриншоте -- тёмная полоска с иконками).

Тулбар будет выглядеть как компактная "floating bar":
- Тёмный фон (`bg-foreground/80 backdrop-blur`) с `rounded-full` скруглением
- Белые иконки на тёмном фоне
- Плавное появление при наведении
- Тень для эффекта "парящей" панели

## 2. Новые трендовые настройки

### Зачёркивание текста (Strikethrough)
Новое поле `strikethrough?: boolean` -- часто используется для пометки устаревшей информации.

### Подчёркивание (Underline)
Поле `underline?: boolean` -- для акцентирования.

### Верхний регистр / Капитель (Uppercase)
Поле `uppercase?: boolean` -- трендовый приём для заголовков и подзаголовков.

### Цвет текста
Поле `textColor?: string` -- выбор из пресетов (по аналогии с фоном): серый, синий, красный, зелёный, фиолетовый. Полезно для выделения ключевых абзацев.

### Межстрочный интервал (Line Height)
Поле `lineHeight?: 'tight' | 'normal' | 'relaxed'` -- управление плотностью текста.

## Технические детали

### Файл: `src/components/course-builder/BlockEditor.tsx`

**Изменения в типах ContentBlock:**
```typescript
export interface ContentBlock {
  // ... существующие поля
  strikethrough?: boolean;
  underline?: boolean;
  uppercase?: boolean;
  textColor?: string;
  lineHeight?: 'tight' | 'normal' | 'relaxed';
}
```

**Изменения в тулбаре (SortableBlockItem):**
- Контейнер тулбара: `bg-foreground/80 backdrop-blur-sm text-background rounded-full px-2 py-1 shadow-lg`
- Кнопки: `h-8 w-8` с иконками `w-4 h-4`, hover-эффект `hover:bg-white/20 rounded-full`
- Кнопка удаления: `hover:bg-red-500/30`

**Изменения в Popover настроек:**
- Добавить секцию "Стиль текста" с кнопками: **B**, *I*, ~~S~~, U, Aa (uppercase)
- Добавить секцию "Цвет текста" с цветными кружками
- Добавить секцию "Интервал" с 3 кнопками (tight / normal / relaxed)

**Изменения в editorStyleClasses и getBlockStyleClasses:**
- `strikethrough` -> `line-through`
- `underline` -> `underline`
- `uppercase` -> `uppercase`
- `textColor` -> маппинг на Tailwind-классы (`text-blue-600`, `text-red-600`, ...)
- `lineHeight: 'tight'` -> `leading-tight`, `'relaxed'` -> `leading-relaxed`

### Без изменений в базе данных
Все настройки хранятся в JSON-структуре блоков.

