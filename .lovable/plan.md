

## Анализ проблемы

Проблема **только в preview-среде** (не на опубликованном сайте). Текущая логика в `main.tsx` уже пытается очищать SW и кэши в preview, но использует `sessionStorage` — это значит очистка происходит только один раз за сессию вкладки. Если preview-iframe перезагружается внутри той же сессии, повторная очистка не срабатывает.

Однако основная причина скорее всего в том, что **preview-среда Lovable** сама по себе может кэшировать ресурсы на уровне CDN/браузера (HTTP-кэш), и это не связано с Service Worker. Это нормальное поведение preview — оно может отставать на несколько секунд после сохранения изменений.

## Что можно улучшить

**В `src/main.tsx`**: Сделать очистку preview-кэша более агрессивной:
- Заменить `sessionStorage` на `localStorage` с timestamp последней очистки
- Очищать кэши **всегда** при загрузке в preview (не только если есть зарегистрированные SW)
- Добавить мета-тег `no-cache` для preview через JS

```typescript
if (isPreview) {
  // Always clear caches in preview, not just when SW exists
  if ('caches' in window) {
    const names = await caches.keys();
    await Promise.all(names.map(n => caches.delete(n)));
  }
  // Unregister any stale SW
  const regs = await navigator.serviceWorker.getRegistrations();
  for (const reg of regs) await reg.unregister();
  // No SW registration in preview
  return;
}
```

Убрать проверку `regs.length > 0` и `sessionStorage` — просто всегда чистить кэши в preview. Это минимальное изменение (~5 строк), без перезагрузки страницы (чтобы не зациклиться).

