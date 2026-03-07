

## Сделать Lovable AI основным провайдером + исправить интерфейс

### Проблема 1: AI баланс не тратится
Функция `callAI()` в `gigachat-client.ts` (строка 583) по умолчанию вызывает GigaChat первым, а Lovable AI — только как fallback. Поэтому баланс Lovable Cloud не расходуется.

### Решение
Изменить порядок в `callAI()` — Lovable AI первым, GigaChat как fallback:

**`supabase/functions/_shared/gigachat-client.ts`**

В функции `callAI()` (строки 583-611):
- Если `preferredProvider` не указан — вызывать `callLovableAI()` первым
- При ошибке — fallback на `callGigaChat()`
- Оставить явные пути для `preferredProvider === "gigachat"` и `"round_robin"`

В функции `callAIRoundRobin()` (строки 514-581):
- Поставить канал Lovable AI первым в массиве `channels`, затем GigaChat слоты

В функции `callAIWithTools()` (строки 617-652):
- Аналогично: сначала Lovable AI, fallback на GigaChat

### Проблема 2: Старый интерфейс
Скорее всего это кеш браузера. Опубликованная версия не обновлена — нужно нажать «Update» в диалоге публикации. Код в проекте уже содержит все новые вкладки (Рассылка, ИИ-провайдеры и т.д.). Кодовых изменений не требуется.

### Файлы для изменения
- `supabase/functions/_shared/gigachat-client.ts` — приоритет Lovable AI

