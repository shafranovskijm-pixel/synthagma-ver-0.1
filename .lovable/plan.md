

## Проблема

PWA-кэширование JS/CSS использует стратегию `StaleWhileRevalidate` — это значит, что при обновлении сайта пользователю сначала показывается **старая** закэшированная версия, а новая скачивается в фоне. Пользователь видит актуальную версию только после следующей перезагрузки.

Также в `registerSW` нет обработчика `onNeedRefresh` — когда новый Service Worker готов, приложение не перезагружается автоматически.

## Решение

### 1. `vite.config.ts` — сменить стратегию кэширования JS/CSS

Заменить `StaleWhileRevalidate` на `NetworkFirst` для статических ресурсов (JS, CSS), чтобы всегда загружалась актуальная версия:

```
handler: "NetworkFirst",
expiration: { maxAgeSeconds: 60 * 60 * 24 }  // 1 день вместо 30
```

### 2. `src/main.tsx` — автоматическая перезагрузка при обновлении

Добавить обработчик `onNeedRefresh` в `registerSW`, который сразу вызывает `updateSW()` для активации нового Service Worker и перезагрузки страницы:

```typescript
registerSW({
  immediate: true,
  onNeedRefresh() {
    // Автоматически применяем обновление
    updateSW(true);
  },
  onRegistered(registration) {
    if (registration) {
      setInterval(() => registration.update(), 30 * 1000);
    }
  },
});
```

### Файлы
- `vite.config.ts` — смена стратегии кэширования JS/CSS
- `src/main.tsx` — авто-перезагрузка при новом SW

