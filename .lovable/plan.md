

# Round-Robin распределение задач по ИИ-провайдерам

## Идея

Вместо «все запросы в GigaChat → fallback на Gemini» — распределять задачи циклически: задача 1 → GigaChat slot-0, задача 2 → GigaChat slot-1, задача 3 → Lovable AI, задача 4 → slot-0, и т.д. Каждый запрос идёт только к одному провайдеру — токены не тратятся впустую.

## Что сделаем

### 1. `gigachat-client.ts` — новая функция `callAIRoundRobin`

Атомарный счётчик задач. Каждый вызов берёт следующий канал по модулю:
- Канал 0: GigaChat slot-0
- Канал 1: GigaChat slot-1 (если есть второй ключ)
- Канал 2: Lovable AI (Gemini)

При ошибке конкретного канала — fallback на любой другой. Без дублирования запросов.

```text
callAIRoundRobin(messages, maxTokens)
  counter++ → channel = counter % totalChannels
  try channel[N]
  catch → try next channel
```

### 2. `bulk-pipeline/index.ts` — использовать round-robin

- Заменить `callAI` на `callAIRoundRobin` в конвейере
- Поднять concurrency с 2 до 3 (три параллельных канала)
- Существующий `callAI` остаётся для единичных вызовов вне конвейера

### 3. `callAI` — новый режим `preferredProvider === "round_robin"`

Добавить ветку в `callAI` для обратной совместимости — если `preferredProvider === "round_robin"`, вызывать `callAIRoundRobin`.

## Файлы
- `supabase/functions/_shared/gigachat-client.ts` — добавить `callAIRoundRobin` с round-robin счётчиком
- `supabase/functions/bulk-pipeline/index.ts` — concurrency=3, использовать round-robin режим

