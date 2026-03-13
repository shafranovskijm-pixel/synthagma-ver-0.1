

## Диагностика: обогащение работает в 3 потока, но медленно

### Текущая ситуация

Код в `AdminMarketplaceManager.tsx` (строка 694) **уже использует CONCURRENCY=3** — уроки обрабатываются батчами по 3 через `Promise.allSettled`. Это корректно.

**Но внутри каждого урока изображения генерируются последовательно** (строка 733: `for (const visual of imageVisuals)`). Если AI рекомендует 2-3 изображения на урок, каждое — отдельный вызов `generate-image` (5-15 секунд). Итого на 1 урок: ~15с анализ + 3×10с изображения = **~45 секунд**. На 8 уроков (3 батча): ~2-3 минуты минимум.

### План ускорения

| Изменение | Файл | Что даёт |
|---|---|---|
| Параллельная генерация изображений внутри урока | `AdminMarketplaceManager.tsx` | Вместо `for...of` → `Promise.all` для всех visuals одного урока. Ускорение в 2-3 раза |
| Обновление тоста после каждого урока, а не батча | `AdminMarketplaceManager.tsx` | Пользователь видит прогресс: "Обогащаю медиа: 1/8, 2/8..." вместо скачков 0→3→6→8 |
| Аналогичное ускорение в ContentGeneratorTab | `ContentGeneratorTab.tsx` | Единообразие обоих потоков |

### Ключевое изменение (AdminMarketplaceManager.tsx)

Строки 729-747 — заменить последовательный цикл на параллельный:

```typescript
// Было: последовательно
for (const visual of imageVisuals) {
  const { data: imgData } = await safeInvoke("generate-image", ...);
  blocks.splice(...);
}

// Станет: параллельно
const imageResults = await Promise.allSettled(
  imageVisuals.map(visual =>
    safeInvoke("generate-image", { body: { prompt: visual.prompt, provider: "gigachat" } })
  )
);
// Вставка блоков в обратном порядке по after_block_index
```

Плюс — атомарный счётчик для тоста, обновляемый после каждого урока.

