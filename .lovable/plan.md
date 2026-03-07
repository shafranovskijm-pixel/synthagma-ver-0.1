

## Проблема

Настройки конвейера из AISettingsManager (таблица `ai_settings`) **не применяются**. Вот что происходит:

### Данные в `ai_settings` (сохранены корректно):
```
provider: round_robin
gigachat_model: GigaChat-Max
lovable_model: openai/gpt-5-nano
extra_config: { slot0_model: GigaChat-Max, slot1_model: GigaChat-Pro, gemini_model: google/gemini-2.5-flash }
```

### Что реально используется:
1. **BulkPipelineWidget** — читает провайдера из `localStorage` (ключ `pipeline_ai_provider`), а не из `ai_settings`. В селекторе виджета только `gigachat` / `lovable_ai` — нет опции `round_robin`.
2. **Edge-функция `gigachat-client.ts`** — модели захардкожены:
   - Round-robin слоты: всегда `GigaChat-Pro` (строка 517)
   - Lovable AI: всегда `google/gemini-2.5-flash` (строка 358, 547)
   - Выбранные в админке `GigaChat-Max` и `openai/gpt-5-nano` **не подставляются**

**Итог**: настройки GPT-5 Nano и Round-Robin сохранились в БД, но ни клиент, ни сервер их не читают.

---

## Решение

### 1. BulkPipelineWidget — загружать настройки из `ai_settings`

**Файл:** `src/components/admin/BulkPipelineWidget.tsx`

- При монтировании загрузить строку `ai_settings` с `context = 'pipeline'`
- Инициализировать `aiProvider` из `settings.provider` (вместо `localStorage`)
- Передавать `gigachat_model`, `lovable_model` и `extra_config` (slot-модели) в edge-функцию вместе с `ai_provider`
- Селектор провайдера синхронизировать: добавить опцию `round_robin`, убрать дублирование с `localStorage`

### 2. Edge-функция — принимать и использовать модели из запроса

**Файл:** `supabase/functions/_shared/gigachat-client.ts`

- `callAI()` и `callAIRoundRobin()` — принимать параметры `gigachatModel` и `lovableModel`
- `buildChannels()` — принимать `slot0_model`, `slot1_model`, `geminiModel` и использовать их вместо хардкода
- `callLovableAI()` уже принимает `model` параметр — нужно просто передавать его корректно

**Файл:** `supabase/functions/gigachat/index.ts`

- Читать `gigachat_model`, `lovable_model`, `extra_config` из тела запроса
- Передавать их в `callAI()` / `callAIRoundRobin()`

**Файл:** `supabase/functions/bulk-pipeline/index.ts`

- Читать модели из тела запроса и передавать в вызовы ИИ

### 3. Клиентский конвейер `useBulkPipeline` — передавать модели

**Файл:** `src/hooks/useBulkPipeline.ts`

- Принимать `gigachatModel`, `lovableModel`, `extraConfig` через пропсы
- Передавать их в каждый `supabase.functions.invoke("gigachat", { body: { ... } })`

---

### Файлы для изменения:
1. `src/components/admin/BulkPipelineWidget.tsx` — загрузка настроек из БД, передача моделей
2. `src/hooks/useBulkPipeline.ts` — прокидка моделей в edge-функции
3. `src/hooks/useServerPipeline.ts` — прокидка моделей
4. `supabase/functions/_shared/gigachat-client.ts` — параметризация моделей в round-robin и callAI
5. `supabase/functions/gigachat/index.ts` — чтение моделей из запроса
6. `supabase/functions/bulk-pipeline/index.ts` — чтение и прокидка моделей

