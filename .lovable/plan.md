

## Проблема

Старый Service Worker, зарегистрированный ранее с `registerType: "prompt"`, продолжает перехватывать запросы и отдавать кэшированные бандлы. Очистка кэшей (`caches.delete`) не помогает, потому что старый SW восстанавливает их. Нужно принудительно **разрегистрировать** старый SW перед регистрацией нового.

## Изменения

### `src/main.tsx`
- **Перед** регистрацией нового SW — принудительно разрегистрировать ВСЕ существующие Service Workers
- Очистить все кэши **после** разрегистрации
- Только потом регистрировать новый SW
- Добавить `location.reload()` если был разрегистрирован старый SW (одноразовый reload через sessionStorage флаг), чтобы гарантировать загрузку свежих ресурсов без старого SW

```typescript
// Pseudocode
if ('serviceWorker' in navigator) {
  const registrations = await navigator.serviceWorker.getRegistrations();
  for (const reg of registrations) await reg.unregister();
  // clear caches
  // then register new SW
  // reload once if old SW was found
}
```

Одно изменение в одном файле — `src/main.tsx`.

