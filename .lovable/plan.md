

## Диагностика: почему Lovable AI не получает задачи в Round-Robin

### Проблема

В `callAIRoundRobin` (gigachat-client.ts) распределение идёт по каналам: slot-0, slot-1, Lovable AI. Каунтер `rrCounter` корректно чередует стартовый канал. **Но** каждый GigaChat-слот имеет цепочку фоллбэка моделей: `GigaChat-Pro → GigaChat-Max → GigaChat (базовый)`. Даже когда Pro получает 402 (токены кончились) и Max — 429, базовый GigaChat всё равно **успешно** отвечает. Это видно в логах:

```
slot-0: GigaChat-Pro failed (402) → GigaChat-Max failed (429) → GigaChat: Success
```

В итоге GigaChat-слоты **никогда не «падают»** полностью, а Round-Robin переходит к Lovable AI только как к **фоллбэку при ошибке**. Когда `rrCounter` отправляет задачу на слот — слот справляется (через базовую модель) и Lovable AI не нужен.

Второй фактор: при рестарте edge-функции `rrCounter` сбрасывается в 0, всегда начиная со slot-0.

### Решение

Добавить **принудительное распределение** — передавать индекс задачи из bulk-pipeline в `callAI`, чтобы Round-Robin работал детерминированно:

**Файл: `supabase/functions/_shared/gigachat-client.ts`**
1. В `callAIRoundRobin` добавить параметр `taskIndex?: number`
2. Если передан `taskIndex`, использовать `taskIndex % channels.length` вместо `rrCounter`
3. Когда `taskIndex % channels.length` указывает на Lovable AI — идти **напрямую** на Lovable AI, без попытки GigaChat

**Файл: `supabase/functions/_shared/gigachat-client.ts` — `callAI`**
1. Добавить параметр `taskIndex?: number` и прокинуть в `callAIRoundRobin`

**Файл: `supabase/functions/bulk-pipeline/index.ts`**
1. Завести счётчик `let taskCounter = 0` на уровне pipeline-run
2. При каждом вызове `callAI(...)` передавать `taskCounter++` как `taskIndex`
3. Это обеспечит: задача 0 → slot-0, задача 1 → slot-1, задача 2 → Lovable AI, задача 3 → slot-0 и т.д.

**Дополнительное логирование:**
- Добавить `console.log` в `callAIRoundRobin` с указанием `taskIndex` и выбранного канала для отслеживания распределения

### Итог
Каждый третий вызов ИИ в конвейере будет **гарантированно** идти на Lovable AI, а не застревать на базовом GigaChat.

