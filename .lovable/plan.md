

# Сделать ссылки видимыми и кликабельными везде

## Проблема

1. **В редакторе**: `handleClick` на `<a>` уже есть в RichTextEditor — ссылки должны открываться. Но стилизация может не применяться если CSS-класс `[&_a]:text-primary [&_a]:underline` не срабатывает из-за специфичности.

2. **В предпросмотре** (`RenderBlock`): Только блок `paragraph` рендерит HTML через `dangerouslySetInnerHTML`. Все остальные типы (heading1, heading2, quote, callout-*, highlight, bulletList, numberedList) используют `{block.content}` как **plain text** — HTML-теги `<a>` отображаются как текст, а не как ссылки.

## Решения

### Файл: `BlockEditor.tsx`

**A. RenderBlock — все текстовые блоки должны рендерить HTML:**
- heading1, heading2 → `dangerouslySetInnerHTML` вместо `{block.content}`
- quote → `dangerouslySetInnerHTML`
- callout-* и highlight → внутренний `<p>` через `dangerouslySetInnerHTML`
- bulletList, numberedList → парсить `<a>` теги в элементах списка через `dangerouslySetInnerHTML`

**B. Добавить CSS-класс для кликабельных ссылок в превью:**
- В обёртку `RenderBlock` добавить стили `[&_a]:text-primary [&_a]:underline [&_a]:cursor-pointer`
- Ссылки в превью будут кликабельны по умолчанию (не contenteditable → обычное поведение `<a>`)

### Файл: `RichTextEditor.tsx`

**C. Усилить стилизацию ссылок:**
- Убедиться что `[&_a]:text-primary [&_a]:underline` применяется корректно (уже есть на строке 194, проверю специфичность)

## Что НЕ нужно менять
- Логика вставки ссылок (DOM-манипуляция через setTimeout) — это уже работает
- sanitizeHtml — уже разрешает `<a>` с `href`, `target`, `rel`

