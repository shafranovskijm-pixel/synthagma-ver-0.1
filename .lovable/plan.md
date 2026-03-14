

## Проблема

Из логов видно: все 3 запроса `generate-image` запускаются одновременно (параллельно), но GigaChat API возвращает **429 Too Many Requests** на одном из слотов. Код молча пропускает ошибку (строка 881: `if (!imgErr && imgData?.url)`) — изображение не вставляется, `insertedCount` остаётся 0, урок сохраняется без картинки. В лог записывается `+0 img`, но это не вызывает повторной попытки.

## Решение

**Файл: `src/components/admin/AdminMarketplaceManager.tsx`** (строки 876-888)

1. **Добавить ретрай для `generate-image`**: если первый вызов вернул ошибку или пустой URL, подождать 5 секунд и повторить (до 2 попыток). Это покрывает сценарий 429 rate limit.

2. **Логировать неудачу**: если после ретраев изображение так и не получено, записать в `generation_history` с деталями ошибки (сейчас записывается `+0 img` без пояснения).

Изменение локализовано в одном блоке (~15 строк). Остальная логика (анализ, вставка блока, сохранение) не меняется.

```typescript
// Вместо одного вызова generate-image:
let imgUrl: string | null = null;
let lastImgErr: any = null;
for (let attempt = 0; attempt < 2; attempt++) {
  if (attempt > 0) await new Promise(r => setTimeout(r, 5000));
  const { data: imgData, error: imgErr } = await safeInvoke<any>("generate-image", {
    body: { prompt: imageVisual.prompt, provider: "gigachat", slotIndex: streamIndex },
  });
  if (!imgErr && imgData?.url) { imgUrl = imgData.url; break; }
  lastImgErr = imgErr;
  console.warn(`[Enrichment] generate-image attempt ${attempt+1} failed for "${lesson.title}":`, imgErr?.message);
}
if (imgUrl) {
  // splice block...
  insertedCount++;
} else {
  console.error(`[Enrichment] All attempts failed for "${lesson.title}"`);
}
```

