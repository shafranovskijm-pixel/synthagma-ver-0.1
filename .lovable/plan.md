

## План

### 1. Рекомендация в баннере Ростехнадзора
В `CourseStoreManager.tsx` — добавить строку-совет в баннер после основного текста:

> 💡 После добавления курса проверьте правильность ответов в тестах с помощью ИИ — кнопка «Решить ИИ» в редакторе курса.

Стиль: `text-xs text-muted-foreground` с иконкой `Lightbulb`.

### 2. Самая мощная модель для проверки тестов
В `TestAnswersDialog.tsx` — при вызове `gigachat` добавить параметры:
```
ai_provider: "lovable_ai",
lovable_model: "google/gemini-2.5-pro"
```
Это переключит проверку тестов на самую мощную доступную модель (Gemini 2.5 Pro) вместо дефолтного GigaChat-Pro/Gemini Flash.

### 3. Дефолт в `callAI` для `generate_answers`
В `gigachat/index.ts` — для action `generate_answers`, если `ai_provider` не указан, принудительно использовать `lovable_ai` + `google/gemini-2.5-pro`. Это обеспечит мощную модель и для bulk-операций (AdminMarketplace, BulkPipeline).

### Файлы
- `src/components/organization/CourseStoreManager.tsx` — совет в баннере
- `src/components/course-builder/TestAnswersDialog.tsx` — передать мощную модель
- `supabase/functions/gigachat/index.ts` — дефолт для generate_answers

