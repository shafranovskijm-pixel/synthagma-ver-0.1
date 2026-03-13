

## План: 3 изображения на курс, параллельно, для первых 3 уроков

### Текущая проблема
Сейчас система пытается обогатить **все** текстовые уроки без медиа (может быть 5-8 штук). Каждый урок = вызов `analyze_visuals` + `generate-image` → много последовательных батчей, долго.

### Новая логика
1. Из всех текстовых уроков без медиа взять **только первые 3**
2. Запустить все 3 **параллельно** (каждый на своём GigaChat-слоте: 0, 1, 2)
3. Убрать цикл `for (ei = 0; ei < ...; ei += ENRICH_CONCURRENCY)` — он больше не нужен, т.к. всегда ровно 3 урока

### Изменения в файле

**`src/components/admin/AdminMarketplaceManager.tsx`** (строки 696-772):

```typescript
// Берём только первые 3 урока для обогащения
const lessonsToEnrich = lessonsNeedingMedia.slice(0, 3);

if (lessonsToEnrich.length > 0) {
  toast.loading(`Генерирую изображения: 0/${lessonsToEnrich.length}...`, { id: toastId });
  let enrichedCount = 0;
  let enrichedLessons = 0;

  // Все 3 параллельно, каждый на своём слоте
  const enrichPromises = lessonsToEnrich.map(async (lesson, idx) => {
    // idx = 0, 1, 2 → slotIndex = 0, 1, 2
    // ... analyze_visuals + generate-image (без изменений внутренней логики)
  });
  await Promise.allSettled(enrichPromises);
}
```

Результат: вместо 5-8 уроков по батчам → ровно 3 параллельных запроса, каждый на своём API-ключе. Генерация займёт время одного изображения (~10-15с) вместо нескольких батчей.

