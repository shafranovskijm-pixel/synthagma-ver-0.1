

## Проблема

Фаза анализа визуалов (`analyze_visuals`) отправляет **все запросы одновременно** (строки 861-912: `analyzePromises` → `Promise.allSettled`). Для 9 уроков рабочих профессий это 9 одновременных запросов на 3 слота GigaChat → перегрузка и 429 ошибки.

Текущий порядок уже правильный: структура → контент (по 3) → тесты → **анализ (все сразу!)** → изображения (по 3). Нужно просто исправить фазу анализа.

## Решение

**Файл: `src/components/admin/AdminMarketplaceManager.tsx`**

Заменить параллельный запуск всех `analyzePromises` через `Promise.allSettled` на **батчи по 3** с паузой между ними (аналогично тому, как уже сделано для контента и изображений):

```typescript
// Было (строки 861-912):
const analyzePromises = lessonsToEnrich.map(async (lesson, idx) => { ... });
await Promise.allSettled(analyzePromises);

// Станет:
for (let i = 0; i < lessonsToEnrich.length; i += CONCURRENCY) {
  const chunk = lessonsToEnrich.slice(i, i + CONCURRENCY);
  if (i > 0) await new Promise(r => setTimeout(r, 5000)); // cooldown
  const chunkPromises = chunk.map(async (lesson, idxInChunk) => {
    const idx = i + idxInChunk;
    // ... existing analysis logic ...
  });
  await Promise.allSettled(chunkPromises);
}
```

Константа `CONCURRENCY = 3` уже определена выше. Пауза 5 секунд между батчами анализа (меньше чем у изображений, т.к. анализ — текстовый запрос, не такой тяжёлый).

Итоговый порядок конвейера:

```text
1. Структура курса (1 запрос)
2. Контент уроков — батчи по 3, последовательно
3. Вопросы тестов — батчи по 3
4. Решение тестов — батчи по 3
5. Анализ визуалов — батчи по 3 (ИСПРАВЛЕНО)
6. Генерация изображений — батчи по 3 с паузой 10с
```

