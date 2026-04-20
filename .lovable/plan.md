

## Перенос «Преобразовать» и недостающих частей «Стиль блока» в основной floating toolbar

### Что убираю из «...» меню (SortableBlockItem.tsx)
Убираю 4 пункта и связанные диалоги:
- `Преобразовать в…` → переезжает в основной toolbar
- `Стиль блока…` → недостающие подразделы переезжают в основной toolbar, остальное удаляется как дубль
- `Пресеты стиля` → переезжает в основной toolbar
- `Сбросить стиль` → переезжает в основной toolbar

В «...» меню остаётся только: **Вверх / Вниз / Удалить** (+ поиск).

Удаляю также диалоги `convertOpen`, `styleDialogOpen`, `presetsOpen` и связанные стейты.

### Что добавляю в основной toolbar (RichTextEditor.tsx)

Добавляю **2 новые popover-кнопки** в правой части (после палитры, перед ссылкой), чтобы не раздувать линейку:

**1. Кнопка `Wand2` — «Преобразовать»** (только при `onConvertType` и для блоков из `convertibleTypes`):
- Popover со списком из `wrapOtherTargets` + раздел «Выделение» с `wrapCalloutTargets` (как было в Dialog).
- Передаю наружу через новый проп `onConvertBlockType?: (type: BlockType) => void` (отдельный от `onConvertType`, который сейчас используется для смены H1/H2/paragraph). На уровне `BlockContent` мапим оба к одному `onUpdate({ type })`.

**2. Кнопка `Sliders` — «Доп. оформление»** (только при `onStyleUpdate` и `canStyle`):
Popover с разделами, которых нет в текущем toolbar:
- **Доп. форматирование:** Зачёркнутый, UPPERCASE
- **Шрифт:** Обычный / Моно
- **Межстрочный интервал:** Плотный / Обычный / Свободный
- **Рамка:** Нет / Тонкая / Жирная / Пунктир
- **Скругление:** Нет / Md / Xl
- **Готовые стили:** сетка `quickStyles` 3 колонки
- **Пресеты:** «Сохранить текущий стиль» + список сохранённых (берём через новые пропсы `presets`, `onPresetsChange`)
- Внизу — **«Сбросить стиль»** (та же логика что была в `...`)

### Новые пропсы RichTextEditor
```ts
onConvertBlockType?: (type: BlockType) => void;   // для меню «Преобразовать»
canConvert?: boolean;                              // показывать ли кнопку Wand2
canStyle?: boolean;                                // показывать ли кнопку Sliders
presets?: { name: string; style: StylePreset }[];
onPresetsChange?: (p: { name: string; style: StylePreset }[]) => void;
currentBlock?: ContentBlock;                       // для extractStyle/describeStyle при сохранении пресета
```

### Проброс в `BlockContent.tsx` / `TextBlocks.tsx`
В `BlockContent.tsx` расширяю `blockCtrlProps`:
```ts
onConvertBlockType: (type) => onUpdate({ type, ...(type === 'accordion' && !block.accordionTitle ? { accordionTitle: 'Заголовок секции', accordionOpen: true } : {}) }),
canConvert: convertibleTypes.includes(block.type),
canStyle: textStyleableTypes.includes(block.type),
currentBlock: block,
```
И принимаю/прокидываю `presets` / `onPresetsChange` из `SortableBlockItem` → `BlockContent` → `*Block` → `RichTextEditor`.

### Файлы под изменение
- `src/components/course-builder/RichTextEditor.tsx` — 2 новые кнопки/popover (Преобразовать, Доп. оформление + пресеты + сброс).
- `src/components/course-builder/block-editor/blocks/SortableBlockItem.tsx` — убрать 4 пункта из «...», удалить 3 Dialog'а, прокинуть `presets`/`onPresetsChange` и расширенные `blockCtrlProps`.
- `src/components/course-builder/block-editor/blocks/BlockContent.tsx` — расширить `blockCtrlProps`, принять `presets`/`onPresetsChange`.
- `src/components/course-builder/block-editor/blocks/TextBlocks.tsx` — пропускает `blockCtrlProps` дальше (уже сделано в прошлый раз, без изменений интерфейса).

### Результат
- В «...» меню остаётся: Поиск, Вверх, Вниз, Удалить.
- В основном floating toolbar добавляются 2 кнопки: «Преобразовать в…» и «Доп. оформление» (зачёркнутый/UPPERCASE/шрифт/интервал/рамка/скругление/пресеты/сброс).
- Никаких дубликатов с тем, что уже есть (B/I/U, размер, выравнивание, цвет, H1-H4).

