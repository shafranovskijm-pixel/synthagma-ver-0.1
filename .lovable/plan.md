

## Проблема

Текущий round-robin в `callAIWithTools` (строки 714-751) строит 4 канала: **[Lovable AI, GigaChat-0, GigaChat-1, GigaChat-2]**. При `taskIndex % 4`:
- task 0 → Lovable AI
- task 1 → GigaChat-0  
- task 2 → GigaChat-1
- task 3 → GigaChat-2

Это значит, что GigaChat-2 (3-й ключ) получает только каждый 4-й запрос, а Lovable AI забирает 25% нагрузки. Пользователь хочет **только 3 потока GigaChat**, без Lovable AI.

## План

### 1. `_shared/gigachat-client.ts` — убрать Lovable AI из round-robin

Строки 714-733: убрать Lovable AI из массива `channels`. Каналы будут **только** GigaChat slot-0, slot-1, slot-2. `taskIndex % 3` обеспечит равномерное распределение.

```text
channels = [
  GigaChat slot-0,  ← taskIndex 0, 3, 6, ...
  GigaChat slot-1,  ← taskIndex 1, 4, 7, ...
  GigaChat slot-2,  ← taskIndex 2, 5, 8, ...
]
```

Lovable AI останется как fallback — если все 3 слота GigaChat упадут, тогда попробовать Lovable AI последним.

### 2. `BulkContentGenerator.tsx` — батч строго по 3

Убедиться что `PARALLEL_BATCH_SIZE = 3` (уже так) и что `taskIndex` передаётся корректно для каждого урока в батче.

### Файлы для изменения

| Файл | Изменение |
|---|---|
| `supabase/functions/_shared/gigachat-client.ts` | Убрать Lovable AI из основных каналов, оставить только 3 слота GigaChat. Lovable AI — последний fallback |

