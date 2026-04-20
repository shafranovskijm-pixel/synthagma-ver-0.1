

## План: большой toolbar по центру + «...» меню справа от блока

### 1. Floating toolbar по центру выделения (RichTextEditor.tsx)
- Вернуть позиционирование **по центру выделенного текста, над ним** (как на референсе):
  ```
  top: rect.top - editorRect.top - toolbarHeight - 8
  left: rect.left + rect.width/2 - editorRect.left  (с transform: translateX(-50%))
  ```
- Сделать toolbar **крупнее и заметнее** (как на скрине 2):
  - Контейнер: `h-11 px-2 py-1.5 rounded-2xl bg-slate-800/95 backdrop-blur-md shadow-2xl border border-white/10`.
  - Кнопки: `h-8 w-8` (вместо 7×7), иконки `w-4 h-4` (вместо 3.5×3.5).
  - Кнопки T-/T+ — с подписью «T», читаемые.
  - Активные кнопки выравнивания/форматирования — заливка `bg-primary text-primary-foreground` (teal), как на референсе у активного «по левому краю».
  - Разделители — `w-px h-6 bg-white/15 mx-1`.
- Если toolbar упирается в верх вьюпорта — флипать вниз (`top: rect.bottom + 8`).
- Состав и логика — без изменений (T-, Стиль, T+, B, i, {}, U, Списки, Align L/C/R, Палитра, Ссылка).

### 2. «...» меню справа от блока (SortableBlockItem.tsx)
- Удалить большую горизонтальную «таблетку» под блоком (строки 112–294): `GripVertical / Wand2 / Pencil / Star / Eraser / Link2 / Trash2`.
- Добавить в правом gutter (симметрично `+` слева):
  ```
  <div className="absolute right-2 top-1 opacity-0 group-hover:opacity-100 z-20">
    <Popover>...</Popover>
  </div>
  ```
- Контейнер блока: добавить `pr-14` (зеркально текущему `pl-14`).
- Триггер: круглая teal-кнопка `w-9 h-9 rounded-full bg-muted/60 hover:bg-primary/15 text-muted-foreground hover:text-primary` с иконкой `MoreHorizontal`.
- Popover (как на скрине 3):
  - Поле поиска сверху (`Поиск`) с иконкой лупы.
  - Пункты:
    - **↑ Вверх** — onMoveUp
    - **× Удалить** — onDelete
    - **↓ Вниз** — onMoveDown
  - Поиск фильтрует пункты по подписи.
- Drag handle (`GripVertical` с `attributes`/`listeners` от dnd-kit) — встроить **в тот же триггер «...»** (long-press / drag) ИЛИ оставить как маленькую иконку слева от «...» в том же gutter, чтобы DnD продолжал работать. Решаю: добавить отдельную маленькую кнопку с `GripVertical` рядом с «...» (показывается только на hover, в том же контейнере справа).

### 3. Куда уехал утраченный функционал из удалённой таблетки
Все важные функции уже доступны:
- **Bold/Italic/Underline/Strikethrough/Align/Color/Link/Code** → во floating toolbar при выделении текста.
- **Convert (Wand2)** → перенесём пунктом «Преобразовать в…» в то же «...» меню (саб-меню под поиском).
- **Стиль блока (Pencil — рамка/шрифт/межстрочный)** → пунктом «Стиль блока» в «...» меню (открывает старый Popover в Dialog).
- **Пресеты (Star)** → пунктом «Пресеты стиля» в «...» меню.
- **Сбросить стиль (Eraser)** → пунктом «Сбросить стиль» в «...» меню.

Итоговое «...» меню:
```
[поиск]
↑ Вверх
↓ Вниз
─────────
Преобразовать в… ▸
Стиль блока…
Пресеты стиля ▸
Сбросить стиль
─────────
× Удалить
```

### Файлы под изменение
- `src/components/course-builder/RichTextEditor.tsx` — позиция (центр, сверху), размеры toolbar.
- `src/components/course-builder/block-editor/blocks/SortableBlockItem.tsx` — удалить горизонтальную таблетку, добавить правый gutter с «...» меню (поиск + Вверх/Вниз/Удалить + перенесённые действия) и drag-handle.

### Открытые вопросы для уточнения

