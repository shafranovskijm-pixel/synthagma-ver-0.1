

## Toggle list/heading off when re-clicking the active item

### Проблема
В popover «Список» (и логически — в popover «Стиль текста» с H1/H2/H3/H4) при клике на пункт, который уже активен (галочка стоит), ничего не происходит — блок остаётся тем же. Пользователь ожидает поведение toggle: повторный клик возвращает блок в обычный `paragraph`.

### Что меняю в `src/components/course-builder/RichTextEditor.tsx`

**1. Popover «Список» (строки 433–446):**
В обработчиках `onMouseDown` обоих пунктов — проверять, активен ли уже этот тип, и если да — вызывать `onConvertType("paragraph")` вместо повторной конвертации в тот же тип.

```tsx
onMouseDown={(e) => {
  e.preventDefault();
  onConvertType(currentBlockType === "bulletList" ? "paragraph" : "bulletList");
  setListMenuOpen(false);
}}
```
Аналогично для `numberedList`.

**2. Popover «Стиль текста» (T) — heading1..heading4 / Текст:**
Применить ту же логику: клик по уже активному заголовку → возврат в `paragraph`. Пункт «Текст» (paragraph) при активном paragraph остаётся как есть (no-op закрытие меню).

### Файлы
- `src/components/course-builder/RichTextEditor.tsx` — обновить обработчики кликов в двух popover-ах (Список + Стиль текста).

### Результат
Кнопки «Маркированный», «Нумерованный», «H1–H4» работают как переключатели вкл/выкл — повторный клик по активному пункту возвращает блок в обычный текст.

