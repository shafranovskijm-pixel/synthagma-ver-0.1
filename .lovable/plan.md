
## Сдвинуть меню форматирования в левый gutter, рядом с «+»

Проблема не в том, что `left` ещё “неправильный”, а в системе координат: сейчас toolbar рисуется `absolute` внутри `RichTextEditor`, поэтому даже `left: 0` ставит его в начало текстового блока, а не в левую зону с круглым `+`.

### Что сделаю
1. В `src/components/course-builder/RichTextEditor.tsx`
   - перестану якорить floating toolbar к самому редактору;
   - добавлю отдельный проп для gutter-позиции, чтобы toolbar можно было вынести левее контента;
   - позицию буду считать не от `rect.left`, а от левой границы блока с отрицательным смещением в gutter;
   - зафиксирую вертикаль по выделению, а горизонталь — в одной колонке с левым `+`.

2. В `src/components/course-builder/block-editor/blocks/BlockContent.tsx`
   - прокину в `RichTextEditor` общий режим “toolbar in gutter” для всех текстовых блоков.

3. В `src/components/course-builder/block-editor/blocks/TextBlocks.tsx`
   - исправлю `ParagraphBlock` и остальные текстовые блоки, которые сейчас вызывают `RichTextEditor` напрямую без общих block-control props;
   - чтобы меню вело себя одинаково в paragraph / quote / callout / highlight / accordion, а не только в heading-блоках.

4. При необходимости в `src/components/course-builder/block-editor/blocks/SortableBlockItem.tsx`
   - выровняю контейнер блока/отступы, чтобы колонка toolbar и кнопки `+` визуально совпадали по X-координате.

### Ожидаемый результат
- при выделении текста меню больше не появляется по центру;
- меню живёт слева, в той же gutter-зоне, что и круглый `+`;
- горизонтальная позиция стабильна для всех текстовых блоков;
- вертикально меню остаётся на уровне выделенного текста.

### Файлы под изменение
- `src/components/course-builder/RichTextEditor.tsx`
- `src/components/course-builder/block-editor/blocks/BlockContent.tsx`
- `src/components/course-builder/block-editor/blocks/TextBlocks.tsx`
- возможно `src/components/course-builder/block-editor/blocks/SortableBlockItem.tsx`

### Техническая причина, которую устраняю
- сейчас toolbar: `absolute` внутри `RichTextEditor`;
- `left: 0` = левый край editor-content, а не левый gutter блока;
- часть текстовых блоков вообще не получает единый набор props для нового toolbar, из-за чего поведение может различаться между типами блоков.
