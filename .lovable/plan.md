

## Проблема

Сгенерированный контент использует только базовые блоки (`paragraph`, `heading1`, `heading2`, `bulletList`, `numberedList`, `quote`). Не используются:
- **Callout-блоки**: `callout-info`, `callout-warning`, `callout-tip`, `callout-success`, `callout-danger`
- **Highlight** и **accordion** (сворачиваемая секция)
- **Изображения** и **аудио** не вставляются при генерации через `ContentGeneratorTab` (маркетплейс-конвейер)

Причина в двух местах:
1. **Tool definition** в `generate-lesson-content/index.ts` (строки 147, 195) — `enum` содержит только 6 типов
2. **Gigachat function** (`gigachat/index.ts`, строки 129-136) — промпт не упоминает callout/accordion блоки вообще
3. **`ContentGeneratorTab.tsx`** — после генерации текста нет фазы медиа (изображения/аудио), в отличие от `BulkContentGenerator`

## План исправления

### 1. Расширить tool definition в `generate-lesson-content/index.ts`

Добавить в `enum` типов блоков: `"callout-info"`, `"callout-warning"`, `"callout-tip"`, `"callout-danger"`, `"highlight"`, `"accordion"`.

Добавить в `items.properties`:
- `accordionTitle` (string, optional) — заголовок для accordion-блоков

Обновить промпт — добавить инструкции по использованию:
- `callout-warning` — для предупреждений, техника безопасности, опасные факторы
- `callout-info` — для справочной информации, нормативных ссылок
- `callout-tip` — для практических советов и рекомендаций
- `callout-danger` — для критически важной информации, запретов
- `highlight` — для ключевых определений и терминов
- `accordion` — для дополнительных материалов, подробных таблиц, справочных данных

Правило: на каждые 3-4 параграфа — минимум 1 callout или highlight.

### 2. Обновить промпт в `gigachat/index.ts` (action: `generate_content`)

Аналогичные инструкции по callout-блокам. Поскольку gigachat возвращает Markdown (не structured blocks), добавить конвенцию маркеров:
- `:::info` / `:::warning` / `:::tip` / `:::danger` — для callout-ов
- `:::accordion Заголовок` — для сворачиваемых секций
- `**!!!** текст` — для highlight

### 3. Обновить `markdownToBlocks` (client + edge function)

Добавить парсинг маркеров `:::info`, `:::warning`, `:::tip`, `:::danger`, `:::accordion` в обоих местах:
- `src/components/course-builder/BlockEditor.tsx` (строка 2454)
- `supabase/functions/convert-lesson-content/index.ts` (строка 21)

### 4. Добавить фазу медиа в `ContentGeneratorTab.tsx`

После генерации контента для урока — автоматически генерировать изображение и аудио (как это делает `BulkContentGenerator`). Это обеспечит полноценный контент «под ключ».

### Файлы для изменения

| Файл | Что меняется |
|---|---|
| `supabase/functions/generate-lesson-content/index.ts` | Расширить enum блоков, добавить accordionTitle, обновить промпт |
| `supabase/functions/gigachat/index.ts` | Обновить промпт generate_content — инструкции по callout-маркерам |
| `src/components/course-builder/BlockEditor.tsx` | Парсинг `:::info/warning/tip/danger/accordion` в `markdownToBlocks` |
| `supabase/functions/convert-lesson-content/index.ts` | Аналогичный парсинг маркеров |
| `src/components/admin/ContentGeneratorTab.tsx` | Добавить генерацию изображений и аудио после контента |

