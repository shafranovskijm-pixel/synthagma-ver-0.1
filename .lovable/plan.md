

## Редизайн меню работы с текстом и меню «+» (как в Skill Space, но в нашем стиле)

На скринах две панели:
1. **Floating toolbar при выделении текста** — тёмная пилюля с инструментами (`T-` `T+`, `B`, `i`, `{}`, `U`, список, выравнивание, цвет, ссылка) + поповеры (стиль H1/H2/H3/H4/Текст, типы списков, палитра текст/фон, ввод ссылки).
2. **Кнопка «+» слева от блока** → большая сетка с категориями (Текст / Видео / Картинка / Файл / Презентация / Аудио / Таблица / Callout / Кнопка / Embed / Код / Формула) с поиском.

Сейчас у нас: маленький тёмный toolbar по центру выделения (только B/I/U/S/Ссылка) и popover «Добавить блок» справа/снизу с табами.

### 1. Перерисовать `RichTextEditor.tsx` — floating toolbar

**Позиция:** не по центру, а слева под выделением (как на референсе) — `top: rect.bottom + 8`, `left: rect.left` (внутри editor-rect).

**Стиль (наш Teal/Cyan):** тёмная пилюля `bg-slate-800/95 backdrop-blur-md text-white rounded-2xl shadow-xl border border-white/10 px-1.5 py-1 gap-0.5`, активная кнопка — заливка `bg-primary text-primary-foreground` (наш teal), hover — `bg-white/10`, разделители `w-px h-5 bg-white/15`.

**Состав (слева направо):**
- `T-` / **меню стиля** (триггер с иконкой `Type` и текущим уровнем) / `T+` — уменьшить/увеличить размер. Меню стиля — popover с пунктами: H1, H2, H3, H4, **Текст** (галочка на активном). Применяет: для H1/H2 — конвертирует блок (`onConvertType`), для Текст — обратно в `paragraph`. H3/H4 — пока маппинг на heading2 + размер (или добавить блоки heading3/heading4 в types — уточняю в открытых вопросах).
- разделитель
- `B` Bold, `i` Italic, `{}` Code (inline `<code>` через execCommand `'formatBlock'` или wrap span), `U` Underline
- разделитель
- **Списки** (иконка `List`) → popover: «Маркированный» / «Нумерованный» (конвертирует блок в `bulletList`/`numberedList`)
- разделитель
- Выравнивание: `AlignLeft`, `AlignCenter`, `AlignRight` (активная — заливка teal). Применяет к блоку через `onUpdate({ textAlign })` — нужно прокинуть проп.
- разделитель
- **Палитра** (`Palette`) → popover 2 ряда кружков: верхний — цвет текста (8 цветов из `textColorPresets`), нижний — фон/выделение (8 цветов из `bgColorPresets`), кнопка «Убрать выделение». Применяет `onUpdate({ textColor, bgColor })`.
- **Ссылка** (`Link2`) → popover с инпутом «Введите ссылку» + кнопка «Применить» (teal). Если ссылка уже есть — показывает «Удалить ссылку».

**Технически:**
- Расширить пропсы `RichTextEditor`: `onConvertType?(type)`, `onStyleUpdate?(updates)`, `currentBlockType?`, `currentTextAlign?`, `currentTextColor?`, `currentBgColor?`. Прокинуть из `BlockContent.tsx` (он уже знает `block` и `onUpdate`).
- Размер шрифта `T-`/`T+` — циклически по `textSize: 'sm' | undefined | 'lg'` через `onStyleUpdate`.
- Для Code-кнопки — wrap selection `<code>...</code>` (расширить `ALLOWED_TAGS` добавив `code`).
- Активные состояния — через `document.queryCommandState('bold')` и т.д., перечитывать на `selectionchange`.

### 2. Перерисовать «+» — `AddBlockButton.tsx`

**Позиция/триггер:** на скриншоте «+» висит **слева от блока** (плавающая круглая кнопка teal). Сейчас она снизу по центру и в hover-меню `SortableBlockItem`. Посмотрю `SortableBlockItem` — там уже есть hover-кнопка слева; перерисуем её под teal-круг (`w-9 h-9 rounded-full bg-primary/15 hover:bg-primary/25 text-primary`).

**Контент popover** (большая сетка как на референсе):
- Поле поиска сверху: `<Input placeholder="Поиск по модулям" />` с иконкой лупы.
- Сетка `grid-cols-4` (на mobile `grid-cols-3`) карточек: квадрат `aspect-square`, фон `bg-muted/40 hover:bg-primary/10 border border-transparent hover:border-primary/30`, иконка teal сверху + подпись снизу.
- Категории не табами, а подзаголовками-разделителями (или оставить табы — уточняю).
- Состав: все текущие из `blockCategories` + `calloutItems` собираем в один плоский список с поиском по `label`.

**Стиль карточки:**
```
flex flex-col items-center justify-center gap-2 p-3 rounded-xl
[icon] w-7 h-7 text-primary
[label] text-xs font-medium text-foreground text-center
```
Активная (hover) — лёгкая заливка `bg-primary/10` и обводка teal.

### Что НЕ трогаем
- Логику конвертации блоков (`onUpdate({ type })` уже работает) — только подключаем в новый toolbar.
- Сами блоки и их рендер (`BlockContent.tsx`).
- DnD, autosave, undo/redo, AI-форматирование.
- AddBlockButton, который снизу всего редактора (большая кнопка «+ Добавить блок») — оставим как есть для пустого состояния.

### Файлы под изменение
- `src/components/course-builder/RichTextEditor.tsx` — новый floating toolbar (стиль + новые поповеры + новые пропсы).
- `src/components/course-builder/block-editor/blocks/BlockContent.tsx` — прокинуть в `RichTextEditor` `onStyleUpdate`, `onConvertType`, `currentBlockType`, `currentTextAlign`, `currentTextColor`, `currentBgColor`.
- `src/components/course-builder/block-editor/blocks/AddBlockButton.tsx` — переделать popover под сеточный grid с поиском и teal-круглым триггером.
- `src/components/course-builder/block-editor/blocks/SortableBlockItem.tsx` — стилизовать левую hover-кнопку «+» под teal-круг (если она уже там; если нет — добавить).

### Открытые вопросы (2)
1. **H3/H4 в меню стиля** — сейчас в `types.ts` есть только `heading1` и `heading2`. Добавить `heading3`/`heading4` как новые типы блоков (обновить `BlockContent.tsx` рендер) или показывать в меню только H1/H2/Текст?
2. **Категории в popover «+»**: оставить переключение по табам (Текст/Медиа/Ещё) **или** показать всё одним длинным списком с поиском (как на референсе Skill Space)?

