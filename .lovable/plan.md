

## Проблема

Подтверждено: **контент генерируется, но не отображается**. Причина — несовпадение форматов:

- Edge-функция `generate_content` возвращает **plain Markdown** текст
- Поле `content` в таблице `lessons` ожидает **JSON-массив блоков** (`ContentBlock[]`)
- Когда `jsonToBlocks()` пытается распарсить Markdown через `JSON.parse()`, получает ошибку → возвращает `[]` → пустой урок

Это касается и конвейера (`useBulkPipeline.ts`), и кнопки «Исправить ИИ» в маркетплейсе (`AdminMarketplaceManager.tsx`).

## Решение

Конвертировать Markdown-ответ ИИ в массив `ContentBlock[]` перед сохранением в БД.

### 1. Создать утилиту `markdownToBlocks()` в `src/components/course-builder/BlockEditor.tsx`

Парсинг Markdown → массив блоков:
- `# Заголовок` → `{ type: "heading1", content: "..." }`
- `## Подзаголовок` → `{ type: "heading2", content: "..." }`
- `> Цитата` → `{ type: "quote", content: "..." }`
- `- Элемент` → `{ type: "bullet-list", content: "..." }`
- `1. Элемент` → `{ type: "numbered-list", content: "..." }`
- Обычный текст → `{ type: "paragraph", content: "..." }`

Каждому блоку присваивается уникальный `id`. Результат сериализуется через `blocksToJson()`.

### 2. Применить в `useBulkPipeline.ts` (строка ~452)

```typescript
// Было:
await supabase.from("lessons").update({ content: data.content }).eq("id", lesson.id);

// Станет:
const blocks = markdownToBlocks(data.content);
await supabase.from("lessons").update({ content: blocksToJson(blocks) }).eq("id", lesson.id);
```

### 3. Применить в `AdminMarketplaceManager.tsx` (строка ~410)

Аналогичная замена при автофиксе.

### Файлы для изменения

| Файл | Что |
|---|---|
| `src/components/course-builder/BlockEditor.tsx` | Добавить и экспортировать `markdownToBlocks()` |
| `src/hooks/useBulkPipeline.ts` | Импортировать и применить конвертацию |
| `src/components/admin/AdminMarketplaceManager.tsx` | Импортировать и применить конвертацию |

### Ожидаемый результат
Все 193 курса, которые уже сгенерированы с пустым контентом, потребуют **повторной генерации контента** (перезапуск конвейера). Новые курсы будут сразу сохраняться в правильном формате.

