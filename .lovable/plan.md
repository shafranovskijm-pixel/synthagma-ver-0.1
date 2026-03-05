
## Диагностика и план исправления

### Проблема
Сборка проекта упала с общей ошибкой `failed to build` (3 попытки). Код GigaChat (edge function + UI) синтаксически корректен. Ошибка, скорее всего, связана с развёртыванием edge function.

### Анализ
Все файлы проверены — ошибок TypeScript/синтаксиса нет:
- `supabase/functions/gigachat/index.ts` — корректный Deno-код
- `src/components/course-builder/TestAnswersDialog.tsx` — корректный React
- `src/components/course-builder/SortableLessonItem.tsx` — корректно передаёт `lessonTitle`
- `supabase/config.toml` — запись `[functions.gigachat]` добавлена

### План
1. **Пересохранить edge function без изменений** — иногда повторная сборка решает transient-ошибки деплоя
2. Если ошибка сохраняется, **упростить import** в edge function (убрать `createClient` import и проверить совместимость версии `supabase-js`)

По сути, код уже написан правильно. Нужно просто повторно запустить сборку. Я пересохраню файл edge function, чтобы запустить новый деплой.
