

## Диагностика: Почему 3-й ключ не расходуется и всё идёт последовательно

### Найденные проблемы

| Проблема | Где | Суть |
|---|---|---|
| **Последовательная обработка** | `BulkContentGenerator.tsx` | `for` цикл с `await` + 2 сек пауза между уроками. Уроки идут один за другим, а не параллельно |
| **Нет round-robin в generate-image** | `generate-image/index.ts` строки 250-268 | Всегда пробует KEY → KEY_2 → KEY_3 как fallback. Если KEY работает, KEY_2 и KEY_3 **никогда не используются** |
| **Нет taskIndex в generate-lesson-content** | `generate-lesson-content/index.ts` | Вызывает `callAIWithTools` без `taskIndex` — всегда попадает на один и тот же канал |
| **callAIWithTools не поддерживает round-robin** | `_shared/gigachat-client.ts` строки 687-740 | Функция не принимает `taskIndex` и не может маршрутизировать по слотам |

### Корень проблемы

```text
Текущий поток (всё последовательно через 1 канал):

  Урок 1 → [Lovable AI] → ожидание → Урок 2 → [Lovable AI] → ожидание → ...
  Изображение 1 → [KEY] → Изображение 2 → [KEY] → ...

Нужный поток (параллельно через 3 канала):

  Урок 1 → [Lovable AI]    ─┐
  Урок 2 → [GigaChat KEY]   ├─ одновременно
  Урок 3 → [GigaChat KEY_2] ─┘
  Урок 4 → [GigaChat KEY_3] → следующий батч...
```

### План исправления

#### 1. `generate-image/index.ts` — настоящий round-robin (не fallback)

Добавить глобальный счётчик `imageSlotCounter` и поддержку параметра `slotIndex` из body запроса:
- Если передан `slotIndex` — использовать `slotIndex % 3` для выбора ключа
- Если не передан — использовать `imageSlotCounter++ % 3`
- Fallback на другие ключи только при ошибке текущего, а не как основная стратегия

#### 2. `generate-lesson-content/index.ts` — принять `taskIndex` и передать в AI

- Принять `taskIndex` из body запроса
- Передать его в `callAIWithTools` (потребуется расширить сигнатуру)
- Это позволит маршрутизировать запросы по разным слотам GigaChat

#### 3. `_shared/gigachat-client.ts` — расширить `callAIWithTools`

- Добавить параметр `taskIndex` в `callAIWithTools`
- При `preferredProvider !== "gigachat"` — использовать round-robin логику (Lovable AI + 3 слота GigaChat)
- Использовать `taskIndex % channels.length` для детерминированной маршрутизации

#### 4. `BulkContentGenerator.tsx` — параллельные батчи по 3

Заменить последовательный `for` цикл на обработку батчами:

```text
// Фаза контента:
for (batch of chunks(targets, 3)) {
  await Promise.allSettled(
    batch.map((lesson, i) => generateOneLesson(lesson, batchOffset + i))
  )
}

// Фаза медиа:  
for (batch of chunks(mediaTargets, 3)) {
  await Promise.allSettled(
    batch.map((lesson, i) => generateMediaForLesson(lesson, batchOffset + i))
  )
}
```

Передавать `taskIndex` (глобальный индекс урока) в каждый вызов edge-функции, чтобы она распределяла нагрузку по слотам.

### Файлы для изменения

- `supabase/functions/generate-image/index.ts` — round-robin вместо fallback
- `supabase/functions/generate-lesson-content/index.ts` — принять и передать taskIndex
- `supabase/functions/_shared/gigachat-client.ts` — добавить taskIndex в callAIWithTools
- `src/components/admin/BulkContentGenerator.tsx` — параллельные батчи по 3

