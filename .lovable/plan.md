

## Увеличить toolbar и довести до референса Skill Space

Сейчас floating toolbar маленький и в нём не хватает левой группы «T- / Стиль / T+» (размер шрифта + выбор уровня заголовка H1–H4 / Текст). Делаю один-в-один по референсу.

### 1. RichTextEditor.tsx — увеличение и состав

Контейнер toolbar:
- `h-12 px-2 py-1.5 rounded-2xl bg-slate-800/95 backdrop-blur-md shadow-2xl border border-white/10`
- Кнопки: `h-9 w-9` (вместо текущих маленьких), иконки `w-[18px] h-[18px]`
- Разделители: `w-px h-7 bg-white/15 mx-1`
- Активные кнопки (выравнивание / B / I / U / списки): заливка `bg-primary text-primary-foreground` (teal)

Состав слева направо (как на скрине 2):
```
[ −  T  + ] | [ B  i  <>  U  🔗 ] | [ ☰ списки ] | [ ⬅ ⬄ ➡ ] | [ 🎨 ] | [ 🔗 ]
```

Левая группа **«− T +»** (новая, сейчас отсутствует):
- `−` — уменьшить размер шрифта (execCommand `fontSize` или inline `style.fontSize` через wrap span)
- `T` — кнопка-триггер popover «Стиль текста»: H1, H2, H3, H4, Текст (с галочкой у текущего)
- `+` — увеличить размер шрифта

Popover «Стиль текста» (как на скрине 3) — тёмный фон `bg-slate-800`, пункты `H1 / H2 / H3 / H4 / Текст`, у активного — teal-галочка справа. При клике — конвертирует текущий блок через `onConvertBlock(type)` (новый callback из `SortableBlockItem`).

### 2. Поддержка H3 / H4

В `block-editor/types.ts` добавить типы блоков `heading3` и `heading4`. В `BlockContent.tsx` рендер: `h3` (`text-xl font-semibold`), `h4` (`text-lg font-semibold`). В `SortableBlockItem.tsx` — добавить пункты «H3 / H4» в подменю «Преобразовать в…».

### 3. Проброс onConvertBlock в RichTextEditor

- `RichTextEditor` получает новый опциональный проп `onChangeBlockType?: (type: 'heading1'|'heading2'|'heading3'|'heading4'|'paragraph') => void`.
- `SortableBlockItem` пробрасывает его через `BlockContent` → во все text-блоки (`HeadingBlock`, `ParagraphBlock`).
- Если проп не передан (внеблочное использование RichTextEditor) — popover «Стиль» скрывает H1–H4, показывает только «Текст».

### 4. Размер шрифта (− / +)

- Хранится как `document.execCommand('fontSize', false, '1..7')` ИЛИ через обёртку `<span style="font-size: …px">` вокруг выделения.
- Беру простой путь: применяю inline-стиль через `document.execCommand('fontSize', false, '4')` и затем заменяю появившийся `<font size="4">` на `<span style="font-size: …">` (стандартный паттерн, у нас уже есть похожая логика для цветов).
- Шаги: 12 → 14 → 16(по умолч.) → 18 → 20 → 24 → 28 → 32.

### Файлы под изменение
- `src/components/course-builder/RichTextEditor.tsx` — увеличение toolbar, добавление группы «− T +» с popover H1–H4/Текст, кнопок размера шрифта.
- `src/components/course-builder/block-editor/types.ts` — типы `heading3`, `heading4`.
- `src/components/course-builder/block-editor/blocks/BlockContent.tsx` — рендер H3/H4 + проброс `onChangeBlockType`.
- `src/components/course-builder/block-editor/blocks/TextBlocks.tsx` — проброс `onChangeBlockType` в `RichTextEditor` для Heading и Paragraph блоков.
- `src/components/course-builder/block-editor/blocks/SortableBlockItem.tsx` — добавить H3/H4 в подменю «Преобразовать в…», передать `onChangeBlockType` в BlockContent.

### Результат
- Toolbar заметно крупнее (h-12, кнопки 36×36).
- Слева появляется «− T +» — кнопки размера и popover выбора H1/H2/H3/H4/Текст с teal-галочкой.
- Поведение и стиль один-в-один с референсом Skill Space, цветовая палитра — наша (slate-800 + teal active).

