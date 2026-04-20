

## Сохранять переносы строк (Enter → новая строка) в превью

### Корень проблемы
В `RichTextEditor.tsx` редактор разрешает теги `<div>`, `<p>`, `<br>` — при нажатии Enter Chrome вставляет `<div>новая строка</div>`. Это сохраняется в БД как есть.

Но рендерер `BlockRenderer` использует `renderHtml` → `sanitizeHtml` (`src/components/course-builder/block-editor/utils.ts`), у которого в `ALLOWED_TAGS` **нет `<div>`**. DOMPurify удаляет тег `<div>`, но оставляет его текст — в итоге строки склеиваются в одну.

### Решение
Нормализовать HTML в `RichTextEditor` перед эмитом, превращая `<div>...</div>` и `<p>...</p>` границы в `<br>`. Тогда сохранённое содержимое использует только `<br>` (который разрешён везде) и одинаково выглядит и в редакторе, и в превью, и в опубликованном уроке.

### Что меняю

**`src/components/course-builder/RichTextEditor.tsx`:**

1. Добавить функцию `normalizeLineBreaks(html: string): string`:
   - `</div><div>` / `</div><p>` / `</p><div>` / `</p><p>` → `<br>`
   - Открывающие/закрывающие `<div>`, `</div>`, `<p>`, `</p>` (с возможными атрибутами) → удалить (контент сохранится, между блоками уже будет `<br>`)
   - Сжать множественные `<br>` (более 2 подряд) до двух
   - `&nbsp;` в конце строк не трогаем

2. Применить в `handleInput` (перед `onChange`) и в `handleBlur` (перед итоговым `onChange`):
   ```ts
   const normalized = normalizeLineBreaks(raw);
   lastEmittedHtml.current = normalized;
   onChange(normalized);
   ```
   В `handleBlur` — после `linkify` и `sanitize`, перед записью `el.innerHTML` обратно (чтобы DOM редактора тоже стал унифицированным).

3. Не трогать список разрешённых тегов в редакторе — `<div>` нужен браузеру при наборе, мы лишь нормализуем результат на выходе.

### Дополнительно
Проверить, что `BlockRenderer` для `paragraph`/`heading*` корректно показывает `<br>` (по умолчанию да, поскольку `<br>` есть в `sanitizeHtml.ALLOWED_TAGS`). Списки (`bulletList`/`numberedList`) уже разбивают по `\n` — их не трогаем.

### Файлы
- `src/components/course-builder/RichTextEditor.tsx` — добавить `normalizeLineBreaks`, применить в `handleInput` и `handleBlur`.

### Результат
Любой Enter в редакторе превращается в `<br>`. Текст с переносами выглядит одинаково в редакторе, превью и опубликованном уроке — каждая строка с новой строки, как на втором скриншоте.

